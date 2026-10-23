"""Geometria básica do boneco chibi (canvas 64x96, coordenadas do canvas).

Convenção: o pixel (x, y) ocupa o quadrado [x, x+1) x [y, y+1); um pixel entra numa forma
se o CENTRO dele (x+0.5, y+0.5) estiver dentro. Isso deixa as bordas limpas e simétricas.
"""
import math

import numpy as np

W, H = 64, 96
YY, XX = np.mgrid[0:H, 0:W]
PY, PX = YY + 0.5, XX + 0.5


def blank():
    return np.zeros((H, W), bool)


def shift(m, dx, dy):
    """Desloca a máscara: o[y, x] = m[y - dy, x - dx]."""
    o = np.zeros_like(m)
    ys = slice(max(dy, 0), H + min(dy, 0))
    yd = slice(max(-dy, 0), H + min(-dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0))
    xd = slice(max(-dx, 0), W + min(-dx, 0))
    o[ys, xs] = m[yd, xd]
    return o


def erode(m):
    return m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)


def dilate(m):
    return m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


def ring(m):
    return m & ~erode(m)


def rows_mask(spec, mirror=False):
    """{y: (x0, x1)} inclusivo -> máscara. mirror espelha em x -> 63 - x."""
    m = blank()
    for y, (a, b) in spec.items():
        if 0 <= y < H:
            m[y, max(a, 0):min(b, W - 1) + 1] = True
    return m | m[:, ::-1] if mirror else m


def poly(pts):
    """Polígono em coordenadas contínuas do canvas (par/ímpar)."""
    inside = blank()
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cond = (y1 > PY) != (y2 > PY)
        xint = (x2 - x1) * (PY - y1) / ((y2 - y1) if y2 != y1 else 1e-9) + x1
        inside ^= cond & (PX < xint)
    return inside


def ellipse(cx, cy, rx, ry):
    return ((PX - cx) / rx) ** 2 + ((PY - cy) / ry) ** 2 <= 1.0


def pts_mask(pts):
    m = blank()
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H:
            m[int(y), int(x)] = True
    return m


# ---------------- ossos ----------------
def bone_frame(A, B):
    ax, ay = A
    dx, dy = B[0] - ax, B[1] - ay
    L = math.hypot(dx, dy) or 1e-6
    u = (dx / L, dy / L)
    n = (u[1], -u[0])        # osso apontando pra baixo -> n aponta pra direita da tela
    return L, u, n


def bone_ts(A, B):
    """(t, s) de cada pixel em relação ao osso A->B (t normalizado, s em pixels)."""
    L, u, n = bone_frame(A, B)
    vx, vy = PX - A[0], PY - A[1]
    return (vx * u[0] + vy * u[1]) / L, vx * n[0] + vy * n[1]


def sweep(A, B, prof):
    """Varre um perfil ao longo do osso. prof = [(t, wl, wr), ...] ordenado por t;
    wl = largura pro lado -n (esquerda da tela num osso que desce), wr = pro lado +n."""
    t, s = bone_ts(A, B)
    ts = np.array([p[0] for p in prof])
    wl = np.interp(t, ts, [p[1] for p in prof])
    wr = np.interp(t, ts, [p[2] for p in prof])
    return (t >= ts[0]) & (t <= ts[-1]) & (s >= -wl) & (s <= wr)


def profile_from_rows(rows, A, B):
    """Perfil (t, wl, wr) a partir de uma tabela {y: (x0, x1)} desenhada com o osso em repouso A->B.
    Reproduz a tabela exatamente quando o osso está na posição de repouso."""
    L, u, n = bone_frame(A, B)
    cos = abs(u[1]) if abs(u[1]) > 1e-6 else 1.0
    out = []
    for y in sorted(rows):
        x0, x1 = rows[y]
        t = ((y + 0.5) - A[1]) / (B[1] - A[1])
        xb = A[0] + t * (B[0] - A[0])
        out.append((t, (xb - x0) * cos, (x1 + 1 - xb) * cos))
    return out


def ik(a, b, l1, l2, bend=1, stretch=False):
    """IK de 2 ossos. bend=+1/-1 escolhe de que lado o joelho/cotovelo dobra (sentido do giro).
    Se o alvo estiver longe demais, estica (aponta pro alvo)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dy) or 1e-6
    if d >= l1 + l2 - 1e-3:
        if stretch:
            k = l1 / (l1 + l2)
            return (a[0] + dx * k, a[1] + dy * k), b
        ux, uy = dx / d, dy / d
        return (a[0] + ux * l1, a[1] + uy * l1), (a[0] + ux * (l1 + l2), a[1] + uy * (l1 + l2))
    cosA = max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
    ang = math.acos(cosA) * bend
    ux, uy = dx / d, dy / d
    ca, sa = math.cos(ang), math.sin(ang)
    j = (a[0] + (ux * ca - uy * sa) * l1, a[1] + (ux * sa + uy * ca) * l1)
    return j, b


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])
