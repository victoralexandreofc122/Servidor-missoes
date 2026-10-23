"""Paletas pra recolorir o personagem: pele (tons reais, do mais escuro ao mais claro), cabelo, olhos e roupas
(+ metais). Cada rampa é derivada da rampa aprovada correspondente: a mesma diferença de luz, saturação e matiz
entre os tons é aplicada sobre a nova cor base (em OKLab), então o sombreado continua com a mesma cara.
"""
import math

import numpy as np

from pal import EYE_DEFAULT, HAIR_DEFAULT, SKIN_DEFAULT, _delin, hue_toward, rgb2oklch

# ---------------- conversão com controle de gamut ----------------
def _lin_rgb(L, C, h):
    A, B = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return np.array([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                     -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                     -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s])


def to_rgb(L, C, h):
    """OKLCH -> RGB, tirando saturação até caber no sRGB (em vez de cortar o canal e mudar a matiz)."""
    L = min(max(L, 0.0), 1.0)
    for _ in range(80):
        v = _lin_rgb(L, C, h)
        if v.min() >= -1e-4 and v.max() <= 1 + 1e-4:
            break
        C *= 0.94
    return tuple(int(round(float(c))) for c in _delin(_lin_rgb(L, C, h)))


def _hd(a, b):
    return (a - b + 540) % 360 - 180


def derive(template, base_i, new_base, lo=0.20, hi=0.985, keep_contrast_dark=True):
    """Aplica as diferenças (luz, saturação, matiz) da rampa modelo sobre uma nova base."""
    T = [rgb2oklch(c) for c in template]
    Lb, Cb, hb = T[base_i]
    L0, C0, h0 = rgb2oklch(new_base)
    out = []
    for i, (L, C, h) in enumerate(T):
        dL = L - Lb
        if dL > 0:                      # base muito clara: comprime os brilhos pra caber
            room = hi - L0
            maxd = max(dL for (l, c, hh) in T if l - Lb > 0) if any(l > Lb for (l, c, hh) in T) else dL
            if L0 + maxd > hi:
                dL *= max(room, 0.0) / maxd
        elif dL < 0:                    # base muito escura: comprime as sombras (sem passar do contorno)
            room = L0 - lo
            mind = min(L - Lb for (L, c, hh) in T)
            if L0 + mind < lo:
                dL *= max(room, 0.0) / -mind
        k = C / Cb if Cb > 1e-4 else 1.0
        Cn = C0 * k
        hn = (h0 + _hd(h, hb)) % 360 if C0 > 0.02 else h0
        out.append(to_rgb(L0 + dL, Cn, hn))
    return out


def cloth_ramp(base):
    """Rampa de 5 tons pra roupa (escuro, sombra, base, luz, brilho) com sombra puxando pro azul-violeta
    e luz puxando pro amarelo (o mesmo jeito das rampas aprovadas)."""
    L0, C0, h0 = rgb2oklch(base)
    steps = [(-0.22, 0.80, 285, 16), (-0.11, 0.92, 285, 8), (0, 1, 0, 0), (0.09, 0.95, 95, 7), (0.18, 0.78, 95, 14)]
    neg = [s for s in steps if s[0] < 0]
    pos = [s for s in steps if s[0] > 0]
    sc_dn = min(1.0, max(L0 - 0.21, 0.02) / 0.22)
    sc_up = min(1.0, max(0.99 - L0, 0.01) / 0.18)
    out = []
    for dL, kC, tgt, amt in steps:
        d = dL * (sc_dn if dL < 0 else sc_up)
        h = hue_toward(h0, tgt, amt) if (amt and C0 > 0.02) else h0
        out.append(to_rgb(L0 + d, C0 * kC, h))
    return out


# =====================================================================================
# PELE: tons reais, do mais escuro ao mais claro (o 9 é o aprovado)
# =====================================================================================
SKIN_BASES = [
    ("ebano", (84, 52, 38)),
    ("cacau", (110, 70, 48)),
    ("castanho", (140, 92, 62)),
    ("canela", (170, 116, 78)),
    ("caramelo", (198, 142, 98)),
    ("oliva", (212, 166, 118)),
    ("mel", (230, 186, 140)),
    ("pessego", (244, 206, 166)),
    ("claro", None),                 # padrão aprovado
    ("porcelana", (255, 236, 220)),
]


def skin_ramp(base):
    """Mesma estrutura da pele aprovada (brilhos, sombras, linha, orelha, boca), ajustada pro tom: em pele
    escura as sombras descem menos (pra não encostar no contorno), ficam menos saturadas e os brilhos
    ficam quentes e mais visíveis (em vez de cinza)."""
    T = [rgb2oklch(c) for c in SKIN_DEFAULT]
    Lb, Cb, hb = T[2]
    L0, C0, h0 = rgb2oklch(base)
    s = min(max((L0 - 0.36) / (Lb - 0.36), 0.0), 1.0)        # 0 = mais escura, 1 = a aprovada
    f_dn = min(max((L0 - 0.18) / (Lb - 0.40), 0.5), 1.0)
    out = []
    for L, C, h in T:
        dL, k, dh = L - Lb, C / Cb, _hd(h, hb)
        if dL > 0:
            Ln = min(L0 + dL * (1.0 + 0.8 * (1 - s)), 0.99)
            k = k + (1 - k) * (1 - s) * 0.7
        else:
            Ln = max(L0 + dL * f_dn, 0.19)
            k = 1 + (k - 1) * (0.4 + 0.6 * s)
        out.append(to_rgb(Ln, C0 * k, (h0 + dh * (0.5 + 0.5 * s)) % 360))
    return out


def skin_ramps():
    return [(n, list(SKIN_DEFAULT) if b is None else skin_ramp(b)) for n, b in SKIN_BASES]


# =====================================================================================
# CABELO (5 tons)
# =====================================================================================
HAIR_BASES = [
    ("castanho", None), ("preto", (46, 42, 58)), ("castanho_escuro", (88, 54, 42)), ("ruivo", (178, 70, 40)),
    ("laranja", (228, 122, 48)), ("loiro", (226, 184, 92)), ("platinado", (238, 224, 186)),
    ("branco", (232, 232, 242)), ("cinza", (146, 146, 160)), ("azul", (62, 104, 206)),
    ("azul_marinho", (44, 56, 116)), ("verde", (72, 152, 84)), ("rosa", (236, 132, 172)), ("roxo", (128, 82, 182)),
    ("vermelho", (192, 42, 52)), ("turquesa", (44, 170, 172)),
]


def hair_ramps():
    return [(n, list(HAIR_DEFAULT) if b is None else derive(HAIR_DEFAULT, 2, b, lo=0.21)) for n, b in HAIR_BASES]


# =====================================================================================
# OLHOS (4 tons)
# =====================================================================================
EYE_BASES = [
    ("azul", None), ("azul_claro", (72, 152, 222)), ("verde", (52, 150, 82)), ("esmeralda", (22, 142, 112)),
    ("avela", (146, 122, 58)), ("castanho", (124, 74, 42)), ("castanho_escuro", (78, 46, 34)),
    ("ambar", (212, 150, 40)), ("vermelho", (202, 42, 42)), ("roxo", (132, 62, 182)), ("rosa", (222, 92, 152)),
    ("cinza", (132, 138, 152)), ("preto", (52, 48, 62)), ("turquesa", (30, 170, 182)),
]


def eye_ramps():
    return [(n, list(EYE_DEFAULT) if b is None else derive(EYE_DEFAULT, 2, b, lo=0.18)) for n, b in EYE_BASES]


# =====================================================================================
# ROUPAS (5 tons) + metais
# =====================================================================================
VEST = [(38, 60, 54), (64, 94, 58), (96, 126, 62), (130, 156, 74), (168, 186, 98)]
NAVY = [(28, 28, 56), (40, 44, 82), (54, 62, 110), (74, 88, 142), (102, 120, 174)]
WRAP = [(148, 140, 152), (194, 186, 182), (234, 228, 216), (248, 245, 236), (252, 250, 244)]
STEEL = [(80, 86, 110), (128, 136, 158), (174, 182, 198), (214, 220, 230), (252, 252, 255)]
GOLD = [(112, 66, 30), (172, 116, 38), (222, 170, 58), (246, 212, 108), (255, 246, 198)]
BRONZE = [(88, 48, 32), (138, 80, 44), (184, 116, 64), (214, 156, 96), (242, 202, 152)]

CLOTH_BASES = [
    ("azul_marinho", NAVY), ("verde_colete", VEST), ("creme", WRAP),
    ("vermelho", (192, 46, 50)), ("vinho", (124, 32, 54)), ("laranja", (232, 122, 42)), ("amarelo", (234, 194, 58)),
    ("verde", (96, 172, 70)), ("verde_escuro", (42, 96, 64)), ("azul", (52, 112, 210)),
    ("azul_celeste", (104, 172, 230)), ("roxo", (122, 72, 172)), ("rosa", (230, 122, 162)),
    ("marrom", (124, 82, 52)), ("branco", (236, 236, 242)), ("cinza", (128, 130, 142)), ("preto", (52, 50, 62)),
    ("turquesa", (40, 160, 160)),
]
METALS = [("aco", STEEL), ("ouro", GOLD), ("bronze", BRONZE)]


def cloth_ramps():
    out = []
    for n, b in CLOTH_BASES:
        out.append((n, list(b) if isinstance(b, list) else cloth_ramp(b)))
    return out + [(n, list(r)) for n, r in METALS]


def all_palettes():
    return dict(pele=skin_ramps(), cabelo=hair_ramps(), olhos=eye_ramps(), roupa=cloth_ramps())


def swatches(path, sc=18):
    from PIL import Image, ImageDraw, ImageFont
    P = all_palettes()
    FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    f, fb = ImageFont.truetype(FONT, 13), ImageFont.truetype(FB, 17)
    colw = 330
    rows = max(len(v) for v in P.values())
    img = Image.new("RGB", (colw * 4 + 20, 60 + rows * (sc + 8) + 20), (248, 248, 252))
    d = ImageDraw.Draw(img)
    titles = dict(pele="PELE (escura -> clara)", cabelo="CABELO", olhos="OLHOS", roupa="ROUPAS + METAIS")
    for c, (k, ramps) in enumerate(P.items()):
        x0 = 10 + c * colw
        d.text((x0, 18), titles[k], fill=(20, 16, 34), font=fb)
        for r, (name, ramp) in enumerate(ramps):
            y = 60 + r * (sc + 8)
            for i, col in enumerate(ramp):
                d.rectangle([x0 + i * sc, y, x0 + (i + 1) * sc - 1, y + sc - 1], fill=tuple(col))
            d.text((x0 + len(ramp) * sc + 8, y + 2), "%02d %s" % (r + 1, name), fill=(40, 40, 60), font=f)
    img.save(path)


if __name__ == "__main__":
    swatches("paletas_teste.png")
    P = all_palettes()
    print({k: len(v) for k, v in P.items()})
