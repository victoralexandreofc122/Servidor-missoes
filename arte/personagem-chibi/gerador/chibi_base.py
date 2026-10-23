"""Base chibi (estilo da referência do usuário) — vista de frente, em pixel art limpa.

Medidas tiradas da referência (2.jpg): grade nativa de ~6,3 px por pixel, figura com 82 px de altura,
cabeça de 37 px (45% do corpo), olhos de 9 x 9, pernas de 7 px, pés de 8 px.
Coordenadas: as tabelas abaixo estão em "coordenadas da referência" (col, linha) e são convertidas
para o canvas por C(c) = c + 12 e R(r) = r + 9. O eixo de simetria fica entre as colunas 31 e 32
(espelho: x -> 63 - x).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 64, 96
DX, DY = 12, 9

# ---------------- paleta (amostrada da referência + hue shift) ----------------
OUT = (20, 16, 34)           # contorno azul-marinho quase preto
SKIN_HI = (255, 241, 226)    # brilho da careca (rosado-claro)
SKIN = (253, 221, 184)       # pele base
SKIN_L1 = (246, 205, 166)    # 1º degrau de sombra (borda)
SKIN_SH = (226, 170, 132)    # sombra
SKIN_DK = (186, 120, 88)     # sombra funda / vinco (sob o queixo)
SKIN_LN = (150, 88, 70)      # linha interna de pele
EAR_IN = (214, 150, 116)     # dentro da orelha
MOUTH = (200, 132, 98)
MOUTH_DK = (172, 104, 80)
EYE_DK = (22, 26, 66)        # íris escura (azul-marinho)
EYE_MD = (30, 56, 128)
EYE = (44, 98, 180)          # íris azul
EYE_LT = (110, 168, 230)
WHITE = (252, 252, 255)
CL_HI = (178, 178, 186)      # roupa de baixo (cinza com hue shift frio)
CL = (146, 145, 154)
CL_SH = (110, 108, 126)
CL_DK = (78, 76, 100)

# ---------------- utilitários ----------------
def C(c):
    return c + DX


def R(r):
    return r + DY


def blank():
    return np.zeros((H, W), bool)


def runs_left(spec):
    """spec: {linha_ref: (col_esq, col_dir_meio)} em coords da referência -> máscara do lado esquerdo
    (col_esq .. col_dir_meio), já espelhada para o lado direito."""
    m = blank()
    for r, (a, b) in spec.items():
        m[R(r), C(a):C(b) + 1] = True
    return m | m[:, ::-1]


def shift(m, dx, dy):
    o = np.zeros_like(m)
    ys = slice(max(dy, 0), H + min(dy, 0)); yd = slice(max(-dy, 0), H + min(-dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0)); xd = slice(max(-dx, 0), W + min(-dx, 0))
    o[ys, xs] = m[yd, xd]
    return o


def erode(m):
    return m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)


def dilate(m):
    return m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


def ellipse(cx, cy, rx, ry):
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


class Img:
    def __init__(self):
        self.a = np.zeros((H, W, 4), np.uint8)

    def put(self, m, col):
        self.a[m] = (*col, 255)

    def px(self, pts, col, mirror=False):
        for c, r in pts:
            for x in ([C(c), 63 - C(c)] if mirror else [C(c)]):
                self.a[R(r), x] = (*col, 255)


# ---------------- silhueta e partes (coords da referência, lado esquerdo) ----------------
HEAD_L = {2: 15, 3: 12, 4: 11, 5: 10, 6: 9, 7: 8, 8: 7, 9: 6, 10: 6, 11: 5, 12: 5, 13: 5,
          **{r: 4 for r in range(14, 32)}, 32: 5, 33: 5, 34: 6, 35: 7, 36: 8, 37: 10, 38: 12}
EAR_ROWS = range(25, 31)          # a orelha empurra o contorno 1 px pra fora
NECK = {38: (15, 19), 39: (15, 19), 40: (15, 19)}
# braço: (borda externa, borda interna) por linha
ARM = {41: (12, 14), 42: (11, 14), 43: (10, 13), 44: (9, 13), 45: (9, 12), 46: (8, 12), 47: (8, 12),
       48: (8, 11), 49: (7, 11), 50: (7, 11), 51: (7, 11), 52: (7, 11),
       **{r: (6, 10) for r in range(53, 59)}}
HAND = {59: (5, 10), 60: (5, 10), 61: (5, 10), 62: (5, 10), 63: (5, 10), 64: (6, 9), 65: (7, 9)}
TORSO = {40: (13, 19), 41: (13, 19), 42: (13, 19), 43: (13, 19), 44: (13, 19), 45: (13, 19),
         46: (13, 19), 47: (13, 19), **{r: (12, 19) for r in range(48, 53)},
         **{r: (11, 19) for r in range(53, 59)}, **{r: (11, 19) for r in range(59, 66)},
         66: (11, 19), 67: (11, 18)}
LEG = {**{r: (10, 18) for r in range(67, 72)}, **{r: (10, 17) for r in range(72, 79)},
       79: (10, 16), 80: (9, 16), 81: (9, 16), 82: (9, 16), 83: (9, 16)}


def part_masks():
    head = blank()
    for r, a in HEAD_L.items():
        head[R(r), C(a):C(19) + 1] = True
    head |= head[:, ::-1]
    ears = blank()
    for r in EAR_ROWS:
        ears[R(r), C(3)] = True
    ears |= ears[:, ::-1]
    neck = runs_left(NECK)
    torso = runs_left(TORSO)
    arm = blank()
    for r, (a, b) in {**ARM, **HAND}.items():
        arm[R(r), C(a):C(b) + 1] = True
    arm_l = arm.copy()
    arm |= arm[:, ::-1]
    legs = runs_left(LEG)
    return dict(head=head | ears, ears=ears, neck=neck, torso=torso, arm=arm, arm_l=arm_l, legs=legs)


# ---------------- rosto ----------------
# Olho esquerdo (o direito é espelhado na forma; brilho e branco seguem a luz de cima-esquerda).
# O = contorno/cílios, N = íris escura, M = íris média, B = íris azul, L = azul claro,
# W = branco do olho, H = brilho, . = pele (não pinta)
EYE_L = [  # colunas ref 7..15, linhas ref 25..33
    "...OOOO..",
    ".OOOOOOO.",
    "OOOOOOOOO",
    "OOONHNNNW",
    "..WNNNNNW",
    "..WNMMMNW",
    "...WBBBBW",
    "....BLBB.",
    ".....BB..",
]
BROW_F = [(10, 22), (11, 22), (12, 22), (13, 22), (9, 23), (14, 23)]          # fina e arqueada
BROW_M = [(10, 22), (11, 22), (12, 22), (13, 22), (14, 22), (9, 23), (10, 23), (14, 23)]  # mais grossa
EYE_COL = {"O": OUT, "N": EYE_DK, "M": EYE_MD, "B": EYE, "L": EYE_LT, "W": WHITE, "H": WHITE}


def draw_eyes(img, lashes=True):
    rows = [list(s) for s in EYE_L]
    if not lashes:  # versão sem cílios: pálpebra mais curta, sem a ponta caindo pra fora
        rows[2] = list(".OOOOOOOO")
        rows[3] = list("..ONHNNNW")
    for j, s in enumerate(rows):
        for i, ch in enumerate(s):
            if ch == ".":
                continue
            c, r = 7 + i, 25 + j
            col = EYE_COL[ch]
            img.px([(c, r)], col)                       # olho esquerdo
            # olho direito: mesma forma espelhada, mas brilho/branco seguem a luz (não espelha o "H")
            mc = 39 - c
            mch = ch
            img.px([(mc, r)], EYE_COL[mch])
    # brilho do olho direito também no canto de cima-esquerdo da íris (luz de cima-esquerda)
    img.px([(39 - 11, 28)], EYE_DK)                     # tira o brilho espelhado
    img.px([(39 - 13, 28)], WHITE)
    img.px([(39 - 12, 32)], EYE)                        # reflexo azul-claro também à esquerda
    img.px([(39 - 13, 32)], EYE_LT)


def draw_face(img, variant):
    draw_eyes(img, lashes=(variant == "f"))
    brow = BROW_F if variant == "f" else BROW_M
    img.px(brow, OUT, mirror=True)
    # sorriso pequeno
    img.px([(18, 35), (21, 35)], MOUTH)
    img.px([(19, 36), (20, 36)], MOUTH_DK)


# ---------------- render ----------------
def render_front(variant="f"):
    P = part_masks()
    img = Img()
    body = P["torso"] | P["neck"]
    sil = P["head"] | body | P["arm"] | P["legs"]

    # preenchimento base
    img.put(sil, SKIN)

    # --- sombreamento (luz de cima-esquerda; sombra chapada de 1 px nas bordas da direita) ---
    def right_edge(m, k=1):
        e = m & ~shift(m, -1, 0)
        for _ in range(k - 1):
            e |= shift(e, -1, 0) & m
        return e

    head = P["head"]
    hf = erode(head)
    rows_ = np.mgrid[0:H, 0:W][0]
    img.put(right_edge(hf, 2) & (rows_ >= R(6)), SKIN_L1)                          # borda direita da cabeça
    img.put(right_edge(hf, 1) & (rows_ >= R(10)) & (rows_ <= R(34)), SKIN_SH)
    jaw = hf & ~shift(hf, 0, -1)                                                   # base do rosto
    img.put(jaw & (np.mgrid[0:H, 0:W][0] >= R(33)), SKIN_L1)
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    def tilted(cx, cy, rx, ry, ang):
        ca, sa = np.cos(ang), np.sin(ang)
        u = (xx - cx) * ca + (yy - cy) * sa; v = -(xx - cx) * sa + (yy - cy) * ca
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1
    img.put(tilted(C(11.5), R(9.6), 3.9, 2.2, -0.75) & hf, SKIN_HI)             # brilho da careca
    img.put(tilted(C(11.3), R(9.4), 2.2, 1.1, -0.75) & hf, (255, 250, 244))
    # orelhas: "C" mais escuro por dentro
    for (c, r, col) in [(4, 25, SKIN_SH), (4, 26, SKIN_SH), (5, 26, EAR_IN), (5, 27, EAR_IN), (5, 28, EAR_IN),
                        (5, 29, EAR_IN), (4, 29, SKIN_SH), (4, 30, SKIN_SH), (6, 27, SKIN_L1), (6, 28, SKIN_L1)]:
        img.px([(c, r)], col, mirror=True)

    # pescoço na sombra do queixo
    img.put(P["neck"] & ~P["head"], SKIN_L1)
    img.px([(18, 39), (19, 39)], SKIN_DK, mirror=True)
    img.px([(16, 39), (17, 39)], SKIN_SH, mirror=True)
    # tronco: borda direita + leve sombra sob o peito e no quadril
    t = P["torso"] & ~P["head"]
    ti = erode(t) & ~P["arm"]
    img.put(right_edge(ti, 2), SKIN_L1)
    img.px([(13, 42), (13, 43)], SKIN_L1, mirror=True)
    img.px([(17, 51), (18, 51)], SKIN_L1, mirror=True)                            # linha sob o peito
    img.px([(19, 58)], SKIN_SH, mirror=False)                                     # umbigo
    img.px([(20, 58)], SKIN_SH, mirror=False)
    # braços e mãos: sombra de 2 tons na borda direita (por dentro do contorno) + vinco na axila
    arm = P["arm"]
    ai = erode(arm)
    img.put(right_edge(ai, 2), SKIN_L1)
    img.put(right_edge(ai, 1), SKIN_SH)
    img.px([(12, 47), (12, 46)], SKIN_DK)                                         # axila esquerda (vinco)
    img.px([(27, 47), (27, 46)], SKIN_DK)
    # pernas: borda direita (por dentro do contorno) em 2 tons, borda esquerda clara
    legs = P["legs"]
    li = erode(legs)
    img.put(right_edge(li, 2), SKIN_L1)
    img.put(right_edge(li, 1), SKIN_SH)
    img.put(li & (np.mgrid[0:H, 0:W][0] >= R(82)) & ~right_edge(li, 1), SKIN_L1)  # base do pé

    # --- roupa de baixo (cueca/calcinha mínima) ---
    brief = blank()
    spec = {59: (12, 19), 60: (12, 19), 61: (12, 19), 62: (13, 19), 63: (14, 19), 64: (15, 19),
            65: (16, 19), 66: (17, 19)}
    for r, (a, b) in spec.items():
        brief[R(r), C(a):C(b) + 1] = True
    brief |= brief[:, ::-1]
    brief &= ~arm
    img.put(brief, CL)
    img.put(brief & ~shift(brief, 0, 1), CL_DK)                                   # cós
    img.put(right_edge(brief) & ~(brief & ~shift(brief, 0, 1)), CL_SH)
    img.put(brief & ~shift(brief, 0, -1), CL_SH)                                  # borda das pernas
    img.px([(14, 60), (15, 60)], CL_HI)

    # --- contorno externo ---
    ring = sil & ~erode(sil)
    img.put(ring, OUT)
    # contorno interno: braço x tronco (do cotovelo pra baixo), vinco dos dedos, cantos do queixo
    inner = blank()
    for r in range(48, 65):
        a, b = {**ARM, **HAND}[r]
        inner[R(r), C(b) + 1] = True
    inner |= inner[:, ::-1]
    img.put(inner & sil, OUT)
    img.px([(9, 62), (9, 63)], OUT, mirror=True)                                  # vinco polegar/dedos
    img.px([(12, 38), (13, 38), (14, 38)], OUT, mirror=True)                      # canto do queixo
    img.px([(11, 37)], OUT, mirror=True)
    # vão entre as pernas (fechado por contorno)
    img.px([(19, 67)], OUT, mirror=True)

    draw_face(img, variant)
    return img.a


def compare(variant, out_path):
    """Referência (recortada na grade nativa) ao lado da nossa versão, mesma escala."""
    sc = 6
    ours = Image.fromarray(render_front(variant), "RGBA")
    ref = Image.open("/tmp/claude-0/-home-user/21a1a9d9-2c67-5827-875e-921da8ec9205/images/2.jpg").convert("RGB")
    px, ox, py, oy = 6.30, 106.1, 6.18, 363.7
    # recorta a referência no mesmo enquadramento do canvas (64 x 96 células)
    x0 = ox - DX * px; y0 = oy - DY * py
    refc = ref.crop((int(x0), int(y0), int(x0 + W * px), int(y0 + H * py))).resize((W * sc, H * sc), Image.LANCZOS)
    big = ours.resize((W * sc, H * sc), Image.NEAREST)
    canvas = Image.new("RGB", (W * sc * 2 + 30, H * sc + 50), (255, 255, 255))
    canvas.paste(refc, (0, 50))
    canvas.paste(big, (W * sc + 30, 50), big)
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    d.text((10, 12), "REFERÊNCIA", fill=OUT, font=f)
    d.text((W * sc + 40, 12), "NOSSA VERSÃO (pixel nativo)", fill=OUT, font=f)
    canvas.save(out_path)


if __name__ == "__main__":
    v = sys.argv[1] if len(sys.argv) > 1 else "f"
    out = os.path.dirname(os.path.abspath(__file__))
    Image.fromarray(render_front(v), "RGBA").save(os.path.join(out, f"front_{v}.png"))
    compare(v, os.path.join(out, f"cmp_{v}.png"))
    print("ok")
