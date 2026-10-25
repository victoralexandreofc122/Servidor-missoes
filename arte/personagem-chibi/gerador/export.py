"""Exporta o personagem em camadas: folhas por gênero x animação x item x plano (cores padrão + mapa de índices
pra recolorir), paletas, metadados, prévias (GIF e pranchas) e checagens de qualidade."""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import head_items as HI
import poses
from charsys import SLOTS, Frame
from compose import PLANOS
from pal import (CABELO, CANAIS, COR1, COR2, COR3, FIXED, FIXO, F_UW, F_UW_DK, F_UW_HI, F_UW_SH, Idx, NOMES_TONS,
                 OLHO, PELE, colorize)
from paletas import all_palettes

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "saida")
CW, CH = 64, 96
VIEWS = [("front", "frente"), ("side", "lado"), ("back", "costas")]
GENEROS = [("m", "masculino"), ("f", "feminino")]
ANIMS = [  # (função, nome, sequência de frames, duração de cada passo em ms, repete?)
    (poses.idle, "parado", [0, 1, 2, 1], [1200, 260, 300, 260], True),
    (poses.walk, "andar", [0, 1, 2, 1], [160, 130, 160, 130], True),
    (poses.run, "correr", [0, 1, 2, 1], [100, 90, 100, 90], True),
    (poses.attack, "ataque", [1, 0, 1, 2], [140, 220, 140, 320], False),
    (poses.jutsu, "jutsu", [1, 2, 1], [110, 170, 110], False),
    (poses.golpe, "golpe", [0, 1, 2], [90, 120, 150], False),
]
ANIM_NOTAS = {
    "parado": "0 = parado, 1 = solta o ar (tronco/cabeça descem 1 px), 2 = braços abrem levemente",
    "andar": "0 = perna de perto/visível na frente, 1 = passagem, 2 = perna de trás na frente",
    "correr": "0 = perna de perto na frente, 1 = passagem (apoio), 2 = perna de trás na frente",
    "ataque": "0 = soco, 1 = guarda (mão volta pro corpo), 2 = chute alto",
    "golpe": "golpe com a arma equipada: 0 = preparação (arma lá atrás), 1 = corte (braço estendido, avança), "
             "2 = fim do golpe (braço desce)",
    "jutsu": "0 = carregar chakra (agachado, selo do carneiro; parado em loop na meditação), 1 = A, preparação "
             "(mãos juntas), 2 = B, lançamento (palmas pra frente, grito). Jutsu: A -> B -> A. Rosto sério",
}

P = all_palettes()
PAL = {k: dict(v) for k, v in P.items()}

# itens que existem hoje: (slot, id do item, como montar, cores padrão por canal)
#   como montar: (tipo, estilo) de item de cabeça ou de roupa, ou ("dif", com, sem) = só os pixels que mudam
#   (usado pro SÍMBOLO DA VILA, que fica num arquivo separado por cima da bandana / da camisa)
ITEMS = [
    ("corpo", "base", None, {}),
    ("olhos", "masculino", ("olhos", "masculino"), {}),
    ("olhos", "cilios", ("olhos", "cilios"), {}),
    ("boca", "sorriso", ("boca", "sorriso"), {}),
    ("cabelo", "espetado", ("cabelo", "espetado"), {}),
    ("cabelo", "longo_lateral", ("cabelo", "longo_lateral"), {}),
    ("chapeu", "bandana", ("chapeu", "bandana"), {COR1: "azul_marinho", COR2: "aco"}),
    ("chapeu", "simbolo_espiral", ("dif", ("chapeu", "bandana+espiral"), ("chapeu", "bandana")), {COR2: "aco"}),
    ("conjunto", "vila", ("conjunto_vila", None), {COR1: "verde_colete", COR2: "azul_marinho", COR3: "creme"}),
    ("camisa", "basica", ("camisa_basica_lisa", None), {COR1: "azul_marinho", COR2: "vermelho", COR3: "creme"}),
    ("camisa", "simbolo_espiral", ("dif", ("camisa_basica", None), ("camisa_basica_lisa", None)),
     {COR1: "azul_marinho", COR2: "vermelho"}),
    ("calca", "basica", ("calca_basica", None), {COR1: "cinza", COR2: "creme", COR3: "marrom"}),
    ("sapato", "sandalia", ("sandalia", None), {COR1: "azul_marinho"}),
    ("sapato", "bota", ("bota", None), {COR1: "marrom", COR2: "creme", COR3: "preto"}),
]
ITEM_INFO = {
    ("corpo", "base"): "corpo + roupa de baixo (canal pele + fixo)",
    ("olhos", "masculino"): "olhos sem cílios (some de costas)",
    ("olhos", "cilios"): "olhos com cílios (some de costas)",
    ("boca", "sorriso"): "boca (some de costas)",
    ("cabelo", "espetado"): "cabelo espetado (cor = canal cabelo; tem 1 remendo de pele cobrindo a orelha)",
    ("cabelo", "longo_lateral"): "cabelo longo até o meio das costas, franja lateral. De frente e de lado a parte "
                                 "comprida fica no plano 'tras' (atrás do corpo); de costas fica por cima das costas",
    ("chapeu", "bandana"): "bandana da vila com a placa LISA: cor1 = faixa (cor da vila), cor2 = placa de metal",
    ("chapeu", "simbolo_espiral"): "símbolo da vila gravado na placa (desenhe logo depois da bandana); "
                                   "'espiral' é provisório até o símbolo de cada vila ficar pronto",
    ("conjunto", "vila"): "conjunto da vila (substitui camisa + calça): cor1 = colete, cor2 = camisa/calça, "
                          "cor3 = faixas e fita do porta-kunai; porta-kunai em aço fixo. Cores travadas por vila",
    ("camisa", "basica"): "camisa de manga longa SEM logo: cor1 = camisa, cor3 = gola e punhos",
    ("camisa", "simbolo_espiral"): "logo da vila no peito da camisa (desenhe logo depois da camisa): cor2 = logo",
    ("calca", "basica"): "calça ninja folgada presa no tornozelo: cor1 = calça, cor2 = amarração e cordão",
    ("sapato", "sandalia"): "sandália ninja aberta (equipamento dos pés): cor1 = sandália; os dedos ficam de fora (pele)",
    ("sapato", "bota"): "bota de cano médio (equipamento dos pés), por cima da barra da calça: cor1 = couro, "
                        "cor2 = dobra do cano, cor3 = sola",
}
# cores de cada vila (travadas: o jogador não troca). Exemplos provisórios até as vilas serem definidas.
VILAS = [
    dict(vila="vila_exemplo_1", conjunto=dict(cor1="verde_colete", cor2="azul_marinho", cor3="creme"),
         bandana="azul_marinho", simbolo="espiral"),
    dict(vila="vila_exemplo_2", conjunto=dict(cor1="cinza", cor2="preto", cor3="branco"),
         bandana="preto", simbolo="espiral"),
    dict(vila="vila_exemplo_3", conjunto=dict(cor1="azul_celeste", cor2="azul", cor3="branco"),
         bandana="azul", simbolo="espiral"),
    dict(vila="vila_exemplo_4", conjunto=dict(cor1="vinho", cor2="preto", cor3="creme"),
         bandana="vinho", simbolo="espiral"),
    dict(vila="vila_exemplo_5", conjunto=dict(cor1="laranja", cor2="marrom", cor3="creme"),
         bandana="marrom", simbolo="espiral"),
]
BASE_COLORS = {PELE: PAL["pele"]["claro"], CABELO: PAL["cabelo"]["castanho"], OLHO: PAL["olhos"]["azul"]}
HEAD_KINDS = ("olhos", "boca", "cabelo", "chapeu")


def item_colors(defaults):
    c = dict(BASE_COLORS)
    for ch, name in defaults.items():
        c[ch] = PAL["roupa"][name]
    return c


def empty4():
    return [Idx(CH, CW) for _ in range(4)]


def planes_for(fr, fig, spec, cache):
    """Os 4 planos (Idx) de um item neste frame."""
    if spec is None:
        return fr.layers["corpo"]
    if spec[0] == "dif":
        a, b = planes_for(fr, fig, spec[1], cache), planes_for(fr, fig, spec[2], cache)
        out = empty4()
        for pa, pb, po in zip(a, b, out):
            m = (pa.ch > 0) & ((pa.ch != pb.ch) | (pa.sh != pb.sh))
            po.copy_from(pa, m)
        return out
    if spec in cache:
        return cache[spec]
    kind, style = spec
    if kind in HEAD_KINDS:
        if fig.view == "back" and kind in ("olhos", "boca"):
            pl = empty4()
        else:
            pl = [HI.follow_head(p, fig) for p in HI.head_planes(kind, fig.view, HI.face_style(kind, style, fig))]
            if kind == "cabelo":
                pl = HI.fit_to_pose(pl, fig, fr.layers["corpo"])
    else:
        import clothes
        from charsys import breath_shift
        pl = clothes.build(kind, fig, fr)
        if getattr(fig, "breath", 0):
            for p in pl:
                breath_shift(p)
    cache[spec] = pl
    return pl


def build_all():
    """{(g, anim): {(slot, iid): {(vista, frame): [Idx x4]}}}"""
    data = {}
    for g, gname in GENEROS:
        for fn, aname, seq, ms, loop in ANIMS:
            cells = {}
            for vi, (v, vname) in enumerate(VIEWS):
                for f in range(3):
                    fig = fn(g, v, f)
                    fr = Frame(fig, {})
                    cache = {}
                    for slot, iid, spec, _ in ITEMS:
                        cells.setdefault((slot, iid), {})[(vi, f)] = planes_for(fr, fig, spec, cache)
            data[(g, aname)] = cells
    return data


def sheet_idx(cells, plane):
    ch = np.zeros((CH * 3, CW * 3), np.uint8)
    sh = np.zeros((CH * 3, CW * 3), np.uint8)
    for (vi, f), planes in cells.items():
        p = planes[plane]
        ch[vi * CH:(vi + 1) * CH, f * CW:(f + 1) * CW] = p.ch
        sh[vi * CH:(vi + 1) * CH, f * CW:(f + 1) * CW] = p.sh
    out = Idx(CH * 3, CW * 3)
    out.ch, out.sh = ch, sh
    return out


def idx_png(idx):
    a = np.zeros(idx.ch.shape + (4,), np.uint8)
    m = idx.ch > 0
    a[..., 0][m] = idx.ch[m] * 32
    a[..., 1][m] = idx.sh[m] * 16
    a[..., 3][m] = 255
    return Image.fromarray(a, "RGBA")


def compose_rgba(layers, colors):
    """layers: {slot: [Idx x4]} -> RGBA na ordem do jogo (plano a plano, slot a slot)."""
    h, w = next(iter(layers.values()))[0].ch.shape
    out = np.zeros((h, w, 4), np.uint8)
    for pl in range(4):
        for slot in SLOTS:
            if slot not in layers:
                continue
            img = colorize(layers[slot][pl], colors.get(slot, {}))
            m = img[..., 3] > 0
            out[m] = img[m]
    return out


# =====================================================================================
def export():
    for sub in ("camadas", "indices", "previas"):      # refaz só o que é gerado (mantém o LEIA-ME)
        if os.path.exists(os.path.join(OUT, sub)):
            shutil.rmtree(os.path.join(OUT, sub))
    os.makedirs(OUT, exist_ok=True)
    data = build_all()
    files = {}
    for (g, aname), cells in data.items():
        gname = dict(GENEROS)[g]
        dc = os.path.join(OUT, "camadas", gname, aname)
        di = os.path.join(OUT, "indices", gname, aname)
        os.makedirs(dc, exist_ok=True)
        os.makedirs(di, exist_ok=True)
        for slot, iid, spec, defaults in ITEMS:
            if (g == "m" and iid == "cilios") and False:
                continue
            for pl in range(4):
                idx = sheet_idx(cells[(slot, iid)], pl)
                if not idx.any():
                    continue
                name = "%s__%s__%s.png" % (slot, iid, PLANOS[pl])
                Image.fromarray(colorize(idx, item_colors(defaults)), "RGBA").save(os.path.join(dc, name))
                idx_png(idx).save(os.path.join(di, name))
                files.setdefault("%s/%s" % (gname, aname), []).append(
                    dict(slot=slot, item=iid, plano=PLANOS[pl], arquivo="camadas/%s/%s/%s" % (gname, aname, name),
                         indices="indices/%s/%s/%s" % (gname, aname, name)))
    write_meta(files)
    write_palettes()
    previews(data)
    qa(data)
    copy_tools()
    return data


def write_meta(files):
    meta = dict(
        versao=1,
        celula=dict(largura=CW, altura=CH),
        layout_das_folhas="3 colunas (frames 0,1,2) x 3 linhas (frente, lado, costas); célula 64x96",
        pivo=dict(x=32, y=92, nota="centro entre os pés; a linha 92 é a última linha da sola (chão)"),
        vista_lado="olhando pra ESQUERDA; pra olhar pra direita espelhe na horizontal (todas as camadas juntas)",
        vistas=[n for _, n in VIEWS],
        planos=dict(ordem=PLANOS, nota="o jogo desenha plano a plano (tras -> corpo -> frente -> topo) e, dentro de "
                                       "cada plano, os slots na ordem de 'slots'"),
        slots=SLOTS,
        regras_slots=dict(conjunto="quando equipado, esconde camisa e calça. O conjunto da vila tem as cores da "
                                   "vila do personagem, travadas (o jogador não troca)",
                          chapeu="bandana da vila: cor da faixa = cor da vila (travada); o símbolo da vila é um arquivo "
                                 "à parte (chapeu__simbolo_<vila>), desenhado logo depois da bandana",
                          camisa="o logo da vila no peito é um arquivo à parte (camisa__simbolo_<vila>), desenhado "
                                 "logo depois da camisa",
                          sapato="equipamento dos pés, camada própria (sem sapato o pé fica descalço); desenhado "
                                 "depois da roupa, então a bota cobre a barra da calça",
                          punho="vazio por enquanto", mascara="vazio por enquanto",
                          acessorio="vazio por enquanto (capa, aura, corte, asas, auréola...)"),
        animacoes={a: dict(sequencia=seq, duracao_ms=ms, repete=loop, frames=ANIM_NOTAS[a])
                   for _, a, seq, ms, loop in ANIMS},
        canais={str(k): v for k, v in CANAIS.items()},
        tons={CANAIS[k]: v for k, v in NOMES_TONS.items()},
        mapa_de_indices="PNG RGBA: R = canal x 32, G = tom x 16, A = 255 onde tem pixel. canal = round(R/32), "
                        "tom = round(G/16). Cor final = paletas.json[canal][tom] (fixo = lista 'fixo').",
        itens=[dict(slot=s, item=i, descricao=ITEM_INFO[(s, i)],
                    cores_padrao={CANAIS[c]: n for c, n in d.items()}) for s, i, _, d in ITEMS],
        vilas=dict(nota="cores travadas de cada vila (exemplos provisórios; troque pelos nomes/cores definitivos). "
                        "Os nomes das cores são as rampas de paletas.json['roupa']",
                   exemplos=VILAS),
        arquivos=files,
    )
    with open(os.path.join(OUT, "personagem.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)


def write_palettes():
    pj = dict(fixo=[list(c) for c in FIXED],
              pele={n: [list(c) for c in r] for n, r in P["pele"]},
              cabelo={n: [list(c) for c in r] for n, r in P["cabelo"]},
              olho={n: [list(c) for c in r] for n, r in P["olhos"]},
              roupa={n: [list(c) for c in r] for n, r in P["roupa"]},
              nota=dict(pele="10 tons reais, do mais escuro (ebano) ao mais claro (porcelana); 10 cores cada: "
                             + ", ".join(NOMES_TONS[PELE]),
                        cabelo="5 cores cada: escuro, sombra, base, luz, brilho",
                        olho="4 cores cada: escuro, medio, base, claro",
                        roupa="5 cores cada (vale pra cor1, cor2 e cor3 de qualquer item): escuro, sombra, base, luz, "
                              "brilho; aco/ouro/bronze são metais"))
    with open(os.path.join(OUT, "paletas.json"), "w", encoding="utf-8") as fh:
        json.dump(pj, fh, ensure_ascii=False, indent=1)
    from paletas import swatches
    os.makedirs(os.path.join(OUT, "previas"), exist_ok=True)
    swatches(os.path.join(OUT, "previas", "paletas.png"))


# =====================================================================================
# prévias
# =====================================================================================
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
INK = (20, 16, 34, 255)
PANEL = (234, 236, 243, 255)

LOOKS = {   # visual: itens por slot (o símbolo vai por cima do item base do mesmo slot)
    "vila": {"corpo": ["base"], "olhos": [], "boca": ["sorriso"], "cabelo": ["espetado"],
             "chapeu": ["bandana", "simbolo_espiral"], "conjunto": ["vila"], "sapato": ["sandalia"]},
    "basica": {"corpo": ["base"], "olhos": [], "boca": ["sorriso"], "cabelo": ["espetado"],
               "camisa": ["basica", "simbolo_espiral"], "calca": ["basica"], "sapato": ["bota"]},
}


def merge(planes_list):
    out = empty4()
    for pls in planes_list:
        for po, p in zip(out, pls):
            po.copy_from(p, p.ch > 0)
    return out


def look_layers(cells, vi, f, look, g):
    out = {}
    for slot, iids in LOOKS[look].items():
        if slot == "olhos":
            iids = ["masculino" if g == "m" else "cilios"]
        if slot == "cabelo" and g == "f":
            iids = ["longo_lateral"]
        out[slot] = merge([cells[(slot, i)][(vi, f)] for i in iids])
    return out


def look_colors(look, vila=None):
    c = {}
    for slot, iid, spec, d in ITEMS:
        c.setdefault(slot, item_colors(d))
    for slot, iid, spec, d in ITEMS:                 # as cores padrão do item que o visual usa no slot
        if LOOKS[look].get(slot, [None])[:1] == [iid]:
            c[slot] = item_colors(d)
    if vila:
        k = vila["conjunto"]
        c["conjunto"].update({COR1: PAL["roupa"][k["cor1"]], COR2: PAL["roupa"][k["cor2"]], COR3: PAL["roupa"][k["cor3"]]})
        c["chapeu"].update({COR1: PAL["roupa"][vila["bandana"]]})
    return c


def frame_img(cells, vi, f, look, g, sc, colors=None):
    a = compose_rgba(look_layers(cells, vi, f, look, g), colors or look_colors(look))
    return Image.fromarray(a, "RGBA").crop((4, 0, 60, 96)).resize((56 * sc, 96 * sc), Image.NEAREST)


def previews(data):
    d = os.path.join(OUT, "previas")
    os.makedirs(d, exist_ok=True)
    sc = 3
    cw, chh = 56 * sc, 96 * sc
    f1, f2, f3 = ImageFont.truetype(FONT, 26), ImageFont.truetype(FONT, 17), ImageFont.truetype(FONT_R, 14)
    for g, gname in GENEROS:
        for look in LOOKS:
            # prancha: colunas = animações x frames, linhas = vistas
            W_ = 150 + len(ANIMS) * (3 * (cw + 6) + 24)
            H_ = 110 + 3 * (chh + 14)
            can = Image.new("RGBA", (W_, H_), (248, 248, 252, 255))
            dr = ImageDraw.Draw(can)
            dr.text((20, 16), "%s · %s · todas as animações (camadas compostas)" %
                    (gname.upper(), "conjunto da vila" if look == "vila" else "camisa + calça básicas"), fill=INK, font=f1)
            for ai, (fn, aname, seq, ms, loop) in enumerate(ANIMS):
                x0 = 150 + ai * (3 * (cw + 6) + 24)
                dr.text((x0, 60), aname, fill=INK, font=f2)
                for f in range(3):
                    dr.text((x0 + f * (cw + 6) + 4, 84), "frame %d" % f, fill=(90, 90, 110, 255), font=f3)
                for vi, (v, vname) in enumerate(VIEWS):
                    y = 104 + vi * (chh + 14)
                    if ai == 0:
                        dr.text((20, y + chh // 2 - 10), vname, fill=INK, font=f2)
                    for f in range(3):
                        x = x0 + f * (cw + 6)
                        panel = Image.new("RGBA", (cw, chh), PANEL)
                        panel.alpha_composite(frame_img(data[(g, aname)], vi, f, look, g, sc))
                        can.alpha_composite(panel, (x, y))
            can.save(os.path.join(d, "prancha_%s_%s.png" % (gname, look)))
            # GIFs: as 3 vistas lado a lado, na sequência e tempo do jogo
            for fn, aname, seq, ms, loop in ANIMS:
                frames = []
                for f in seq:
                    im = Image.new("RGB", (3 * cw, chh), PANEL[:3])
                    for vi in range(3):
                        fi = frame_img(data[(g, aname)], vi, f, look, g, sc)
                        im.paste(fi, (vi * cw, 0), fi)
                    frames.append(im)
                frames[0].save(os.path.join(d, "%s_%s_%s.gif" % (gname, look, aname)), save_all=True,
                               append_images=frames[1:], duration=ms, loop=0)
    exploded(data)
    variety(data)
    vilas(data)


def vilas(data):
    """Conjunto + bandana de cada vila (cores travadas por vila; exemplos provisórios)."""
    d = os.path.join(OUT, "previas")
    sc = 3
    cw, chh = 56 * sc, 96 * sc
    can = Image.new("RGBA", (20 + len(VILAS) * 2 * (cw + 8) + len(VILAS) * 14, 110 + chh), (248, 248, 252, 255))
    dr = ImageDraw.Draw(can)
    dr.text((20, 14), "Conjunto da vila: cada vila tem cores próprias e travadas (exemplos provisórios)",
            fill=INK, font=ImageFont.truetype(FONT, 24))
    x = 20
    for vila in VILAS:
        dr.text((x, 56), vila["vila"], fill=INK, font=ImageFont.truetype(FONT, 16))
        for g in ("m", "f"):
            im = frame_img(data[(g, "parado")], 0, 0, "vila", g, sc, look_colors("vila", vila))
            panel = Image.new("RGBA", (cw, chh), PANEL)
            panel.alpha_composite(im)
            can.alpha_composite(panel, (x, 84))
            x += cw + 8
        x += 14
    can.save(os.path.join(d, "vilas_exemplo.png"))


def exploded(data):
    """Um frame aberto em camadas: cada slot sozinho + resultado, e a ordem de desenho por plano."""
    d = os.path.join(OUT, "previas")
    sc = 4
    cw, chh = 56 * sc, 96 * sc
    f1, f2, f3 = ImageFont.truetype(FONT, 24), ImageFont.truetype(FONT, 16), ImageFont.truetype(FONT_R, 13)
    for look in LOOKS:
        cells = data[("m", "andar")]
        vi, f = 1, 0
        lay = look_layers(cells, vi, f, look, "m")
        cols = look_colors(look)
        order = [s for s in SLOTS if s in lay]
        W_ = 40 + (len(order) + 1) * (cw + 16)
        can = Image.new("RGBA", (W_, chh + 150), (248, 248, 252, 255))
        dr = ImageDraw.Draw(can)
        dr.text((20, 14), "Camadas separadas (andar, lado, frame 0) — cada slot é um arquivo; dá pra trocar e recolorir",
                fill=INK, font=f1)
        for i, slot in enumerate(order + ["RESULTADO"]):
            x = 20 + i * (cw + 16)
            if slot == "RESULTADO":
                a = compose_rgba(lay, cols)
                sub = "tudo junto"
            else:
                a = compose_rgba({slot: lay[slot]}, cols)
                used = [PLANOS[p] for p in range(4) if lay[slot][p].any()]
                sub = "planos: " + ", ".join(used)
            im = Image.fromarray(a, "RGBA").crop((4, 0, 60, 96)).resize((cw, chh), Image.NEAREST)
            panel = Image.new("RGBA", (cw, chh), PANEL)
            panel.alpha_composite(im)
            can.alpha_composite(panel, (x, 90))
            dr.text((x, 56), slot, fill=INK, font=f2)
            dr.text((x, 96 + chh), sub, fill=(90, 90, 110, 255), font=f3)
        can.save(os.path.join(d, "camadas_separadas_%s.png" % look))


def variety(data):
    """Mesmo boneco com cores diferentes de pele (escura -> clara), cabelo, olhos e roupas."""
    d = os.path.join(OUT, "previas")
    sc = 3
    cw, chh = 56 * sc, 96 * sc
    skins = [n for n, _ in P["pele"]]
    hairs = [n for n, _ in P["cabelo"]]
    eyes = [n for n, _ in P["olhos"]]
    cl = [n for n, _ in P["roupa"]][:18]
    rows = []
    for look, g in (("vila", "m"), ("basica", "f")):
        row = []
        for i, sk in enumerate(skins):
            base = {PELE: PAL["pele"][sk], CABELO: PAL["cabelo"][hairs[(i * 3 + 1) % len(hairs)]],
                    OLHO: PAL["olhos"][eyes[(i * 5 + 2) % len(eyes)]]}
            c = {}
            for slot, iid, spec, dd in ITEMS:
                c[slot] = dict(base)
            c["chapeu"].update({COR1: PAL["roupa"][cl[(i * 7) % 18]], COR2: PAL["roupa"]["aco" if i % 3 else "ouro"]})
            c["conjunto"].update({COR1: PAL["roupa"][cl[(i * 5 + 1) % 18]], COR2: PAL["roupa"][cl[(i * 5 + 9) % 18]],
                                  COR3: PAL["roupa"][cl[(i * 3 + 2) % 18]]})
            c["camisa"].update({COR1: PAL["roupa"][cl[(i * 5 + 3) % 18]], COR2: PAL["roupa"][cl[(i * 7 + 4) % 18]],
                                COR3: PAL["roupa"][cl[(i * 3 + 2) % 18]]})
            c["calca"].update({COR1: PAL["roupa"][cl[(i * 5 + 11) % 18]], COR2: PAL["roupa"]["creme"],
                               COR3: PAL["roupa"]["marrom"]})
            c["sapato"].update({COR1: PAL["roupa"][cl[(i * 7 + 5) % 18]], COR2: PAL["roupa"]["creme"],
                                COR3: PAL["roupa"]["preto"]})
            row.append(frame_img(data[(g, "parado")], 0, 0, look, g, sc, c))
        rows.append(row)
    can = Image.new("RGBA", (20 + 10 * (cw + 8), 70 + 2 * (chh + 12)), (248, 248, 252, 255))
    dr = ImageDraw.Draw(can)
    dr.text((20, 16), "Recolor: 10 tons de pele (do mais escuro ao mais claro) + cabelo, olhos e roupas trocados",
            fill=INK, font=ImageFont.truetype(FONT, 24))
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            panel = Image.new("RGBA", (cw, chh), PANEL)
            panel.alpha_composite(im)
            can.alpha_composite(panel, (20 + c * (cw + 8), 60 + r * (chh + 12)))
    can.save(os.path.join(d, "recolor_exemplos.png"))


# =====================================================================================
# checagens
# =====================================================================================
def qa(data):
    lines = []
    ok = True
    for (g, aname), cells in data.items():
        for look in LOOKS:
            for vi, (v, vname) in enumerate(VIEWS):
                for f in range(3):
                    lay = look_layers(cells, vi, f, look, g)
                    a = compose_rgba(lay, look_colors(look))
                    ys = np.where(a[..., 3].any(axis=1))[0]
                    low = int(ys.max())
                    # roupa de baixo aparecendo por baixo da roupa
                    body = lay["corpo"]
                    uw = np.zeros((CH, CW), bool)
                    for pl in range(4):
                        uw |= (body[pl].ch == FIXO) & np.isin(body[pl].sh, [F_UW_HI, F_UW, F_UW_SH, F_UW_DK])
                    above = np.zeros((CH, CW), bool)
                    for s, pls in lay.items():
                        if s == "corpo":
                            continue
                        for pl in range(4):
                            above |= pls[pl].ch > 0
                    show = int((uw & ~above).sum())
                    flag = []
                    if low != 92:
                        flag.append("pé fora do chão (última linha %d)" % low)
                    if show:
                        flag.append("%d px de roupa de baixo à mostra" % show)
                    if flag:
                        ok = ok and not show
                        lines.append("%s %s %s %s f%d: %s" % (g, aname, look, vname, f, "; ".join(flag)))
    # ida e volta: índice -> cor = PNG colorido
    bad = 0
    for root, _, fs in os.walk(os.path.join(OUT, "indices")):
        for fn in fs:
            pi = os.path.join(root, fn)
            pc = pi.replace(os.sep + "indices" + os.sep, os.sep + "camadas" + os.sep)
            a = np.array(Image.open(pi))
            c = np.array(Image.open(pc))
            if not np.array_equal(a[..., 3] > 0, c[..., 3] > 0):
                bad += 1
    lines.append("mapas de índice x PNG colorido: %d arquivos com máscara diferente" % bad)
    txt = "\n".join(lines)
    with open(os.path.join(OUT, "previas", "checagem.txt"), "w", encoding="utf-8") as fh:
        fh.write(txt + "\n")
    print(txt)


def copy_tools():
    """A ferramenta de recolor vai junto da saída (o gerador fica em arte/personagem-chibi/gerador)."""
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(OUT, "ferramentas"), exist_ok=True)
    shutil.copy(os.path.join(here, "recolorir.py"), os.path.join(OUT, "ferramentas"))


if __name__ == "__main__":
    export()
    print("ok")
