# Animações do boneco: cada quadro só gira/move as peças (rig). Saída: folhas de sprite e GIFs.
import json, math, os
from PIL import Image, ImageDraw
import rig

DIRS = ['baixo', 'esquerda', 'direita', 'cima']

# ------------------------------------------------------------------ efeitos
def impacto(k):
    def fx(fr, d, PV, hands):
        h = hands.get(k)
        if not h: return
        px = fr.load()
        x, y = int(h[0]), int(h[1])
        for dx, dy, c in ((0, 0, (255, 255, 255)), (1, 0, (255, 230, 120)), (-1, 0, (255, 230, 120)), (0, 1, (255, 230, 120)), (0, -1, (255, 230, 120)),
                          (2, 0, (255, 160, 60)), (-2, 0, (255, 160, 60)), (0, 2, (255, 160, 60)), (0, -2, (255, 160, 60)),
                          (2, 2, (255, 200, 90)), (-2, -2, (255, 200, 90)), (2, -2, (255, 200, 90)), (-2, 2, (255, 200, 90)), (3, 0, (255, 120, 40)), (-3, 0, (255, 120, 40))):
            if 0 <= x + dx < rig.FW and 0 <= y + dy < rig.FH: px[x + dx, y + dy] = (*c, 255)
    return fx

def corte(k, a0, a1, raio=27):
    def fx(fr, d, PV, hands):
        sh = PV['ombro_' + k]
        px = fr.load()
        n = 40
        for i in range(n + 1):
            t = i / n
            ang = a0 + (a1 - a0) * t
            for r, c in ((raio + 1, (180, 220, 255)), (raio, (255, 255, 255)), (raio - 1, (255, 255, 255)), (raio - 2, (150, 200, 255))):
                if r < raio - 1 and t < 0.35: continue
                vx, vy = rig.rot_vec(0, r, ang)
                x, y = int(round(sh[0] + vx)), int(round(sh[1] + vy))
                if 0 <= x < rig.FW and 0 <= y < rig.FH:
                    px[x, y] = (*c, 255)
    return fx

# ------------------------------------------------------------------ poses
Z = (0, 0)
def walk_front():
    return [
        {'perna_a': (0, (0, -1)), 'pe_a': 1, 'braco_a': (0, (0, 1)), 'braco_b': (0, (0, -1))},
        {'corpo': (0, -1)},
        {'perna_b': (0, (0, -1)), 'pe_b': 1, 'braco_b': (0, (0, 1)), 'braco_a': (0, (0, -1))},
        {'corpo': (0, -1)},
    ]
def walk_side():
    return [
        {'perna_a': (-24, Z), 'perna_b': (24, Z), 'braco_a': (22, Z), 'braco_b': (-22, Z)},
        {'corpo': (0, -1), 'perna_a': (-4, Z), 'perna_b': (4, Z), 'pe_b': 1},
        {'perna_a': (24, Z), 'perna_b': (-24, Z), 'braco_a': (-22, Z), 'braco_b': (22, Z)},
        {'corpo': (0, -1), 'perna_a': (4, Z), 'perna_b': (-4, Z), 'pe_a': 1},
    ]
def run_front(back=False):
    s = -1 if back else 1
    # de frente os braços ficam escondidos atrás do corpo (só as mãos aparecem); de costas, esticados para trás
    arms = ({'braco_a': (-18, (0, -1)), 'braco_b': (18, (0, -1))} if back else {'braco_a': (14, (3, 0)), 'braco_b': (-14, (-3, 0))})
    base = {'cabeca': (0, 1), **arms}
    if not back: base['atras'] = ('a', 'b')
    return [
        {**base, 'perna_a': (0, (0, -2)), 'pe_a': 2},
        {**base, 'corpo': (0, -1)},
        {**base, 'perna_b': (0, (0, -2)), 'pe_b': 2},
        {**base, 'corpo': (0, -1)},
    ]
def run_side():
    lean = {'corpo': (-2, 1), 'cabeca': (-1, 0)}
    return [
        {**lean, 'perna_a': (-42, Z), 'perna_b': (38, Z), 'braco_a': (108, Z), 'braco_b': (102, Z)},
        {**lean, 'corpo': (-2, 0), 'perna_a': (-8, Z), 'perna_b': (10, Z), 'braco_a': (102, Z), 'braco_b': (108, Z), 'pe_b': 2},
        {**lean, 'perna_a': (38, Z), 'perna_b': (-42, Z), 'braco_a': (108, Z), 'braco_b': (102, Z)},
        {**lean, 'corpo': (-2, 0), 'perna_a': (10, Z), 'perna_b': (-8, Z), 'braco_a': (102, Z), 'braco_b': (108, Z), 'pe_a': 2},
    ]
def punch_side():
    return [
        {'braco_a': (35, Z), 'corpo': (1, 0), 'perna_a': (-10, Z), 'perna_b': (10, Z)},
        {'braco_a': (-90, (-1, 0)), 'corpo': (-2, 0), 'cabeca': (-1, 0), 'perna_a': (-18, Z), 'perna_b': (16, Z), 'fx': [impacto('a')]},
        {'braco_a': (-45, Z), 'corpo': (-1, 0), 'perna_a': (-10, Z), 'perna_b': (10, Z)},
    ]
def punch_front(back=False):
    k = 'a' if back else 'b'
    ang = 40 if back else -40
    return [
        {'braco_' + k: (-ang / 2, (0, 1)), 'corpo': (0, 1)},
        {'braco_' + k: (ang, (-2 if not back else 2, -4)), 'corpo': (0, 0), **({'fx': [impacto(k)]} if not back else {}), **({'atras': (k,)} if back else {})},
        {'braco_' + k: (ang / 2, (0, -1))},
    ]
def sword_side():
    w = ('espada', 'a')
    return [
        {'arma': w, 'braco_a': (160, Z), 'corpo': (1, 0), 'perna_a': (-8, Z), 'perna_b': (10, Z)},
        {'arma': w, 'braco_a': (-160, Z), 'corpo': (0, -1), 'perna_a': (-12, Z), 'perna_b': (12, Z)},
        {'arma': w, 'braco_a': (-75, (-1, 0)), 'corpo': (-2, 1), 'cabeca': (-1, 0), 'perna_a': (-22, Z), 'perna_b': (18, Z), 'fx': [corte('a', -170, -60)]},
        {'arma': w, 'braco_a': (-35, Z), 'corpo': (-1, 0), 'perna_a': (-14, Z), 'perna_b': (12, Z)},
    ]
def sword_front(back=False):
    k = 'b' if back else 'a'
    w = ('espada', k)
    s = 1 if k == 'a' else -1
    return [
        {'arma': w, 'braco_' + k: (180 * s, (0, 0)), 'corpo': (0, 1)},
        {'arma': w, 'braco_' + k: (125 * s, (0, -1)), 'corpo': (0, -1)},
        {'arma': w, 'braco_' + k: (30 * s, (0, 0)), 'corpo': (0, 1), 'fx': [corte(k, 175 * s, 35 * s)]},
        {'arma': w, 'braco_' + k: (15 * s, (0, 0))},
    ]

ANIMS = {
    'parado': {'baixo': [{}], 'esquerda': [{}], 'cima': [{}], 'ms': 400},
    'andar': {'baixo': walk_front(), 'esquerda': walk_side(), 'cima': walk_front(), 'ms': 150},
    'correr': {'baixo': run_front(), 'esquerda': run_side(), 'cima': run_front(True), 'ms': 90},
    'soco': {'baixo': punch_front(), 'esquerda': punch_side(), 'cima': punch_front(True), 'ms': 110},
    'espada': {'baixo': sword_front(), 'esquerda': sword_side(), 'cima': sword_front(True), 'ms': 100},
}

def frames(anim, d):
    a = ANIMS[anim]
    src = 'esquerda' if d == 'direita' else d
    return [rig.render(d, p) for p in a[src]]

def main(out):
    rig.build()
    os.makedirs(out, exist_ok=True)
    meta = {'quadro': [rig.FW, rig.FH], 'direcoes': DIRS, 'animacoes': {}}
    for anim, a in ANIMS.items():
        n = len(a['baixo'])
        sheet = Image.new('RGBA', (rig.FW * max(len(a[d]) for d in ('baixo', 'esquerda', 'cima')), rig.FH * 4), (0, 0, 0, 0))
        for r, d in enumerate(DIRS):
            for c, f in enumerate(frames(anim, d)):
                sheet.alpha_composite(f, (c * rig.FW, r * rig.FH))
        sheet.save(f'{out}/{anim}.png')
        meta['animacoes'][anim] = {'arquivo': f'{anim}.png', 'quadros': {d: len(a['esquerda' if d == 'direita' else d]) for d in DIRS}, 'ms_por_quadro': a['ms']}
    with open(f'{out}/animacoes.json', 'w') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main('saida')
