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


# Kunai como nas referências: lâmina escura em folha larga, com duas faces (uma clara, outra escura) que se
# encontram na crista do meio; cabo enrolado em faixa; argola na ponta do cabo. u = 0 no meio do cabo (o punho).
KUNAI_ESCURA = [(30, 32, 42), (52, 56, 70), (84, 90, 106), (124, 130, 148), (176, 182, 198)]
KUNAI_TREINO = [(70, 72, 84), (100, 104, 118), (132, 136, 150), (164, 168, 182), (198, 202, 212)]
FAIXA_BEGE = [(150, 132, 104), (190, 174, 142), (222, 210, 182), (242, 234, 214)]


def kunai_sampler(blade_ramp, wrap, blade_end=17.0, ring_ramp=None):
    ring_ramp = ring_ramp or blade_ramp

    def sample(u, v, lit):
        d = math.hypot(u + 7.6, v)                                   # argola
        if 0.95 <= d <= 2.45:
            top = (v < 0) == lit
            return ring_ramp[3] if (top and d > 1.6) else ring_ramp[1] if d > 1.6 else ring_ramp[0]
        if -5.6 <= u <= 3.0 and abs(v) <= 1.05:                     # cabo enrolado (listras na diagonal)
            stripe = math.floor((u - v * 0.9) * 0.9) % 2
            return wrap[3 if (stripe and lit) else 2 if stripe else 1 if lit else 0]
        if 3.0 <= u <= blade_end:                                    # lâmina em folha
            if u < 3.8:
                hw = 1.3                                             # gola
            elif u < 7.0:
                hw = 1.3 + (u - 3.8) / 3.2 * 1.6
            else:
                hw = 2.9 * (blade_end - u) / (blade_end - 7.0)
            if abs(v) > hw:
                return None
            if abs(v) < 0.35:
                return blade_ramp[3]                                 # crista
            face_lit = (v > 0) == lit
            if face_lit:
                return blade_ramp[4] if (abs(v) > hw - 0.6 and u > 7) else blade_ramp[2]
            return blade_ramp[0] if abs(v) > hw - 0.6 else blade_ramp[1]
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


KATANA_LEN = 1.75   # chibi: espada longa de verdade (quase 2/3 da altura do boneco)
KATANA_W = 1.3      # e mais grossa


def katana_sample(u, v, lit):
    """Espada longa na bainha. u = 0 no meio; a ponta da bainha em -17 (x KATANA_LEN), o cabo para +u."""
    u = u / KATANA_LEN
    v = v / KATANA_W
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
    return katana_hilt(u, v, lit)


def katana_hilt(u, v, lit):
    """Tsuba, cabo trançado e kashira (u e v já na escala da espada)."""
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


def katana_scabbard_only(u, v, lit):
    """Só a bainha (a espada está na mão, no golpe)."""
    uu, vv = u / KATANA_LEN, v / KATANA_W
    if uu > 6.0:
        return None
    return katana_sample(u, v, lit)


KATANA_HAND_LEN = 1.55


def katana_drawn(u, v, lit):
    """Espada desembainhada, na mão. u = 0 no meio do cabo (o punho); a lâmina vai para +u."""
    uu = -u / KATANA_HAND_LEN + 10.9                             # o cabo (7,2..14,6) centrado no punho
    vv = v / KATANA_W
    hilt = katana_hilt(uu, vv, lit)
    if hilt is not None:
        return hilt
    if 5.2 <= uu <= 6.0 and abs(vv) <= 1.2:                      # habaki
        return OURO[3]
    if -16.5 <= uu <= 5.2:                                       # lâmina (fio de um lado, ponta curva)
        t = (uu + 16.5) / 21.7                                   # 0 na ponta, 1 na guarda
        spine = -1.05 if t > 0.1 else -1.05 + (0.1 - t) / 0.1 * 1.6
        edge = 1.0 if t > 0.12 else 1.0 - (0.12 - t) / 0.12 * 1.6
        if spine <= vv <= edge:
            if vv > edge - 0.55:
                return ACO[4]
            if vv < spine + 0.5:
                return ACO[1] if not lit else ACO[2]
            return ACO[3] if lit else ACO[2]
    return None


SHURIKEN_R = 30.0   # Shuriken Gigante: maior que as costas (60 px de ponta a ponta), as pontas saem em volta do corpo


def shuriken_back(w, h, cx, cy, R=SHURIKEN_R, rot=45, squash=1.0):
    """Shuriken Gigante: 4 lâminas largas e curvas em volta de um anel com furo (`rot` gira a estrela;
    `squash` < 1 achata na horizontal, para a vista de lado em perspectiva)."""
    import numpy as np
    out = blank(w, h)
    x, y = grid(w, h, cx, cy)
    xs = x / squash
    r = np.hypot(xs, y)
    phi = np.arctan2(y, xs)
    hub_r = max(4.6, R * 0.27)
    for k in range(4):
        base = math.radians(rot + 90 * k)
        d = (phi - base + math.pi) % (2 * math.pi) - math.pi            # -pi..pi em volta da lâmina k
        swept = d - 0.42 * (r / R) ** 1.3                                # lâminas curvadas (giram)
        # ponta fina e base larga: o lado de ataque (lead) é reto; o de trás, côncavo (gancho)
        width = np.where(swept < 0, 0.95, 0.72)
        reach = R * np.clip(1 - np.abs(swept) / width, 0, 1) ** 1.25
        m = (r <= reach) & (r > hub_r - 1)
        lead = swept < 0
        col = np.where(lead, 3, 1)
        col = np.where(np.abs(swept) < 0.07, 2, col)
        col = np.where((r > reach - 1.3) & lead, 4, col)
        col = np.where((r > reach - 1.0) & ~lead, 0, col)
        for i, c in enumerate(ACO):
            out[m & (col == i)] = (*c, 255)
    hole = R * 0.09 + 0.9
    hub = (r <= hub_r) & (r > hole)
    out[hub] = (*ACO[2], 255)
    out[hub & (y < -0.5)] = (*ACO[3], 255)
    out[(r <= hub_r) & (r > hub_r - 1.1) & (y > 1)] = (*ACO[1], 255)
    out[(r <= hole + 0.9) & (r > hole)] = (*ACO[0], 255)
    return outline(out)


def shuriken_side(w, h, cx, cy, R=SHURIKEN_R):
    """De lado (em perspectiva) a estrela fica estreita na horizontal: as pontas de cima e de baixo aparecem
    bem atrás do ombro e do quadril."""
    return shuriken_back(w, h, cx, cy, R=R, rot=80, squash=0.32)


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


def shuriken_hand(size=88, R=SHURIKEN_R - 2, reach=12.0):
    """Shuriken Gigante na mão (no golpe): segura pelo miolo, a estrela um pouco para fora, girando com o ângulo."""
    out = []
    for k in range(16):
        a = math.radians(k * 22.5)
        cx, cy = size / 2 + math.cos(a) * reach, size / 2 + math.sin(a) * reach
        out.append(shuriken_back(size, size, cx, cy, R=R, rot=45 + k * 22.5))
    return out


# Armas de arremesso: no golpe saem da mão (no quadro do lançamento) e somem das costas enquanto voam.
THROWN = {"fuma_shuriken"}

# Na mão: código -> (desenho, tamanho do quadro). A espada longa também tem a versão desembainhada (no golpe).
HAND = {
    "kunai_training": (kunai_sampler(KUNAI_TREINO, FAIXA_COURO, 15.5), 38),
    "kunai": (kunai_sampler(KUNAI_ESCURA, FAIXA_BEGE, 17.0), 40),
    "tanto": (tanto_sample, 34),
    "katana": (katana_drawn, 90),
}

# Costas: tamanho do quadro, e por vista (frente, lado, costas): ângulo da espada / deslocamento do meio
# em relação à âncora das costas (pixels do boneco; na vista de lado o boneco olha para a esquerda,
# então as costas ficam para +x). A espada longa vai quase deitada na lombar: de frente, o cabo sai de um lado
# do quadril e a ponta do outro; de lado, o cabo sai para trás e a ponta na frente (posições medidas na silhueta
# do boneco: na diagonal, ela some atrás da cabeça grande e do corpo).
BACK = {
    "katana": dict(size=(70, 70), views=[dict(ang=-155, off=(-4, 6)), dict(ang=-28, off=(6, 7)), dict(ang=-32, off=(0, 3))]),
    # Shuriken Gigante: maior que as costas; de frente, as 4 pontas saem em volta do corpo (giro medido na silhueta).
    "fuma_shuriken": dict(size=(70, 70), views=[dict(off=(0, 2), rot=75), dict(off=(6, -1)), dict(off=(0, -1), rot=45)]),
    "scroll": dict(size=(40, 16), views=[dict(off=(0, 5)), dict(off=(5, 5)), dict(off=(0, 5))]),
}


def back_views(code, empty=False):
    """As 3 vistas do item nas costas. empty: só a bainha (a espada está na mão, no golpe)."""
    spec = BACK[code]
    w, h = spec["size"]
    cx, cy = w / 2, h / 2
    if code == "katana":
        sample = katana_scabbard_only if empty else katana_sample
        return [outline(rasterize(sample, w, h, cx, cy, v["ang"])) for v in spec["views"]]
    if code == "fuma_shuriken":
        v = spec["views"]
        return [shuriken_back(w, h, cx, cy, rot=v[0]["rot"]), shuriken_side(w, h, cx, cy), shuriken_back(w, h, cx, cy, rot=v[2]["rot"])]
    if code == "scroll":
        side = blank(w, h)
        side_art = scroll_side(12, 12, 6, 6)
        side[2:14, 14:26] = side_art
        return [scroll_back(w, h, cx, cy), side, scroll_back(w, h, cx, cy)]
    raise KeyError(code)
