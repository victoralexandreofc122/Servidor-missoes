"""Canais de cor (pra recolorir) e paletas.

Cada pixel de uma camada guarda (canal, tom). Canais:
  FIXO  - cores que nunca mudam (contorno, branco do olho, roupa de baixo, aço do porta-kunai)
  PELE  - tom de pele (10 tons: brilhos, base, sombras, linha, orelha, boca)
  CABELO, OLHO
  COR1, COR2, COR3 - cores 1, 2 e 3 de cada item de roupa (5 tons cada: escuro, sombra, base, luz, brilho)
"""
import colorsys
import math

import numpy as np

FIXO, PELE, CABELO, OLHO, COR1, COR2, COR3 = 1, 2, 3, 4, 5, 6, 7
CANAIS = {FIXO: "fixo", PELE: "pele", CABELO: "cabelo", OLHO: "olho", COR1: "cor1", COR2: "cor2", COR3: "cor3"}

# tons por canal
F_OUT, F_WHITE, F_UW_HI, F_UW, F_UW_SH, F_UW_DK, F_ST_DK, F_ST_SH, F_ST, F_ST_LT, F_ST_HI = range(11)
P_HI2, P_HI, P_BASE, P_L1, P_SH, P_DK, P_LN, P_EAR, P_MOUTH, P_MOUTH_DK = range(10)
K_DK, K_SH, K_BASE, K_LT, K_HI = range(5)         # cabelo / roupas
E_DK, E_MD, E_BASE, E_LT = range(4)                # íris

FIXED = [
    (20, 16, 34),       # contorno
    (252, 252, 255),    # branco do olho
    (178, 178, 186), (146, 145, 154), (110, 108, 126), (78, 76, 100),       # roupa de baixo (cinza frio)
    (80, 86, 110), (128, 136, 158), (174, 182, 198), (214, 220, 230), (248, 250, 253),   # aço
]
NOMES_TONS = {
    FIXO: ["contorno", "branco", "rb_brilho", "rb_base", "rb_sombra", "rb_escuro",
           "aco_escuro", "aco_sombra", "aco_base", "aco_luz", "aco_brilho"],
    PELE: ["brilho2", "brilho", "base", "sombra1", "sombra2", "escuro", "linha", "orelha", "boca", "boca_escuro"],
    CABELO: ["escuro", "sombra", "base", "luz", "brilho"],
    OLHO: ["escuro", "medio", "base", "claro"],
    COR1: ["escuro", "sombra", "base", "luz", "brilho"],
}
NOMES_TONS[COR2] = NOMES_TONS[COR3] = NOMES_TONS[COR1]

# ---------------- rampas padrão (as que já foram aprovadas) ----------------
SKIN_DEFAULT = [(255, 250, 244), (255, 241, 226), (253, 221, 184), (246, 205, 166), (226, 170, 132),
                (186, 120, 88), (150, 88, 70), (214, 150, 116), (200, 132, 98), (172, 104, 80)]
HAIR_DEFAULT = [(60, 30, 44), (100, 52, 50), (142, 78, 54), (184, 112, 66), (226, 162, 98)]
EYE_DEFAULT = [(22, 26, 66), (30, 56, 128), (44, 98, 180), (110, 168, 230)]


class Idx:
    """Mapa de índices de uma camada: canal e tom por pixel."""

    def __init__(self, h, w):
        self.ch = np.zeros((h, w), np.uint8)
        self.sh = np.zeros((h, w), np.uint8)

    def put(self, m, ch, sh):
        self.ch[m] = ch
        self.sh[m] = sh

    def copy_from(self, other, m):
        self.ch[m] = other.ch[m]
        self.sh[m] = other.sh[m]

    def any(self):
        return bool(self.ch.any())


def colorize(idx, ramps):
    """ramps: {canal: lista de cores RGB}. Canal FIXO usa FIXED."""
    h, w = idx.ch.shape
    out = np.zeros((h, w, 4), np.uint8)
    for ch in np.unique(idx.ch):
        if ch == 0:
            continue
        ramp = FIXED if ch == FIXO else ramps[int(ch)]
        m = idx.ch == ch
        sh = idx.sh[m]
        cols = np.array(ramp, np.uint8)[np.clip(sh, 0, len(ramp) - 1)]
        out[m, :3] = cols
        out[m, 3] = 255
    return out


# ---------------- OKLab (pra gerar rampas com variação de matiz) ----------------
def _lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _delin(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255.0


def rgb2oklch(rgb):
    r, g, b = _lin(np.array(rgb, float))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return float(L), float(math.hypot(A, B)), float(math.degrees(math.atan2(B, A)) % 360)


def oklch2rgb(L, C, h):
    A, B = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(int(round(float(v))) for v in _delin(np.array([r, g, b])))


def hue_toward(h, target, amount):
    d = (target - h + 540) % 360 - 180
    step = max(-abs(amount), min(abs(amount), d))
    return (h + step) % 360
