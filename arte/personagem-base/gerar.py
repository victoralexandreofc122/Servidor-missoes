# Gera as peças-base do personagem (pixel art) para o Nin Online Mobile.
# Cada peça é desenhada como uma MÁSCARA de cores (letras) num quadro de 32x48 px.
# O contorno (1 px) e o sombreado (luz em cima/esquerda, sombra embaixo/direita) são
# calculados aqui, peça por peça: assim todas têm o mesmo acabamento e cada uma fica
# completa sozinha (a cabeça existe inteira por baixo do cabelo, a perna por baixo da calça).
import json, os, shutil, zipfile
from PIL import Image, ImageDraw, ImageFont

W, H = 32, 48
OUT = 'personagem-base'
OUTLINE = (26, 21, 48, 255)

# Rampas: letra-base -> (luz, base, sombra). Letras de detalhe têm cor fixa.
RAMP = {
    's': ((255, 214, 170), (242, 185, 138), (201, 138, 94)),     # pele
    'h': ((70, 70, 92), (40, 40, 54), (24, 24, 34)),             # cabelo
    'g': ((86, 132, 226), (47, 95, 191), (31, 63, 138)),         # roupa de cima (azul)
    'n': ((60, 60, 76), (28, 28, 36), (16, 16, 22)),             # faixa (preta)
    'p': ((62, 68, 104), (42, 47, 74), (28, 32, 54)),            # calça
    'f': ((84, 76, 110), (59, 53, 80), (38, 34, 54)),            # sapato
    'm': ((104, 104, 140), (74, 74, 106), (52, 52, 78)),         # munhequeira
    'r': ((240, 90, 90), (216, 50, 58), (156, 31, 42)),          # bandana (vermelha)
    't': ((242, 246, 250), (201, 210, 220), (138, 150, 166)),    # metal
    'u': ((122, 70, 46), (90, 46, 30), (60, 30, 20)),            # cabo (couro)
}
FIXED = {
    'e': (28, 28, 40), 'w': (232, 238, 247), 'b': (74, 90, 122),   # olho escuro, brilho, íris
    'M': (180, 110, 80),                                           # boca
    'S': (201, 138, 94), 'G': (31, 63, 138), 'N': (16, 16, 22),
    'l': (120, 160, 240),                                          # gola (azul claro)
    'P': (28, 32, 54), 'R': (156, 31, 42), 'T': (138, 150, 166),
    'i': (255, 255, 255), 'y': (217, 164, 65), 'k': (110, 30, 30),
}


def grid(x0, y0, rows):
    return (x0, y0, rows)


def render(spec, dark=False):
    """spec = (x0, y0, rows) -> imagem RGBA 32x48 com contorno e sombreado."""
    x0, y0, rows = spec
    mask = {}
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch not in '. ':
                mask[(x0 + i, y0 + j)] = ch
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = img.load()
    inside = lambda p: p in mask
    for (x, y), ch in mask.items():
        if not (0 <= x < W and 0 <= y < H):
            continue
        if ch in RAMP:
            light, base, shade = RAMP[ch]
            if dark:
                c = shade
            elif not inside((x, y + 1)) or not inside((x + 1, y)):
                c = shade
            elif not inside((x, y - 1)) or not inside((x - 1, y)):
                c = light
            else:
                c = base
        else:
            c = FIXED[ch]
        px[x, y] = (*c, 255)
    for (x, y) in list(mask):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in mask and 0 <= q[0] < W and 0 <= q[1] < H:
                px[q] = OUTLINE
    return img


def mirror(rows_spec):
    """Espelha um spec (x0, y0, rows) no quadro de 32 px."""
    x0, y0, rows = rows_spec
    w = max(len(r) for r in rows)
    rows = [r.ljust(w, '.')[::-1] for r in rows]
    return (W - x0 - w, y0, rows)


# ====================================================================== FRENTE (baixo)
F = {}
F['cabeca'] = grid(7, 7, [
    "....ssssssssss....",
    "..ssssssssssssss..",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    "ssssssssssssssssss",
    "Sssssssssssssssss S".replace(' ', ''),
    "Sssseesssssseessss",
    "Ssssewssssssewssss",
    ".sssebsssssseebss.".replace('eebss', 'ebsss'),
    ".ssssssssssssssss.",
    "..ssssssMMssssss..",
    "...ssssssssssss...",
    ".....ssssssss.....",
])
F['cabelo'] = grid(5, 1, [
    "........h.....h.......",
    "......hhh...hhh...h...",
    "..h...hhhh.hhhhh.hh...",
    "..hh.hhhhhhhhhhhhhh...",
    "...hhhhhhhhhhhhhhhh.h.",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhhh",
    "hhhhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhh..",
    "..hhhhhh.hhhhh.hhhhhh.",
    ".hhhhh...hhh....hhhhh.",
    ".hhhh.....h......hhhh.",
    "..hhh.............hhh.",
    "..hh..............hh..",
    "..h................h..",
])
F['tronco'] = grid(10, 21, [
    "....ssss....",
    "....ssss....",
    ".ssssssssss.",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    "ssssssssssss",
    ".ssssssssss.",
    ".ssssssssss.",
    ".ssssssssss.",
    ".ssssssssss.",
    ".ssssssssss.",
    ".ssssssssss.",
])
# braço direito do personagem = lado ESQUERDO da tela, de frente
F['braco_dir'] = grid(6, 23, [
    "..ss", ".sss", ".sss", ".sss", ".sss", "sss.", "sss.", "sss.", "ssss", "ssss", ".ss.",
])
F['braco_esq'] = mirror(F['braco_dir'])
F['perna_dir'] = grid(12, 33, ["ssss"] * 11)
F['perna_esq'] = mirror(F['perna_dir'])
F['roupa_cima'] = grid(10, 22, [
    "..ggg..ggg..",
    ".gggg..gggg.",
    "gggggl.ggggg",
    "ggggggllgggg",
    "gggggggllggg",
    "ggggggggllgg",
    "gggggggggggg",
    ".gggggggggg.",
    ".nnnnnnnnnn.",
    ".nnnnNNnnnn.",
    ".ggggnngggg.",
    ".gggg.n.ggg.",
    ".ggg....ggg.",
])
F['munhequeira_dir'] = grid(6, 29, ["mmm", "mmm"])
F['munhequeira_esq'] = mirror(F['munhequeira_dir'])
F['calca_dir'] = grid(11, 32, [
    ".pppp", "ppppp", "ppppp", "ppppp", "ppppp", ".pppp", ".pppp", ".pppp", ".PPPP", ".PPPP",
])
F['calca_esq'] = mirror(F['calca_dir'])
F['sapato_dir'] = grid(10, 42, ["..fff.", ".ffff.", "fffff."])
F['sapato_esq'] = mirror(F['sapato_dir'])
F['bandana'] = grid(7, 11, [
    "rrrrrrrrrrrrrrrrrr......",
    "rrrrrrrrrrrrrrrrrrrr....",
    "..................rrrr..",
    "...................rRrr.",
    "....................rr.r",
])

# ====================================================================== COSTAS (cima)
B = {}
B['cabeca'] = grid(7, 7, [
    "....ssssssssss....",
    "..ssssssssssssss..",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    "ssssssssssssssssss",
    "Sssssssssssssssss S".replace(' ', ''),
    "ssssssssssssssssss",
    "ssssssssssssssssss",
    ".ssssssssssssssss.",
    ".ssssssssssssssss.",
    "..ssssssssssssss..",
    "...ssssssssssss...",
    ".....ssssssss.....",
])
B['cabelo'] = grid(5, 1, [
    "........h.....h.......",
    "......hhh...hhh...h...",
    "..h...hhhh.hhhhh.hh...",
    "..hh.hhhhhhhhhhhhhh...",
    "...hhhhhhhhhhhhhhhh.h.",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhhh",
    "hhhhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhh..",
    ".hhhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhh..",
    "..hhhhhhhhhhhhhhhhhh..",
    "...hhhhhhhhhhhhhhhh...",
    "...hh.hhhhhhhhhh.hh...",
    "......hhh.hhh.hhh.....",
    ".......h...h...h......",
])
B['tronco'] = F['tronco']
B['braco_esq'] = F['braco_dir']        # de costas, o braço esquerdo fica à esquerda da tela
B['braco_dir'] = F['braco_esq']
B['perna_esq'] = F['perna_dir']
B['perna_dir'] = F['perna_esq']
B['roupa_cima'] = grid(10, 22, [
    "..gggggggg..",
    ".gggggggggg.",
    "gggggggggggg",
    "gggggggggggg",
    "gggggggggggg",
    "gggggggggggg",
    "gggggggggggg",
    ".gggggggggg.",
    ".nnnnnnnnnn.",
    ".nnnnNNnnnn.",
    ".ggggnngggg.",
    ".ggggnnnggg.",
    ".ggg.n..ggg.",
])
B['munhequeira_esq'] = F['munhequeira_dir']
B['munhequeira_dir'] = F['munhequeira_esq']
B['calca_esq'] = F['calca_dir']
B['calca_dir'] = F['calca_esq']
B['sapato_esq'] = grid(11, 42, [".fff.", "ffff.", "ffff."])
B['sapato_dir'] = mirror(B['sapato_esq'])
B['bandana'] = grid(7, 11, [
    "rrrrrrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrrrrrr",
    "......rRRRRr......",
    ".......rrrr.......",
    "......rrr.rr......",
    "......rr...rr.....",
    ".....rr.....r.....",
    ".....r......r.....",
])

# ====================================================================== LADO (olhando para a esquerda)
L = {}
L['cabeca'] = grid(8, 7, [
    "....ssssssss....",
    "..ssssssssssss..",
    ".ssssssssssssss.",
    ".ssssssssssssss.",
    "ssssssssssssssss",
    "ssssssssssssssss",
    "ssssssssssssssss",
    "ssssssssssSSssss",
    "sseessssssSSssss",
    "sewessssssSsssss",
    ".sbessssssssssss",
    ".ssssssssssssss.",
    "MMssssssssssss..",
    ".ssssssssssss...",
    "...ssssssss.....",
])
L['cabelo'] = grid(6, 1, [
    "..........h.....h.....",
    ".......hhhh...hhh.....",
    "....hhhhhhhhhhhhh..h..",
    "...hhhhhhhhhhhhhhhhh..",
    "..hhhhhhhhhhhhhhhhhhhh",
    "..hhhhhhhhhhhhhhhhhhh.",
    ".hhhhhhhhhhhhhhhhhhhhh",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "hhhhhhhhhhhhhhhhhhhhhh",
    ".hhhhhhhhhhhhhhhhhhhh.",
    "..hhhhhhhhhhhhhhhhhhhh",
    "..hhh.hhh...hhhhhhhhh.",
    "..hh...h.....hhhhhhhh.",
    "..h...........hhhhhh..",
    "...............hhhhh.h",
    "...............hhhhh..",
    "................hhh...",
    ".................h....",
])
L['tronco'] = grid(12, 21, [
    "..sss...",
    "..sss...",
    ".ssssss.",
    "ssssssss",
    "ssssssss",
    "ssssssss",
    "ssssssss",
    "ssssssss",
    ".ssssss.",
    ".ssssss.",
    ".ssssss.",
    ".ssssss.",
    ".ssssss.",
])
# olhando para a esquerda: o braço ESQUERDO fica na frente (perto), o direito atrás (longe)
L['braco_esq'] = grid(13, 23, ["sss", "sss", "sss", "sss", "sss", "sss", "sss", "sss", "sss.", "ssss", ".ss."])
L['braco_dir'] = grid(16, 23, ["sss", "sss", "sss", "sss", "sss", "sss", "sss", "sss", "sss", "sss", ".s."])
L['perna_esq'] = grid(12, 33, ["ssss"] * 11)
L['perna_dir'] = grid(15, 33, ["ssss"] * 11)
L['roupa_cima'] = grid(11, 22, [
    "..ggg.....",
    ".lgggggg..",
    "glgggggggg",
    "ggllgggggg",
    "gggglggggg",
    "gggggggggg",
    "gggggggggg",
    ".gggggggg.",
    "nnnnnnnnnn",
    "nnnnnnnnnN",
    "gggggggggn",
    ".ggggggggn",
    ".ggg..ggg.",
])
L['munhequeira_esq'] = grid(13, 29, ["mmm", "mmm"])
L['munhequeira_dir'] = grid(16, 29, ["mmm", "mmm"])
L['calca_esq'] = grid(11, 32, ["ppppp", "ppppp", "ppppp", "ppppp", "ppppp", ".pppp", ".pppp", ".pppp", ".PPPP", ".PPPP"])
L['calca_dir'] = grid(15, 32, ["pppp", "pppp", "pppp", "pppp", "pppp", "pppp", "pppp", "pppp", "PPPP", "PPPP"])
L['sapato_esq'] = grid(10, 42, ["...fff", "..ffff", "ffffff"])
L['sapato_dir'] = grid(13, 42, ["...fff", "..ffff", "ffffff"])
L['bandana'] = grid(8, 11, [
    "rrrrrrrrrrrrrrr.....",
    "rrrrrrrrrrrrrrrrr...",
    "...............rrrr.",
    "...............rRrrr",
    "................rr.r",
    "................r...",
])

# Ordem das camadas (de trás para a frente) e quais peças ficam "longe" (mais escuras).
LAYERS = {
    'baixo': ['perna_dir', 'perna_esq', 'calca_dir', 'calca_esq', 'sapato_dir', 'sapato_esq', 'tronco', 'roupa_cima',
              'braco_dir', 'braco_esq', 'munhequeira_dir', 'munhequeira_esq', 'cabeca', 'cabelo', 'bandana'],
    'cima': ['bandana_caudas', 'perna_dir', 'perna_esq', 'calca_dir', 'calca_esq', 'sapato_dir', 'sapato_esq', 'tronco', 'roupa_cima',
             'braco_dir', 'braco_esq', 'munhequeira_dir', 'munhequeira_esq', 'cabeca', 'cabelo', 'bandana'],
    'esquerda': ['braco_dir', 'munhequeira_dir', 'perna_dir', 'calca_dir', 'sapato_dir', 'perna_esq', 'calca_esq', 'sapato_esq',
                 'tronco', 'roupa_cima', 'cabeca', 'cabelo', 'bandana', 'braco_esq', 'munhequeira_esq'],
}
LAYERS['cima'].remove('bandana_caudas')
LAYERS['direita'] = [p.replace('_esq', '_X').replace('_dir', '_esq').replace('_X', '_dir') for p in LAYERS['esquerda']]
FAR = {'esquerda': {'braco_dir', 'munhequeira_dir', 'perna_dir', 'calca_dir', 'sapato_dir'}}
FAR['direita'] = {p.replace('_dir', '_esq') for p in FAR['esquerda']}

PARTS = ['cabeca', 'cabelo', 'tronco', 'braco_esq', 'braco_dir', 'perna_esq', 'perna_dir', 'roupa_cima',
         'munhequeira_esq', 'munhequeira_dir', 'calca_esq', 'calca_dir', 'sapato_esq', 'sapato_dir', 'bandana']
DIRS = ['baixo', 'esquerda', 'direita', 'cima']


def part_img(direction, name):
    if direction == 'baixo':
        return render(F[name])
    if direction == 'cima':
        return render(B[name])
    if direction == 'esquerda':
        return render(L[name], dark=name in FAR['esquerda'])
    # direita = espelho da esquerda, com esquerdo/direito trocados
    src = name.replace('_esq', '_X').replace('_dir', '_esq').replace('_X', '_dir')
    return render(L[src], dark=src in FAR['esquerda']).transpose(Image.FLIP_LEFT_RIGHT)


# ====================================================================== ARMAS (quadro próprio, empunhadura marcada)
WEAPONS = {
    'kunai': (20, 7, (4, 3), [
        "............ttt.....",
        ".tt.......y.tttttt..",
        "t..tuuuuuuyiTTTTTTTt",
        ".tt.......y.tttttt..",
        "............ttt.....",
    ]),
    'espada': (36, 7, (5, 3), [
        "...........yy.......................",
        ".nuuuuuuuuuyyitttttttttttttttttttti..",
        "nuyuyuyuyuuyytTTTTTTTTTTTTTTTTTTTTTt",
        ".nuuuuuuuuuyyitttttttttttttttttttti..",
        "...........yy.......................",
    ]),
    'shuriken': (15, 15, (7, 7), None),
}


def shuriken_rows():
    # Uma lâmina (para cima, inclinada como cata-vento) girada 4 vezes em volta do centro (7, 7).
    blade = {(7, 0), (7, 1), (8, 1), (7, 2), (8, 2), (6, 3), (7, 3), (8, 3), (6, 4), (7, 4), (8, 4), (9, 4),
             (6, 5), (7, 5), (8, 5), (9, 5), (6, 6), (7, 6), (8, 6), (9, 6)}
    pts = set()
    for x, y in blade:
        for _ in range(4):
            pts.add((x, y))
            x, y = 14 - y, x
    pts.discard((7, 7))                       # furo no meio
    return [''.join('t' if (x, y) in pts else '.' for x in range(15)) for y in range(15)]


def weapon_img(name):
    w, h, _, rows = WEAPONS[name]
    rows = rows or shuriken_rows()
    global W, H
    saveW, saveH = W, H
    W, H = w + 2, h + 2
    img = render((1, 1, rows))
    W, H = saveW, saveH
    return img


def compose(direction, parts=None, weapon=None):
    base = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for name in LAYERS[direction]:
        if parts is None or name in parts:
            base.alpha_composite(part_img(direction, name))
    return base


# Pontos de articulação (pivôs), em pixels do quadro 32x48, para girar/mover as peças na animação.
PIVOTS = {
    'baixo': {'pescoco': [15.5, 21.5], 'ombro_dir': [8, 23.5], 'ombro_esq': [23, 23.5], 'quadril_dir': [14, 33], 'quadril_esq': [18, 33],
              'mao_dir': [7.5, 32.5], 'mao_esq': [24.5, 32.5]},
    'cima': {'pescoco': [15.5, 21.5], 'ombro_esq': [8, 23.5], 'ombro_dir': [23, 23.5], 'quadril_esq': [14, 33], 'quadril_dir': [18, 33],
             'mao_esq': [7.5, 32.5], 'mao_dir': [24.5, 32.5]},
    'esquerda': {'pescoco': [15, 21.5], 'ombro_esq': [14.5, 23.5], 'ombro_dir': [17.5, 23.5], 'quadril_esq': [14, 33], 'quadril_dir': [17, 33],
                 'mao_esq': [14.5, 32.5], 'mao_dir': [17, 32.5]},
}
PIVOTS['direita'] = {k.replace('_esq', '_X').replace('_dir', '_esq').replace('_X', '_dir'): [W - 1 - v[0], v[1]] for k, v in PIVOTS['esquerda'].items()}


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(f'{OUT}/pecas', exist_ok=True)
    os.makedirs(f'{OUT}/folhas', exist_ok=True)
    os.makedirs(f'{OUT}/armas', exist_ok=True)
    for name in PARTS:
        sheet = Image.new('RGBA', (W * 4, H), (0, 0, 0, 0))
        for k, d in enumerate(DIRS):
            img = part_img(d, name)
            os.makedirs(f'{OUT}/pecas/{d}', exist_ok=True)
            img.save(f'{OUT}/pecas/{d}/{name}.png')
            sheet.alpha_composite(img, (W * k, 0))
        sheet.save(f'{OUT}/folhas/{name}.png')
    full = Image.new('RGBA', (W * 4, H), (0, 0, 0, 0))
    for k, d in enumerate(DIRS):
        full.alpha_composite(compose(d), (W * k, 0))
    full.save(f'{OUT}/folhas/personagem_completo.png')
    for name in WEAPONS:
        weapon_img(name).save(f'{OUT}/armas/{name}.png')
    manifest = {
        'jogo': 'Nin Online Mobile',
        'quadro': {'largura': W, 'altura': H, 'pixel_art': True, 'escala_sugerida': 'inteira (x2, x3, x4), sem suavizar'},
        'direcoes': DIRS,
        'folhas': 'folhas/<peca>.png: 4 quadros lado a lado, na ordem de "direcoes"',
        'lados': 'esq/dir = lado do PERSONAGEM (de frente, o braço direito fica à esquerda da tela)',
        'camadas': LAYERS,
        'pecas_longe': {d: sorted(v) for d, v in FAR.items()},
        'pivos': PIVOTS,
        'armas': {n: {'arquivo': f'armas/{n}.png', 'empunhadura': [WEAPONS[n][2][0] + 1, WEAPONS[n][2][1] + 1]} for n in WEAPONS},
        'paleta': {k: {'luz': '#%02x%02x%02x' % v[0], 'base': '#%02x%02x%02x' % v[1], 'sombra': '#%02x%02x%02x' % v[2]} for k, v in RAMP.items()},
        'contorno': '#%02x%02x%02x' % OUTLINE[:3],
    }
    with open(f'{OUT}/manifesto.json', 'w', encoding='utf8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
