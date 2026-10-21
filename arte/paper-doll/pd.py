# Paper doll pixel art: corpo base (masculino/feminino) + roupas e acessórios em camadas.
# Cada camada é uma folha com o MESMO layout (linhas = direções, colunas = quadros),
# então o jogo desenha base -> calça -> sapato -> roupa -> ... no mesmo quadro.
#
# O corpo é um esqueleto 3D simples (quadril, joelho, tornozelo, ombro, cotovelo, punho).
# Cada pose é definida UMA vez em ângulos; as 4 direções saem da mesma pose girada,
# por isso frente, lado e costas ficam coerentes. Membros são rasterizados em pixel
# (sem girar imagem), com contorno de 1px e sombra vinda de cima/esquerda.
import math, json, os
import numpy as np
from PIL import Image

FW, FH = 64, 64            # tamanho do quadro
CX, GY = 32.0, 57.0        # centro horizontal e linha do chão
K = 0.25                   # inclinação da câmera (vista 3/4 de cima)
DIRS = ['baixo', 'esquerda', 'direita', 'cima']
YAW = {'baixo': 0, 'esquerda': 90, 'direita': -90, 'cima': 180}
ANIMS = [('parado', 1, 400), ('andar', 4, 150), ('correr', 4, 90), ('soco', 4, 100), ('espada', 4, 100)]


def hx(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


# material: base, sombra, luz, contorno
MAT = {k: [hx(c) for c in v] for k, v in {
    'pele':      ['#f6c7a0', '#dc9c78', '#ffe0c4', '#5a3024'],
    'intima':    ['#6c6f7b', '#51535e', '#878b98', '#202128'],
    'gi':        ['#3d6fd6', '#2b51a6', '#5e8ff0', '#131b44'],
    'faixa':     ['#1f2442', '#161a31', '#2d3358', '#0b0d1a'],
    'camiseta':  ['#34343e', '#24242c', '#4a4a56', '#0d0d12'],
    'calca':     ['#2c3150', '#202439', '#3e4569', '#0d0f1b'],
    'atadura':   ['#e8e2d4', '#bdb5a4', '#fffaf0', '#4b4538'],
    'sapato':    ['#26304f', '#1a2039', '#3a4671', '#0b0e1b'],
    'vermelho':  ['#d6353b', '#a52328', '#f15b55', '#480d12'],
    'cab_preto': ['#2b2e47', '#1c1e31', '#474c72', '#0a0b15'],
    'cab_cast':  ['#7b4a2a', '#5a331b', '#a06a3f', '#251208'],
    'lamina':    ['#d4dde8', '#98a4b5', '#ffffff', '#262c3a'],
    'cabo':      ['#3b2c4d', '#281e35', '#57426f', '#120c1a'],
    'guarda':    ['#d5a73b', '#a57a1f', '#f3d277', '#3e2a06'],
    'bainha':    ['#3a2b27', '#291e1b', '#55403a', '#100a08'],
}.items()}
OLHO_ESCURO, IRIS, BRILHO = hx('#1d2140'), hx('#3e78c9'), hx('#ffffff')
BOCA, BOCHECHA = hx('#b4685a'), hx('#f2a094')

BODY = {
    'm': dict(hip_x=2.4, thigh=5.4, shin=5.0, foot=2.6, torso=10.0, sh_t=0.80, sh_x=4.7,
              upper=4.3, fore=3.9, r=dict(thigh=1.95, knee=1.65, ank=1.3, toe=1.6, up=1.45, el=1.35, wr=1.25, hand=1.75),
              a=[(0, 3.9), (.25, 3.6), (.6, 4.2), (.85, 4.7), (1, 4.0)], b=[(0, 3.2), (.7, 3.5), (1, 3.0)]),
    'f': dict(hip_x=2.5, thigh=5.4, shin=5.0, foot=2.5, torso=9.8, sh_t=0.80, sh_x=4.0,
              upper=4.2, fore=3.8, r=dict(thigh=2.05, knee=1.6, ank=1.25, toe=1.5, up=1.35, el=1.25, wr=1.15, hand=1.6),
              a=[(0, 4.4), (.32, 3.25), (.62, 3.75), (.85, 4.0), (1, 3.4)], b=[(0, 3.3), (.65, 3.7), (1, 2.9)]),
}

YY, XX = np.mgrid[0:FH, 0:FW].astype(float) + 0.5


# ---------------------------------------------------------------- vetores
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def norm(a):
    n = math.sqrt(sum(c * c for c in a)) or 1
    return mul(a, 1 / n)
def rad(d): return math.radians(d)


def rotY(v, a):
    c, s = math.cos(rad(a)), math.sin(rad(a))
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def rotX(v, a):
    c, s = math.cos(rad(a)), math.sin(rad(a))
    return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)


def dirvec(p, a, s):
    p, a = rad(p), rad(a)
    return (s * math.sin(a), -math.cos(a) * math.cos(p), math.cos(a) * math.sin(p))


def interp(tab, t):
    if t <= tab[0][0]: return tab[0][1]
    for (t0, v0), (t1, v1) in zip(tab, tab[1:]):
        if t <= t1: return v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return tab[-1][1]


# ---------------------------------------------------------------- rasterização
def snap(p):
    return (math.floor(p[0]) + 0.5, math.floor(p[1]) + 0.5)


def chain(pts, radii):
    """Cápsulas encadeadas. Devolve máscara + s (posição na corrente, 0..n-1) + normal + rel."""
    best = np.full((FH, FW), 1e9); S = np.zeros((FH, FW)); NX = np.zeros((FH, FW)); NY = np.zeros((FH, FW)); REL = np.zeros((FH, FW))
    for i in range(len(pts) - 1):
        ax, ay = pts[i]; bx, by = pts[i + 1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1e-9
        t = np.clip(((XX - ax) * dx + (YY - ay) * dy) / L2, 0, 1)
        qx, qy = ax + t * dx, ay + t * dy
        r = radii[i] + (radii[i + 1] - radii[i]) * t
        ddx, ddy = XX - qx, YY - qy
        d = np.hypot(ddx, ddy)
        m = d - r
        u = m < best
        best = np.where(u, m, best); S = np.where(u, i + t, S)
        NX = np.where(u, ddx / (d + 1e-9), NX); NY = np.where(u, ddy / (d + 1e-9), NY); REL = np.where(u, d / r, REL)
    return dict(mask=best <= 0, s=S, nx=NX, ny=NY, rel=REL)


def torso_shape(p0, p1, hw, cap0, cap1):
    ax, ay = p0; bx, by = p1
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1e-9
    ux, uy = dx / L, dy / L
    px, py = -uy, ux                         # perpendicular
    if px < 0: px, py = -px, -py             # +u = lado direito da tela
    along = (XX - ax) * ux + (YY - ay) * uy
    perp = (XX - ax) * px + (YY - ay) * py
    t = along / L
    tc = np.clip(t, 0, 1)
    w = np.vectorize(hw)(tc)
    beyond = np.where(t < 0, -along, np.where(t > 1, along - L, 0))
    cap = np.where(t < 0, cap0, cap1)
    inside = (beyond / cap) ** 2 + (perp / w) ** 2 <= 1.0
    rel = np.sqrt((perp / w) ** 2 + (beyond / cap) ** 2)
    nx = perp * px / (w * w) + (np.where(t < 0, -1, np.where(t > 1, 1, 0)) * beyond * ux) / (cap * cap)
    ny = perp * py / (w * w) + (np.where(t < 0, -1, np.where(t > 1, 1, 0)) * beyond * uy) / (cap * cap)
    n = np.hypot(nx, ny) + 1e-9
    return dict(mask=inside, t=t, u=perp / w, nx=nx / n, ny=ny / n, rel=rel)


def tone_from(sh, light=0.5, dark=-0.3):
    v = -(sh['nx'] + sh['ny']) / 1.4142 * sh['rel']
    return np.where((v > light) & (sh['rel'] > 0.55), 2, np.where(v < dark, 1, 0))


def edge_tone(mask):
    """Sombra nas bordas de baixo/direita (para formas sem normal, como cabelo)."""
    down = np.zeros_like(mask); down[:-1] = mask[1:]
    right = np.zeros_like(mask); right[:, :-1] = mask[:, 1:]
    return np.where(mask & (~down | ~right), 1, 0)


def dilate4(m):
    o = m.copy()
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o


def shape(mask, tone, mat, z, far=False, extras=None):
    return dict(mask=mask, tone=tone, mat=mat, z=z, far=far, extras=extras or [])


def paint(sh):
    cols = np.array(MAT[sh['mat']], dtype=float)
    if sh['far']: cols = cols * np.array([[.8], [.8], [.8], [1]])
    img = np.zeros((FH, FW, 4), np.uint8)
    m = sh['mask']
    ol = dilate4(m) & ~m
    rgb = cols[np.clip(sh['tone'], 0, 2)]
    img[m, :3] = rgb[m].astype(np.uint8); img[m, 3] = 255
    img[ol, :3] = cols[3].astype(np.uint8); img[ol, 3] = 255
    for em, c in sh['extras']:
        mm = em & m
        img[mm, :3] = c; img[mm, 3] = 255
    return img


# ---------------------------------------------------------------- cabeça (carimbo)
HS = 30  # grade local da cabeça; centro no pixel (15,15)
HY, HX = np.mgrid[0:HS, 0:HS].astype(float) - HS // 2   # coordenadas inteiras = centro do pixel


def head_mask(view):
    x, y = HX, HY
    if view == 'lado':     # olhando para a esquerda
        rx = 7.0 - 0.9 * np.clip(y / 6.8, 0, 1) ** 2 * (x < 0)
        m = ((x - 0.3) / rx) ** 2 + (y / 6.8) ** 2 <= 1
        m |= (x == -7) & (y == 2)                                  # nariz
        return m
    rx = 7.45 * (1 - 0.15 * np.clip(y / 6.8, 0, 1) ** 2)
    m = (x / rx) ** 2 + (y / 6.8) ** 2 <= 1
    m |= ((np.abs(x) - 7.3) ** 2 + (y - 1.6) ** 2) <= 1.6          # orelhas
    return m


def at(view_pts):
    m = np.zeros((HS, HS), bool)
    for x, y in view_pts:
        m[int(y) + HS // 2, int(x) + HS // 2] = True
    return m


def head_stamp(g, view):
    m = head_mask(view)
    nx, ny = HX / 7.2, HY / 6.8
    rel = np.hypot(nx, ny); n = rel + 1e-9
    tone = tone_from(dict(nx=nx / n, ny=ny / n, rel=rel), light=0.45, dark=-0.32)
    ex = []
    if view == 'frente':
        for ox in (-4, 3):
            ex.append((at([(ox, 0), (ox + 1, 0)]), OLHO_ESCURO))
            ex.append((at([(ox, 1), (ox, 2), (ox + 1, 2)]), IRIS))
            ex.append((at([(ox + 1, 1)]), BRILHO))
        ex.append((at([(0, 4)]), BOCA))
        ex.append((at([(-7, 1), (7, 1)]), MAT['pele'][1]))         # dobra da orelha
        if g == 'f':
            ex.append((at([(-5, -1), (5, -1)]), OLHO_ESCURO))     # cílios
            ex.append((at([(-5, 3), (5, 3)]), BOCHECHA))
    elif view == 'lado':
        ex.append((at([(-5, 0), (-4, 0)]), OLHO_ESCURO))
        ex.append((at([(-5, 1), (-5, 2)]), IRIS))
        ex.append((at([(-4, 1)]), BRILHO))
        ex.append((at([(-5, 4)]), BOCA))
        ex.append((at([(2, 0), (2, 1), (2, 2), (1, 2)]), MAT['pele'][3]))   # orelha
        ex.append((at([(1, 1)]), MAT['pele'][1]))
        if g == 'f':
            ex.append((at([(-6, -1)]), OLHO_ESCURO))
            ex.append((at([(-4, 3)]), BOCHECHA))
    else:
        ex.append((at([(-7, 1), (7, 1)]), MAT['pele'][1]))
    return m, tone, ex


def place(stamp_arr, cx, cy, fill=False, mirror=False):
    """Coloca um array local (HS x HS) no quadro, com o centro em (cx, cy) (centro de pixel)."""
    if mirror: stamp_arr = stamp_arr[:, ::-1]
    out = np.zeros((FH, FW), stamp_arr.dtype)
    ox, oy = int(math.floor(cx)) - HS // 2, int(math.floor(cy)) - HS // 2
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(FW, ox + HS), min(FH, oy + HS)
    out[y0:y1, x0:x1] = stamp_arr[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    return out


# ---------------------------------------------------------------- poses
def P(lean=0, twist=0, bob=0, al=(0, 8, 8), ar=(0, 8, 8), ll=(0, 2, 0), lr=(0, 2, 0), espada=None, fx=None, vento=(0.3, 1, 0.15)):
    return dict(lean=lean, twist=twist, bob=bob, arm_l=al, arm_r=ar, leg_l=ll, leg_r=lr, espada=espada, fx=fx, vento=vento)


def swap(p):
    q = dict(p)
    q['arm_l'], q['arm_r'] = p['arm_r'], p['arm_l']
    q['leg_l'], q['leg_r'] = p['leg_r'], p['leg_l']
    return q


def poses(anim):
    if anim == 'parado':
        return [P(al=(2, 9, 10), ar=(2, 9, 10))]
    if anim == 'andar':
        v = (0.6, 0.8, 0.35)
        a = P(ll=(24, 2, 6), lr=(-20, 2, 14), al=(-20, 8, 10), ar=(22, 8, 24), vento=v)
        b = P(ll=(2, 2, 0), lr=(14, 2, 42), al=(2, 8, 12), ar=(-2, 8, 12), bob=0, vento=v)
        return [a, b, swap(a), swap(b)]
    if anim == 'correr':
        v = (1.0, 0.15, 0.8)
        a = P(lean=24, ll=(44, 3, 24), lr=(-36, 3, 62), al=(-70, 16, 4), ar=(-66, 16, 6), bob=1, vento=v)
        b = P(lean=24, ll=(6, 3, 16), lr=(56, 3, 112), al=(-64, 18, 8), ar=(-70, 18, 6), vento=v)
        return [a, b, swap(a), swap(b)]
    pe = dict(ll=(16, 5, 16), lr=(-14, 5, 10))
    if anim == 'soco':
        v = (0.45, 0.9, 0.3)
        return [
            P(twist=-10, al=(58, -6, 100), ar=(48, -4, 112), vento=v, **pe),
            P(twist=-24, al=(72, -10, 72), ar=(22, 2, 122), vento=v, **pe),
            P(twist=26, lean=6, al=(36, -4, 112), ar=(88, -14, 0), fx='impacto', vento=v, **pe),
            P(twist=8, al=(58, -6, 100), ar=(70, -10, 52), vento=v, **pe),
        ]
    if anim == 'espada':
        v = (0.5, 0.85, 0.35)
        pe = dict(ll=(22, 5, 24), lr=(-18, 5, 14))
        return [
            P(twist=-26, al=(50, -10, 70), ar=(165, 26, 34), espada=(-0.25, 0.72, -0.62), vento=v, **pe),
            P(twist=-6, al=(42, -10, 80), ar=(132, 12, 16), espada=(-0.12, 0.95, 0.3), vento=v, **pe),
            P(twist=28, lean=10, al=(18, -4, 60), ar=(76, -30, 0), espada=(0.55, -0.05, 0.83), fx='corte', vento=v, **pe),
            P(twist=32, lean=8, al=(8, 2, 40), ar=(34, -38, 10), espada=(0.66, -0.6, 0.45), fx='corte2', vento=v, **pe),
        ]


# ---------------------------------------------------------------- esqueleto -> tela
class Ctx:
    def __init__(self, g, d, anim, fi):
        self.g, self.d, self.anim, self.fi = g, d, anim, fi
        self.B = B = BODY[g]
        self.pose = p = poses(anim)[fi]
        self.psi = rad(YAW[d])
        R = B['r']
        legs = {}
        for side, s in (('l', 1), ('r', -1)):
            pt, ab, kn = p['leg_' + side]
            hip = (s * B['hip_x'], 0, 0)
            knee = add(hip, mul(dirvec(pt, ab, s), B['thigh']))
            ank = add(knee, mul(dirvec(pt - kn, ab, s), B['shin']))
            q = pt - kn
            beta = max(0, -q) * 0.8 if q < 0 else -min(q, 30) * 0.3
            toe = add(ank, (0, -math.sin(rad(beta)) * B['foot'], math.cos(rad(beta)) * B['foot']))
            legs[side] = [hip, knee, ank, toe]
        low = min(min(l[2][1] - R['ank'], l[3][1] - R['toe']) for l in legs.values())
        sh = -low + p['bob']
        self.lift = sh
        legs = {k: [add(v, (0, sh, 0)) for v in l] for k, l in legs.items()}
        self.pelvis = (0, sh, 0)
        self.legs3 = legs

        def up(v):   # corpo superior: torção + inclinação, a partir da pelve
            return add(self.pelvis, rotX(rotY(v, p['twist']), p['lean']))
        self.up = up
        self.upv = lambda v: rotX(rotY(v, p['twist']), p['lean'])
        arms = {}
        for side, s in (('l', 1), ('r', -1)):
            pt, ab, el = p['arm_' + side]
            shd = up((s * B['sh_x'], B['torso'] * B['sh_t'], 0))
            ud = self.upv(dirvec(pt, ab, s)); fd = self.upv(dirvec(pt + el, ab, s))
            elb = add(shd, mul(ud, B['upper']))
            wr = add(elb, mul(fd, B['fore']))
            hand = add(wr, mul(fd, 1.0))
            arms[side] = [shd, elb, wr, hand]
            if side == 'r': self.fore_r = fd
        self.arms3 = arms
        self.neck3 = up((0, B['torso'], 0))
        self.head3 = up((0, B['torso'] + 6.2, 0))
        hs = self.scr(self.head3)
        self.hs = snap(hs)

    def world(self, v):
        c, s = math.cos(self.psi), math.sin(self.psi)
        return (v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c)

    def scr(self, v):
        w = self.world(v)
        return (CX + w[0], GY - w[1] + K * w[2])

    def wz(self, v): return self.world(v)[2]

    def head_pt(self, off):
        """Ponto preso à cabeça (sem perspectiva: a cabeça é um carimbo plano)."""
        w = self.world(off)
        return (self.hs[0] + w[0], self.hs[1] - w[1]), w[2]

    @property
    def view(self):
        return {'baixo': 'frente', 'cima': 'costas'}.get(self.d, 'lado')

    @property
    def mirror(self):
        return self.d == 'direita'

    # corrente de um membro em tela
    def limb(self, pts3, radii, infl=0.0):
        sp = [snap(self.scr(p)) for p in pts3]
        return chain(sp, [r + infl for r in radii])

    def leg_radii(self):
        R = self.B['r']; return [R['thigh'], R['knee'], R['ank'], R['toe']]

    def arm_radii(self):
        R = self.B['r']; return [R['up'], R['el'], R['wr'], R['hand']]

    def limb_z(self, pts3, bias):
        return sum(self.wz(p) for p in pts3) / len(pts3) + bias

    def torso_hw(self, infl=0.0):
        B = self.B
        phi = self.psi + rad(self.pose['twist'])
        def hw(t):
            a, b = interp(B['a'], t), interp(B['b'], t)
            return math.sqrt((a * math.cos(phi)) ** 2 + (b * math.sin(phi)) ** 2) + infl
        return hw

    def torso(self, infl=0.0):
        p0 = snap(self.scr(self.up((0, -0.7, 0))))
        p1 = snap(self.scr(self.up((0, self.B['torso'] - 0.5, 0))))
        return torso_shape(p0, p1, self.torso_hw(infl), 2.2 + infl, 1.5 + infl)


def cut(sh, lo, hi, key='s'):
    return sh['mask'] & (sh[key] >= lo) & (sh[key] <= hi)


# ---------------------------------------------------------------- corpo base
def base_shapes(c):
    out = []
    for side in ('l', 'r'):
        L = c.legs3[side]
        z = c.limb_z(L, -2.0)
        sh = c.limb(L, c.leg_radii())
        out.append(shape(sh['mask'], tone_from(sh), 'pele', z, far=z < -2.5))
        # roupa íntima: topo das coxas
        u = c.limb(L, c.leg_radii(), 0.25)
        m = cut(u, 0, 0.38)
        out.append(shape(m, tone_from(u), 'intima', z + 0.01, far=z < -2.5))
    for side in ('l', 'r'):
        A = c.arms3[side]
        z = c.limb_z(A, 0.3)
        sh = c.limb(A, c.arm_radii())
        out.append(shape(sh['mask'], tone_from(sh), 'pele', z, far=z < -2.0))
    # pescoço
    n0, n1 = c.up((0, c.B['torso'] - 1.6, 0)), c.up((0, c.B['torso'] + 2.0, 0))
    nk = chain([snap(c.scr(n0)), snap(c.scr(n1))], [1.5, 1.5])
    out.append(shape(nk['mask'], np.where(nk['nx'] > 0.3, 1, 0), 'pele', -0.5))
    tr = c.torso()
    out.append(shape(tr['mask'], tone_from(tr), 'pele', 0.0))
    ti = c.torso(0.2)
    m = ti['mask'] & (ti['t'] <= 0.2)
    out.append(shape(m, tone_from(ti), 'intima', 0.01))
    if c.g == 'f':
        m = ti['mask'] & (ti['t'] >= 0.57) & (ti['t'] <= 0.78)
        out.append(shape(m, tone_from(ti), 'intima', 0.02))
    # cabeça
    m, tone, ex = head_stamp(c.g, c.view)
    hx_, hy_ = c.hs
    mm = place(m, hx_, hy_, mirror=c.mirror)
    tt = place(tone, hx_, hy_, mirror=c.mirror)
    exs = [(place(e, hx_, hy_, mirror=c.mirror), col) for e, col in ex]
    out.append(shape(mm, tt, 'pele', 50.0, extras=exs))
    return out


# ---------------------------------------------------------------- caudas (fitas, rabo de cavalo, cachecol)
def tail3(anchor, n, seg, c, spread=0.0, lateral=0.0):
    back, down, amp = c.pose['vento']
    dirv = norm((0, -down, -back))
    pts = [anchor]
    ph = c.fi * math.pi / 2
    for k in range(1, n + 1):
        w = amp * math.sin(k * 1.3 - ph) * k / n
        p = add(anchor, mul(dirv, seg * k))
        p = add(p, (spread * k + lateral, w * (1 if back > 0.7 else 0.5), 0 if back > 0.7 else w * 0.6))
        pts.append(p)
    return pts


def head_chain(c, offs, radii):
    pts, zs = zip(*[c.head_pt(o) for o in offs])
    pts = [snap(p) for p in pts]
    if c.mirror:
        pass
    return chain(pts, radii), sum(zs) / len(zs)


def tail_z(wz, front_base=50.0):
    if wz > 1.0: return front_base + wz * 0.01
    if wz < -1.0: return wz - 1.5
    return front_base + 0.15


# ---------------------------------------------------------------- cabelos (forma por vista, em coordenadas da cabeça)
def poly_mask(polys):
    from PIL import ImageDraw
    im = Image.new('1', (HS, HS), 0)
    dr = ImageDraw.Draw(im)
    for pl in polys:
        dr.polygon([(x + HS // 2 + 0.5, y + HS // 2 + 0.5) for x, y in pl], fill=1)
    return np.array(im, bool)


def ell(cx, cy, rx, ry):
    return ((HX - cx) / rx) ** 2 + ((HY - cy) / ry) ** 2 <= 1


def hair_espetado(view):
    if view == 'frente':
        cap = ell(0, -0.8, 8.3, 7.7) & (HY <= -2.5)
        sp = poly_mask([
            [(-7.6, -3), (-4.4, -3), (-6.8, 1.6)], [(-5.2, -3), (-1.2, -3), (-3.2, 0.6)],
            [(-1.6, -3), (2.4, -3), (0.4, 1.2)], [(1.8, -3), (5.8, -3), (3.9, 0.4)], [(4.6, -3.4), (8.0, -3), (7.2, 1.8)],
            [(-8.2, -5), (-6.6, -1), (-9.8, 1.2)], [(8.2, -5), (6.6, -1), (9.8, 1.2)],
            [(-6.4, -5.4), (-3.2, -7.4), (-9.6, -9.4)], [(-3.4, -7.4), (0.8, -8.2), (-1.8, -11.8)],
            [(0.2, -8.2), (4.4, -7.2), (3.6, -11.4)], [(3.8, -6.8), (7.4, -4.6), (9.8, -8.6)],
        ])
        return cap | sp
    if view == 'lado':
        cap = ell(0.6, -0.8, 8.3, 7.7) & ((HY <= -2.5) | (HX >= 1.5)) & (HY <= 4.5)
        sp = poly_mask([
            [(-7.4, -3.2), (-4.0, -3.2), (-6.6, 1.2)], [(-4.6, -3.2), (-0.8, -3.2), (-2.8, 0.2)],
            [(-6.0, -5.4), (-2.6, -7.6), (-8.8, -9.8)], [(-3.0, -7.6), (1.2, -8.2), (-0.6, -12.0)],
            [(0.8, -8.0), (5.0, -6.2), (5.4, -11.0)], [(4.6, -6.6), (7.8, -3.0), (10.6, -7.2)],
            [(7.6, -3.6), (8.4, 1.0), (11.2, -1.4)], [(7.4, 0.4), (6.8, 4.4), (9.8, 4.0)],
            [(2.4, 3.0), (6.0, 3.6), (3.6, 6.4)],
        ])
        return (cap | sp)
    cap = ell(0, -0.6, 8.3, 7.7) & (HY <= 4.2)
    sp = poly_mask([
        [(-6.4, -5.4), (-3.2, -7.4), (-9.6, -9.4)], [(-3.4, -7.4), (0.8, -8.2), (-1.8, -11.8)],
        [(0.2, -8.2), (4.4, -7.2), (3.6, -11.4)], [(3.8, -6.8), (7.4, -4.6), (9.8, -8.6)],
        [(-8.4, -3.6), (-7.8, 0.8), (-10.8, -1.0)], [(8.4, -3.6), (7.8, 0.8), (10.8, -1.0)],
        [(-8.0, 0), (-5.6, 3.6), (-8.6, 4.6)], [(8.0, 0), (5.6, 3.6), (8.6, 4.6)],
        [(-5.6, 3.0), (-1.6, 3.6), (-3.8, 6.6)], [(-1.8, 3.4), (1.8, 3.4), (0, 6.8)], [(1.6, 3.6), (5.6, 3.0), (3.8, 6.6)],
    ])
    return cap | sp


def hair_rabo(view):
    if view == 'frente':
        cap = ell(0, -0.9, 8.1, 7.6) & (HY <= -2.2)
        fr = poly_mask([
            [(-8.0, -4.0), (0.6, -4.0), (-5.8, -1.4), (-8.2, 0.2)],        # franja de lado
            [(0.0, -4.0), (8.0, -4.0), (7.4, -1.0), (3.0, -1.6)],
            [(-8.6, -3.0), (-6.6, -3.0), (-7.0, 4.6), (-8.8, 4.0)],       # mechas laterais
            [(6.6, -3.0), (8.6, -3.0), (8.8, 4.0), (7.0, 4.6)],
        ])
        return cap | fr
    if view == 'lado':
        cap = ell(0.6, -0.9, 8.1, 7.6) & ((HY <= -2.2) | (HX >= 0.5)) & (HY <= 3.4)
        fr = poly_mask([[(-7.6, -4.0), (-2.0, -4.0), (-6.4, 0.8)], [(-1.8, -2.8), (0.8, -2.8), (0.2, 3.8), (-1.2, 3.6)]])
        return cap | fr
    cap = ell(0, -0.8, 8.1, 7.6) & (HY <= 3.6)
    return cap


HAIR = {'espetado': (hair_espetado, 'cab_preto'), 'rabo': (hair_rabo, 'cab_cast')}


def hair_shapes(c, style):
    fn, mat = HAIR[style]
    m = fn(c.view)
    tone = edge_tone(m)
    # brilho estilo anime: arco no alto à esquerda
    rr = np.hypot((HX + 1) / 7.0, (HY + 1.5) / 6.4)
    shine = m & (rr > 0.62) & (rr < 0.8) & (HX < 0) & (HY < -2) & (tone == 0)
    tone = np.where(shine, 2, tone)
    hx_, hy_ = c.hs
    out = [shape(place(m, hx_, hy_, mirror=c.mirror), place(tone, hx_, hy_, mirror=c.mirror), mat, 50.5)]
    if style == 'rabo':
        tie = (0, 3.0, -6.4)
        offs = tail3(tie, 5, 2.3, c, lateral=0)
        sh, z = head_chain(c, offs, [1.8, 2.1, 2.0, 1.6, 1.1, 0.7])
        out.append(shape(sh['mask'], tone_from(sh), mat, tail_z(c.world(add(tie, (0, 0, -1)))[2], 50.6)))
        (px, py), wz = c.head_pt(tie)
        kx, ky = snap((px, py))
        km = (np.abs(XX - kx) < 1.2) & (np.abs(YY - ky) < 0.7)
        out.append(shape(km, np.zeros((FH, FW), int), 'vermelho', tail_z(wz, 50.9)))
    return out


# ---------------------------------------------------------------- roupas
def roupa_gi(c):
    tr = c.torso(0.55)
    m = tr['mask'] & (tr['t'] >= 0.06)
    tone = tone_from(tr)
    ex = [(tr['mask'] & (tr['t'] >= 0.14) & (tr['t'] <= 0.25), MAT['faixa'][0])]
    if c.view == 'frente':
        ex.append((tr['mask'] & (tr['t'] > 0.74) & (np.abs(tr['u']) < (tr['t'] - 0.74) * 3.2), MAT['faixa'][1]))
    out = [shape(m, tone, 'gi', 0.05, extras=ex)]
    return out


def roupa_camiseta(c):
    tr = c.torso(0.5)
    out = [shape(tr['mask'] & (tr['t'] >= 0.02), tone_from(tr), 'camiseta', 0.05)]
    for side in ('l', 'r'):
        A = c.arms3[side]
        z = c.limb_z(A, 0.3)
        sh = c.limb(A, c.arm_radii(), 0.45)
        out.append(shape(cut(sh, 0, 0.62), tone_from(sh), 'camiseta', z + 0.02, far=z < -2.0))
    return out


def calca(c):
    out = []
    tr = c.torso(0.45)
    out.append(shape(tr['mask'] & (tr['t'] <= 0.24), tone_from(tr), 'calca', 0.03))
    for side in ('l', 'r'):
        L = c.legs3[side]
        z = c.limb_z(L, -2.0)
        sh = c.limb(L, c.leg_radii(), 0.45)
        m = cut(sh, 0, 1.92)
        ex = [(cut(sh, 1.55, 1.92), MAT['atadura'][0])]
        out.append(shape(m, tone_from(sh), 'calca', z + 0.03, far=z < -2.5, extras=ex))
    return out


def sapato(c):
    out = []
    for side in ('l', 'r'):
        L = c.legs3[side]
        z = c.limb_z(L, -2.0)
        sh = c.limb(L, c.leg_radii(), 0.35)
        out.append(shape(cut(sh, 1.8, 3.0), tone_from(sh), 'sapato', z + 0.05, far=z < -2.5))
    return out


def munhequeira(c):
    out = []
    for side in ('l', 'r'):
        A = c.arms3[side]
        z = c.limb_z(A, 0.3)
        sh = c.limb(A, c.arm_radii(), 0.35)
        m = cut(sh, 1.35, 2.0)
        ex = [(cut(sh, 1.6, 1.68), MAT['atadura'][1])]
        out.append(shape(m, tone_from(sh), 'atadura', z + 0.04, far=z < -2.0, extras=ex))
    return out


def bandana(c):
    v = c.view
    if v == 'frente':
        m = ell(0, 0, 8.2, 7.6) & (HY >= -4) & (HY <= -2)
    elif v == 'lado':
        m = ell(0.4, 0, 8.0, 7.6) & (HY >= -4) & (HY <= -2)
    else:
        m = ell(0, 0, 8.2, 7.6) & (HY >= -4) & (HY <= -2)
    tone = edge_tone(m)
    hx_, hy_ = c.hs
    out = [shape(place(m, hx_, hy_, mirror=c.mirror), place(tone, hx_, hy_, mirror=c.mirror), 'vermelho', 50.8)]
    knot = (0, 3.0, -7.4)
    (px, py), wz = c.head_pt(knot)
    if wz > -1.0:   # nó só aparece de lado e de costas
        for sp in (-0.35, 0.35):
            offs = tail3(knot, 3, 2.5, c, spread=sp * 1.6)
            sh, _ = head_chain(c, offs, [1.1, 1.05, 0.9, 0.65])
            out.append(shape(sh['mask'], tone_from(sh), 'vermelho', tail_z(wz, 50.9)))
        kn = chain([snap((px - 0.6, py)), snap((px + 0.6, py))], [1.2, 1.2])
        out.append(shape(kn['mask'], np.zeros((FH, FW), int), 'vermelho', tail_z(wz, 51.0)))
    return out


def cachecol(c):
    B = c.B
    ring = []
    for k in range(13):
        a = 2 * math.pi * k / 12
        ring.append(c.up((math.cos(a) * 3.3, B['torso'] - 0.4, math.sin(a) * 2.6)))
    sh = chain([snap(c.scr(p)) for p in ring], [1.55] * len(ring))
    out = [shape(sh['mask'], tone_from(sh), 'vermelho', 45.0)]
    anchor = c.up((-1.0, B['torso'] - 0.8, -2.6))
    back, down, amp = c.pose['vento']
    offs = tail3((0, 0, 0), 4, 2.3, c)
    pts3 = [add(anchor, o) for o in offs]
    t = chain([snap(c.scr(p)) for p in pts3], [1.4, 1.35, 1.2, 1.0, 0.8])
    wz = sum(c.wz(p) for p in pts3) / len(pts3)
    out.append(shape(t['mask'], tone_from(t), 'vermelho', tail_z(wz - 0.5, 45.5) if wz > 1 else (wz - 1.5 if wz < -1 else 44.0)))
    return out


def espada(c):
    out = []
    p = c.pose
    # bainha nas costas (sempre)
    b0, b1, b2 = c.up((3.0, 0.8, -3.4)), c.up((-2.4, 10.8, -3.4)), c.up((-3.6, 13.4, -3.4))
    sh = chain([snap(c.scr(b0)), snap(c.scr(b1))], [0.95, 0.95])
    zb = (c.wz(b0) + c.wz(b1)) / 2
    out.append(shape(sh['mask'], tone_from(sh), 'bainha', zb - 0.3 if zb < 0 else zb + 0.3))
    if p['espada'] is None:
        hd = chain([snap(c.scr(b1)), snap(c.scr(b2))], [0.85, 0.85])
        out.append(shape(hd['mask'], tone_from(hd), 'cabo', zb - 0.29 if zb < 0 else zb + 0.31))
        return out
    d = norm(c.upv(p['espada']))
    hand = c.arms3['r'][3]
    zA = c.limb_z(c.arms3['r'], 0.3)
    pom, gd, tip = add(hand, mul(d, -2.4)), add(hand, mul(d, 1.5)), add(hand, mul(d, 15.0))
    perp = norm((d[1], -d[0], 0)) if abs(d[2]) < 0.9 else (1, 0, 0)
    blade = chain([snap(c.scr(gd)), snap(c.scr(tip))], [0.65, 0.5])
    zs = (c.wz(gd) + c.wz(tip)) / 2
    zz = zA + (0.2 if zs > c.wz(hand) else -0.2)
    out.append(shape(blade['mask'], np.where(blade['nx'] > 0.2, 1, np.where(blade['nx'] < -0.2, 2, 0)), 'lamina', zz))
    g0, g1 = add(gd, mul(perp, 1.4)), add(gd, mul(perp, -1.4))
    gu = chain([snap(c.scr(g0)), snap(c.scr(g1))], [0.6, 0.6])
    out.append(shape(gu['mask'], np.zeros((FH, FW), int), 'guarda', zz + 0.01))
    hd = chain([snap(c.scr(pom)), snap(c.scr(gd))], [0.8, 0.8])
    out.append(shape(hd['mask'], tone_from(hd), 'cabo', zA - 0.05))
    c.sword_tip = (hand, d)
    return out


ITEMS = {
    'cabelo_espetado': lambda c: hair_shapes(c, 'espetado'),
    'cabelo_rabo': lambda c: hair_shapes(c, 'rabo'),
    'roupa_gi': roupa_gi,
    'roupa_camiseta': roupa_camiseta,
    'calca_ninja': calca,
    'sapato_ninja': sapato,
    'munhequeira': munhequeira,
    'bandana': bandana,
    'cachecol': cachecol,
    'espada': espada,
}
# ordem de desenho no jogo (de baixo para cima)
LAYER_ORDER = ['base', 'calca_ninja', 'sapato_ninja', 'roupa_camiseta', 'roupa_gi', 'munhequeira',
               'cachecol', 'cabelo_espetado', 'cabelo_rabo', 'bandana', 'espada']


# ---------------------------------------------------------------- efeitos (folha separada)
def efeito(c):
    img = np.zeros((FH, FW, 4), np.uint8)
    fx = c.pose['fx']
    if not fx: return img
    if fx == 'impacto':
        hx_, hy_ = snap(c.scr(c.arms3['r'][3]))
        cx, cy = int(hx_), int(hy_)
        pts = [(0, -3), (0, 3), (-3, 0), (3, 0), (-2, -2), (2, 2), (2, -2), (-2, 2), (0, -4), (0, 4), (-4, 0), (4, 0)]
        for k, (dx, dy) in enumerate(pts):
            x, y = cx + dx, cy + dy
            if 0 <= x < FW and 0 <= y < FH:
                img[y, x] = (255, 244, 180, 255) if k < 8 else (255, 170, 60, 220)
        return img
    # arco do corte: ponta da lâmina entre a pose anterior e a atual
    seq = poses('espada')
    i = c.fi
    a, b = seq[i - 1], seq[i]
    ca, cb = Ctx(c.g, c.d, 'espada', i - 1), c
    da, db = norm(ca.upv(a['espada'])), norm(cb.upv(b['espada']))
    ha, hb = ca.arms3['r'][3], cb.arms3['r'][3]
    n = 14
    core = 1.6 if fx == 'corte' else 1.0
    alpha = 235 if fx == 'corte' else 140
    for k in range(n + 1):
        t = k / n
        dd = norm(add(mul(da, 1 - t), mul(db, t)))
        hh = add(mul(ha, 1 - t), mul(hb, t))
        tip = add(hh, mul(dd, 15.5))
        x, y = cb.scr(tip)
        r = 0.4 + core * t
        m = (XX - x) ** 2 + (YY - y) ** 2 <= r * r + 0.25
        img[m] = (210, 245, 255, int(alpha * (0.4 + 0.6 * t)))
        m2 = (XX - x) ** 2 + (YY - y) ** 2 <= (r * 0.45) ** 2 + 0.2
        img[m2] = (255, 255, 255, alpha)
    return img


# ---------------------------------------------------------------- composição
def composite(shapes, owners):
    order = sorted(range(len(shapes)), key=lambda k: shapes[k]['z'])
    img = np.zeros((FH, FW, 4), np.uint8); own = np.full((FH, FW), -1)
    for k in order:
        p = paint(shapes[k])
        m = p[..., 3] > 0
        img[m] = p[m]; own[m] = owners[k]
    return img, own


def frame_layers(g, d, anim, fi):
    c = Ctx(g, d, anim, fi)
    base = base_shapes(c)
    bimg, _ = composite(base, [0] * len(base))
    layers = {'base': bimg}
    for name, fn in ITEMS.items():
        its = fn(c)
        img, own = composite(base + its, [0] * len(base) + [1] * len(its))
        out = np.zeros_like(img)
        out[own == 1] = img[own == 1]
        layers[name] = out
    layers['efeito'] = efeito(c)
    return layers


def build_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    cols = sum(n for _, n, _ in ANIMS)
    meta = dict(quadro=[FW, FH], direcoes=DIRS, ordem_camadas=LAYER_ORDER, animacoes={}, camadas=[])
    col = 0
    for a, n, ms in ANIMS:
        meta['animacoes'][a] = dict(coluna=col, quadros=n, ms=ms); col += n
    for g in ('m', 'f'):
        sheets = {}
        col = 0
        for a, n, _ in ANIMS:
            for fi in range(n):
                for r, d in enumerate(DIRS):
                    L = frame_layers(g, d, a, fi)
                    for name, im in L.items():
                        if name not in sheets: sheets[name] = np.zeros((FH * 4, FW * cols, 4), np.uint8)
                        sheets[name][r * FH:(r + 1) * FH, (col + fi) * FW:(col + fi + 1) * FW] = im
            col += n
        sub = os.path.join(outdir, 'masculino' if g == 'm' else 'feminino')
        os.makedirs(sub, exist_ok=True)
        for name, arr in sheets.items():
            Image.fromarray(arr, 'RGBA').save(os.path.join(sub, name + '.png'), optimize=True)
    meta['camadas'] = ['base'] + list(ITEMS) + ['efeito']
    meta['paletas'] = {k: ['#%02x%02x%02x' % c for c in v] for k, v in MAT.items()}
    with open(os.path.join(outdir, 'manifesto.json'), 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return meta


if __name__ == '__main__':
    import sys
    build_all(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'saida'))
