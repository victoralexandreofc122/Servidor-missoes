"""Camadas presas na cabeça: olhos (2 estilos), boca, cabelo espetado e chapéu (bandana), nas 3 vistas.

Cada item é desenhado UMA vez por vista, na posição de repouso da cabeça, e depois só acompanha a cabeça
(fig.head_off + respiração). Tudo em mapa de índices (canal + tom) pra poder trocar de cor.
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import chibi_base as CB  # noqa: E402
from body import edge_band  # noqa: E402
from compose import CORPO, TRAS, Part, compose  # noqa: E402
from geom import H, PX, PY, W, blank, dilate, ellipse, erode, poly, shift  # noqa: E402
from pal import (CABELO, COR1, COR2, E_BASE, E_DK, E_LT, E_MD, F_OUT, F_WHITE, FIXO, Idx, K_BASE, K_DK, K_HI,  # noqa: E402
                 K_LT, K_SH, OLHO, P_BASE, P_L1, P_MOUTH, P_MOUTH_DK, PELE)

ROWS, COLS = np.mgrid[0:H, 0:W]


def ref(c, r):
    """coordenada da referência (frente) -> canvas"""
    return (c + CB.DX, r + CB.DY)


def rpoly(pts):
    return poly([ref(x, y) for x, y in pts])


def put(idx, m, ch, sh):
    idx.put(m, ch, sh)


def put_px(idx, pts, ch, sh):
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H:
            idx.ch[y, x] = ch
            idx.sh[y, x] = sh


# =====================================================================================
# OLHOS
# =====================================================================================
EYE_CH = {"O": (FIXO, F_OUT), "N": (OLHO, E_DK), "M": (OLHO, E_MD), "B": (OLHO, E_BASE), "L": (OLHO, E_LT),
          "W": (FIXO, F_WHITE), "H": (FIXO, F_WHITE)}
SIDE_EYE = {33: ".OOOO..", 34: "OOOOOOO", 35: ".ONHNWO", 36: ".ONNNWO", 37: ".OMMNW.", 38: "..BBNW.",
            39: "..BLB..", 40: "...BB.."}
SIDE_EYE_LASH = {32: "OO.....", 33: ".OOOO.."}          # cílio puxado pra frente (estilo com cílios)
SIDE_BROW = {"masculino": [(24, 30), (25, 30), (26, 30), (27, 30), (28, 30), (23, 31), (24, 31)],
             "cilios": [(24, 30), (25, 30), (26, 30), (27, 30), (23, 31), (28, 31)]}


def eyes_template(view, style):
    idx = Idx(H, W)
    if view == "front":
        rows = [list(s) for s in CB.EYE_L]
        if style == "masculino":
            rows[2] = list(".OOOOOOOO")
            rows[3] = list("..ONHNNNW")
        for j, s in enumerate(rows):
            for i, ch in enumerate(s):
                if ch == ".":
                    continue
                c, r = 7 + i, 25 + j
                for cc in (c, 39 - c):
                    x, y = ref(cc, r)
                    idx.ch[y, x], idx.sh[y, x] = EYE_CH[ch]
        # brilho do olho direito também à esquerda da íris (luz de cima-esquerda)
        fix = [((39 - 11, 28), (OLHO, E_DK)), ((39 - 13, 28), (FIXO, F_WHITE)), ((39 - 12, 32), (OLHO, E_BASE)),
               ((39 - 13, 32), (OLHO, E_LT))]
        for (c, r), v in fix:
            x, y = ref(c, r)
            idx.ch[y, x], idx.sh[y, x] = v
        brow = CB.BROW_F if style == "cilios" else CB.BROW_M
        for c, r in brow:
            put_px(idx, [ref(c, r), ref(39 - c, r)], FIXO, F_OUT)
    elif view == "side":
        for y, s in SIDE_EYE.items():
            for i, ch in enumerate(s):
                if ch != ".":
                    idx.ch[y, 23 + i], idx.sh[y, 23 + i] = EYE_CH[ch]
        if style == "cilios":
            for y, s in SIDE_EYE_LASH.items():
                for i, ch in enumerate(s):
                    if ch != ".":
                        idx.ch[y, 22 + i], idx.sh[y, 22 + i] = EYE_CH[ch]
        put_px(idx, SIDE_BROW[style], FIXO, F_OUT)
    return idx


def mouth_template(view, style="sorriso"):
    idx = Idx(H, W)
    if view == "front":
        put_px(idx, [ref(18, 35), ref(21, 35)], PELE, P_MOUTH)
        put_px(idx, [ref(19, 36), ref(20, 36)], PELE, P_MOUTH_DK)
    elif view == "side":
        put_px(idx, [(19, 44)], PELE, P_MOUTH_DK)
        put_px(idx, [(20, 44)], PELE, P_MOUTH)
    return idx


# =====================================================================================
# CABELO ESPETADO
# =====================================================================================
import ninja_example as N  # noqa: E402  (geometria aprovada da frente)


def _front_hair_masks():
    vpts, spikes = N.hair_geometry()
    pts = [(1.6, 14.0), tuple(vpts[0])]
    for s in spikes:
        pts += [tuple(s["tip"]), tuple(s["v1"])]
    pts += [(38.4, 14.0)]
    top = rpoly(pts)
    temples = rpoly([(1.4, 12.5), (5.5, 12.5), (5.5, 20.0), (1.4, 20.0)])
    temples |= rpoly([(34.5, 12.5), (38.6, 12.5), (38.6, 20.0), (34.5, 20.0)])
    # franja da testa: termina na linha 19 (fica escondida quando a bandana está por cima)
    fringe = rpoly([(4.0, 11.5), (4.0, 18.6), (6.8, 19.85), (9.6, 16.4), (12.8, 19.9), (16.2, 16.8), (19.6, 19.9),
                    (23.2, 16.8), (26.6, 19.9), (29.8, 16.4), (33.0, 19.85), (36.0, 18.6), (36.0, 11.5)])
    locks = rpoly(N.LOCK_L) | rpoly(N.BANG_L) | rpoly(N.LOCK_R) | rpoly(N.BANG_R)
    return top | temples, fringe, locks


def _paint_front_hair(idx, part, vis, interior):
    top, fringe, locks = _front_hair_masks()
    vpts, spikes = N.hair_geometry()
    put(idx, part.mask, CABELO, K_BASE)
    rx, ry = PX - CB.DX, PY - CB.DY
    d = np.sqrt(((rx - (N.HAIR_CX - 5)) / N.HAIR_RX) ** 2 + ((ry - (N.HAIR_CY - 6)) / N.HAIR_RY) ** 2)
    put(idx, interior & top & (d > 1.0), CABELO, K_SH)
    for s in spikes:
        reg = rpoly([tuple(s["v0"]), tuple(s["tip"]), tuple(s["v1"]), tuple(s["root"])])
        ax = s["tip"] - s["root"]
        ax = ax / np.linalg.norm(ax)
        n_cw = np.array([-ax[1], ax[0]])
        lit_cw = (n_cw @ N.LIGHT) > -0.05
        cross = ax[0] * (ry - s["root"][1]) - ax[1] * (rx - s["root"][0])
        lit = ((cross > 0) == lit_cw)
        reg &= top & (ROWS <= ref(0, 13)[1])
        put(idx, interior & reg & ~lit, CABELO, K_SH)
        put(idx, interior & reg & lit & (d <= 1.0), CABELO, K_BASE)
    lines = blank()
    for v in vpts[1:-1]:
        dv = np.array([N.HAIR_CX, N.HAIR_CY + 4]) - v
        dv = dv / np.linalg.norm(dv)
        for t in np.arange(0.5, 3.1, 0.5):
            p = v + dv * t
            x, y = ref(int(np.floor(p[0])), int(np.floor(p[1])))
            if 0 <= y < H and 0 <= x < W:
                lines[y, x] = True
    put(idx, lines & interior & (ROWS <= ref(0, 11)[1]), CABELO, K_DK)
    e = np.sqrt(((rx - 21.0) / 15.5) ** 2 + ((ry - 13.0) / 12.5) ** 2)
    ang = np.degrees(np.arctan2(ry - 13.0, rx - 21.0))
    arc = (e > 0.80) & (e < 0.93) & (ang > -160) & (ang < -62)
    put(idx, arc & interior & ~lines & ~shift(lines, 1, 0), CABELO, K_LT)
    arc_hi = (e > 0.83) & (e < 0.91) & (ang > -140) & (ang < -112)
    put(idx, arc_hi & interior & ~lines & ~shift(lines, 1, 0), CABELO, K_HI)
    # franja: sombra na raiz (sai de baixo do volume) e nas pontas, risco escuro entre as mechas
    fi = fringe & interior & ~top
    put(idx, fi & (ROWS <= ref(0, 13)[1]), CABELO, K_SH)
    put(idx, edge_band(fi, (1, 0), 1), CABELO, K_SH)
    for vx in (9.6, 16.2, 23.2, 29.8):
        for yy in (15.6, 14.6):
            x, y = ref(int(vx), int(yy))
            if fi[y, x]:
                idx.ch[y, x], idx.sh[y, x] = CABELO, K_DK
    li = locks & interior & (ROWS >= ref(0, 20)[1])
    put(idx, li, CABELO, K_BASE)
    put(idx, edge_band(li, (1, 0), 1), CABELO, K_SH)
    put(idx, li & (ROWS == ref(0, 20)[1]), CABELO, K_DK)
    put(idx, li & ~shift(li, 0, -1) & (ROWS >= ref(0, 25)[1]), CABELO, K_SH)


def _paint_front_ear_patch(idx, part, vis, interior):
    """A costeleta cobre a orelha: o que sobra do miolo da orelha vira borda da bochecha (canal pele)."""
    for c, r, sh in ((5, 26, P_L1), (5, 27, P_L1), (5, 28, P_L1), (5, 29, P_L1), (6, 27, P_BASE), (6, 28, P_BASE)):
        put_px(idx, [ref(c, r), ref(39 - c, r)], PELE, sh)
    put_px(idx, [ref(33, 24)], PELE, P_BASE)
    put_px(idx, [ref(4, 30)], PELE, P_L1)


def _ear_patch_mask():
    m = blank()
    for c, r in ((5, 26), (5, 27), (5, 28), (5, 29), (6, 27), (6, 28)):
        for cc in (c, 39 - c):
            x, y = ref(cc, r)
            m[y, x] = True
    for c, r in ((33, 24), (4, 30)):
        x, y = ref(c, r)
        m[y, x] = True
    return m


# --- de lado (olhando pra esquerda): espetos varridos pra trás, franja na testa, costeleta na frente da orelha
SIDE_HAIR = [
    (15.6, 29.2), (19.4, 25.0), (21.6, 29.2), (24.2, 24.6), (26.4, 28.6), (29.2, 24.4), (30.6, 25.8),
    (33.0, 40.6), (34.6, 31.6), (40.6, 32.8), (43.6, 41.2), (45.2, 36.2), (48.6, 44.6), (49.6, 37.2),
    (55.4, 38.4), (51.6, 30.2), (58.2, 25.2), (51.6, 20.6), (57.2, 11.2), (48.2, 11.4), (50.2, 2.6),
    (40.6, 6.4), (38.4, 1.4), (32.2, 6.2), (26.0, 1.8), (24.0, 9.2), (13.6, 9.6), (18.2, 15.2),
    (13.4, 19.6), (16.8, 22.0),
]
SIDE_HAIR_VALLEYS = [(45.2, 36.2), (49.6, 37.2), (51.6, 30.2), (51.6, 20.6),
                     (48.2, 11.4), (40.6, 6.4), (32.2, 6.2), (24.0, 9.2), (18.2, 15.2)]
SIDE_CENTER = (36.0, 20.0)

# --- de costas: mesmo topo espetado da frente (espelhado), cobrindo a nuca, pontas caindo sobre o pescoço
def _back_hair_pts():
    vpts, spikes = N.hair_geometry()
    top = [(1.6, 14.0), tuple(vpts[0])]
    for s in spikes:
        top += [tuple(s["tip"]), tuple(s["v1"])]
    top += [(38.4, 14.0)]
    top = [(40.0 - x, y) for x, y in top][::-1]          # de costas a silhueta é espelhada
    return top + BACK_LOWER


# nuca: mechas caindo em pontas de tamanhos diferentes (cobrem as orelhas, como na frente)
BACK_LOWER = [(38.6, 14.0), (38.9, 24.0), (37.6, 33.2), (34.8, 37.4), (32.6, 33.6), (29.8, 40.2), (26.8, 35.2),
              (23.4, 40.8), (20.0, 35.8), (16.6, 40.6), (13.4, 35.2), (10.2, 39.8), (7.4, 33.6), (5.2, 37.2),
              (2.4, 33.2), (1.1, 24.0), (1.4, 14.0)]
BACK_VALLEYS = [(32.6, 33.6), (26.8, 35.2), (20.0, 35.8), (13.4, 35.2), (7.4, 33.6)]


def hair_template(view, style="espetado"):
    """Retorna (lista de Parts) do cabelo na vista, em repouso."""
    if style in ("longo", "longo_reta"):
        return long_hair_template(view, "reta")
    if style == "longo_lateral":
        return long_hair_template(view, "lateral")
    if view == "front":
        top, fringe, locks = _front_hair_masks()
        m = top | fringe | locks
        return [Part("cabelo", m, 1, CORPO, _paint_front_hair),
                Part("cabelo_remendo_orelha", _ear_patch_mask() & ~m, 0, CORPO, _paint_front_ear_patch, ring=False)]
    if view == "side":
        m = poly(SIDE_HAIR)

        def paint(idx, part, vis, interior):
            put(idx, part.mask, CABELO, K_BASE)
            # sombra: parte de trás/baixo do volume e lado direito de cada espeto
            e = ((PX - 30.0) / 22.0) ** 2 + ((PY - 12.0) / 22.0) ** 2
            put(idx, interior & (e > 1.0), CABELO, K_SH)
            put(idx, edge_band(interior, (1, 1), 2), CABELO, K_SH)
            put(idx, edge_band(interior, (0, 1), 1) & (PY > 24), CABELO, K_SH)
            # risco entre os espetos
            for vx, vy in SIDE_HAIR_VALLEYS:
                dx, dy = SIDE_CENTER[0] - vx, SIDE_CENTER[1] - vy
                n = math.hypot(dx, dy)
                for t in np.arange(0.6, 3.2, 0.5):
                    x, y = int(vx + dx / n * t), int(vy + dy / n * t)
                    if 0 <= x < W and 0 <= y < H and interior[y, x]:
                        idx.ch[y, x], idx.sh[y, x] = CABELO, K_DK
            # brilho em arco no alto da cabeça (lado da frente)
            r = np.hypot(PX - 33.0, PY - 23.0)
            ang = np.degrees(np.arctan2(PY - 23.0, PX - 33.0))
            arc = (r > 13.6) & (r < 15.2) & (ang > -165) & (ang < -75) & interior
            put(idx, arc & (idx.sh != K_DK), CABELO, K_LT)
            put(idx, arc & (ang > -150) & (ang < -118) & (idx.sh != K_DK), CABELO, K_HI)
            # franja e costeleta: base com sombra na direita
            low = interior & (PY > 24.5) & (PX < 35.5)
            put(idx, low, CABELO, K_BASE)
            put(idx, edge_band(low, (1, 0), 1), CABELO, K_SH)
            put(idx, low & (PY < 26.0), CABELO, K_SH)
        return [Part("cabelo", m, 1, CORPO, paint)]
    # costas: topo espetado (espelho da frente) UNIDO com a parte de baixo (mechas da nuca cobrindo as orelhas).
    # São polígonos separados somados (antes era um polígono só e a sobreposição abria buracos nas laterais).
    vpts, spikes = N.hair_geometry()
    top = [(1.6, 14.0), tuple(vpts[0])]
    for sp in spikes:
        top += [tuple(sp["tip"]), tuple(sp["v1"])]
    top += [(38.4, 14.0)]
    top_m = rpoly([(40.0 - x, y) for x, y in top])
    m = top_m | rpoly(BACK_LOWER) | rpoly([(1.4, 12.0), (38.6, 12.0), (38.6, 16.0), (1.4, 16.0)])
    top_valleys = [(40.0 - v[0], v[1]) for v in vpts[1:-1]]
    side_valleys = [(40.0 - vpts[0][0], vpts[0][1]), (40.0 - vpts[-1][0], vpts[-1][1])]
    crown = (20.5, 3.0)

    def paint(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_BASE)
        rx, ry = PX - CB.DX, PY - CB.DY
        d = np.sqrt(((rx - 16.0) / 21.0) ** 2 + ((ry - 8.0) / 24.0) ** 2)
        put(idx, interior & (d > 1.0), CABELO, K_SH)                     # volume: borda de baixo/direita na sombra
        put(idx, edge_band(interior, (1, 0), 2), CABELO, K_SH)
        put(idx, interior & (ry > 36.0), CABELO, K_SH)                   # pontas da nuca
        # brilho em arco no alto da cabeça (luz de cima-esquerda)
        e = np.sqrt(((rx - 18.5) / 15.5) ** 2 + ((ry - 13.0) / 12.5) ** 2)
        ang = np.degrees(np.arctan2(ry - 13.0, rx - 18.5))
        arc = (e > 0.80) & (e < 0.93) & (ang > -165) & (ang < -60) & interior
        put(idx, arc, CABELO, K_LT)
        put(idx, arc & (ang > -142) & (ang < -110), CABELO, K_HI)
        # mechas: riscos que descem da coroa até as valas entre as pontas (embaixo e nos lados)
        lines_dk, lines_sh = blank(), blank()
        for vx, vy in list(BACK_VALLEYS) + side_valleys:
            dx, dy = crown[0] - vx, crown[1] - vy
            n = math.hypot(dx, dy)
            for t in np.arange(0.5, n * 0.58, 0.5):
                x, y = ref(int(math.floor(vx + dx / n * t)), int(math.floor(vy + dy / n * t)))
                if 0 <= x < W and 0 <= y < H:
                    (lines_dk if t < n * 0.36 else lines_sh)[y, x] = True
        for vx, vy in top_valleys:                                       # entre os espetos do topo (curtos)
            dx, dy = 20.0 - vx, 19.0 - vy
            n = math.hypot(dx, dy)
            for t in np.arange(0.5, 3.1, 0.5):
                x, y = ref(int(math.floor(vx + dx / n * t)), int(math.floor(vy + dy / n * t)))
                if 0 <= x < W and 0 <= y < H:
                    lines_dk[y, x] = True
        lines_dk &= interior
        lines_sh &= interior & ~lines_dk
        # cada mecha fica arredondada: lado direito (encostado no risco da mecha vizinha) na sombra
        allines = lines_dk | lines_sh
        shade = blank()
        for k in (1, 2):
            shade |= shift(allines, -k, 0) & interior
        put(idx, shade & ~allines & (ry > 24), CABELO, K_SH)
        put(idx, lines_sh, CABELO, K_SH)
        put(idx, lines_dk, CABELO, K_DK)
    return [Part("cabelo", m, 1, CORPO, paint)]


# =====================================================================================
# CABELO LONGO (feminino): até o meio das costas. Frente: topo arredondado, franja na testa e duas mechas
# emoldurando o rosto (plano CORPO); a massa comprida cai ATRÁS do corpo (plano TRAS).
# =====================================================================================
LONG_FRONT = [  # silhueta da parte da frente (sentido horário a partir do alto)
    (31.5, 5.6), (38.6, 6.6), (44.0, 9.0), (47.8, 12.6), (50.2, 17.4), (51.4, 23.0), (51.8, 30.0), (51.8, 38.0),
    (51.4, 44.0), (50.8, 49.0), (49.6, 53.4), (48.0, 56.2),                      # ponta da mecha direita
    (46.4, 52.6), (45.6, 47.0), (45.2, 41.0), (45.2, 35.0), (45.4, 30.6),         # lado de dentro da mecha
    "FRANJA",
    (18.8, 35.0), (18.8, 41.0), (18.4, 47.0), (17.6, 52.6), (16.0, 56.2),        # mecha esquerda (dentro)
    (14.4, 53.4), (13.2, 49.0), (12.6, 44.0), (12.2, 38.0), (12.2, 30.0), (12.6, 23.0), (13.8, 17.4),
    (16.2, 12.6), (20.0, 9.0), (25.0, 6.6),
]
LONG_BACK = [   # massa que cai atrás do corpo até o meio das costas (pontas em alturas diferentes)
    (14.0, 16.0), (50.0, 16.0), (52.6, 26.0), (53.2, 36.0), (53.2, 46.0), (52.8, 54.0), (52.0, 60.0),
    (50.6, 65.0), (47.6, 61.0), (45.0, 66.4), (41.6, 61.6), (38.0, 64.6), (34.6, 61.0), (31.8, 64.8),
    (28.8, 61.0), (25.6, 64.6), (22.2, 61.4), (18.8, 66.4), (16.2, 61.0), (13.2, 65.0), (11.8, 60.0),
    (11.0, 54.0), (10.6, 46.0), (10.6, 36.0), (11.2, 26.0),
]
# franja (da direita pra esquerda da tela), termina acima das sobrancelhas (some embaixo da bandana)
BANGS = {
    "reta": dict(pts=[(43.4, 29.6), (41.0, 26.4), (38.4, 29.8), (35.6, 26.4), (33.0, 29.7), (30.2, 26.3),
                      (27.6, 29.8), (24.8, 26.4), (22.2, 29.6), (20.2, 26.8), (18.6, 30.0)],
                 valleys=[(41.0, 26.4), (35.6, 26.4), (30.2, 26.3), (24.8, 26.4), (20.2, 26.8)], part=(31.5, 31.0)),
    # lateral: risca do lado esquerdo da tela, a franja varre a testa pra direita e cobre o canto da sobrancelha
    "lateral": dict(pts=[(44.6, 31.4), (42.0, 29.0), (40.4, 30.4), (37.4, 27.0), (34.4, 28.4), (31.0, 24.6),
                         (28.0, 25.4), (25.2, 22.6), (22.6, 24.4), (21.0, 22.8), (19.4, 26.8), (18.6, 30.0)],
                    valleys=[(42.0, 29.0), (37.4, 27.0), (31.0, 24.6), (25.2, 22.6)], part=(24.0, 24.8)),
}
LONG_BANG_VALLEYS = BANGS["reta"]["valleys"]
LONG_BACK_VALLEYS = [(47.6, 61.0), (41.6, 61.6), (34.6, 61.0), (28.8, 61.0), (22.2, 61.4), (16.2, 61.0)]


def _line_px(a, b, step=0.4):
    (x0, y0), (x1, y1) = a, b
    n = max(int(math.hypot(x1 - x0, y1 - y0) / step), 1)
    return {(int(math.floor(x0 + (x1 - x0) * i / n)), int(math.floor(y0 + (y1 - y0) * i / n))) for i in range(n + 1)}


# --- de lado (olhando pra esquerda): franja varrendo a testa até a têmpora, mecha cobrindo a orelha e caindo
#     na frente do ombro (plano CORPO); a massa comprida cai atrás das costas (plano TRAS)
LONG_SIDE = [
    (16.4, 23.0), (16.6, 18.0), (18.4, 13.2), (21.8, 9.2), (26.6, 6.6), (32.6, 5.4), (38.6, 6.0), (43.8, 8.4),
    (47.8, 12.2), (50.4, 17.0), (51.8, 23.0), (52.4, 30.0), (52.2, 37.0), (51.4, 43.0), (49.6, 46.6),
    (45.0, 47.8), (40.6, 47.6),                                                   # nuca
    (39.0, 50.0), (38.6, 53.6), (37.0, 57.8),                                     # ponta da mecha da frente
    (35.2, 54.2), (33.6, 49.0), (32.4, 43.0), (31.6, 37.0), (31.2, 31.8),         # lado de fora da mecha
    (28.8, 28.6), (27.4, 30.2), (24.4, 26.4), (22.4, 28.4), (19.8, 24.6), (17.6, 26.2),   # franja
]
LONG_SIDE_BACK = [
    (38.8, 40.0), (51.6, 40.0), (51.8, 46.0), (51.0, 52.0), (49.8, 57.0), (48.6, 64.6), (46.6, 60.8),
    (44.6, 65.4), (42.6, 60.6), (40.6, 63.2), (39.6, 57.0), (38.8, 50.0),
]
LONG_SIDE_VALLEYS = [(28.8, 28.6), (24.4, 26.4), (19.8, 24.6)]
LONG_SIDE_BACK_VALLEYS = [(46.6, 60.8), (42.6, 60.6)]
# --- de costas: cobre a cabeça toda e cai por cima das costas até o meio (plano CORPO)
LONG_BACKVIEW = [
    (31.5, 5.6), (38.6, 6.6), (44.0, 9.0), (47.8, 12.6), (50.2, 17.4), (51.4, 23.0), (51.8, 30.0), (51.8, 38.0),
    (51.2, 44.0), (49.0, 48.6), (46.8, 53.6), (45.8, 59.0),                       # afina abaixo da cabeça
    (45.0, 64.4), (42.8, 60.6), (40.4, 65.4), (37.6, 61.0), (35.0, 64.6), (32.2, 61.0), (29.4, 65.6), (26.6, 61.2),
    (24.0, 64.6), (21.6, 60.8), (19.6, 64.2),
    (18.4, 59.0), (17.2, 53.6), (15.0, 48.6), (12.8, 44.0), (12.2, 38.0), (12.2, 30.0), (12.6, 23.0), (13.8, 17.4),
    (16.2, 12.6), (20.0, 9.0), (25.0, 6.6),
]
LONG_BACKVIEW_VALLEYS = [(42.8, 60.6), (37.6, 61.0), (32.2, 61.0), (26.6, 61.2), (21.6, 60.8)]


def _draw_lines(idx, lines, interior, sh):
    for x, y in lines:
        if 0 <= x < W and 0 <= y < H and interior[y, x]:
            idx.ch[y, x], idx.sh[y, x] = CABELO, sh


def _long_side_parts():
    front = poly(LONG_SIDE)
    back = poly(LONG_SIDE_BACK) & ~front

    def paint_front(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_BASE)
        e = ((PX - 34.0) / 19.0) ** 2 + ((PY - 20.0) / 17.5) ** 2
        put(idx, interior & (e > 1.0), CABELO, K_SH)                       # volume (nuca e trás)
        put(idx, edge_band(interior, (1, 0), 2), CABELO, K_SH)
        lock = interior & (PY > 31.5) & (PX < 39.6)
        put(idx, lock, CABELO, K_BASE)
        put(idx, lock & edge_band(lock, (-1, 0), 1) & (PY < 50), CABELO, K_LT)   # mecha: frente na luz
        put(idx, lock & edge_band(lock, (1, 0), 1), CABELO, K_SH)
        put(idx, lock & (PY > 51), CABELO, K_SH)
        bang = interior & (PY > 22.5) & (PX < 31.5)
        put(idx, bang & (PY < 24.5), CABELO, K_SH)                         # raiz da franja
        lines = set()
        for vx, vy in LONG_SIDE_VALLEYS:                                    # mechas da franja, varridas pra trás
            lines |= _line_px((vx, vy - 0.2), (vx + 3.0, vy - 6.0))
        for ex, ey in ((40.0, 12.0), (46.0, 18.0), (49.0, 27.0)):           # mechas do topo, da risca pra trás
            lines |= _line_px((30.0 + (ex - 30.0) * 0.4, 7.5 + (ey - 7.5) * 0.4), (ex, ey))
        lines |= _line_px((36.0, 30.0), (37.4, 44.0))                       # separa a mecha da nuca
        _draw_lines(idx, lines, interior, K_DK)
        r = np.hypot(PX - 33.0, PY - 22.5)
        ang = np.degrees(np.arctan2(PY - 22.5, PX - 33.0))
        arc = (r > 13.4) & (r < 15.0) & (ang > -170) & (ang < -70) & interior & (idx.sh != K_DK)
        put(idx, arc, CABELO, K_LT)
        put(idx, arc & (ang > -150) & (ang < -118), CABELO, K_HI)

    def paint_back(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_SH)
        put(idx, edge_band(interior, (1, 0), 1), CABELO, K_DK)
        lines = set()
        for vx, vy in LONG_SIDE_BACK_VALLEYS:
            lines |= _line_px((vx, vy - 0.2), (vx - 1.0, vy - 10.0))
        _draw_lines(idx, lines, interior, K_DK)

    return [Part("cabelo_tras", back, 0, TRAS, paint_back), Part("cabelo", front, 1, CORPO, paint_front)]


def _long_back_parts():
    m = poly(LONG_BACKVIEW)

    def paint(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_BASE)
        e = ((PX - 30.0) / 21.0) ** 2 + ((PY - 18.0) / 22.0) ** 2
        put(idx, interior & (e > 1.0) & (PY < 46), CABELO, K_SH)
        put(idx, edge_band(interior, (1, 0), 2), CABELO, K_SH)
        put(idx, interior & (PY > 58.5), CABELO, K_SH)                     # pontas
        lines = set()
        for vx, vy in LONG_BACKVIEW_VALLEYS:                               # mechas: sobem das pontas pra coroa
            lines |= _line_px((vx, vy - 0.2), (vx + (32.0 - vx) * 0.32, vy - 27.0))
        for ex, ey in ((21.0, 18.0), (27.0, 14.0), (37.0, 14.0), (43.0, 18.0)):   # da coroa pra baixo
            lines |= _line_px((32.0 + (ex - 32.0) * 0.3, 9.0 + (ey - 9.0) * 0.3), (ex, ey + 10.0))
        allines = set(p for p in lines if 0 <= p[0] < W and 0 <= p[1] < H and interior[p[1], p[0]])
        shade_ = blank()
        for x, y in allines:                                               # mecha arredondada: sombra à direita
            if y > 30:
                for k in (1, 2):
                    if x + k < W and interior[y, x + k]:
                        shade_[y, x + k] = True
        put(idx, shade_, CABELO, K_SH)
        _draw_lines(idx, allines, interior, K_DK)
        r = ((PX - 31.0) / 16.0) ** 2 + ((PY - 20.5) / 13.0) ** 2
        ang = np.degrees(np.arctan2(PY - 20.5, PX - 31.0))
        arc = (r > 0.62) & (r < 0.80) & (ang > -170) & (ang < -40) & interior & (idx.sh != K_DK)
        put(idx, arc, CABELO, K_LT)
        put(idx, arc & (ang > -150) & (ang < -112), CABELO, K_HI)

    return [Part("cabelo", m, 1, CORPO, paint)]


def long_hair_template(view, bangs="reta"):
    if view == "side":
        return _long_side_parts()
    if view == "back":
        return _long_back_parts()
    B = BANGS[bangs]
    pts = []
    for p in LONG_FRONT:
        pts += B["pts"] if p == "FRANJA" else [p]
    front = poly(pts)
    back = poly(LONG_BACK) & ~front

    def paint_front(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_BASE)
        # volume: borda de baixo/direita na sombra (luz de cima-esquerda)
        e = ((PX - 30.0) / 19.5) ** 2 + ((PY - 19.0) / 15.5) ** 2
        put(idx, interior & (e > 1.0) & (PY < 30), CABELO, K_SH)
        put(idx, edge_band(interior, (1, 0), 2), CABELO, K_SH)
        # mechas do rosto: lado de dentro (encostado na bochecha) na sombra, pontas escuras
        locks = interior & (PY > 30)
        put(idx, locks & edge_band(locks, (1, 0), 1), CABELO, K_SH)
        put(idx, locks & (PX > 32) & ~edge_band(locks, (1, 0), 1) & (PX < 47.5), CABELO, K_SH)
        put(idx, locks & (PY > 49), CABELO, K_SH)
        lt = locks & (PX < 32) & edge_band(locks, (-1, 0), 1) & (PY < 48)
        put(idx, lt, CABELO, K_LT)
        # franja: raiz na sombra (sai de baixo do volume) + risco entre as mechas, subindo da vala
        bang = interior & (PY > 24.5) & (PX > 18.6) & (PX < 45.4)
        put(idx, bang & (PY < 26.5), CABELO, K_SH)
        lines = set()
        px_, py_ = B["part"]
        for vx, vy in B["valleys"]:                                      # risco de cada mecha da franja
            lines |= _line_px((vx, vy - 0.2), (vx + (px_ - vx) * 0.25, vy - 5.0))
        # mechas do topo: riscos curtos saindo da risca
        top_x = 31.5 if bangs == "reta" else 25.0
        for ex, ey in ((22.0, 14.0), (26.5, 10.6), (37.5, 10.8), (42.0, 14.4)):
            lines |= _line_px((top_x + (ex - top_x) * 0.35, 8.6 + (ey - 8.6) * 0.35), (ex, ey))
        lines |= _line_px((top_x - 0.5, 6.8), (top_x - 0.9, 10.2))       # risca do cabelo
        for x, y in lines:
            if 0 <= x < W and 0 <= y < H and interior[y, x]:
                idx.ch[y, x], idx.sh[y, x] = CABELO, K_DK
        # brilho em arco (anel de luz) no alto da cabeça
        r = ((PX - 31.0) / 16.0) ** 2 + ((PY - 20.5) / 13.0) ** 2
        ang = np.degrees(np.arctan2(PY - 20.5, PX - 31.0))
        arc = (r > 0.62) & (r < 0.80) & (ang > -170) & (ang < -40) & interior & (idx.sh != K_DK)
        put(idx, arc, CABELO, K_LT)
        put(idx, arc & (ang > -150) & (ang < -112), CABELO, K_HI)

    def paint_back(idx, part, vis, interior):
        put(idx, part.mask, CABELO, K_SH)                                # atrás do corpo: um tom abaixo
        put(idx, edge_band(interior, (-1, 0), 1) & (PY < 56), CABELO, K_BASE)   # luz na borda de fora (esquerda)
        put(idx, edge_band(interior, (1, 0), 2), CABELO, K_DK)
        lines = set()
        for vx, vy in LONG_BACK_VALLEYS:
            lines |= _line_px((vx, vy - 0.2), (vx + (31.5 - vx) * 0.1, vy - 9.0))
        lines |= _line_px((12.4, 40.0), (12.2, 54.0)) | _line_px((51.6, 40.0), (51.8, 54.0))
        for x, y in lines:
            if 0 <= x < W and 0 <= y < H and interior[y, x]:
                idx.ch[y, x], idx.sh[y, x] = CABELO, K_DK

    return [Part("cabelo_tras", back, 0, TRAS, paint_back), Part("cabelo", front, 1, CORPO, paint_front)]


# =====================================================================================
# CHAPÉU: BANDANA NINJA (cor 1 = pano, cor 2 = placa de metal)
# =====================================================================================
SPIRAL = N.SPIRAL


def _paint_band_front(idx, part, vis, interior):
    put(idx, part.mask, COR1, K_BASE)
    put(idx, interior & (ROWS == ref(0, 14)[1]), COR1, K_LT)
    put(idx, interior & (ROWS == ref(0, 18)[1]), COR1, K_SH)
    put(idx, interior & (COLS >= ref(33, 0)[0]) & (COLS <= ref(35, 0)[0]), COR1, K_SH)
    put(idx, interior & (COLS == ref(35, 0)[0]), COR1, K_DK)


SYMBOLS = {"espiral": SPIRAL}     # símbolos de vila (5x5). O símbolo de verdade de cada vila entra aqui.


def _plate_paint(spiral_at=(18, 14), rivets=((14, 15), (14, 17), (25, 15), (25, 17)), top=13, bottom=19,
                 left=13, right=26, use_ref=True, symbol="espiral"):
    f = ref if use_ref else (lambda c, r: (c, r))

    def paint(idx, part, vis, interior):
        put(idx, part.mask, COR2, K_BASE)
        put(idx, interior & (ROWS == f(0, top)[1]), COR2, K_LT)
        put(idx, interior & (COLS == f(left, 0)[0]), COR2, K_LT)
        put(idx, interior & (ROWS == f(0, bottom)[1]), COR2, K_SH)
        put(idx, interior & (COLS == f(right, 0)[0]), COR2, K_SH)
        put_px(idx, [f(left, top), f(left + 1, top), f(left, top + 1)], COR2, K_HI)
        put_px(idx, [f(c, r) for c, r in rivets], COR2, K_DK)
        if spiral_at and symbol:
            for j, s in enumerate(SYMBOLS[symbol]):
                for i, ch in enumerate(s):
                    if ch == "X":
                        put_px(idx, [f(spiral_at[0] + i, spiral_at[1] + j)], COR2, K_DK)
    return paint


def _band_shade(idx, interior, top_y, bot_y):
    put(idx, interior & (ROWS == top_y), COR1, K_LT)
    put(idx, interior & (ROWS == bot_y), COR1, K_SH)


def hat_template(view, symbol="espiral"):
    if view == "front":
        return [Part("bandana", N.headband_mask(), 1, CORPO, _paint_band_front),
                Part("placa", N.plate_mask(), 2, CORPO, _plate_paint(symbol=symbol))]
    if view == "side":
        # faixa contorna a cabeça (por cima do cabelo) da testa até a nuca; placa vista de quina na frente
        band = poly([(16.2, 22.0), (48.0, 21.0), (50.0, 22.0), (50.0, 28.5), (16.2, 29.0)])
        plate = poly([(15.0, 21.0), (20.0, 21.0), (20.0, 30.0), (15.0, 30.0)])
        for x, y in ((15, 21), (15, 29)):
            plate[y, x] = False
        knot = ellipse(49.5, 25.0, 2.6, 3.2)
        tails = poly([(49.0, 23.0), (55.0, 26.0), (59.0, 31.0), (57.4, 32.4), (53.6, 28.6), (49.0, 26.5)])
        tails |= poly([(48.6, 26.0), (53.4, 31.6), (55.0, 38.4), (53.0, 38.8), (50.6, 33.0), (47.6, 28.6)])

        def paint_band(idx, part, vis, interior):
            put(idx, part.mask, COR1, K_BASE)
            _band_shade(idx, interior, 23, 27)
            put(idx, interior & (COLS >= 44), COR1, K_SH)

        def paint_tail(idx, part, vis, interior):
            put(idx, part.mask, COR1, K_SH)
            put(idx, edge_band(interior, (-1, -1), 1), COR1, K_BASE)
            put(idx, edge_band(interior, (1, 1), 1), COR1, K_DK)
            put(idx, interior & ellipse(49.5, 25.0, 1.6, 2.0), COR1, K_BASE)

        return [Part("pontas", tails, 0, CORPO, paint_tail),
                Part("bandana", band, 1, CORPO, paint_band),
                Part("no", knot, 2, CORPO, paint_tail),
                Part("placa", plate, 3, CORPO, _plate_paint(spiral_at=None, rivets=((17, 23), (17, 27)), top=22,
                                                              bottom=28, left=16, right=18, use_ref=False))]
    # costas: faixa atravessando a nuca, nó no meio e duas pontas caindo
    band = rpoly([(3.0, 13.0), (37.0, 13.0), (37.0, 20.0), (3.0, 20.0)])
    knot = ellipse(32.0, 25.0, 3.0, 3.4)
    tails = poly([(30.4, 26.0), (33.0, 26.4), (29.6, 37.6), (26.6, 39.2), (27.2, 33.0)])
    tails |= poly([(31.4, 26.4), (34.4, 26.0), (37.0, 33.2), (38.6, 40.2), (35.6, 38.4)])

    def paint_band(idx, part, vis, interior):
        put(idx, part.mask, COR1, K_BASE)
        _band_shade(idx, interior, 23, 27)
        put(idx, interior & (COLS >= 44), COR1, K_SH)

    def paint_tail(idx, part, vis, interior):
        put(idx, part.mask, COR1, K_SH)
        put(idx, edge_band(interior, (-1, 0), 1), COR1, K_BASE)
        put(idx, edge_band(interior, (1, 0), 1), COR1, K_DK)
        put(idx, interior & ellipse(31.4, 24.6, 1.6, 1.8), COR1, K_BASE)

    return [Part("bandana", band, 0, CORPO, paint_band),
            Part("pontas", tails, 1, CORPO, paint_tail),
            Part("no", knot, 2, CORPO, paint_tail)]


# =====================================================================================
# composição presa na cabeça
# =====================================================================================
_CACHE = {}


def head_planes(kind, view, style=None):
    """4 planos (Idx) do item em repouso. Cabelo longo usa o plano TRAS (a parte que cai atrás do corpo).
    chapeu: 'bandana' = placa lisa; 'bandana+espiral' = com o símbolo da vila."""
    key = (kind, view, style)
    if key not in _CACHE:
        if kind in ("olhos", "boca"):
            planes = [Idx(H, W) for _ in range(4)]
            planes[CORPO] = eyes_template(view, style) if kind == "olhos" else mouth_template(view, style or "sorriso")
        elif kind == "cabelo":
            planes = compose(hair_template(view, style or "espetado"))
        else:
            sym = style.split("+", 1)[1] if style and "+" in style else None
            planes = compose(hat_template(view, symbol=sym))
        _CACHE[key] = planes
    return _CACHE[key]


def fit_to_pose(planes, fig, body_planes):
    """De frente, a massa de cabelo que cai atrás do corpo (plano TRAS) fica atrás dos braços/pernas que também
    vão pra trás (ex.: mãos da corrida ao lado do rosto)."""
    if fig.view != "front" or not planes[TRAS].any():
        return planes
    out = [p for p in planes]
    t = Idx(H, W)
    t.ch, t.sh = planes[TRAS].ch.copy(), planes[TRAS].sh.copy()
    cut = body_planes[TRAS].ch > 0
    t.ch[cut] = 0
    t.sh[cut] = 0
    out[TRAS] = t
    return out


def head_item(kind, view, style=None):
    """Idx (plano CORPO) do item em repouso."""
    return head_planes(kind, view, style)[CORPO]


def follow_head(idx, fig):
    """Desloca o item com a cabeça (head_off + respiração)."""
    dx, dy = fig.head_off
    dy += 1 if getattr(fig, "breath", 0) else 0
    out = Idx(H, W)
    out.ch = _shift_arr(idx.ch, dx, dy)
    out.sh = _shift_arr(idx.sh, dx, dy)
    return out


def _shift_arr(a, dx, dy):
    """Desloca sem dar a volta (o que sai do quadro some, não reaparece do outro lado)."""
    o = np.zeros_like(a)
    h, w = a.shape
    ys, yd = slice(max(dy, 0), h + min(dy, 0)), slice(max(-dy, 0), h + min(-dy, 0))
    xs, xd = slice(max(dx, 0), w + min(dx, 0)), slice(max(-dx, 0), w + min(-dx, 0))
    o[ys, xs] = a[yd, xd]
    return o
