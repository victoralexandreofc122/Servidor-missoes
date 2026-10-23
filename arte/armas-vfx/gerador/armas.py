"""Armas do ninja em pixel art, na mesma escala do boneco chibi (1 pixel = 1 pixel do personagem).

- Na mão (kunai de treino, kunai, espada curta): 16 ângulos já desenhados (um a cada 22,5°), sem girar
  na tela. O ponto (0, 0) do desenho é o meio do cabo: fica na mão.
- Nas costas (espada longa, Shuriken Gigante, pergaminho): 3 vistas (frente, lado, costas). O meio do
  desenho vai na âncora das costas do boneco, mais um deslocamento por vista.
"""
import math

from pix import CONTORNO, blank, outline, rasterize, grid

# rampas (escuro -> claro)
ACO = [(80, 86, 110), (128, 136, 158), (174, 182, 198), (214, 220, 230), (248, 250, 253)]          # o aço do boneco
ACO_FOSCO = [(66, 68, 84), (96, 100, 118), (128, 132, 148), (160, 164, 178), (190, 194, 206)]
FAIXA_ESCURA = [(30, 28, 44), (48, 44, 66), (72, 66, 94), (104, 98, 126)]
FAIXA_COURO = [(72, 42, 26), (108, 66, 38), (144, 96, 56), (182, 134, 84)]
FAIXA_VERMELHA = [(84, 22, 28), (126, 36, 38), (168, 56, 48), (206, 92, 72)]
OURO = [(112, 70, 22), (172, 120, 32), (216, 168, 54), (244, 212, 106), (255, 244, 190)]
LACA = [(22, 18, 34), (38, 32, 58), (58, 52, 86), (88, 82, 122), (132, 126, 166)]
CORDAO = [(64, 30, 84), (100, 54, 128), (144, 90, 174)]
SEDA = [(206, 200, 214), (236, 232, 240)]
PAPEL = [(150, 126, 92), (196, 176, 136), (226, 212, 176), (244, 236, 210), (255, 252, 238)]
MADEIRA = [(78, 40, 26), (120, 60, 36), (160, 88, 52), (196, 124, 80)]
FITA = [(110, 20, 30), (162, 34, 40), (208, 62, 54), (236, 110, 90)]


def steel_blade(ramp, u, v, hw, lit, ridge=0.45):
    """Lâmina de dois gumes: crista no meio, lado da luz claro com fio brilhante, o outro na sombra."""
    if abs(v) < ridge:
        return ramp[2]
    if lit:
        return ramp[4] if abs(v) > hw - 0.55 else ramp[3]
    return ramp[0] if abs(v) > hw - 0.5 else ramp[1]


def kunai_sampler(blade_ramp, wrap, blade_end=10.5):
    def sample(u, v, lit):
        # argola do cabo
        d = math.hypot(u + 6.3, v)
        if 0.75 <= d <= 1.95:
            return ACO[3] if (lit and v != 0) else ACO[1]
        # cabo enrolado em faixa (listras na diagonal)
        if -4.6 <= u <= 1.8 and abs(v) <= 0.95:
            stripe = math.floor((u + v * 0.9) * 0.8) % 2
            return wrap[3 if (stripe and lit) else 2 if stripe else 1 if lit else 0]
        # lâmina em folha
        if 1.8 <= u <= blade_end:
            hw = 1.0 + (u - 1.8) / 2.2 * 1.1 if u < 4.0 else 2.1 * (blade_end - u) / (blade_end - 4.0)
            if abs(v) <= hw:
                return steel_blade(blade_ramp, u, v, hw, lit)
        return None
    return sample


def tanto_sample(u, v, lit):
    if -7.2 <= u <= -6.1 and abs(v) <= 1.25:                     # kashira (ponta do cabo)
        return OURO[3] if lit else OURO[1]
    if -6.1 <= u <= 0.2 and abs(v) <= 1.1:                       # cabo com a trama em losangos
        k = (u + 6.1) % 2.4
        dia = abs(k - 1.2) < 0.75 - abs(v) * 0.55
        return FAIXA_VERMELHA[3 if dia and lit else 2 if dia else 1 if lit else 0]
    if 0.2 <= u <= 1.3 and abs(v) <= 2.5:                        # tsuba (guarda)
        return OURO[4] if (lit and abs(v) > 1.6) else OURO[2] if lit else OURO[1]
    if 1.3 <= u <= 2.1 and abs(v) <= 1.25:                       # habaki
        return OURO[3]
    if 2.1 <= u <= 14.2:                                         # lâmina de um gume, ponta curva
        spine = -1.15 + (max(0.0, u - 12.6) / 1.6) ** 1.4 * 1.2
        edge = 1.05 if u < 11.4 else 1.05 - ((u - 11.4) / 2.8) ** 1.3 * 2.2
        if spine <= v <= edge:
            if v > edge - 0.6:
                return ACO[4]                                     # fio (hamon claro)
            if v < spine + 0.5:
                return ACO[1] if not lit else ACO[2]              # costas da lâmina
            return ACO[3] if lit else ACO[2]
    return None


KATANA_LEN = 1.28   # chibi: a espada é bem comprida para aparecer por trás da cabeça grande e dos braços


def katana_sample(u, v, lit):
    """Espada longa na bainha. u = 0 no meio; a ponta da bainha em -17 (x KATANA_LEN), o cabo para +u."""
    u = u / KATANA_LEN
    if -17.2 <= u <= -15.9 and abs(v) <= 1.55:                   # kojiri (ponteira de ouro)
        return OURO[3] if lit else OURO[1]
    if -15.9 <= u <= 5.0 and abs(v) <= 1.5:                      # saya (bainha laqueada)
        if 1.2 <= u <= 3.8:                                       # cordão (sageo) cruzado
            k = (u - 1.2) % 1.3
            if abs(k - 0.65) < 0.45:
                return CORDAO[2] if lit else CORDAO[1]
        return LACA[4] if (lit and abs(v) > 0.75 and u > -12) else LACA[2] if lit else LACA[1]
    if 5.0 <= u <= 6.0 and abs(v) <= 1.6:                        # koiguchi (boca da bainha)
        return OURO[3] if lit else OURO[1]
    if 6.0 <= u <= 7.2 and abs(v) <= 2.9:                        # tsuba
        return OURO[4] if (lit and abs(v) > 2.0) else OURO[2] if lit else OURO[1]
    if 7.2 <= u <= 14.6 and abs(v) <= 1.25:                      # tsuka: trama escura com losangos de seda
        k = (u - 7.2) % 2.4
        dia = abs(k - 1.2) < 0.7 - abs(v) * 0.45
        if dia:
            return SEDA[1] if lit else SEDA[0]
        return LACA[3] if lit else LACA[1]
    if 14.6 <= u <= 15.7 and abs(v) <= 1.35:                     # kashira
        return OURO[3] if lit else OURO[1]
    return None


def shuriken_back(w, h, cx, cy, R=16.0, rot=45):
    """Shuriken Gigante de frente: 4 lâminas curvas em volta de um anel com furo (`rot` gira a estrela)."""
    import numpy as np
    out = blank(w, h)
    x, y = grid(w, h, cx, cy)
    r = np.hypot(x, y)
    phi = np.arctan2(y, x)
    for k in range(4):
        base = math.radians(rot + 90 * k)
        d = (phi - base + math.pi) % (2 * math.pi) - math.pi            # -pi..pi em volta da lâmina k
        swept = d - 0.35 * (r / R)                                       # lâminas curvadas (giram)
        reach = R * np.clip(1 - np.abs(swept) / 0.62, 0, 1) ** 0.9
        m = (r <= reach) & (r > 3.4)
        lead = swept < 0
        col = np.where(lead, 3, 1)
        col = np.where(np.abs(swept) < 0.09, 2, col)
        col = np.where((r > reach - 1.2) & lead, 4, col)
        for i, c in enumerate(ACO):
            out[m & (col == i)] = (*c, 255)
    hub = (r <= 4.6) & (r > 1.6)
    out[hub] = (*ACO[2], 255)
    out[hub & (y < -0.5)] = (*ACO[3], 255)
    out[(r <= 4.6) & (r > 3.6) & (y > 1)] = (*ACO[1], 255)
    return outline(out)


def shuriken_side(w, h, cx, cy, R=16.0):
    """De lado (de perfil) a estrela vira uma lâmina fina na vertical, com o miolo no meio."""
    def sample(u, v, lit):
        if abs(u) > R:
            return None
        hw = 1.4 if abs(u) > 3.5 else 2.3
        hw *= max(0.35, 1 - (abs(u) / R) ** 2 * 0.6)
        if abs(v) <= hw:
            return ACO[3] if lit else ACO[1] if abs(v) > 0.5 else ACO[2]
        return None
    return outline(rasterize(sample, w, h, cx, cy, 90))


def scroll_back(w, h, cx, cy):
    """Pergaminho grande atravessado nas costas: papel com sombra de cilindro, pontas de madeira e a fita vermelha.
    Comprido (33 px): de frente, as pontas aparecem dos dois lados, por fora dos braços."""
    HALF = 16.5
    def sample(u, v, lit):
        # u = x, v = y (ângulo 0): vertical = v
        if abs(u) <= HALF - 2.4 and abs(v) <= 3.4:
            if abs(u) <= 1.6:                                           # fita
                return FITA[3] if v < -1.8 else FITA[2] if v < 1.5 else FITA[1]
            if abs(u - (HALF - 5.1)) < 0.5 and v > -2.5:                # borda do papel enrolado
                return PAPEL[1]
            t = (v + 3.4) / 6.8                                         # 0 em cima, 1 embaixo
            return PAPEL[4] if t < 0.18 else PAPEL[3] if t < 0.45 else PAPEL[2] if t < 0.75 else PAPEL[1]
        if HALF - 2.4 <= abs(u) <= HALF and abs(v) <= 2.3:              # pontas (madeira)
            return MADEIRA[3] if v < -1.2 else MADEIRA[2] if v < 1.0 else MADEIRA[1]
        if abs(u + 0.6) <= 0.6 and 3.4 < v <= 6.2:                      # pontas soltas da fita
            return FITA[1]
        if abs(u - 1.0) <= 0.55 and 3.4 < v <= 5.4:
            return FITA[2]
        return None
    return outline(rasterize(sample, w, h, cx, cy, 0))


def scroll_side(w, h, cx, cy):
    """De perfil: a ponta do rolo (espiral de papel) com o pino de madeira."""
    import numpy as np
    out = blank(w, h)
    x, y = grid(w, h, cx, cy)
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    paper = r <= 3.6
    spiral = np.abs(((r - (a + math.pi) / (2 * math.pi) * 1.4) % 1.4) - 0.7) < 0.28
    out[paper] = (*PAPEL[3], 255)
    out[paper & spiral] = (*PAPEL[1], 255)
    out[paper & (y > 1.5)] = (*PAPEL[2], 255)
    out[r <= 1.3] = (*MADEIRA[2], 255)
    return outline(out)


def hand_weapon(sample, size):
    """16 quadros (0°, 22,5°, ... 337,5°) com o meio do cabo no centro do quadro."""
    c = size / 2
    return [outline(rasterize(sample, size, size, c, c, k * 22.5)) for k in range(16)]


# Itens: (código, tipo, desenho)
HAND = {
    "kunai_training": (kunai_sampler(ACO_FOSCO, FAIXA_COURO, 9.6), 24),
    "kunai": (kunai_sampler(ACO, FAIXA_ESCURA, 10.5), 26),
    "tanto": (tanto_sample, 32),
}

# Costas: tamanho do quadro, e por vista (frente, lado, costas): ângulo da espada / deslocamento do meio
# em relação à âncora das costas (pixels do boneco; na vista de lado o boneco olha para a esquerda,
# então as costas ficam para +x).
BACK = {
    # De frente a espada fica quase deitada, com o cabo saindo do lado do ombro e a ponta do outro lado do
    # quadril (posição medida na silhueta do boneco: o resto some atrás da cabeça e do corpo).
    "katana": dict(size=(52, 52), views=[dict(ang=-155, off=(-5, 4)), dict(ang=-74, off=(5, -4)), dict(ang=-58, off=(0, -3))]),
    "fuma_shuriken": dict(size=(38, 38), views=[dict(off=(0, 6), rot=75), dict(off=(5, -2)), dict(off=(0, -2), rot=45)]),
    "scroll": dict(size=(40, 16), views=[dict(off=(0, 5)), dict(off=(5, 5)), dict(off=(0, 5))]),
}


def back_views(code):
    spec = BACK[code]
    w, h = spec["size"]
    cx, cy = w / 2, h / 2
    if code == "katana":
        return [outline(rasterize(katana_sample, w, h, cx, cy, v["ang"])) for v in spec["views"]]
    if code == "fuma_shuriken":
        v = spec["views"]
        return [shuriken_back(w, h, cx, cy, rot=v[0]["rot"]), shuriken_side(w, h, cx, cy), shuriken_back(w, h, cx, cy, rot=v[2]["rot"])]
    if code == "scroll":
        side = blank(w, h)
        side_art = scroll_side(12, 12, 6, 6)
        side[2:14, 14:26] = side_art
        return [scroll_back(w, h, cx, cy), side, scroll_back(w, h, cx, cy)]
    raise KeyError(code)
