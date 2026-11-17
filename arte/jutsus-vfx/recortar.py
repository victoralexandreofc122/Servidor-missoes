"""Recorta as folhas dos jutsus (6 quadros sobre fundo verde) em quadros transparentes na escala do jogo.

  python3 arte/jutsus-vfx/recortar.py [--debug pasta]

Entrada: arte/jutsus-vfx/folhas/<jutsu>.jpg (as folhas do Victor, uma por jutsu).
Saída:   public/assets/vfx/<jutsu>_0N.png (N = 1..6, na ordem da folha; quadro que falta na folha não é gerado).

Passos, para cada folha:
1. Fundo: todo pixel verde (o verde vivo e o verde-escuro de algumas molduras) vira transparente, com borda suave e o
   verde tirado da franja (despill), para o fogo não ficar com contorno esverdeado.
2. Painéis: os retângulos verdes grandes; na folha sem moldura, os grupos de desenho lado a lado.
3. Textos (títulos e F1..F6): grupos de letras numa linha (muitos pedaços pequenos da mesma altura, lado a lado) saem.
4. Corte no desenho e redução para o tamanho do pixel da arte (cada "pixel" da folha vira 1 pixel), sem borrar.
"""
import glob, json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
SAIDA = os.path.join(RAIZ, 'public', 'assets', 'vfx')

# Ajustes por folha: pixel = tamanho do pixel da arte na folha (px); ordem = como ler os painéis quando a grade não é 3x2.
AJUSTES = json.load(open(os.path.join(AQUI, 'ajustes.json'), encoding='utf-8'))


def verdura(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return g - np.maximum(r, b)


def fundo(a, corte=45):
    """Máscara do fundo verde (vivo ou escuro). Devolve alfa 0..1 (0 = fundo)."""
    v = verdura(a)
    alfa = np.clip((corte - v) / 30.0, 0, 1)   # verdura >= corte: fundo; 30 abaixo: desenho; no meio, borda suave
    return alfa


def fundo_cor(sub, modo='magenta', limiar_m=None):
    """Fundo de cor lisa (o magenta): a cor dos cantos do painel; o alfa pela distância a ela; a franja sem o tom do fundo."""
    c = 14
    cantos = np.concatenate([sub[:c, :c].reshape(-1, 3), sub[:c, -c:].reshape(-1, 3), sub[-c:, :c].reshape(-1, 3), sub[-c:, -c:].reshape(-1, 3)])
    bg = np.median(cantos, axis=0)
    f = sub.astype(float)
    d = np.sqrt(((f - bg) ** 2).sum(axis=2))
    # quanto de magenta tem o pixel (vermelho e azul juntos acima do verde), comparado com o fundo: o brilho verde
    # misturado no magenta fica com alfa parcial (e a cor limpa abaixo), em vez de virar uma auréola rosa
    m = np.minimum(f[..., 0], f[..., 2]) - f[..., 1]
    if modo == 'escuro':
        # fundo escuro (o brilho soma luz por cima): o alfa pela distância à cor do fundo
        alfa = np.clip((d - 22) / 70.0, 0, 1)
        k = np.maximum(alfa, 0.3)[..., None]
        return alfa, np.clip(bg + (f - bg) / k, 0, 255).astype(np.uint8)
    mbg = max(1.0, min(bg[0], bg[2]) - bg[1])
    alfa = np.clip(1 - m / mbg, 0, 1)
    alfa = np.where(d < 55, 0, alfa)
    # o próprio fundo clareado (brilho branco por cima) ou escurecido (sombra da moldura, vinheta): sai; branco e preto
    # de verdade (faíscas, contornos) ficam
    for alvo in (255.0, 0.0):
        v0 = alvo - bg
        t0 = ((f - bg) * v0).sum(axis=2) / max(1.0, float((v0 * v0).sum()))
        resto0 = np.sqrt(((f - (bg + np.clip(t0, 0, 1)[..., None] * v0)) ** 2).sum(axis=2))
        alfa = np.where((resto0 < 40) & (t0 < 0.8), 0, alfa)
    if limiar_m is not None:   # brilho claro da cor do fundo (rosa sobre rosa): sai inteiro
        alfa = np.where(m > limiar_m * mbg, 0, alfa)
    # tira o fundo misturado na borda do brilho (c = bg + (cor - bg) / alfa)
    k = np.maximum(alfa, 0.3)[..., None]
    limpo = np.clip(bg + (f - bg) / k, 0, 255).astype(np.uint8)
    # brilho sobre o magenta: verde + magenta dá cinza (sem "magenta" nenhum). Para cada pixel perto de um núcleo de
    # cor (verde, ciano, amarelo...), o alfa é o quanto ele está no caminho entre o fundo e a cor do núcleo mais perto.
    nucleo = m < -120   # só a cor forte (o brilho meio misturado com o fundo não conta)
    if nucleo.any():
        dist, (ny, nx) = ndi.distance_transform_edt(~nucleo, return_indices=True)
        G = f[ny, nx]
        v = G - bg
        t = ((f - bg) * v).sum(axis=2) / np.maximum(1.0, (v * v).sum(axis=2))
        t = np.clip(t, 0, 1)
        resto = np.sqrt(((f - (bg + t[..., None] * v)) ** 2).sum(axis=2))
        mistura = (~nucleo) & (dist <= 160) & (resto < 70)
        alfa = np.where(mistura, np.minimum(alfa, t), alfa)
        limpo[mistura] = G[mistura].astype(np.uint8)
    # a franja do brilho pega a cor do desenho firme mais perto (só o alfa fica gradual): sem auréola cinza nem rosa
    firme = alfa > 0.85
    if firme.any():
        _, (iy, ix) = ndi.distance_transform_edt(~firme, return_indices=True)
        franja = (alfa > 0) & ~firme
        limpo[franja] = limpo[iy[franja], ix[franja]]
    return alfa, limpo


def preenche_preto(bloco):
    """Letras pretas por cima do desenho: cada pixel de letra ganha a cor do vizinho mais perto que não é letra."""
    m = bloco.max(axis=2) < 80
    m = ndi.binary_dilation(m, iterations=2)
    if not m.any():
        return bloco
    _, (iy, ix) = ndi.distance_transform_edt(m, return_indices=True)
    return bloco[iy, ix]


def paineis(a, ajuste):
    """Retângulos (x0, y0, x1, y1) dos painéis, em ordem de leitura."""
    if 'paineis' in ajuste:
        return [tuple(p) for p in ajuste['paineis']]
    if ajuste.get('fundo') == 'magenta':
        r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
        v = (r > 150) & (b > 110) & (g < 120)
    else:
        v = verdura(a) > 45
    v = ndi.binary_opening(v, iterations=2)
    lab, n = ndi.label(v)
    H, W = v.shape
    caixas = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if h * w > 0.05 * H * W and h < 0.9 * H:
            caixas.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    # o desenho às vezes corta o fundo de um painel em dois: junta as caixas que se sobrepõem na mesma faixa
    if caixas:
        mw = float(np.median([c[2] - c[0] for c in caixas])); mh = float(np.median([c[3] - c[1] for c in caixas]))
    juntou = True
    while juntou:
        juntou = False
        for i in range(len(caixas)):
            for j in range(i + 1, len(caixas)):
                p, q = caixas[i], caixas[j]
                sx = min(p[2], q[2]) - max(p[0], q[0]); sy = min(p[3], q[3]) - max(p[1], q[1])
                u = (min(p[0], q[0]), min(p[1], q[1]), max(p[2], q[2]), max(p[3], q[3]))
                cabe = (u[2] - u[0]) <= 1.15 * max(mw, p[2] - p[0], q[2] - q[0]) and (u[3] - u[1]) <= 1.15 * mh
                if cabe and sx > -40 and sy > -40:
                    caixas[i] = (min(p[0], q[0]), min(p[1], q[1]), max(p[2], q[2]), max(p[3], q[3]))
                    del caixas[j]; juntou = True; break
            if juntou: break
    caixas.sort(key=lambda c: (round(c[1] / (H / 4)), c[0]))
    return caixas


def tira_textos(alfa, a, painel_h):
    """Apaga as linhas de texto: pedaços pequenos e da mesma altura, lado a lado, numa faixa horizontal."""
    m = alfa > 0.5
    lab, n = ndi.label(m)
    objs = ndi.find_objects(lab)
    peq = []
    for i, sl in enumerate(objs, 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if h < 0.11 * painel_h and w < 0.11 * painel_h:
            peq.append((i, sl[0].start, sl[0].stop, sl[1].start, sl[1].stop))
    apagar = set()
    for i, y0, y1, x0, x1 in peq:
        cy = (y0 + y1) / 2; h = y1 - y0
        vizinhos = [p for p in peq if abs((p[1] + p[2]) / 2 - cy) < 0.35 * h and 0.55 < (p[2] - p[1]) / max(1, h) < 1.8]
        if len(vizinhos) >= 3:
            # o grupo tem de ser uma linha: pedaços próximos uns dos outros na horizontal
            xs = sorted((p[3], p[4]) for p in vizinhos)
            gaps = [xs[k + 1][0] - xs[k][1] for k in range(len(xs) - 1)]
            if gaps and np.median(gaps) < 1.2 * h:
                # letras têm muito branco puro ou preto puro (o fogo não tem preto puro dentro)
                apagar.add(i)
    for i in apagar:
        alfa[lab == i] = 0
    return alfa


def roer(peq, lado, frac, semente):
    """Desfaz um corte reto em pixels soltos (1 na borda, 0 lá dentro): esq, dir, baixo ou cima."""
    h2, w2 = peq.shape[:2]
    rng = np.random.default_rng(semente)
    n = max(2, int((w2 if lado in ('esq', 'dir') else h2) * frac))
    for i in range(n):
        prob = 1 - i / n
        if lado == 'esq':
            col = peq[:, i]
        elif lado == 'dir':
            col = peq[:, w2 - 1 - i]
        elif lado == 'cima':
            col = peq[i, :]
        else:
            col = peq[h2 - 1 - i, :]
        col[..., 3] = np.where(rng.random(col.shape[0]) < prob ** 1.5, 0, col[..., 3])


def reduz(rgba, px, suave=False):
    """Cada pixel da arte (px x px na folha, px pode ser fracionado) vira 1 pixel: a cor pelo centro, o alfa pela maioria."""
    h, w = rgba.shape[:2]
    W, H = max(1, round(w / px)), max(1, round(h / px))
    if w < px or h < px:
        return None
    im = Image.fromarray(rgba, 'RGBA')
    cor = np.asarray(im.convert('RGB').resize((W, H), Image.NEAREST))
    alfa = np.asarray(im.getchannel('A').resize((W, H), Image.BOX))
    if suave:   # brilho e névoa: o alfa em 4 degraus (pixel art), em vez de cortar seco
        a4 = np.clip(np.round(alfa.astype(float) / 85) * 85, 0, 255)
        return np.dstack([cor, np.where(alfa < 72, 0, a4).astype(np.uint8)])
    return np.dstack([cor, np.where(alfa > 127, 255, 0).astype(np.uint8)])


def recorta(nome, debug=None):
    ajuste = AJUSTES.get(nome, {})
    img = Image.open(os.path.join(AQUI, 'folhas', nome + '.jpg')).convert('RGB')
    a = np.asarray(img).copy()
    for (tx0, ty0, tx1, ty1) in ajuste.get('texto_preto', []):
        a[ty0:ty1, tx0:tx1] = preenche_preto(a[ty0:ty1, tx0:tx1])
    caixas = paineis(a, ajuste)
    px = ajuste.get('pixel', 8)
    quadros = ajuste.get('quadros', list(range(1, len(caixas) + 1)))
    feitos = []
    dbg = []
    for k, (x0, y0, x1, y1) in zip(quadros, caixas):
        m = ajuste.get('margem', 6)
        sub = a[y0 + m:y1 - m, x0 + m:x1 - m].copy()
        magenta = ajuste.get('fundo') in ('magenta', 'escuro')
        if magenta:
            alfa, sub = fundo_cor(sub, ajuste.get('fundo'), ajuste.get('limiar_m'))
        else:
            alfa = fundo(sub, ajuste.get('verde', 45))
        if str(k) in ajuste.get('circulo', {}):
            # o desenho vazou da moldura (ficaria quadrado): máscara redonda que some na borda
            hh0, ww0 = alfa.shape
            yy, xx = np.mgrid[0:hh0, 0:ww0]
            rr = np.sqrt(((xx - ww0 / 2) / (ww0 / 2)) ** 2 + ((yy - hh0 / 2) / (hh0 / 2)) ** 2)
            r0 = ajuste['circulo'][str(k)]
            r0, R = (r0, 1.0) if not isinstance(r0, list) else r0   # some de r0 (inteiro) até R (nada)
            alfa = alfa * np.clip((R - rr) / max(0.01, R - r0), 0, 1)
        if str(k) in ajuste.get('buraco', {}):
            # o miolo de um anel com a cor do fundo misturada (a Onda): zera uma elipse [cx, cy, rx, ry] em frações do painel
            hh0, ww0 = alfa.shape
            cxf, cyf, rxf, ryf = ajuste['buraco'][str(k)]
            yy, xx = np.mgrid[0:hh0, 0:ww0]
            dentro = ((xx - cxf * ww0) / (rxf * ww0)) ** 2 + ((yy - cyf * hh0) / (ryf * hh0)) ** 2 < 1
            alfa = np.where(dentro, 0, alfa)
        hh, ww = alfa.shape
        # faixa do título no alto do painel e os rótulos (F1..F6): retângulos fixos por folha (negativo = da direita/de baixo)
        if ajuste.get('topo'):
            alfa[:ajuste['topo']] = 0
        for (ex0, ey0, ex1, ey1) in ajuste.get('cantos', []):
            fx = lambda v, n: v + n if v < 0 else v
            alfa[fx(ey0, hh):fx(ey1, hh) if ey1 else hh, fx(ex0, ww):fx(ex1, ww) if ex1 else ww] = 0
        # tira o que encosta na moldura (restos da borda) e os textos
        if ajuste.get('detector_texto', True):
            alfa = tira_textos(alfa, sub, y1 - y0)
        for (ex0, ey0, ex1, ey1) in ajuste.get('apagar', {}).get(str(k), []):
            alfa[ey0:ey1, ex0:ex1] = 0
        # despill: na franja, o verde não passa do maior entre vermelho e azul
        r, g, b = sub[..., 0].astype(int), sub[..., 1].astype(int), sub[..., 2].astype(int)
        if not magenta:
            franja = alfa < 1
            g2 = np.where(franja, np.minimum(g, np.maximum(r, b)), g)
            sub[..., 1] = g2.astype(np.uint8)
        # só os pedaços grandes (tira grãos soltos de JPEG)
        mm = alfa > 0.5
        lab, n = ndi.label(mm)
        if n:
            tam = ndi.sum(mm, lab, range(1, n + 1))
            minimo = max(12, int(px * px * ajuste.get('grao', 2)))
            for i, t in enumerate(tam, 1):
                if t < minimo:
                    alfa[lab == i] = 0
        # com brilho suave, o corte vai até onde o brilho chega (senão a borda dele fica reta, quadrada)
        ys, xs = np.nonzero(alfa > (0.28 if ajuste.get('alfa_suave') else 0.5))
        if len(ys) == 0:
            continue
        cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([sub, (alfa * 255).astype(np.uint8)])[cy0:cy1, cx0:cx1]
        peq = reduz(rgba, px, ajuste.get('alfa_suave', False))
        if peq is None:
            continue
        # corte reto (o desenho encostava na borda do painel): desfaz em pixels soltos, como fumaça/chama se abrindo
        lado_frac = ajuste.get('roer', {}).get(str(k))
        if lado_frac:
            roer(peq, *lado_frac, k * 7 + len(nome))
        out = Image.fromarray(peq, 'RGBA')
        dest = os.path.join(SAIDA, f'{nome}_0{k}.png')
        out.save(dest)
        # partes: um pedaço do quadro (ex.: só a bola do meio da Revoada, que no jogo voa sozinha), em frações do quadro
        for suf, (fx0, fy0, fx1, fy1) in ajuste.get('partes', {}).get(str(k), {}).items():
            W, H = out.size
            pd = out.crop((round(fx0 * W), round(fy0 * H), round(fx1 * W), round(fy1 * H)))
            bb = pd.getbbox()
            if bb:
                pd = pd.crop(bb)
                rp = ajuste.get('roer_partes', {}).get(f'{k}{suf}')
                if rp:   # a parte cortada no meio de outro desenho (a explosão do meteoro): a borda do corte se desfaz
                    arr = np.asarray(pd).copy()
                    roer(arr, *rp, k * 11 + len(suf))
                    pd = Image.fromarray(arr, 'RGBA')
                pd.save(os.path.join(SAIDA, f'{nome}_0{k}{suf}.png'))
                feitos.append((f'{k}{suf}', pd.crop(bb).size))
        feitos.append((k, out.size))
        if debug:
            dbg.append(out.resize((out.width * 4, out.height * 4), Image.NEAREST))
    if debug and dbg:
        W = sum(d.width for d in dbg) + 10 * len(dbg); H = max(d.height for d in dbg)
        tela = Image.new('RGBA', (W, H), (40, 44, 60, 255))
        x = 0
        for d in dbg:
            tela.alpha_composite(d, (x, 0)); x += d.width + 10
        tela.save(os.path.join(debug, nome + '.png'))
    return feitos, caixas


def ancora_de(img, regra):
    """Ponto de apoio do quadro, em pixels da imagem."""
    a = np.asarray(img)[..., 3] > 0
    ys, xs = np.nonzero(a)
    H, W = a.shape
    if isinstance(regra, list):
        return regra
    if regra == 'base':        # ponta de baixo (o leque e o raio saem da mão)
        return [int(np.median(xs[ys >= ys.max() - 2])), H]
    if regra == 'topo':
        return [int(np.median(xs[ys <= ys.min() + 2])), 0]
    if regra == 'esquerda':
        return [0, int(np.median(ys[xs <= xs.min() + 2]))]
    if regra == 'direita':
        return [W, int(np.median(ys[xs >= xs.max() - 2]))]
    if isinstance(regra, str) and regra.startswith('anel:'):   # anel:<altura/largura do anel> → centro do anel embaixo
        razao = float(regra.split(':')[1])
        return [W // 2, int(H - W * razao / 2)]
    if regra == 'cabeca':      # projétil para a direita: a frente fica no ponto do projétil, o rastro atrás
        return [int(W * 0.82), int(np.median(ys[xs >= xs.max() - 3]))]
    return [W // 2, H // 2]


def gera_js():
    """public/vfxFogo.js: tamanho (casas), âncora, direção da arte, mistura e eixo de cada quadro, a partir dos PNG."""
    linhas = []
    for nome in sorted(AJUSTES):
        j = AJUSTES[nome].get('jogo')
        if not j:
            continue
        for p in sorted(glob.glob(os.path.join(SAIDA, nome + '_0*.png'))):
            q = os.path.basename(p)[len(nome) + 1:-4]
            c = {**{k: v for k, v in j.items() if k != 'quadros'}, **j.get('quadros', {}).get(q, {})}
            img = Image.open(p)
            e = {'casas': round(img.width * c['pxCasa'], 3), 'ancora': ancora_de(img, c.get('ancora', 'centro')), 'blend': c.get('blend', 'normal')}
            if c.get('arte') is not None:
                e['arte'] = round(c['arte'], 4)
            if c.get('alpha'):
                e['alpha'] = c['alpha']
            if c.get('eixo'):
                # comprimento do eixo da arte (da âncora até a ponta), para esticar até onde o golpe vai
                if c['eixo'] is True:
                    vert = c.get('arte') is not None and abs(abs(c['arte']) - math.pi / 2) < 0.1
                    e['eixoPx'] = img.height if vert else img.width
                else:
                    e['eixoPx'] = c['eixo']
            linhas.append(f"  {nome}_{q}: {json.dumps(e)},")
    js = ('/* GERADO por arte/jutsus-vfx/recortar.py (não editar à mão): os quadros desenhados dos jutsus (v73 Fogo; v74 Fogo T4 e Cura).\n'
          ' * casas = largura no jogo; ancora = ponto de apoio (px da imagem); arte = para onde a arte aponta (rad);\n'
          ' * eixoPx = comprimento do eixo da arte, para esticar até o fim do golpe; blend = mistura. */\n'
          'export const FOGO_FRAMES = {\n' + '\n'.join(linhas) + '\n};\n')
    open(os.path.join(RAIZ, 'public', 'vfxFogo.js'), 'w', encoding='utf-8').write(js)
    print('vfxFogo.js:', len(linhas), 'quadros')


if __name__ == '__main__':
    debug = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
    if debug:
        os.makedirs(debug, exist_ok=True)
    so = [x for x in sys.argv[1:] if not x.startswith('-') and x != debug]
    for p in sorted(glob.glob(os.path.join(AQUI, 'folhas', '*.jpg'))):
        nome = os.path.splitext(os.path.basename(p))[0]
        if so and nome not in so:
            continue
        feitos, caixas = recorta(nome, debug)
        print(nome, len(caixas), 'painéis', feitos)
    gera_js()
