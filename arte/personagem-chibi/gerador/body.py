"""Corpo base chibi (masculino/feminino) montado num esqueleto, nas vistas frente/lado/costas.

Tudo em coordenadas do canvas 64x96. As tabelas de linhas (y: (x0, x1)) descrevem cada peça na
POSE DE REPOUSO; as peças de membro viram perfis varridos ao longo dos ossos, então quando o osso
está em repouso a tabela é reproduzida pixel a pixel (a base aprovada), e quando ele gira a peça gira junto.
"""
import math

import numpy as np

from compose import CORPO, FRENTE, TOPO, TRAS, Part
from geom import (H, PX, PY, W, YY, XX, add, blank, bone_frame, bone_ts, dilate, ellipse, erode, pts_mask, rows_mask,
                  shift, sweep, profile_from_rows)
from pal import (F_OUT, F_UW, F_UW_DK, F_UW_HI, F_UW_SH, FIXO, P_BASE, P_DK, P_EAR, P_HI, P_HI2, P_L1, P_LN, P_SH,
                 PELE)

GROUND = 92                # última linha da sola (chão)
ANCHOR = (32.0, 48.0)      # ponto onde a cabeça encaixa (base do queixo / topo do pescoço) em repouso


def mirror_rows(rows):
    return {y: (63 - b, 63 - a) for y, (a, b) in rows.items()}


def mirror_pt(p):
    return (64.0 - p[0], p[1])


# =====================================================================================
# FRENTE (tabelas da base aprovada, convertidas pro canvas)
# =====================================================================================
HEAD_L = {2: 15, 3: 12, 4: 11, 5: 10, 6: 9, 7: 8, 8: 7, 9: 6, 10: 6, 11: 5, 12: 5, 13: 5,
          **{r: 4 for r in range(14, 32)}, 32: 5, 33: 5, 34: 6, 35: 7, 36: 8, 37: 10, 38: 12}
HEAD_F = {r + 9: (c + 12, 63 - (c + 12)) for r, c in HEAD_L.items()}
EARS_F = [(15, y) for y in range(34, 40)] + [(48, y) for y in range(34, 40)]
NECK_F = {47: (27, 36), 48: (27, 36), 49: (27, 36)}

TORSO_F = {"m": {**{y: (25, 38) for y in range(49, 57)}, **{y: (24, 39) for y in range(57, 62)},
                 **{y: (23, 40) for y in range(62, 77)}},
           "f": {**{y: (25, 38) for y in range(49, 55)}, **{y: (24, 39) for y in range(55, 59)},
                 59: (25, 38), 60: (25, 38), 61: (25, 38), 62: (25, 38), 63: (24, 39), 64: (24, 39),
                 **{y: (23, 40) for y in range(65, 67)}, **{y: (22, 41) for y in range(67, 75)}, 75: (23, 40), 76: (23, 40)}}
# braço esquerdo da tela (o direito é espelhado). Inclui 1 px pra dentro abaixo da axila: essa coluna vira a
# linha entre braço e tronco (na base ela era desenhada no tronco; aqui o braço, que fica na frente, desenha).
ARM_F = {"m": {50: (24, 26), 51: (23, 26), 52: (22, 25), 53: (21, 25), 54: (21, 24), 55: (20, 24), 56: (20, 24),
               57: (20, 24), 58: (19, 24), 59: (19, 24), 60: (19, 24), 61: (19, 24),
               **{y: (18, 23) for y in range(62, 68)}},
         }
HAND_F = {68: (17, 23), 69: (17, 23), 70: (17, 23), 71: (17, 23), 72: (17, 23), 73: (18, 21), 74: (19, 21)}
LEG_F = {**{y: (22, 30) for y in range(76, 81)}, **{y: (22, 29) for y in range(81, 88)}, 88: (22, 28)}
FOOT_F = {89: (21, 28), 90: (21, 28), 91: (21, 28), 92: (21, 28)}

# juntas em repouso (lado esquerdo da tela)
REST_F = dict(neck=(32.0, 49.0), hip=(32.0, 76.0),
              sh=(25.5, 50.0), el=(21.6, 58.5), wr=(20.6, 67.8), hand_end=(20.0, 75.0),
              hipj=(26.5, 73.0), knee=(26.0, 82.0), ank=(25.5, 88.5))


def _female_arm(rows, dx=-1):
    """Feminino: quadril mais largo -> braço 1 px mais pra fora da cintura pra baixo (mantém o vão)."""
    out = {}
    for y, (a, b) in rows.items():
        out[y] = (a + dx, b + dx) if y >= 57 else (a, b)
    return out


ARM_F["f"] = _female_arm(ARM_F["m"])
HAND_F_G = {"m": HAND_F, "f": {y: (a - 1, b - 1) for y, (a, b) in HAND_F.items()}}
REST_F_G = {"m": REST_F, "f": {**REST_F, "el": (20.6, 58.5), "wr": (19.6, 67.8), "hand_end": (19.0, 75.0)}}


# =====================================================================================
# utilidades de pintura
# =====================================================================================
def edge_band(m, d, k=1):
    """Faixa de k px na borda de m do lado da direção d=(dx,dy)."""
    dx, dy = d
    e = m & ~shift(m, -dx, -dy)
    for _ in range(k - 1):
        e |= shift(e, -dx, -dy) & m
    return e


def shadow_dir(u):
    """Direção (em pixels) do lado que fica na sombra pra um osso com direção u (luz de cima-esquerda)."""
    n = (u[1], -u[0])
    if n[0] + n[1] < 0:
        n = (-n[0], -n[1])
    dx = int(np.sign(n[0])) if abs(n[0]) > 0.5 else 0
    dy = int(np.sign(n[1])) if abs(n[1]) > 0.5 else 0
    return dx, dy


def tilted(cx, cy, rx, ry, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    u = (PX - cx) * ca + (PY - cy) * sa
    v = -(PX - cx) * sa + (PY - cy) * ca
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1


def local_pt(A, B, t, s):
    """Ponto em coordenadas do osso (t ao longo, s pro lado +n) -> canvas."""
    L, u, n = bone_frame(A, B)
    return (A[0] + u[0] * L * t + n[0] * s, A[1] + u[1] * L * t + n[1] * s)


# =====================================================================================
# LADO (virado pra ESQUERDA, igual à referência; a luz de cima-esquerda bate no rosto)
# medido na referência (x = col_ref - 49, y = lin_ref + 9)
# =====================================================================================
HEAD_S = {11: (29, 37), 12: (26, 40), 13: (24, 41), 14: (23, 42), 15: (22, 43), 16: (21, 44), 17: (20, 45),
          18: (19, 46), 19: (19, 46), 20: (18, 47), 21: (18, 47), 22: (18, 47), **{y: (17, 48) for y in range(23, 32)},
          32: (17, 47), 33: (18, 47), 34: (18, 47), 35: (18, 46), 36: (18, 46), 37: (18, 46), 38: (18, 45),
          39: (17, 44), 40: (17, 43), 41: (17, 43), 42: (18, 41), 43: (19, 40), 44: (20, 39), 45: (21, 37),
          46: (22, 35), 47: (24, 28)}
NECK_S = {46: (28, 35), 47: (28, 35), 48: (28, 35), 49: (28, 35), 50: (28, 35)}
TORSO_S = {"m": {49: (27, 35), 50: (27, 36), 51: (27, 37), 52: (26, 37), 53: (25, 37), 54: (25, 37),
                 **{y: (24, 37) for y in range(55, 68)}, **{y: (23, 37) for y in range(68, 72)}, 72: (24, 37),
                 73: (24, 37), 74: (25, 36), 75: (25, 36)},
           "f": {49: (27, 35), 50: (27, 36), 51: (27, 37), 52: (26, 37), 53: (25, 37), 54: (24, 37),
                 55: (23, 37), 56: (22, 37), 57: (22, 37), 58: (22, 37), 59: (22, 37), 60: (23, 37), 61: (24, 37),
                 62: (25, 37), 63: (25, 37), 64: (25, 37), 65: (25, 37), 66: (25, 37), 67: (25, 38),
                 # barriga reta (cintura fina na frente); o volume fica só atrás (quadril/bumbum)
                 68: (25, 39), 69: (25, 39), 70: (25, 39), 71: (25, 39), 72: (25, 39), 73: (25, 38), 74: (25, 37),
                 75: (25, 36)}}
ARM_S = {50: (33, 36), 51: (32, 37), 52: (32, 38), **{y: (32, 38) for y in range(53, 68)}}
HAND_S = {68: (32, 39), 69: (32, 39), 70: (32, 39), 71: (32, 39), 72: (33, 38), 73: (34, 37)}
LEG_S = {**{y: (29, 36) for y in range(76, 89)}}
FOOT_S = {89: (27, 36), 90: (26, 36), 91: (26, 36), 92: (26, 36)}
REST_S = dict(neck=(31.5, 49.0), hip=(31.0, 76.0),
              sh=(35.0, 51.0), el=(35.0, 60.0), wr=(35.0, 67.8), hand_end=(35.5, 74.0),
              hipj=(32.5, 73.0), knee=(32.5, 81.0), ank=(32.5, 88.5))
REST_S_G = {"m": REST_S, "f": REST_S}

# =====================================================================================
# COSTAS: mesma silhueta da frente (giro consistente), só muda o sombreado e os detalhes
# =====================================================================================
HEAD_B = HEAD_F
EARS_B = EARS_F


# =====================================================================================
# definição de repouso por vista/gênero -> perfis
# =====================================================================================
class RestDef:
    """Repouso de uma vista/gênero: máscaras de cada segmento (com sobreposição nas juntas) + ossos."""

    def __init__(self, g, view):
        self.g, self.view = g, view
        if view in ("front", "back"):
            R = REST_F_G[g]
            arm_rows = {**ARM_F[g], **HAND_F_G[g]}
            leg_rows = {**LEG_F, **FOOT_F}
            torso_rows = TORSO_F[g]
            self.head_rows, self.neck_rows = HEAD_F, NECK_F
            ranges = dict(upper=(49, 59), fore=(57, 68), hand=(66, 75), thigh=(75, 83), shin=(80, 89), foot=(88, 92))
        else:
            R = REST_S_G[g]
            arm_rows = {**ARM_S, **HAND_S}
            leg_rows = {**LEG_S, **FOOT_S}
            torso_rows = TORSO_S[g]
            self.head_rows, self.neck_rows = HEAD_S, NECK_S
            ranges = dict(upper=(49, 61), fore=(58, 68), hand=(66, 74), thigh=(75, 82), shin=(79, 89), foot=(88, 92))
        self.rest = R
        self.arm_rows, self.leg_rows, self.torso_rows = arm_rows, leg_rows, torso_rows
        self.seg = {}
        for k, (y0, y1) in ranges.items():
            rows = arm_rows if k in ("upper", "fore", "hand") else leg_rows
            self.seg[k] = rows_mask({y: v for y, v in rows.items() if y0 <= y <= y1})
        self.seg["torso"] = rows_mask(torso_rows)
        ank = R["ank"]
        self.bones = dict(upper=(R["sh"], R["el"]), fore=(R["el"], R["wr"]), hand=(R["wr"], R["hand_end"]),
                          thigh=(R["hipj"], R["knee"]), shin=(R["knee"], R["ank"]),
                          foot=(ank, (ank[0], ank[1] + 4.0)), torso=(R["neck"], R["hip"]))
        self.len = dict(upper=math.dist(R["sh"], R["el"]), fore=math.dist(R["el"], R["wr"]),
                        hand=math.dist(R["wr"], R["hand_end"]),
                        thigh=math.dist(R["hipj"], R["knee"]), shin=math.dist(R["knee"], R["ank"]),
                        torso=math.dist(R["neck"], R["hip"]))
        # posição das juntas de ombro/quadril em coordenadas do tronco (t ao longo da coluna, s pro lado)
        self.local = {}
        L, u, n = bone_frame(R["neck"], R["hip"])
        for k in ("sh", "hipj"):
            vx, vy = R[k][0] - R["neck"][0], R[k][1] - R["neck"][1]
            self.local[k] = ((vx * u[0] + vy * u[1]) / L, vx * n[0] + vy * n[1])

    def seg_rest(self, name, mirror=False):
        """(máscara de repouso, osso de repouso) do segmento; espelhado pro lado direito da tela."""
        m = self.seg[name]
        A, B = self.bones[name]
        if mirror:
            return m[:, ::-1], (mirror_pt(A), mirror_pt(B))
        return m, (A, B)


_REST_CACHE = {}


def rest(g, view):
    k = (g, view)
    if k not in _REST_CACHE:
        _REST_CACHE[k] = RestDef(g, view)
    return _REST_CACHE[k]


# =====================================================================================
# esqueleto posado
# =====================================================================================
class Limb:
    """kind 'arm' (j: sh, el, wr, end) ou 'leg' (j: hip, knee, ank). side: 'L'/'R' (frente/costas) ou
    'near'/'far' (lado). plane: plano de desenho. Extras: hand ('open'/'fist'), fs (escala do pé/punho),
    foot ('flat'/'tip'/'none'/'sole'), foot_ang (graus, lado)."""

    def __init__(self, kind, side, j, plane=CORPO, z=None, far=False, **kw):
        self.kind, self.side, self.j, self.plane, self.far, self.kw = kind, side, j, plane, far, kw
        self.z = z


class Figure:
    def __init__(self, g, view, hip=None, lean=0.0, head_off=(0, 0), breath=0):
        self.g, self.view = g, view
        self.R = rest(g, view)
        r = self.R.rest
        self.hip = hip if hip is not None else r["hip"]
        L = self.R.len["torso"]
        a = math.radians(lean)
        if view == "side":     # inclina pra frente = pra esquerda (o boneco olha pra esquerda)
            dx0, dy0 = r["neck"][0] - r["hip"][0], r["neck"][1] - r["hip"][1]
            ca, sa = math.cos(-a), math.sin(-a)
            self.neck = (self.hip[0] + dx0 * ca - dy0 * sa, self.hip[1] + dx0 * sa + dy0 * ca)
        else:                  # de frente/costas a inclinação vira encurtamento
            self.neck = (self.hip[0], self.hip[1] - L * math.cos(a))
        self.lean = lean
        self.breath = breath
        hx = self.neck[0] - r["neck"][0] + ANCHOR[0]
        hy = self.neck[1] - r["neck"][1] + ANCHOR[1]
        self.head_off = (int(round(hx - ANCHOR[0] + head_off[0])), int(round(hy - ANCHOR[1] + head_off[1])))
        self.limbs = []

    # juntas presas ao tronco
    def _torso_pt(self, t, s):
        L, u, n = bone_frame(self.neck, self.hip)
        return (self.neck[0] + u[0] * L * t + n[0] * s, self.neck[1] + u[1] * L * t + n[1] * s)

    def shoulder(self, side):
        t, s = self.R.local["sh"]
        if side == "R":
            s = -s
        if side == "far":
            return add(self._torso_pt(t, s), (-2.0, 0.0))
        return self._torso_pt(t, s)

    def hipj(self, side):
        t, s = self.R.local["hipj"]
        if side == "R":
            s = -s
        if side == "far":
            return add(self._torso_pt(t, s), (-2.0, 0.0))
        return self._torso_pt(t, s)

    def add(self, limb):
        self.limbs.append(limb)
        return limb

    # ---------- construção de membros por IK ----------
    def arm(self, side, wrist, bend=None, plane=CORPO, end_dir=None, el=None, **kw):
        sh = self.shoulder(side)
        Ls = self.R.len
        if el is None:
            if bend is None:
                bend = (1 if side in ("L",) else -1) if self.view != "side" else -1
            from geom import ik
            el, wrist = ik(sh, wrist, Ls["upper"], Ls["fore"], bend)
        r = self.R.rest
        mir = self.view in ("front", "back") and side == "R"
        m = mirror_pt if mir else (lambda p: p)
        rel, rwr, rend = m(r["el"]), m(r["wr"]), m(r["hand_end"])
        if kw.get("hand") in ("fist", "fist_front"):
            hv_k = 0.72
        else:
            hv_k = 1.0
        if end_dir is None:   # mão continua alinhada com o antebraço como no repouso
            a0 = math.atan2(rwr[1] - rel[1], rwr[0] - rel[0])
            a1 = math.atan2(wrist[1] - el[1], wrist[0] - el[0])
            hv = ((rend[0] - rwr[0]) * hv_k, (rend[1] - rwr[1]) * hv_k)
            da = a1 - a0
            end = (wrist[0] + hv[0] * math.cos(da) - hv[1] * math.sin(da),
                   wrist[1] + hv[0] * math.sin(da) + hv[1] * math.cos(da))
        else:
            n = math.hypot(*end_dir) or 1.0
            end = (wrist[0] + end_dir[0] / n * Ls["hand"], wrist[1] + end_dir[1] / n * Ls["hand"])
        return self.add(Limb("arm", side, dict(sh=sh, el=el, wr=wrist, end=end), plane=plane, **kw))

    def leg(self, side, ank, bend=None, plane=CORPO, knee=None, **kw):
        hp = self.hipj(side)
        Ls = self.R.len
        if knee is None:
            if bend is None:
                bend = 1 if self.view == "side" else (1 if side == "L" else -1)
            from geom import ik
            knee, ank = ik(hp, ank, Ls["thigh"], Ls["shin"], bend)
        return self.add(Limb("leg", side, dict(hip=hp, knee=knee, ank=ank), plane=plane, **kw))


# =====================================================================================
# máscaras posadas
# =====================================================================================
def remap(rest_mask, rA, rB, A, B, ks=1.0):
    """Leva uma máscara desenhada no osso de repouso rA->rB pro osso posado A->B (gira/escala/translada).
    ks escala também na largura (pé/punho maior quando vem pra câmera)."""
    L, u, n = bone_frame(A, B)
    Lr, ur, nr = bone_frame(rA, rB)
    vx, vy = PX - A[0], PY - A[1]
    t = (vx * u[0] + vy * u[1]) / L
    s = (vx * n[0] + vy * n[1]) / ks
    x = rA[0] + ur[0] * Lr * t + nr[0] * s
    y = rA[1] + ur[1] * Lr * t + nr[1] * s
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
    out = blank()
    out[ok] = rest_mask[yi[ok], xi[ok]]
    return out


def map_pts(pts, rA, rB, A, B):
    """Pixels (x, y) definidos no osso de repouso -> pixels no osso posado."""
    Lr, ur, nr = bone_frame(rA, rB)
    L, u, n = bone_frame(A, B)
    out = []
    for x, y in pts:
        vx, vy = x + 0.5 - rA[0], y + 0.5 - rA[1]
        t = (vx * ur[0] + vy * ur[1]) / Lr
        s = vx * nr[0] + vy * nr[1]
        px = A[0] + u[0] * L * t + n[0] * s
        py = A[1] + u[1] * L * t + n[1] * s
        out.append((int(math.floor(px)), int(math.floor(py))))
    return out


def is_mirror(fig, limb):
    return fig.view in ("front", "back") and limb.side == "R"


def rest_bones(fig, limb):
    """Ossos de repouso correspondentes ao membro (espelhados pro lado direito na frente/costas)."""
    mir = is_mirror(fig, limb)
    names = ("upper", "fore", "hand") if limb.kind == "arm" else ("thigh", "shin", "foot")
    return {k: fig.R.seg_rest(k, mir)[1] for k in names}


def posed_bones(fig, limb):
    j = limb.j
    if limb.kind == "arm":
        return dict(upper=(j["sh"], j["el"]), fore=(j["el"], j["wr"]), hand=(j["wr"], j["end"]))
    ang = math.radians(limb.kw.get("foot_ang", 0.0))
    fs = limb.kw.get("fs", 1.0)
    ax, ay = j["ank"]
    if fig.view == "side":      # ângulo > 0 = ponta do pé desce (pé de trás no ar)
        tip = (ax + math.sin(ang) * 4.0 * fs, ay + math.cos(ang) * 4.0 * fs)
    else:
        tip = (ax, ay + 4.0 * fs)
    return dict(thigh=(j["hip"], j["knee"]), shin=(j["knee"], j["ank"]), foot=(j["ank"], tip))


def seg_mask(fig, limb, name, ks=1.0):
    if name in ("thigh", "shin"):
        ks *= limb.kw.get("thick", 1.0)
    m, (rA, rB) = fig.R.seg_rest(name, is_mirror(fig, limb))
    A, B = posed_bones(fig, limb)[name]
    return remap(m, rA, rB, A, B, ks)


def fist_front_geom(limb):
    j = limb.j
    fs = limb.kw.get("fs", 1.0)
    c = ((j["wr"][0] + j["end"][0]) / 2, (j["wr"][1] + j["end"][1]) / 2)
    return c, 3.0 * fs, 2.8 * fs


def fist_front_mask(limb):
    (cx, cy), rx, ry = fist_front_geom(limb)
    return (np.abs((PX - cx) / rx) ** 3 + np.abs((PY - cy) / ry) ** 3) <= 1.0


def arm_mask(fig, limb, hand_scale=1.0):
    j = limb.j
    if limb.kw.get("hand") == "fist_front":
        m = seg_mask(fig, limb, "upper") | seg_mask(fig, limb, "fore") | fist_front_mask(limb)
        m |= ellipse(j["el"][0], j["el"][1], 1.9, 1.9)
        return m
    m = seg_mask(fig, limb, "upper") | seg_mask(fig, limb, "fore") | seg_mask(fig, limb, "hand", hand_scale)
    m |= ellipse(j["el"][0], j["el"][1], 1.9, 1.9)
    return m


def sole_geom(limb):
    """Sola do pé virada pra câmera (chute de frente): elipse na ponta da canela."""
    j = limb.j
    fs = limb.kw.get("fs", 1.0)
    L, u, n = bone_frame(j["knee"], j["ank"])
    c = (j["ank"][0] + u[0] * 2.4 * fs, j["ank"][1] + u[1] * 2.4 * fs)
    return c, 3.3 * fs, 4.3 * fs


SOLE = [   # sola do pé virada pra câmera (dedos pra cima): O contorno, . dedo, e sola rosada, 1 miolo claro
    ".OO.OO.O.",
    "O..O..O.O",
    "O..O..O.O",
    "O.eOeeOeO",
    "Oe11111eO",
    "Oe11111eO",
    "Oe11111eO",
    "Oee111eeO",
    ".Oeeeee.O",
    ".OeeeeeO.",
    "..OOOOO..",
]


def sole_stamp(limb):
    """(máscara, {(x,y): tom}) da sola carimbada com a base no tornozelo."""
    j = limb.j
    ax, ay = j["ank"]
    h, w = len(SOLE), len(SOLE[0])
    x0, y0 = int(round(ax - w / 2)), int(round(ay - h + 2))
    m = blank()
    px = {}
    for jj, s in enumerate(SOLE):
        inside = [i for i, ch in enumerate(s) if ch != "."]
        lo, hi = (min(inside), max(inside)) if inside else (0, -1)
        for i, ch in enumerate(s):
            if ch == "." and not (lo < i < hi):
                continue
            x, y = x0 + i, y0 + jj
            if 0 <= x < W and 0 <= y < H:
                m[y, x] = True
                px[(x, y)] = ch
    return m, px


def toes_geom(limb):
    (cx, cy), rx, ry = sole_geom(limb)
    fs = limb.kw.get("fs", 1.0)
    out = []
    for k, dy in ((-0.62, 0.15), (-0.2, 0.0), (0.22, 0.05), (0.62, 0.3)):
        out.append((cx + k * rx, cy - ry - 0.6 + dy * fs, 1.25 * fs))
    return out


def leg_mask(fig, limb):
    j = limb.j
    m = seg_mask(fig, limb, "thigh") | seg_mask(fig, limb, "shin")
    m |= ellipse(j["knee"][0], j["knee"][1], 2.6, 2.6)
    foot = limb.kw.get("foot", "flat")
    if foot == "sole":
        m |= sole_stamp(limb)[0]
    elif foot != "none":
        m |= seg_mask(fig, limb, "foot", limb.kw.get("fs", 1.0))
    return m


def head_mask(fig):
    dx, dy = fig.head_off
    m = shift(rows_mask(fig.R.head_rows), dx, dy)
    if fig.view in ("front", "back"):
        m |= shift(pts_mask(EARS_F), dx, dy)
    return m


def neck_torso_mask(fig):
    r = fig.R.rest
    rows = fig.R.neck_rows
    x0 = min(a for a, b in rows.values())
    x1 = max(b for a, b in rows.values())
    cx = (x0 + x1 + 1) / 2.0
    hw = (x1 + 1 - x0) / 2.0
    dx, dy = fig.head_off
    A = (cx + dx, min(rows) + dy - 0.5)
    B = (fig.neck[0] + (cx - r["neck"][0]), fig.neck[1] + 1.5)
    neck = sweep(A, B, [(0, hw, hw), (1, hw, hw)])
    m, (rA, rB) = fig.R.seg_rest("torso")
    torso = remap(m, rA, rB, fig.neck, fig.hip)
    return torso | neck, torso, neck


# =====================================================================================
# pintura do corpo
# =====================================================================================
ALL = np.ones((H, W), bool)
FAR_MAP = {P_HI2: P_HI, P_HI: P_BASE, P_BASE: P_L1, P_L1: P_SH, P_SH: P_DK, P_DK: P_DK, P_EAR: P_DK}


def put_px(idx, pts, ch, sh, mask=None):
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H and (mask is None or mask[y, x]):
            idx.ch[y, x] = ch
            idx.sh[y, x] = sh


def darken_far(idx, m):
    """Membro de longe (vista de lado): tons um degrau mais escuros."""
    sel = m & (idx.ch == PELE)
    sh = idx.sh.copy()
    for a, b in FAR_MAP.items():
        sh[sel & (idx.sh == a)] = b
    idx.sh[sel] = sh[sel]


def seg_owner(bones):
    """Para cada pixel, o índice do osso mais próximo (partição limpa do membro em segmentos)."""
    best = np.full((H, W), np.inf)
    own = np.zeros((H, W), int)
    for i, (A, B) in enumerate(bones):
        L, u, n = bone_frame(A, B)
        vx, vy = PX - A[0], PY - A[1]
        t = np.clip((vx * u[0] + vy * u[1]) / L, 0, 1)
        d = np.hypot(vx - u[0] * L * t, vy - u[1] * L * t)
        better = d < best
        best[better] = d[better]
        own[better] = i
    return own


def limb_shade(idx, interior, bones, rim=None, k_l1=2, k_sh=1):
    own = seg_owner(bones)
    base = interior & ~rim if rim is not None else interior
    for i, (A, B) in enumerate(bones):
        L, u, n = bone_frame(A, B)
        d = shadow_dir(u)
        sel = own == i
        idx.put(edge_band(base, d, k_l1) & sel, PELE, P_L1)
        if k_sh:
            idx.put(edge_band(base, d, k_sh) & sel, PELE, P_SH)


def rim_of(part):
    """Pixels do miolo encostados numa linha interna (ficam na cor base: luz refletida)."""
    ip = getattr(part, "inner_px", None)
    if ip is None or not ip.any():
        return None
    return dilate(ip) & ~ip


def paint_head(fig):
    dx, dy = fig.head_off
    view = fig.view

    def paint(idx, part, vis, interior):
        hf = interior
        idx.put(part.mask, PELE, P_BASE)
        if view == "front":
            idx.put(edge_band(hf, (1, 0), 2) & (YY >= 15 + dy), PELE, P_L1)
            idx.put(edge_band(hf, (1, 0), 1) & (YY >= 19 + dy) & (YY <= 43 + dy), PELE, P_SH)
            jaw = hf & ~shift(hf, 0, -1)
            idx.put(jaw & (YY >= 42 + dy), PELE, P_L1)
            idx.put(tilted(23.5 + dx, 18.6 + dy, 3.9, 2.2, -0.75) & hf, PELE, P_HI)
            idx.put(tilted(23.3 + dx, 18.4 + dy, 2.2, 1.1, -0.75) & hf, PELE, P_HI2)
            ear = [(16, 34, P_SH), (16, 35, P_SH), (17, 35, P_EAR), (17, 36, P_EAR), (17, 37, P_EAR), (17, 38, P_EAR),
                   (16, 38, P_SH), (16, 39, P_SH), (18, 36, P_L1), (18, 37, P_L1)]
            for x, y, c in ear:
                put_px(idx, [(x + dx, y + dy), (63 - x + dx, y + dy)], PELE, c)
        elif view == "back":
            idx.put(tilted(24.5 + dx, 19.5 + dy, 4.6, 2.6, -0.7) & hf, PELE, P_HI)
            idx.put(tilted(24.2 + dx, 19.2 + dy, 2.4, 1.2, -0.7) & hf, PELE, P_HI2)
            idx.put(edge_band(hf, (1, 0), 2) & (YY >= 15 + dy), PELE, P_L1)
            idx.put(edge_band(hf, (1, 0), 1) & (YY >= 19 + dy), PELE, P_SH)
            # nuca na sombra: arco escuro embaixo da cabeça (a cabeça "curva pra dentro" até o pescoço)
            nape = ellipse(31.8 + dx, 24.0 + dy, 17.0, 17.2)
            idx.put(hf & ~nape & (YY >= 36 + dy), PELE, P_L1)
            low = hf & ~shift(hf, 0, -1)
            idx.put((low | shift(low, 0, -1) & hf) & (YY >= 44 + dy) & ((XX <= 25 + dx) | (XX >= 38 + dx)), PELE, P_SH)
            idx.put(low & (YY >= 45 + dy), PELE, P_SH)
            # orelhas vistas por trás: borda externa escura, miolo médio
            ear = [(16, 34, P_SH), (16, 35, P_SH), (16, 36, P_SH), (16, 37, P_SH), (16, 38, P_DK), (16, 39, P_DK),
                   (17, 36, P_L1), (17, 37, P_L1), (17, 38, P_SH)]
            for x, y, c in ear:
                put_px(idx, [(x + dx, y + dy), (63 - x + dx, y + dy)], PELE, c)
        else:  # lado (olhando pra esquerda)
            idx.put(tilted(27.0 + dx, 17.5 + dy, 4.4, 2.3, -0.62) & hf, PELE, P_HI)
            idx.put(tilted(26.7 + dx, 17.3 + dy, 2.3, 1.1, -0.62) & hf, PELE, P_HI2)
            idx.put(edge_band(hf, (1, 0), 2) & (YY >= 15 + dy), PELE, P_L1)
            idx.put(edge_band(hf, (1, 0), 1) & (YY >= 19 + dy), PELE, P_SH)
            jaw = hf & ~shift(hf, 0, -1)
            idx.put(jaw & (YY >= 42 + dy), PELE, P_L1)
            idx.put(edge_band(hf, (1, 1), 1) & (YY >= 40 + dy) & (XX >= 26 + dx), PELE, P_SH)
            # orelha de perfil (x 34..39): contorno de trás, concha escura por dentro
            ear_pix = {
                (36, 34): "O", (37, 34): "O", (38, 34): "O",
                (35, 35): P_L1, (36, 35): P_BASE, (37, 35): P_BASE, (38, 35): P_L1, (39, 35): "O",
                (35, 36): P_L1, (36, 36): P_SH, (37, 36): P_DK, (38, 36): P_L1, (39, 36): "O",
                (35, 37): P_L1, (36, 37): P_DK, (37, 37): P_SH, (38, 37): P_L1, (39, 37): "O",
                (35, 38): P_L1, (36, 38): P_SH, (37, 38): P_DK, (38, 38): P_L1, (39, 38): "O",
                (36, 39): P_L1, (37, 39): P_SH, (38, 39): P_L1, (39, 39): "O",
                (36, 40): P_L1, (37, 40): P_L1, (38, 40): "O",
                (36, 41): "O", (37, 41): "O",
            }
            for (x, y), c in ear_pix.items():
                if c == "O":
                    put_px(idx, [(x + dx, y + dy)], FIXO, F_OUT)
                else:
                    put_px(idx, [(x + dx, y + dy)], PELE, c)
            # bochecha/queixo: leve sombra embaixo do rosto
            put_px(idx, [(x + dx, 45 + dy) for x in range(25, 29)], PELE, P_L1)
    return paint


def paint_torso(fig, arms_m=None):
    view, g = fig.view, fig.g
    nx, ny = fig.neck
    hx, hy = fig.hip

    def tp(pts):
        r = fig.R.rest
        return map_pts(pts, r["neck"], r["hip"], fig.neck, fig.hip)

    def paint(idx, part, vis, interior):
        idx.put(part.mask, PELE, P_BASE)
        top = int(round(ny))
        dx_n = int(round(nx - fig.R.rest["neck"][0]))
        if view in ("front", "back"):
            neck_zone = part.mask & (YY <= top) & (XX >= 27 + dx_n) & (XX <= 36 + dx_n)
            idx.put(neck_zone, PELE, P_L1)
            if view == "front":
                put_px(idx, [(x + dx_n, top - 1) for x in (30, 31, 32, 33)], PELE, P_DK, part.mask)
                put_px(idx, [(x + dx_n, top - 1) for x in (28, 29, 34, 35)], PELE, P_SH, part.mask)
            else:
                put_px(idx, [(x + dx_n, top - 1) for x in range(28, 36)], PELE, P_SH, part.mask)
            body = erode(part.mask) & (YY >= top + 1)
            if arms_m is not None:
                body &= ~arms_m
            idx.put(edge_band(body, (1, 0), 2) & vis, PELE, P_L1)
            if view == "front":
                put_px(idx, tp([(25, 51), (25, 52), (38, 51), (38, 52)]), PELE, P_L1, part.mask)
                put_px(idx, tp([(29, 60), (30, 60), (33, 60), (34, 60)]), PELE, P_L1, part.mask)
                put_px(idx, tp([(31, 67), (32, 67)]), PELE, P_SH, part.mask)
                put_px(idx, tp([(30, 76), (31, 76), (32, 76), (33, 76)]), FIXO, F_OUT)
            else:
                put_px(idx, tp([(31, y) for y in range(53, 62)]), PELE, P_L1, part.mask)       # coluna
                put_px(idx, tp([(28, 55), (27, 56), (35, 55), (36, 56)]), PELE, P_L1, part.mask)  # escápulas
                put_px(idx, tp([(30, 76), (31, 76), (32, 76), (33, 76)]), FIXO, F_OUT)
        else:
            neck_zone = part.mask & (YY <= top)
            idx.put(neck_zone, PELE, P_L1)
            put_px(idx, [(x + dx_n, top - 1) for x in range(28, 33)], PELE, P_SH, part.mask)
            body = interior & (YY >= top + 1)
            L, u, n = bone_frame(fig.neck, fig.hip)
            idx.put(edge_band(body, shadow_dir(u), 2), PELE, P_L1)
            idx.put(edge_band(body, shadow_dir(u), 1) & (YY >= top + 3), PELE, P_SH)
            put_px(idx, tp([(25, 62), (26, 62)] if g == "m" else []), PELE, P_L1, part.mask)
    return paint


ARMPIT = [(24, 55), (24, 56)]
ARMPIT_L1 = [(25, 51), (25, 52)]
CREASE = [(21, 71), (21, 72)]


def paint_arm(fig, limb):
    view = fig.view
    j = limb.j
    rb = rest_bones(fig, limb)

    def paint(idx, part, vis, interior):
        idx.put(part.mask, PELE, P_BASE)
        limb_shade(idx, interior, [(j["sh"], j["el"]), (j["el"], j["wr"]), (j["wr"], j["end"])], rim_of(part))
        if view in ("front", "back"):
            pts = ARMPIT if limb.side == "L" else [(63 - x, y) for x, y in ARMPIT]
            put_px(idx, map_pts(pts, *rb["upper"], j["sh"], j["el"]), PELE, P_DK, part.mask)
            if view == "front":
                pts = ARMPIT_L1 if limb.side == "L" else [(63 - x, y) for x, y in ARMPIT_L1]
                put_px(idx, map_pts(pts, *rb["upper"], j["sh"], j["el"]), PELE, P_L1, part.mask & ~interior)
        if view == "side" and limb.kw.get("hand", "open") == "open":
            put_px(idx, map_pts([(34, 71), (35, 71)], *rest_bones(fig, limb)["hand"], j["wr"], j["end"]), PELE, P_SH,
                   interior)
        if limb.kw.get("hand") == "fist_front":
            (cx, cy), rx, ry = fist_front_geom(limb)
            fm = fist_front_mask(limb) & interior
            idx.put(fm, PELE, P_BASE)
            idx.put(edge_band(fm, (1, 0), 1) | edge_band(fm, (0, 1), 1), PELE, P_SH)
            row = fm & (np.abs(PY - (cy + 0.05 * ry)) < 0.5)                  # dobra dos dedos
            idx.put(row, FIXO, F_OUT)
            for k in (-0.4, 0.1, 0.6):                                          # separação dos dedos (em cima)
                idx.put(fm & (PY < cy + 0.05 * ry) & (PY > cy - 0.75 * ry) & (np.abs(PX - (cx + k * rx)) < 0.5),
                        PELE, P_SH)
            idx.put(fm & (PY > cy + 0.05 * ry) & (PY < cy + 0.6 * ry) & (np.abs(PX - (cx + 0.55 * rx)) < 0.5),
                    PELE, P_SH)
        if limb.kw.get("hand", "open") == "fist":
            L, u, n = bone_frame(j["wr"], j["end"])
            t = ((PX - j["wr"][0]) * u[0] + (PY - j["wr"][1]) * u[1]) / L
            hs = limb.kw.get("fs", 1.0)
            knuck = interior & (t > 0.62 * hs) & (t < 0.62 * hs + 0.16)
            idx.put(knuck & ~edge_band(interior, shadow_dir(u), 1), PELE, P_L1)
        if view == "front" and limb.kw.get("hand", "open") == "open":
            pts = CREASE if limb.side == "L" else [(63 - x, y) for x, y in CREASE]
            put_px(idx, map_pts(pts, *rb["hand"], j["wr"], j["end"]), FIXO, F_OUT, part.mask)
        if limb.far:
            darken_far(idx, part.mask)
    return paint


def paint_leg(fig, limb):
    j = limb.j
    pb = posed_bones(fig, limb)

    def paint(idx, part, vis, interior):
        idx.put(part.mask, PELE, P_BASE)
        limb_shade(idx, interior, [pb["thigh"], pb["shin"], pb["foot"]], rim_of(part))
        if limb.kw.get("foot", "flat") == "sole":
            sm, px = sole_stamp(limb)
            tone = {"O": None, ".": P_BASE, "e": P_EAR, "1": P_L1}
            for (x, y), ch in px.items():
                if ch == "O":
                    idx.ch[y, x], idx.sh[y, x] = FIXO, F_OUT
                else:
                    idx.ch[y, x], idx.sh[y, x] = PELE, tone[ch]
        else:
            sole = interior & (YY >= int(math.floor(j["ank"][1] + 2.5)))
            if fig.view != "side":
                idx.put(sole & ~edge_band(interior, (1, 0), 1), PELE, P_L1)
        if limb.far:
            darken_far(idx, part.mask)
    return paint


# =====================================================================================
# roupa de baixo (fica no corpo base)
# =====================================================================================
def _sym(rows):
    out = dict(rows)
    return out


UW = {
    ("m", "front"): {68: (24, 39), 69: (24, 39), 70: (24, 39), 71: (25, 38), 72: (26, 37), 73: (27, 36), 74: (28, 35),
                     75: (29, 34)},
    ("m", "back"): {68: (24, 39), 69: (24, 39), 70: (24, 39), 71: (24, 39), 72: (25, 38), 73: (26, 37), 74: (27, 36),
                    75: (28, 35)},
    ("m", "side"): {68: (24, 36), 69: (24, 36), 70: (24, 36), 71: (24, 36), 72: (25, 36), 73: (26, 36), 74: (27, 36),
                    75: (28, 36)},
    ("f", "front"): {70: (24, 39), 71: (25, 38), 72: (26, 37), 73: (27, 36), 74: (28, 35), 75: (29, 34)},
    ("f", "back"): {70: (24, 39), 71: (24, 39), 72: (25, 38), 73: (26, 37), 74: (27, 36), 75: (28, 35)},
    ("f", "side"): {70: (24, 37), 71: (24, 37), 72: (25, 37), 73: (26, 37), 74: (27, 37), 75: (28, 36)},
}
BRA = {
    "front": {55: (26, 37), 56: (25, 38), 57: (25, 38), 58: (25, 38)},
    "back": {56: (24, 39), 57: (24, 39)},
    "side": {55: (23, 36), 56: (22, 36), 57: (22, 36), 58: (22, 36)},
}


def underwear_mask(fig, region):
    r = fig.R.rest
    rest_m = rows_mask(UW[(fig.g, fig.view)])
    m = remap(rest_m, r["neck"], r["hip"], fig.neck, fig.hip) & region
    bra = blank()
    if fig.g == "f":
        bra = remap(rows_mask(BRA[fig.view]), r["neck"], r["hip"], fig.neck, fig.hip) & region
    return m, bra


def paint_underwear(fig, briefs, bra):
    view = fig.view

    def paint(idx, part, vis, interior):
        for m in (briefs, bra):
            if not m.any():
                continue
            idx.put(m, FIXO, F_UW)
            top = m & ~shift(m, 0, 1)
            idx.put(top, FIXO, F_UW_DK)
            idx.put(edge_band(m, (1, 0), 1) & ~top, FIXO, F_UW_SH)
            idx.put(m & ~shift(m, 0, -1), FIXO, F_UW_SH)
        if briefs.any():
            r = fig.R.rest
            pts = {"front": [(26, 69), (27, 69)], "back": [(26, 69), (27, 69)], "side": [(26, 69), (27, 69)]}[view]
            if fig.g == "f":
                pts = [(x, y + 2) for x, y in pts]
            put_px(idx, map_pts(pts, r["neck"], r["hip"], fig.neck, fig.hip), FIXO, F_UW_HI, briefs & ~(briefs & ~shift(briefs, 0, 1)))
            if view == "front":  # virilha
                put_px(idx, map_pts([(31, 75), (32, 75)], r["neck"], r["hip"], fig.neck, fig.hip), FIXO, F_OUT)
            if view == "back":   # costura no meio do bumbum
                put_px(idx, map_pts([(31, y) for y in range(71, 76)] + [(32, y) for y in range(71, 76)], r["neck"],
                                    r["hip"], fig.neck, fig.hip), FIXO, F_UW_SH, briefs)
        if bra.any():
            r = fig.R.rest
            if view == "front":   # vão entre os bojos + brilho em cima de cada bojo
                put_px(idx, map_pts([(31, 55), (32, 55)], r["neck"], r["hip"], fig.neck, fig.hip), FIXO, F_OUT)
                put_px(idx, map_pts([(31, 56), (32, 56)], r["neck"], r["hip"], fig.neck, fig.hip), FIXO, F_UW_DK, bra)
                put_px(idx, map_pts([(27, 56), (28, 56), (34, 56), (35, 56)], r["neck"], r["hip"], fig.neck, fig.hip),
                       FIXO, F_UW_HI, bra)
            elif view == "side":
                put_px(idx, map_pts([(23, 56), (24, 56)], r["neck"], r["hip"], fig.neck, fig.hip), FIXO, F_UW_HI, bra)
    return paint


# =====================================================================================
# camada CORPO completa
# =====================================================================================
def body_parts(fig):
    parts = []
    tn, torso, neck = neck_torso_mask(fig)
    head = head_mask(fig)
    arm_ms = {id(a): arm_mask(fig, a, hand_scale=a.kw.get("fs", 1.0)) for a in fig.limbs if a.kind == "arm"}
    arms_front = blank()
    for a in fig.limbs:
        if a.kind == "arm" and a.plane >= CORPO:
            arms_front |= arm_ms[id(a)]
    parts.append(Part("tronco", tn, 20, CORPO, paint_torso(fig, arms_front), soft=ALL))
    region = tn.copy()
    legs = [l for l in fig.limbs if l.kind == "leg"]
    arms = [l for l in fig.limbs if l.kind == "arm"]
    for i, lg in enumerate(legs):
        m = leg_mask(fig, lg)
        if fig.view == "side":
            z = lg.z if lg.z is not None else (5 if lg.far else 22)
            j = lg.j
            t, s = bone_ts(j["hip"], j["knee"])
            soft = (t < 0.30)
            if not lg.far:
                region |= m & (t < 0.6)
        else:
            z = lg.z if lg.z is not None else {TRAS: 3, CORPO: 10 + i, FRENTE: 60 + i, TOPO: 80 + i}[lg.plane]
            soft = None
        m &= YY <= GROUND           # nada passa do chão (pé inclinado não afunda 1 px)
        parts.append(Part(f"perna_{lg.side}", m, z, lg.plane, paint_leg(fig, lg), soft=soft))
    briefs, bra = underwear_mask(fig, region)
    parts.append(Part("roupa_baixo", briefs | bra, 25, CORPO, paint_underwear(fig, briefs, bra), soft=ALL))
    parts.append(Part("cabeca", head, 40, CORPO, paint_head(fig), soft=ALL))
    for i, am in enumerate(arms):
        m = arm_ms[id(am)]
        j = am.j
        t, s = bone_ts(j["sh"], j["el"])
        soft_t = 0.72 if fig.view in ("front", "back") else 0.3
        own = seg_owner([(j["sh"], j["el"]), (j["el"], j["wr"]), (j["wr"], j["end"])])
        soft = (t < soft_t) & (t > -0.6) & (own == 0)
        if am.z is not None:
            z = am.z
        elif fig.view == "side":
            z = 1 if am.far else 50
        else:
            z = {TRAS: 2, CORPO: 30, FRENTE: 50, TOPO: 70}[am.plane] + i
        parts.append(Part(f"braco_{am.side}", m, z, am.plane, paint_arm(fig, am), soft=soft))
    return parts
