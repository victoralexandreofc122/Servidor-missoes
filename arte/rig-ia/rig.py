# Monta o boneco a partir das peças e anima girando/movendo cada peça no seu pivô.
import math
import numpy as np
from PIL import Image
import pecas

FW, FH = 80, 88
OX, OY = 16, 10        # margem do quadro: espada e golpes cabem sem cortar
BW = 48                # largura do corpo (o boneco fica no meio do quadro)
OUT_C = (20, 16, 32)

def fix_head(img):
    a = np.array(img)
    rgb = a[:, :, :3].astype(int); lum = rgb.mean(2); m = a[:, :, 3] > 0
    skin = rgb[m & (lum > 120) & (lum < 225)]
    if len(skin):
        vals, cnt = np.unique(skin.reshape(-1, 3), axis=0, return_counts=True)
        light = vals[cnt.argmax()]
        for j in range(a.shape[0]):
            for i in range(a.shape[1]):
                if m[j, i] and lum[j, i] > 228:
                    nb = lum[max(0, j - 1):j + 2, max(0, i - 1):i + 2]
                    if (nb < 70).sum() == 0:      # longe do olho: é só o brilho exagerado da IA
                        a[j, i, :3] = light
    return Image.fromarray(a, 'RGBA')

def darker(img, k=0.68):
    a = np.array(img).astype(float)
    m = a[:, :, 3] > 0
    a[m, :3] *= k
    return Image.fromarray(a.astype('uint8'), 'RGBA')

P = {}
def build():
    for n in pecas.CFG:
        P[n] = dict(pecas.views(n))
    for d in P['cabeca']:
        P['cabeca'][d] = fix_head(P['cabeca'][d])
    P['armas'] = pecas.weapons()
    # calça: cintura fica parada; cada perna da calça gira no quadril
    for d in ('baixo', 'cima'):
        c = P['calca'][d]; w, h = c.size
        P.setdefault('calca_cintura', {})[d] = c.crop((0, 0, w, 6))
        P.setdefault('calca_a', {})[d] = c.crop((0, 4, w // 2, h))
        P.setdefault('calca_b', {})[d] = c.crop((w // 2, 4, w, h))
    c = P['calca']['esquerda']; w, h = c.size
    P['calca_cintura']['esquerda'] = c.crop((0, 0, w, 6))
    P['calca_a']['esquerda'] = c.crop((0, 4, w, h))
    P['calca_b']['esquerda'] = c.crop((0, 4, w, h))

# ------------------------------------------------------------------ rotação pixel art (8x, gira, volta)
def rotated(img, angle, pivot):
    """Gira `img` em volta de `pivot` (coordenadas da peça). Devolve (imagem, onde fica o pivô nela)."""
    if abs(angle) < 0.5:
        return img, pivot
    Z = 8
    R = int(math.hypot(img.width, img.height)) + 4
    can = Image.new('RGBA', (2 * R, 2 * R), (0, 0, 0, 0))
    can.alpha_composite(img, (int(R - pivot[0]), int(R - pivot[1])))
    big = can.resize((2 * R * Z, 2 * R * Z), Image.NEAREST)
    big = np.array(big.rotate(angle, resample=Image.NEAREST, center=(R * Z, R * Z)))
    # volta para o tamanho real pela cor MAIS COMUM de cada bloco 8x8 (linhas finas não se partem)
    n = 2 * R
    blk = big.reshape(n, Z, n, Z, 4).transpose(0, 2, 1, 3, 4).reshape(n, n, Z * Z, 4)
    cover = (blk[:, :, :, 3] > 0).mean(2)
    out = np.zeros((n, n, 4), dtype='uint8')
    ys, xs = np.where(cover >= 0.34)
    for y, x in zip(ys, xs):
        px = blk[y, x][blk[y, x, :, 3] > 0]
        key = px[:, 0].astype(np.int64) << 16 | px[:, 1].astype(np.int64) << 8 | px[:, 2]
        vals, cnt = np.unique(key, return_counts=True)
        v = vals[cnt.argmax()]
        out[y, x] = (v >> 16 & 255, v >> 8 & 255, v & 255, 255)
    return Image.fromarray(out, 'RGBA'), (R, R)

# ------------------------------------------------------------------ esqueleto por direção
# Para cada peça: posição do canto (x, y) no quadro em pé e o pivô (na peça) para girar.
def layout(d):
    S = lambda n: P[n][d].size
    L = {}
    if d in ('baixo', 'cima'):
        hw, hh = S('cabeca'); L['cabeca'] = ((BW - hw) // 2, 9)
        cw, ch = S('cabelo'); L['cabelo'] = ((BW - cw) // 2, 3 if d == 'baixo' else 4)
        tw, th = S('roupa_cima'); L['roupa_cima'] = ((BW - tw) // 2, 34)
        pw, ph = S('calca'); px = (BW - pw) // 2; L['calca_cintura'] = (px, 50)
        L['calca_a'] = (px, 54); L['calca_b'] = (px + pw // 2, 54)
        lw, lh = S('perna'); L['perna_a'] = (px + 1, 52); L['perna_b'] = (px + pw - lw - 1, 52)
        sw, sh = S('sapato'); L['sapato_a'] = (px - 1, 66); L['sapato_b'] = (px + pw - sw + 1, 66)
        aw, ah = S('braco'); L['braco_a'] = ((BW - tw) // 2 - aw + 4, 35); L['braco_b'] = ((BW + tw) // 2 - 4, 35)
    else:  # esquerda (a direita é o espelho)
        hw, hh = S('cabeca'); L['cabeca'] = (10, 9)
        cw, ch = S('cabelo'); L['cabelo'] = (9, 4)
        tw, th = S('roupa_cima'); L['roupa_cima'] = (15, 34)
        pw, ph = S('calca'); px = 16; L['calca_cintura'] = (px, 50); L['calca_a'] = (px, 54); L['calca_b'] = (px + 2, 54)
        lw, lh = S('perna'); L['perna_a'] = (px + 4, 52); L['perna_b'] = (px + 6, 52)
        sw, sh = S('sapato'); L['sapato_a'] = (px - 3, 66); L['sapato_b'] = (px - 1, 66)
        aw, ah = S('braco'); L['braco_a'] = (21, 35); L['braco_b'] = (23, 35)
    return {k: (x + OX, y + OY) for k, (x, y) in L.items()}

def pivots(d):
    """Pivôs no QUADRO: ombros, quadris, pescoço."""
    L = layout(d)
    aw, ah = P['braco'][d].size
    pw, ph = P['calca'][d].size
    return {
        'ombro_a': (L['braco_a'][0] + aw / 2, L['braco_a'][1] + 1.5), 'ombro_b': (L['braco_b'][0] + aw / 2, L['braco_b'][1] + 1.5),
        'quadril_a': (L['calca_a'][0] + (pw // 2 if d in ('baixo', 'cima') else pw) / 2, 54 + OY), 'quadril_b': (L['calca_b'][0] + (pw // 2 if d in ('baixo', 'cima') else pw) / 2, 54 + OY),
    }

def rot_vec(x, y, ang):
    t = math.radians(ang)
    return (x * math.cos(t) + y * math.sin(t), -x * math.sin(t) + y * math.cos(t))

def paste(frame, img, x, y):
    frame.alpha_composite(img, (int(round(x)), int(round(y))))

def paste_rot(frame, img, ang, pivot_local, at):
    r, pv = rotated(img, ang, pivot_local)
    paste(frame, r, at[0] - pv[0], at[1] - pv[1])

BLADE = {'espada': (20, 4), 'kunai': (7, 2)}   # comprimento da lâmina, do cabo
def draw_blade(fr, hand, ang, kind):
    """Arma na mão desenhada com linhas de 1 px (fica limpa em qualquer ângulo, ao contrário de girar o sprite)."""
    ux, uy = rot_vec(0, 1, ang)            # ao longo do braço
    nx, ny = -uy, ux                       # perpendicular
    blade_len, grip = BLADE.get(kind, (20, 4))
    pts = {}
    def put(x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < FW and 0 <= y < FH: pts[(x, y)] = c
    for t in [i * 0.5 for i in range(-grip * 2, 3)]:             # cabo
        put(hand[0] + ux * t, hand[1] + uy * t, (60, 34, 22) if int(t * 2) % 3 else (217, 164, 65))
    for s in (-1.5, -1, -0.5, 0, 0.5, 1, 1.5):                    # guarda
        put(hand[0] + ux * 1.5 + nx * s, hand[1] + uy * 1.5 + ny * s, (217, 164, 65))
    for t in [i * 0.5 for i in range(5, blade_len * 2)]:          # lâmina: fio claro + dorso
        put(hand[0] + ux * t, hand[1] + uy * t, (236, 242, 248))
        if t < blade_len - 1.5:
            put(hand[0] + ux * t + nx * 0.9, hand[1] + uy * t + ny * 0.9, (150, 162, 178))
    px = fr.load()
    for (x, y) in pts:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in pts and 0 <= q[0] < FW and 0 <= q[1] < FH:
                px[q] = (*OUT_C, 255)
    for (x, y), c in pts.items():
        px[x, y] = (*c, 255)

def render(d, pose=None):
    """d: 'baixo', 'esquerda', 'cima' (a 'direita' é o espelho da esquerda)."""
    if d == 'direita':
        return render('esquerda', pose).transpose(Image.FLIP_LEFT_RIGHT)
    pose = pose or {}
    side = d == 'esquerda'
    L, PV = layout(d), pivots(d)
    fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    cdx, cdy = pose.get('corpo', (0, 0))
    hdx, hdy = pose.get('cabeca', (0, 0))
    far = lambda img, k: darker(img) if side and k == 'b' else img

    def leg(k):
        ang, (dx, dy) = pose.get('perna_' + k, (0, (0, 0)))
        hip = PV['quadril_' + k]; hip = (hip[0] + dx, hip[1] + dy + cdy)
        for part, key in (('perna', 'perna_' + k), ('calca_' + k, 'calca_' + k)):
            img = far(P['perna' if part == 'perna' else part][d], k)
            x0, y0 = L[key]
            paste_rot(fr, img, ang, (PV['quadril_' + k][0] - x0, PV['quadril_' + k][1] - y0), hip)
        sx, sy = L['sapato_' + k]
        sw, sh = P['sapato'][d].size
        foot = (sx + sw / 2 - PV['quadril_' + k][0], sy - PV['quadril_' + k][1])
        fx, fy = rot_vec(foot[0], foot[1], ang)
        lift = pose.get('pe_' + k, 0)
        paste(fr, far(P['sapato'][d], k), hip[0] + fx - sw / 2, hip[1] + fy - lift)

    def arm(k):
        ang, (dx, dy) = pose.get('braco_' + k, (0, (0, 0)))
        sh = PV['ombro_' + k]; sh = (sh[0] + dx + cdx, sh[1] + dy + cdy)
        img = far(P['braco'][d], k)
        aw, ah = img.size
        paste_rot(fr, img, ang, (aw / 2, 1.5), sh)
        mw, mh = P['munhequeira'][d].size
        paste_rot(fr, far(P['munhequeira'][d], k), ang, (mw / 2, -(ah - 7.5)), sh)
        hand = rot_vec(0, ah - 3, ang)
        hand = (sh[0] + hand[0], sh[1] + hand[1])
        w = pose.get('arma')
        if w and w[1] == k:
            draw_blade(fr, hand, ang, w[0])
        return hand

    def body():
        paste(fr, P['calca_cintura'][d], L['calca_cintura'][0] + cdx * 0, L['calca_cintura'][1] + cdy)
        paste(fr, P['roupa_cima'][d], L['roupa_cima'][0] + cdx, L['roupa_cima'][1] + cdy)

    def head():
        paste(fr, P['cabeca'][d], L['cabeca'][0] + cdx + hdx, L['cabeca'][1] + cdy + hdy)
        paste(fr, P['cabelo'][d], L['cabelo'][0] + cdx + hdx, L['cabelo'][1] + cdy + hdy)

    behind = pose.get('atras', ())
    hands = {}
    if side:
        hands['b'] = arm('b')
        leg('b'); leg('a'); body(); head()
        hands['a'] = arm('a') if 'a' not in behind else None
    else:
        for k in behind: hands[k] = arm(k)
        leg('a'); leg('b'); body()
        for k in ('a', 'b'):
            if k not in behind: hands[k] = arm(k)
        head()
    for fx in pose.get('fx', ()):
        fx(fr, d, PV, hands)
    return fr

if __name__ == '__main__':
    build()
    S = '/tmp/claude-0/-home-claude/c0720fcd-7a47-52f7-a5a6-f128aff241d0/scratchpad/'
    sheet = Image.new('RGBA', (FW * 4 * 8 + 60, FH * 8), (235, 232, 222, 255))
    for k, d in enumerate(('baixo', 'esquerda', 'direita', 'cima')):
        f = render(d)
        sheet.alpha_composite(f.resize((FW * 8, FH * 8), Image.NEAREST), (k * (FW * 8 + 20), 0))
    sheet.save(S + 'rig-parado.png')
