"""Exemplo: a base chibi vestida de ninja (estilo anime de Naruto) — vista de frente.

Tudo é desenhado como CAMADAS por cima da base (mesmo canvas 64x96, mesmas coordenadas da referência):
  base (corpo) < sandálias < faixas < calça < porta-kunai < mangas < colete < gola < cabeça
  < cabelo da frente < bandana < placa
Regra de contorno: cada camada desenha a própria linha só onde encosta em algo que está ATRÁS dela
(ou no vazio). Assim nunca sai linha dupla entre duas peças.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    import chibi_base as B  # noqa: E402
except ImportError:  # na pasta de entrega o gerador da base chama gerar_base_chibi.py
    import gerar_base_chibi as B  # noqa: E402
W, H, C, R, OUT, shift, erode, blank = B.W, B.H, B.C, B.R, B.OUT, B.shift, B.erode, B.blank

# ---------------- paletas (hue shift: sombra puxa pro roxo/azul, luz puxa pro amarelo) ----------------
HAIR = dict(dk=(60, 30, 44), sh=(100, 52, 50), base=(142, 78, 54), lt=(184, 112, 66), hi=(226, 162, 98))
VEST = dict(dk=(38, 60, 54), sh=(64, 94, 58), base=(96, 126, 62), lt=(130, 156, 74), hi=(168, 186, 98))
NAVY = dict(dk=(28, 28, 56), sh=(40, 44, 82), base=(54, 62, 110), lt=(74, 88, 142), hi=(102, 120, 174))
STEEL = dict(dk=(80, 86, 110), sh=(128, 136, 158), base=(174, 182, 198), lt=(214, 220, 230), hi=(252, 252, 255))
WRAP = dict(dk=(148, 140, 152), sh=(194, 186, 182), base=(234, 228, 216), lt=(248, 245, 236))
HOL = dict(dk=NAVY["dk"], sh=NAVY["sh"], base=STEEL["dk"], lt=STEEL["sh"])


# ---------------- máscaras ----------------
def runs(spec, mirror=True):
    """{linha_ref: (col_a, col_b)} -> máscara (lado esquerdo, espelhada se mirror)."""
    m = blank()
    for r, (a, b) in spec.items():
        m[R(r), C(a):C(b) + 1] = True
    return m | m[:, ::-1] if mirror else m


def poly(pts, mirror=False):
    """Polígono em coordenadas CONTÍNUAS da referência (o pixel col c ocupa [c, c+1)).
    Espelho contínuo: x -> 40 - x. Um pixel entra se o centro dele está dentro."""
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    xs = [x + B.DX for x, _ in pts]
    ys = [y + B.DY for _, y in pts]
    inside = np.zeros((H, W), bool)
    n = len(pts)
    for i in range(n):
        x1, y1, x2, y2 = xs[i], ys[i], xs[(i + 1) % n], ys[(i + 1) % n]
        cond = (y1 > yy) != (y2 > yy)
        xint = (x2 - x1) * (yy - y1) / ((y2 - y1) if y2 != y1 else 1e-9) + x1
        inside ^= cond & (xx < xint)
    return inside | inside[:, ::-1] if mirror else inside


def at(m, pts):
    """Liga pixels (coords ref) numa máscara."""
    for c, r in pts:
        m[R(r), C(c)] = True
    return m


def right_edge(m, k=1):
    e = m & ~shift(m, -1, 0)
    for _ in range(k - 1):
        e |= shift(e, -1, 0) & m
    return e


def left_edge(m):
    return m & ~shift(m, 1, 0)


def top_edge(m):
    return m & ~shift(m, 0, 1)


def bottom_edge(m):
    return m & ~shift(m, 0, -1)


ROWS = np.mgrid[0:H, 0:W][0]
COLS = np.mgrid[0:H, 0:W][1]


def rows_between(a, b):
    return (ROWS >= R(a)) & (ROWS <= R(b))


def cols_between(a, b):
    return (COLS >= C(a)) & (COLS <= C(b))


class Layer:
    def __init__(self, name, mask, paint=None, pixels=None, ring=True, inner=OUT, no_line_with=()):
        self.name, self.mask, self.paint, self.pixels = name, mask, paint, pixels
        self.ring, self.inner, self.no_line_with = ring, inner, no_line_with


def compose(layers, only=None):
    """Compõe as camadas (lista do fundo pra frente). `only` = nomes a desenhar (pra mostrar camadas soltas)."""
    img = np.zeros((H, W, 4), np.uint8)
    allm = np.zeros((H, W), bool)
    for L in layers:
        allm |= L.mask
    for i, L in enumerate(layers):
        above = np.zeros((H, W), bool)
        for U in layers[i + 1:]:
            above |= U.mask
        vis = L.mask & ~above
        full = L.mask | above
        interior = vis & erode(full)
        lay = np.zeros((H, W, 4), np.uint8)
        if L.pixels is not None:
            lay[:] = L.pixels
        if L.paint is not None:
            L.paint(lay, L.mask, vis, interior)
        if L.ring:
            ring = vis & ~erode(full)
            # vizinho de fora pertence a qual camada? (vazio -> contorno escuro; peça de trás -> linha interna)
            behind_named = {U.name: U.mask for U in layers[:i]}
            ok = np.zeros((H, W), bool)          # anel que encosta no vazio
            soft = np.zeros((H, W), bool)        # anel que encosta só em peça liberada (sem linha)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nb_out = ~shift(full, dx, dy)    # vizinho (x-dx, y-dy) fora de L ∪ acima
                nb_empty = ~shift(allm, dx, dy)
                ok |= ring & nb_out & nb_empty
            for nm in L.no_line_with:
                m = behind_named.get(nm)
                if m is None:
                    continue
                only_that = ring.copy()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nb_out = ~shift(full, dx, dy)
                    nb_in_m = shift(m, dx, dy)
                    only_that &= ~(nb_out & ~nb_in_m)
                soft |= only_that
            ring_col = np.zeros((H, W, 4), np.uint8)
            ring_col[ring] = (*L.inner, 255)
            ring_col[ring & ok] = (*OUT, 255)
            keep = ring & ~soft
            lay[keep] = ring_col[keep]
        if only is None or L.name in only:
            img[vis] = lay[vis]
    return img


def put(lay, m, col):
    lay[m] = (*col, 255)


def putpx(lay, pts, col, mirror=False):
    for c, r in pts:
        xs = [C(c), 63 - C(c)] if mirror else [C(c)]
        for x in xs:
            lay[R(r), x] = (*col, 255)


# ---------------- peças ----------------
P = B.part_masks()

# --- cabelo espetado: espetos distribuídos em volta do crânio (elipse), cada um com lado de luz e de sombra ---
HAIR_CX, HAIR_CY, HAIR_RX, HAIR_RY = 20.0, 15.0, 19.0, 16.4
# (ângulo em graus na tela: -90 = pra cima, 180 = esquerda, 0 = direita; comprimento; curva da ponta em graus)
SPIKES = [
    (-190, 5.0, -10),   # esquerda baixa (cai pra fora)
    (-152, 7.2, -8),
    (-114, 7.8, -4),    # topo-esquerda
    (-78, 8.2, 4),      # topo (maior)
    (-42, 7.6, 8),
    (-6, 6.2, 12),      # direita
    (18, 4.6, 12),      # direita baixa
]
LIGHT = np.array([-1.0, -1.0]) / np.sqrt(2)


def _ell(theta_deg, k=1.0):
    t = np.radians(theta_deg)
    return np.array([HAIR_CX + HAIR_RX * k * np.cos(t), HAIR_CY + HAIR_RY * k * np.sin(t)])


def hair_geometry():
    ang = [s[0] for s in SPIKES]
    valleys = [(ang[0] - (ang[1] - ang[0]) / 2)]
    valleys += [(a + b) / 2 for a, b in zip(ang, ang[1:])]
    valleys += [ang[-1] + (ang[-1] - ang[-2]) / 2]
    vpts = [_ell(v) for v in valleys]
    spikes = []
    for i, (a, L, bend) in enumerate(SPIKES):
        base = _ell(a)
        t = np.radians(a + bend)
        tip = base + L * np.array([np.cos(t), np.sin(t)])
        root = _ell(a, 0.72)
        spikes.append(dict(v0=vpts[i], tip=tip, v1=vpts[i + 1], root=root, axis_ang=a + bend))
    return vpts, spikes


def hair_masks():
    vpts, spikes = hair_geometry()
    pts = [(1.6, 20.0), (1.6, 14.0)]
    pts.append(tuple(vpts[0]))
    for s in spikes:
        pts += [tuple(s["tip"]), tuple(s["v1"])]
    pts += [(38.4, 14.0), (38.4, 20.0)]
    top = poly(pts) | poly([(HAIR_CX - HAIR_RX * 0.98, 14.0), (HAIR_CX + HAIR_RX * 0.98, 14.0),
                             (HAIR_CX + HAIR_RX * 0.98, 20.0), (HAIR_CX - HAIR_RX * 0.98, 20.0)])
    locks = poly(LOCK_L) | poly(BANG_L) | poly(LOCK_R) | poly(BANG_R)
    return top, locks


# mechas da frente (embaixo da bandana): costeleta longa + franjinha curta, dos dois lados
LOCK_L = [(0.6, 19.0), (7.0, 19.0), (6.6, 24.0), (3.4, 32.4), (0.8, 25.0)]
BANG_L = [(5.6, 19.0), (11.4, 19.0), (7.4, 24.8)]


def mirror_pts(pts):
    return [(40 - x, y) for x, y in pts][::-1]


LOCK_R = mirror_pts(LOCK_L)
BANG_R = mirror_pts(BANG_L)


def paint_hair(lay, mask, vis, interior):
    top, locks = hair_masks()
    vpts, spikes = hair_geometry()
    put(lay, mask, HAIR["base"])
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    rx, ry = xx - B.DX, yy - B.DY                       # coords contínuas da referência
    # 1) volume: lado direito e parte de baixo na sombra
    d = np.sqrt(((rx - (HAIR_CX - 5)) / HAIR_RX) ** 2 + ((ry - (HAIR_CY - 6)) / HAIR_RY) ** 2)
    put(lay, interior & top & (d > 1.0), HAIR["sh"])
    # 2) espetos: a metade virada pra longe da luz fica na sombra (blocos limpos)
    for s in spikes:
        reg = poly([tuple(s["v0"]), tuple(s["tip"]), tuple(s["v1"]), tuple(s["root"])])
        ax = s["tip"] - s["root"]
        ax = ax / np.linalg.norm(ax)
        n_cw = np.array([-ax[1], ax[0]])
        lit_cw = (n_cw @ LIGHT) > -0.05
        cross = ax[0] * (ry - s["root"][1]) - ax[1] * (rx - s["root"][0])
        lit = ((cross > 0) == lit_cw)
        reg &= top & (ROWS <= R(13))
        put(lay, interior & reg & ~lit, HAIR["sh"])
        put(lay, interior & reg & lit & (d <= 1.0), HAIR["base"])
    # 3) linhas entre os espetos: das valas pra dentro do volume
    lines = blank()
    for v in vpts[1:-1]:
        dv = np.array([HAIR_CX, HAIR_CY + 4]) - v
        dv = dv / np.linalg.norm(dv)
        for t in np.arange(0.5, 3.1, 0.5):
            p = v + dv * t
            c, r = int(np.floor(p[0])), int(np.floor(p[1]))
            if 0 <= R(r) < H and 0 <= C(c) < W:
                lines[R(r), C(c)] = True
    put(lay, lines & interior & (ROWS <= R(11)), HAIR["dk"])
    # 4) brilho de anime: arco no alto-esquerdo do volume, quebrado pelas linhas das mechas
    e = np.sqrt(((rx - 21.0) / 15.5) ** 2 + ((ry - 13.0) / 12.5) ** 2)
    ang = np.degrees(np.arctan2(ry - 13.0, rx - 21.0))
    arc = (e > 0.80) & (e < 0.93) & (ang > -160) & (ang < -62)
    put(lay, arc & interior & ~lines & ~shift(lines, 1, 0), HAIR["lt"])
    arc_hi = (e > 0.83) & (e < 0.91) & (ang > -140) & (ang < -112)
    put(lay, arc_hi & interior & ~lines & ~shift(lines, 1, 0), HAIR["hi"])
    # 5) sombra logo acima da bandana e nas mechas da frente
    put(lay, interior & top & rows_between(12, 12), HAIR["sh"])
    li = locks & interior & (ROWS >= R(20))
    put(lay, li, HAIR["base"])
    put(lay, right_edge(li, 1), HAIR["sh"])
    put(lay, li & rows_between(20, 20), HAIR["dk"])
    put(lay, bottom_edge(li) & rows_between(25, 33), HAIR["sh"])


def headband_mask():
    return poly([(3.0, 13.0), (37.0, 13.0), (37.0, 20.0), (3.0, 20.0)])


def paint_band(lay, mask, vis, interior):
    put(lay, mask, NAVY["base"])
    put(lay, interior & rows_between(14, 14), NAVY["lt"])
    put(lay, interior & rows_between(18, 18), NAVY["sh"])
    put(lay, interior & cols_between(33, 35), NAVY["sh"])
    put(lay, interior & cols_between(35, 35), NAVY["dk"])


TAILS = [
    [(34.0, 14.6), (40.0, 15.6), (45.2, 19.4), (44.0, 21.0), (39.4, 18.6), (34.0, 18.4)],
    [(34.0, 16.6), (39.0, 19.2), (42.6, 25.6), (40.8, 26.4), (37.6, 21.6), (34.0, 20.0)],
]


def tails_mask():
    return poly(TAILS[0]) | poly(TAILS[1])


def paint_tails(lay, mask, vis, interior):
    put(lay, mask, NAVY["sh"])
    put(lay, top_edge(interior), NAVY["base"])
    put(lay, interior & poly(TAILS[1]) & ~poly(TAILS[0]), NAVY["dk"])
    put(lay, top_edge(interior & poly(TAILS[1]) & ~poly(TAILS[0])), NAVY["sh"])


def plate_mask():
    m = poly([(12.0, 12.0), (28.0, 12.0), (28.0, 21.0), (12.0, 21.0)])
    for c, r in ((12, 12), (27, 12), (12, 20), (27, 20)):
        m[R(r), C(c)] = False
    return m


SPIRAL = [  # símbolo genérico gravado (espiral quadrada), cols 18..22, linhas 14..18
    "XXXXX",
    "....X",
    "XXX.X",
    "X...X",
    "XXXXX",
]


def paint_plate(lay, mask, vis, interior):
    put(lay, mask, STEEL["base"])
    put(lay, interior & rows_between(13, 13), STEEL["lt"])
    put(lay, interior & cols_between(13, 13), STEEL["lt"])
    put(lay, interior & rows_between(19, 19), STEEL["sh"])
    put(lay, interior & cols_between(26, 26), STEEL["sh"])
    putpx(lay, [(13, 13), (14, 13)], STEEL["hi"])
    putpx(lay, [(13, 14)], STEEL["hi"])
    # rebites
    for c, r in ((14, 15), (14, 17), (25, 15), (25, 17)):
        putpx(lay, [(c, r)], STEEL["dk"])
    # espiral gravada (linha escura + borda de luz embaixo/direita = gravação)
    for j, s in enumerate(SPIRAL):
        for i, ch in enumerate(s):
            if ch == "X":
                putpx(lay, [(18 + i, 14 + j)], STEEL["dk"])


# --- colete (flak jacket) ---
VEST_BODY = {**{r: (13, 19) for r in range(40, 48)}, **{r: (12, 19) for r in range(48, 53)},
             **{r: (11, 19) for r in range(53, 62)}}
VEST_CAP = {41: (12, 14), 42: (11, 14), 43: (10, 13), 44: (9, 13)}
COLLAR = {38: (12, 19), 39: (12, 19), 40: (12, 19), 41: (12, 19), 42: (13, 19)}


def vest_mask():
    return runs(VEST_BODY) | runs(VEST_CAP)


def paint_vest(lay, mask, vis, interior):
    put(lay, mask, VEST["base"])
    vi = interior
    put(lay, right_edge(vi & cols_between(20, 40), 2), VEST["sh"])     # lado direito na sombra
    put(lay, vi & rows_between(43, 43) & cols_between(13, 26), VEST["sh"])  # sombra da gola
    put(lay, left_edge(vi) & rows_between(54, 59), VEST["lt"])           # lado esquerdo na luz
    # ombreiras: esquerda clara em cima, direita escura
    capL = runs({41: (9, 14), 42: (9, 14), 43: (9, 14), 44: (9, 14)}, mirror=False)
    put(lay, top_edge(vi & capL), VEST["lt"])
    capR = capL[:, ::-1]
    put(lay, vi & capR & rows_between(41, 44), VEST["sh"])
    # fecho central (a aba esquerda passa por cima da direita)
    put(lay, vi & cols_between(20, 20) & rows_between(43, 60), VEST["dk"])
    put(lay, vi & cols_between(19, 19) & rows_between(44, 60), VEST["lt"])
    # bolsos de pergaminho no peito (2 de cada lado)
    for a in (14, 21):
        b = a + 4
        pocket = runs({r: (a, b) for r in range(46, 54)}, mirror=False)
        put(lay, pocket, VEST["base"])
        put(lay, pocket & ~erode(pocket), VEST["dk"])
        put(lay, erode(pocket) & rows_between(47, 47), VEST["lt"])      # aba do bolso (luz)
        put(lay, pocket & rows_between(48, 48), VEST["dk"])             # beirada da aba
        put(lay, erode(pocket) & cols_between(b - 1, b - 1) & rows_between(49, 52), VEST["sh"])
    # barra do colete
    put(lay, vi & rows_between(60, 60), VEST["sh"])


def collar_mask():
    return runs(COLLAR)


def paint_collar(lay, mask, vis, interior):
    put(lay, mask, VEST["base"])
    ci = interior
    put(lay, top_edge(ci), VEST["lt"])
    put(lay, ci & cols_between(24, 40), VEST["sh"])
    put(lay, ci & rows_between(41, 41) & cols_between(13, 23), VEST["sh"])
    # abertura em V na frente (gola alta da camisa por baixo)
    putpx(lay, [(19, 39), (20, 39), (19, 40), (20, 40)], NAVY["dk"])
    putpx(lay, [(19, 41), (20, 41)], VEST["dk"])


# --- mangas da camisa (azul-marinho) ---
def sleeve_mask():
    return P["arm"] & rows_between(41, 57)


def paint_sleeve(lay, mask, vis, interior):
    put(lay, mask, NAVY["base"])
    si = interior
    put(lay, right_edge(si, 2), NAVY["sh"])
    put(lay, left_edge(si), NAVY["lt"])
    put(lay, si & rows_between(55, 55), NAVY["sh"])        # dobra do punho
    put(lay, si & rows_between(56, 56) & ~right_edge(si, 1), NAVY["lt"])


# --- calça (azul-marinho, folgada na coxa, presa nas faixas) ---
PANTS = {**{r: (11, 19) for r in range(61, 67)}, 67: (10, 19),
         **{r: (9, 18) for r in range(68, 72)}, 72: (9, 17), 73: (9, 17), 74: (10, 17)}


def pants_mask():
    return runs(PANTS)


def paint_pants(lay, mask, vis, interior):
    put(lay, mask, NAVY["base"])
    pi = interior
    put(lay, right_edge(erode(mask), 2) & pi, NAVY["sh"])           # sombra na borda real da perna
    put(lay, pi & cols_between(25, 25) & rows_between(71, 73), NAVY["sh"])   # sombra do porta-kunai
    put(lay, pi & rows_between(62, 62), NAVY["sh"])                 # sombra da barra do colete
    put(lay, left_edge(pi) & rows_between(68, 72), NAVY["lt"])     # coxa pegando luz
    put(lay, pi & rows_between(73, 73), NAVY["sh"])                 # o pano "embolsa" sobre a faixa
    # dobras
    putpx(lay, [(14, 71), (15, 72), (27, 71), (26, 72)], NAVY["sh"])


# --- faixas na canela ---
WRAPS = {**{r: (10, 17) for r in range(75, 79)}, 79: (10, 16)}


def wraps_mask():
    return runs(WRAPS)


def paint_wraps(lay, mask, vis, interior):
    put(lay, mask, WRAP["base"])
    wi = interior
    put(lay, wi & rows_between(75, 75), WRAP["sh"])                 # sombra da barra da calça
    seam = blank()
    at(seam, [(11, 77), (12, 77), (13, 77), (14, 76), (15, 76), (16, 76)])
    seam |= seam[:, ::-1]
    put(lay, seam & wi, WRAP["sh"])
    put(lay, right_edge(wi, 1), WRAP["sh"])


# --- sandálias ninja (dedos de fora) ---
SANDAL = {r: (9, 16) for r in range(80, 84)}


def sandal_mask():
    return runs(SANDAL)


def paint_sandal(lay, mask, vis, interior):
    put(lay, mask, NAVY["base"])
    si = interior
    put(lay, si & rows_between(80, 80), NAVY["lt"])
    put(lay, right_edge(si, 1) & rows_between(80, 81), NAVY["sh"])
    toes = si & rows_between(82, 82)
    put(lay, toes, B.SKIN)
    put(lay, right_edge(toes, 2), B.SKIN_L1)


# --- porta-kunai na coxa (lado direito da tela) ---
def holster_masks():
    pouch = poly([(26.0, 67.0), (32.0, 67.0), (32.0, 74.0), (26.0, 74.0)])
    tape = runs({68: (21, 30), 69: (21, 30), 70: (21, 30)}, mirror=False)
    return pouch, tape


def paint_tape(lay, mask, vis, interior):
    put(lay, mask, WRAP["base"])
    put(lay, interior & cols_between(24, 25), WRAP["sh"])


def paint_pouch(lay, mask, vis, interior):
    put(lay, mask, HOL["base"])
    hi = interior
    put(lay, hi & rows_between(68, 69), HOL["lt"])                  # aba
    put(lay, hi & rows_between(70, 70), HOL["dk"])                  # beirada da aba
    put(lay, right_edge(hi, 1) & rows_between(71, 73), HOL["sh"])
    putpx(lay, [(28, 69)], STEEL["lt"])                             # botão de pressão


TAILS_ON = False


def paint_head_under_hair(lay, mask, vis, interior):
    """A costeleta cobre a orelha: o miolo da orelha que sobra vira borda da bochecha."""
    putpx(lay, [(5, 26), (5, 27), (5, 28), (5, 29)], B.SKIN_L1, mirror=True)
    putpx(lay, [(6, 27), (6, 28)], B.SKIN, mirror=True)
    putpx(lay, [(33, 24)], B.SKIN)
    putpx(lay, [(4, 30)], B.SKIN_L1)
    # sombra projetada da bandana/placa na testa (1 px logo abaixo do que está por cima)
    over = headband_mask() | plate_mask()
    skin = (lay[..., 3] > 0) & np.all(lay[..., :3] == B.SKIN, axis=-1)
    put(lay, skin & shift(over, 0, 1) & ~over, B.SKIN_L1)


def build_layers(face="m", with_hair=True, with_clothes=True):
    base = B.render_front(face)
    base_mask = base[..., 3] > 0
    head_mask = P["head"]
    top, locks = hair_masks()
    pouch, tape = holster_masks()
    L = [Layer("pontas_bandana", tails_mask(), paint_tails)] if (with_hair and TAILS_ON) else []
    L += [Layer("base", base_mask, pixels=base, ring=False)]
    if with_clothes:
        L += [
            Layer("sandalia", sandal_mask(), paint_sandal),
            Layer("faixas", wraps_mask(), paint_wraps),
            Layer("calca", pants_mask(), paint_pants),
            Layer("fita", tape, paint_tape),
            Layer("porta_kunai", pouch, paint_pouch),
            Layer("mangas", sleeve_mask(), paint_sleeve),
            Layer("colete", vest_mask(), paint_vest),
            Layer("gola", collar_mask(), paint_collar, inner=VEST["dk"]),
        ]
    L.append(Layer("cabeca", head_mask, pixels=base, paint=paint_head_under_hair if with_hair else None,
                   ring=True))
    if with_hair:
        L += [
            Layer("cabelo", top | locks, paint_hair),
            Layer("bandana", headband_mask(), paint_band),
            Layer("placa", plate_mask(), paint_plate),
        ]
    return L


def render(face="m", **kw):
    return compose(build_layers(face, **kw))


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG = (248, 248, 252, 255)
PANEL = (234, 236, 243, 255)
INK = (*OUT, 255)


def _panel(arr, sc):
    im = Image.fromarray(arr, "RGBA").resize((W * sc, H * sc), Image.NEAREST)
    p = Image.new("RGBA", im.size, PANEL)
    p.alpha_composite(im)
    return p


def sheet_layers(path, face="m", sc=5):
    """Base  +  peças (roupa e cabelo, camadas separadas)  =  resultado."""
    layers = build_layers(face)
    pieces = [L.name for L in layers if L.name not in ("base", "cabeca")]
    panels = [
        ("1. BASE", "corpo + roupa de baixo", _panel(B.render_front(face), sc)),
        ("2. PEÇAS (camadas)", "roupa, cabelo e bandana", _panel(compose(layers, only=pieces), sc)),
        ("3. RESULTADO", "peças por cima da base", _panel(compose(layers), sc)),
    ]
    gap, mx, top, bot = 70, 30, 96, 30
    pw, ph = W * sc, H * sc
    out = Image.new("RGBA", (mx * 2 + 3 * pw + 2 * gap, top + ph + bot), BG)
    d = ImageDraw.Draw(out)
    f1, f2, f3 = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT_R, 16), ImageFont.truetype(FONT, 46)
    for i, (t, s, p) in enumerate(panels):
        x = mx + i * (pw + gap)
        d.text((x, 18), t, fill=INK, font=f1)
        d.text((x, 50), s, fill=(90, 90, 110, 255), font=f2)
        out.alpha_composite(p, (x, top))
        if i < 2:
            sym = "+" if i == 0 else "="
            tw = d.textlength(sym, font=f3)
            d.text((x + pw + (gap - tw) / 2, top + ph / 2 - 30), sym, fill=INK, font=f3)
    out.save(path)


def hero(path, face="m", sc=8):
    _panel(compose(build_layers(face)), sc).save(path)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else HERE
    img = compose(build_layers("m"))
    Image.fromarray(img, "RGBA").save(os.path.join(out, "exemplo_ninja_frente_64x96.png"))
    hero(os.path.join(out, "exemplo_ninja_frente_8x.png"))
    sheet_layers(os.path.join(out, "exemplo_ninja_camadas.png"))
    print("ok")
