# Prancha dos visuais (V39): o boneco + as armas de verdade do jogo (public/assets/weapons, ARMAS em weaponData.js)
# desenhadas nas âncoras que o boneco devolve, como o jogo faz. Uso: python3 visuais.py pasta_do_visuais.mjs saida
import sys, json, re
from PIL import Image, ImageDraw
pasta, saida = sys.argv[1], sys.argv[2]
txt = open('public/weaponData.js').read()
ARMAS = json.loads(re.search(r'export const ARMAS = (\{.*\});', txt).group(1))['armas']
D = json.load(open(f'{pasta}/meta.json')); META, LOOKS = D['meta'], D['looks']
def folha(code, tipo):
    a = ARMAS.get(code, {}).get(tipo)
    return (a, Image.open('public/' + a['arquivo']).convert('RGBA')) if a else (None, None)
def comp(base_png, anc, look):
    """O quadro 64x96 com as armas, numa tela maior (as armas passam do quadro)."""
    tela = Image.new('RGBA', (120, 120), (0, 0, 0, 0)); ox, oy = 28, 12
    fig = Image.open(base_png).convert('RGBA')
    costas = look.get('costasArma')
    if costas:
        a, img = folha(costas, 'costas')
        if a:
            w, h = a['quadro']; v = anc['vista']; dx, dy = a['desloc'][v]
            fr = img.crop((v * w, 0, v * w + w, h))
            if anc['flip']: fr = fr.transpose(Image.FLIP_LEFT_RIGHT); dx = -dx
            pos = (int(round(ox + anc['costas'][0] + dx - a['ancora'][0])), int(round(oy + anc['costas'][1] + dy - a['ancora'][1])))
            if not anc['costasNaFrente']: tela.alpha_composite(fr, pos)
    tela.alpha_composite(fig, (ox, oy))
    if costas and a and anc['costasNaFrente']: tela.alpha_composite(fr, pos)
    mao = look.get('maoArma')
    if mao:
        a, img = folha(mao, 'mao')
        if a:
            w, h = a['quadro']; k = int(round((anc['mao'][2] % 360) / 22.5)) % a['angulos']
            fr = img.crop((k * w, 0, k * w + w, h))
            tela.alpha_composite(fr, (int(round(ox + anc['mao'][0] - a['ancora'][0])), int(round(oy + anc['mao'][1] - a['ancora'][1]))))
    return tela
VS = ['frente', 'costas', 'direita', 'esquerda']; sc = 2; BG = (205, 211, 222, 255)
n = len(LOOKS); cw = 4 * 100 * sc
o = Image.new('RGBA', (3 * cw, ((n + 2) // 3) * 110 * sc), BG)
for i, look in enumerate(LOOKS):
    for j, v in enumerate(VS):
        t = comp(f'{pasta}/l{i}_{v}.png', META[f'l{i}_{v}'], look).crop((10, 0, 110, 110)).resize((100 * sc, 110 * sc), Image.NEAREST)
        o.alpha_composite(t, ((i % 3) * cw + j * 100 * sc, (i // 3) * 110 * sc))
o.save(f'{saida}/galeria_visuais.png')
# visuais andando (frente e lado)
fs = []
for k in range(6):
    fr = Image.new('RGBA', (6 * 2 * 100 * 2, 110 * 2), BG)
    for c, i in enumerate([0, 2, 3, 4, 6, 7]):
        for j, v in enumerate(['frente', 'direita']):
            t = comp(f'{pasta}/a{i}_{v}_{k}.png', META[f'a{i}_{v}_{k}'], LOOKS[i]).crop((10, 0, 110, 110)).resize((200, 220), Image.NEAREST)
            fr.alpha_composite(t, ((c * 2 + j) * 200, 0))
    fs.append(fr.convert('RGB'))
fs[0].save(f'{saida}/visuais_andando.gif', save_all=True, append_images=fs[1:] + fs, duration=[120, 130, 120, 130, 120, 130] * 2, loop=0)
# camadas completas + prioridade por vista (visual 0)
for v in VS:
    segs = META[f'seg_{v}']
    o = Image.new('RGBA', (len(segs) * 64 * 3, 96 * 3 + 30), BG); d = ImageDraw.Draw(o)
    for g, nome in enumerate(segs):
        d.text((g * 192 + 4, 4), f'{g + 1}. {nome}', fill=(20, 24, 43))
        im = Image.open(f'{pasta}/seg_{v}_{g}.png').convert('RGBA').resize((192, 288), Image.NEAREST); o.alpha_composite(im, (g * 192, 26))
    o.save(f'{saida}/camadas_{v}.png')
print('ok')
