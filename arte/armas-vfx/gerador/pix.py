"""Ferramentas de pixel art feitas por código: amostragem com supersampling, contorno, pontilhado (dither) e ruído.

Tudo trabalha em arrays numpy RGBA (altura x largura x 4, uint8). Coordenadas de tela: x para a direita, y para baixo.
"""
import math

import numpy as np
from PIL import Image

CONTORNO = (20, 16, 34)          # o mesmo contorno do personagem chibi
LUZ = (-0.55, -0.83)             # luz vindo de cima e um pouco da esquerda (como no boneco)

# Matriz de Bayer 4x4 (pontilhado ordenado): limiar de 0 a 1 por pixel.
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0


def blank(w, h):
    return np.zeros((h, w, 4), np.uint8)


def bayer(w, h, ox=0, oy=0):
    ys, xs = np.mgrid[0:h, 0:w]
    return BAYER4[(ys + oy) % 4, (xs + ox) % 4]


def save(arr, path):
    Image.fromarray(arr, "RGBA").save(path, optimize=True)


def rasterize(sample, w, h, ox, oy, ang_deg, ss=4, cover=0.45):
    """Desenha um objeto definido em coordenadas LOCAIS (u ao longo do eixo, v de lado) girado de `ang_deg`.

    sample(u, v, lado_claro) -> cor RGB ou None. (ox, oy) = onde fica u = v = 0 no quadro.
    Cada pixel olha ss x ss pontos; vira opaco se pelo menos `cover` deles tem cor, e fica com a cor mais comum.
    """
    a = math.radians(ang_deg)
    du = (math.cos(a), math.sin(a))
    dv = (-math.sin(a), math.cos(a))
    lit_pos = (dv[0] * LUZ[0] + dv[1] * LUZ[1]) > 0      # o lado v > 0 está virado para a luz?
    out = blank(w, h)
    offs = [(i + 0.5) / ss for i in range(ss)]
    for py in range(h):
        for px in range(w):
            votes = {}
            n = 0
            for sy in offs:
                for sx in offs:
                    x = px + sx - ox
                    y = py + sy - oy
                    u = x * du[0] + y * du[1]
                    v = x * dv[0] + y * dv[1]
                    c = sample(u, v, (v > 0) == lit_pos)
                    if c is not None:
                        votes[c] = votes.get(c, 0) + 1
                        n += 1
            if n >= cover * ss * ss:
                c = max(votes.items(), key=lambda kv: kv[1])[0]
                out[py, px] = (*c, 255)
    return out


def outline(arr, color=CONTORNO, diagonal=False):
    """Contorno de 1 pixel em volta de tudo que é opaco (vizinhos de 4, ou de 8 com `diagonal`)."""
    op = arr[..., 3] > 0
    ring = np.zeros_like(op)
    shifts = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonal:
        shifts += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    for dy, dx in shifts:
        ring |= np.roll(np.roll(op, dy, 0), dx, 1) & ~_edge_mask(op.shape, dy, dx)
    ring &= ~op
    out = arr.copy()
    out[ring] = (*color, 255)
    return out


def _edge_mask(shape, dy, dx):
    """Pixels que o np.roll trouxe do outro lado (não podem virar contorno)."""
    m = np.zeros(shape, bool)
    if dy > 0:
        m[:dy, :] = True
    elif dy < 0:
        m[dy:, :] = True
    if dx > 0:
        m[:, :dx] = True
    elif dx < 0:
        m[:, dx:] = True
    return m


def ramp_pick(ramp, t):
    """Tom da rampa (lista do mais escuro ao mais claro) para t de 0 a 1."""
    i = int(round(max(0.0, min(1.0, t)) * (len(ramp) - 1)))
    return ramp[i]


def dissolve(w, h, seed=0, scale=0.38):
    """Limiar de sumiço em "manchas" (0..1): some em pedaços orgânicos, não em xadrez."""
    x, y = np.mgrid[0:h, 0:w].astype(float)
    return fbm(y * scale, x * scale, seed=seed, octaves=2) * 0.85 + hash_noise(y * 1.7, x * 1.7, seed + 5) * 0.15


def paint_field(arr, field, ramp, alpha=None, dither=False, ox=0, oy=0, seed=0):
    """Pinta um campo contínuo (0..1, NaN = vazio) com uma rampa de cores, em faixas (ou pontilhando, com dither).

    alpha (opcional, 0..1): onde for menor que o limiar o pixel fica vazio. O limiar é em manchas (dissolve),
    então o efeito some se desfazendo, sem semitransparência e sem xadrez. Só pinta onde o campo é finito.
    """
    h, w = field.shape
    th = bayer(w, h, ox, oy) if dither else np.full((h, w), 0.5)
    n = len(ramp)
    f = np.clip(np.nan_to_num(field, nan=-1), 0, 1) * (n - 1)
    lo = np.floor(f).astype(int)
    frac = f - lo
    idx = np.clip(lo + (frac > th), 0, n - 1)
    ok = np.isfinite(field)
    if alpha is not None:
        ok &= alpha > dissolve(w, h, seed)
    pal = np.array([(*c, 255) for c in ramp], np.uint8)
    arr[ok] = pal[idx[ok]]
    return arr


def over(dst, src):
    """Cola src (pixels opacos) por cima de dst."""
    m = src[..., 3] > 0
    dst[m] = src[m]
    return dst


def hash_noise(x, y, seed=0):
    """Ruído de valor (0..1) suave, para bordas orgânicas (fogo, fumaça, água)."""
    def h(ix, iy):
        n = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
        n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    a, b = h(x0, y0), h(x0 + 1, y0)
    c, d = h(x0, y0 + 1), h(x0 + 1, y0 + 1)
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy


def fbm(x, y, seed=0, octaves=3):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * hash_noise(x * (2 ** o), y * (2 ** o), seed + o * 17)
        norm += amp
        amp *= 0.5
    return total / norm


def grid(w, h, cx, cy):
    """Coordenadas (x, y) de cada pixel em relação ao centro (cx, cy), no centro do pixel."""
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return xs + 0.5 - cx, ys + 0.5 - cy


def strip(frames):
    """Quadros lado a lado (folha de sprite numa linha só)."""
    h = max(f.shape[0] for f in frames)
    w = sum(f.shape[1] for f in frames)
    out = blank(w, h)
    x = 0
    for f in frames:
        out[:f.shape[0], x:x + f.shape[1]] = f
        x += f.shape[1]
    return out


def enlarge(arr, k, bg=None):
    img = Image.fromarray(arr, "RGBA").resize((arr.shape[1] * k, arr.shape[0] * k), Image.NEAREST)
    if bg is None:
        return img
    back = Image.new("RGBA", img.size, bg)
    back.alpha_composite(img)
    return back
