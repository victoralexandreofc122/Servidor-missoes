"""Efeitos visuais (VFX) dos golpes em pixel art: folhas de 4 a 8 quadros, lado a lado.

Escala: na maioria das folhas 1 pixel do efeito = 2 pixels do boneco (px = 2): efeitos grandes ficam leves e o
"grão" combina com o boneco. As pequenas (kunai voando) usam px = 1.
Direção: os efeitos que têm direção (corte, água, raio, sombra, projéteis) são desenhados apontando para a
DIREITA; o jogo gira na hora. Raio e sombra têm o comprimento máximo: o jogo corta no ponto onde bateram.
"""
import math

import numpy as np

import armas
from pix import CONTORNO, bayer, blank, fbm, grid, hash_noise, outline, paint_field, rasterize

TILE = 92 / 1.5 / 2          # pixels de efeito (px = 2) por casa: o boneco tem 1,5 casa de altura e 92 px

FOGO = [(92, 18, 30), (156, 34, 30), (214, 70, 34), (246, 132, 44), (255, 196, 72), (255, 236, 150), (255, 252, 232)]
FUMACA = [(46, 40, 52), (72, 64, 76), (104, 96, 104), (140, 132, 136), (178, 172, 172)]
AGUA = [(18, 46, 112), (30, 90, 172), (54, 142, 222), (112, 196, 246), (188, 234, 255), (248, 254, 255)]
RAIO = [(44, 54, 150), (70, 112, 232), (120, 186, 255), (204, 238, 255), (255, 255, 255)]
SOMBRA = [(8, 5, 16), (24, 15, 38), (46, 30, 72), (82, 56, 124), (134, 100, 196)]
ILUSAO = [(70, 24, 104), (116, 52, 176), (170, 92, 232), (222, 160, 255), (255, 228, 255)]
CURA = [(24, 96, 56), (46, 154, 78), (96, 212, 104), (170, 244, 150), (238, 255, 222)]
TERRA = [(58, 40, 30), (96, 68, 46), (140, 104, 70), (184, 150, 104), (218, 196, 150)]
POEIRA = [(112, 98, 88), (150, 136, 122), (190, 178, 162), (226, 218, 204)]
CORTE = [(206, 168, 104), (240, 214, 140), (255, 244, 200), (255, 255, 255)]
SOCO = [(150, 52, 22), (222, 104, 32), (255, 172, 52), (255, 230, 120), (255, 255, 240)]


def rng(seed):
    return np.random.default_rng(seed)


def ease_out(t):
    return 1 - (1 - t) ** 2


def disc(arr, cx, cy, r, color):
    x, y = grid(arr.shape[1], arr.shape[0], cx, cy)
    arr[np.hypot(x, y) <= r] = (*color, 255)


def dot(arr, x, y, color):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < arr.shape[1] and 0 <= y < arr.shape[0]:
        arr[y, x] = (*color, 255)


def cross(arr, x, y, color, arm=1, core=None):
    for d in range(-arm, arm + 1):
        dot(arr, x + d, y, color)
        dot(arr, x, y + d, color)
    if core:
        dot(arr, x, y, core)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy or 1e-9
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1)
    return np.hypot(px - (ax + vx * t), py - (ay + vy * t))


def poly_dist(px, py, pts):
    d = np.full(px.shape, np.inf)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        d = np.minimum(d, seg_dist(px, py, ax, ay, bx, by))
    return d


# ------------------------------------------------------------------ Ataque Básico: corte em arco

def slash():
    W, H, AX, AY = 80, 108, 22, 54
    R, d = 1.55 * TILE, 13.0
    x, y = grid(W, H, AX, AY)
    rho = np.hypot(x, y)
    phi = np.degrees(np.arctan2(y, x))
    frames = []
    # (início do arco, fim, espessura máxima): o golpe varre de cima para baixo e depois afina e some
    for (a0, a1, thick, cut) in [(-86, -36, 7, 0), (-86, 30, 11, 0), (-86, 86, 12, 0), (-50, 86, 8, 0.3), (6, 86, 4, 0.55)]:
        f = blank(W, H)
        Rin = R - thick + d
        rin = np.hypot(x + d, y)
        band = (rho <= R) & (rin >= Rin) & (phi >= a0) & (phi <= a1)
        t = np.clip((rho - (Rin - d)) / thick, 0, 1)                   # 0 por dentro, 1 na borda de fora
        lead = np.clip((phi - a0) / max(1, a1 - a0), 0, 1)
        keep = band & (t >= cut * (1 - lead))                          # a cauda afina primeiro
        tone = np.where(t > 0.82, 1.0, np.where(t > 0.5, 0.7, np.where(t > 0.25, 0.4, 0.05)))
        if cut > 0.4:
            tone = tone * 0.75
        paint_field(f, np.where(keep, tone, np.nan), CORTE)
        if cut < 0.4:                                                  # riscos de velocidade por fora
            sl = (np.abs(rho - (R + 4)) < 0.7) & (phi > a0 + 16) & (phi < a1 - 8) & ((np.floor((phi + 90) / 11) % 3) == 1)
            f[sl & (f[..., 3] == 0)] = (*CORTE[2], 255)
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=45, px=2, gira=True)


# ------------------------------------------------------------------ faísca de acerto (ataque, kunai)

def hit():
    S = 32
    c = S / 2
    frames = []
    x, y = grid(S, S, c, c)
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    for k in range(5):
        f = blank(S, S)
        if k == 0:
            for i in range(-5, 6):
                dot(f, c - 0.5 + i, c - 0.5, SOCO[3 if abs(i) > 2 else 4])
                dot(f, c - 0.5, c - 0.5 + i, SOCO[3 if abs(i) > 2 else 4])
            disc(f, c, c, 2.2, SOCO[4])
        else:
            L = [10, 12, 13, 13][k - 1]
            inner = [0, 6, 9, 11][k - 1]
            ray = np.cos(4 * a) > 0.86
            ray2 = np.cos(4 * (a - math.pi / 4)) > 0.9
            m = ((ray & (r <= L) & (r >= inner)) | (ray2 & (r <= L * 0.6) & (r >= inner * 0.7)))
            tone = np.clip(1 - (r - inner) / max(1, L - inner), 0, 1)
            paint_field(f, np.where(m, tone * 0.9 + 0.1, np.nan), SOCO[1:], alpha=np.where(m, 1.0 - 0.25 * (k - 1), 0))
            if k == 1:
                disc(f, c, c, 3.2, SOCO[4])
            if k == 2:
                ring = np.abs(r - 8) < 0.7
                f[ring & (f[..., 3] == 0)] = (*SOCO[3], 255)
        frames.append(f)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=40, px=2)


# ------------------------------------------------------------------ Taijutsu: impacto do golpe

def punch():
    S = 60
    c = S / 2
    x, y = grid(S, S, c, c)
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    frames = []
    for k in range(6):
        f = blank(S, S)
        if k == 0:
            disc(f, c, c, 6, SOCO[4])
            spikes = (np.cos(4 * a) > 0.97) & (r < 15)
            f[spikes & (f[..., 3] == 0)] = (*SOCO[3], 255)
        elif k <= 2:
            R = 14 if k == 1 else 19
            star = R * (0.62 + 0.38 * (np.cos(8 * a) > 0.5)) * (0.9 + 0.2 * hash_noise(a * 3 + 9, k))
            m = r <= star
            paint_field(f, np.where(m, 1 - r / R, np.nan), SOCO)
            if k == 2:
                ring = (np.abs(r - 22) < 1.3)
                paint_field(f, np.where(ring & (f[..., 3] == 0), 0.85, np.nan), SOCO)
        elif k <= 3:
            ring = np.abs(r - 25) < 1.0
            m = ring & (hash_noise(a * 5 + 3, 4) > 0.3)
            paint_field(f, np.where(m, 0.7, np.nan), SOCO, alpha=np.where(m, 0.85, 0))
            for i in range(8):
                ang = i * math.pi / 4 + 0.3
                dot(f, c + math.cos(ang) * 20, c + math.sin(ang) * 20, SOCO[2])
                dot(f, c + math.cos(ang) * 21, c + math.sin(ang) * 21, SOCO[1])
        else:
            # poeira que sobra no chão
            g = rng(40 + k)
            alpha = 0.8 if k == 4 else 0.4
            for i in range(7):
                ang = g.uniform(0, 2 * math.pi)
                rr = g.uniform(10, 22) + (k - 4) * 3
                px, py = c + math.cos(ang) * rr, c + math.sin(ang) * rr * 0.6 + 6
                xx, yy = grid(S, S, px, py)
                d = np.hypot(xx, yy)
                rad = g.uniform(2.5, 4.5)
                m = d <= rad
                paint_field(f, np.where(m & (f[..., 3] == 0), 1 - np.clip(yy / rad + 0.5, 0, 1), np.nan), POEIRA, alpha=np.where(m, alpha, 0))
        frames.append(f)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=55, px=2)


# ------------------------------------------------------------------ nuvens: poeira (avanço) e fumaça (Teleporte)

def puffs(W, H, cx, cy, frames_n, n, spread, rise, size, palette, seed, grow=1.0):
    g = rng(seed)
    parts = [(g.uniform(-1, 1) * spread[0], g.uniform(-1, 1) * spread[1], g.uniform(0.7, 1.2)) for _ in range(n)]
    frames = []
    for k in range(frames_n):
        t = k / (frames_n - 1)
        f = blank(W, H)
        # cresce e sobe; no fim encolhe e se desfaz em pedaços
        scale = 0.45 + grow * 0.75 * ease_out(min(1, t * 1.4))
        if t > 0.6:
            scale *= 1 - (t - 0.6) * 0.9
        alpha = 1.0 if t < 0.5 else max(0.0, 1 - (t - 0.5) / 0.5)
        for (px, py, s) in sorted(parts, key=lambda p: p[1]):
            rad = size * s * scale
            ox = cx + px * (0.5 + 0.7 * ease_out(t))
            oy = cy + py * (0.5 + 0.7 * ease_out(t)) - rise * t
            x, y = grid(W, H, ox, oy)
            d = np.hypot(x, y)
            m = d <= rad
            light = np.clip(0.95 - (x + y) / (rad * 2.4) - d / (rad * 3.5), 0, 1)   # luz de cima/esquerda
            paint_field(f, np.where(m, light, np.nan), palette, alpha=np.where(m, alpha + 0.12, 0), seed=seed + k)
        if alpha > 0.95:
            f = outline(f, palette[0])
        frames.append(f)
    return frames


def dust():
    W, H = 44, 30
    frames = puffs(W, H, W / 2, H - 8, 6, 5, (9, 2), 6, 5.0, POEIRA, 7)
    return frames, dict(quadro=[W, H], ancora=[W // 2, H - 6], ms=60, px=2)


def smoke():
    S = 56
    frames = puffs(S, S, S / 2, S / 2 + 2, 7, 7, (10, 7), 6, 7.5, [(150, 156, 176), (190, 196, 212), (222, 228, 238), (246, 248, 252)], 11)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=55, px=2)


# ------------------------------------------------------------------ Fogo: bola de fogo e explosão

def fireball():
    W, H, AX, AY = 46, 28, 33, 14
    frames = []
    x, y = grid(W, H, AX, AY)
    for k in range(4):
        f = blank(W, H)
        n = fbm((x - k * 5.0) * 0.18, y * 0.22, seed=3, octaves=2)
        # cauda: se estreita para trás (para a esquerda), tremendo com o ruído
        back = np.clip(-x, 0, None)
        width = 6.2 * np.clip(1 - back / 30, 0, 1) ** 0.8 + (n - 0.5) * 3.0
        tail = (x <= 0) & (np.abs(y + np.sin(back * 0.35 + k * 1.6) * back * 0.06) <= width)
        ball = np.hypot(x, y * 1.08) <= 6.6 + (n - 0.5) * 1.6
        m = tail | ball
        heat = np.where(ball, 1 - np.hypot(x, y) / 9.5, 0.75 * np.clip(1 - back / 30, 0, 1) - np.abs(y) / 16) + (n - 0.5) * 0.25
        paint_field(f, np.where(m, np.clip(heat * 1.05 + 0.08, 0, 1), np.nan), FOGO)
        disc(f, AX + 1, AY - 1, 2.0, FOGO[6])
        g = rng(80 + k)
        for i in range(4):                                          # brasas soltas atrás
            dot(f, AX - g.uniform(18, 40), AY + g.uniform(-6, 6), FOGO[g.integers(3, 6)])
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=70, px=2, gira=True)


def cloud(W, H, blobs, seed):
    """Nuvem feita de bolotas fundidas. Devolve (cobertura 0..1 da bolota dominante, luz 0..1, índice da bolota)."""
    cov = np.zeros((H, W))
    light = np.zeros((H, W))
    idx = np.full((H, W), -1)
    for i, (cx, cy, rad) in enumerate(blobs):
        x, y = grid(W, H, cx, cy)
        d = np.hypot(x, y)
        c = 1 - d / rad
        better = c > cov
        lt = np.clip(0.9 - (x + y) / (rad * 2.6) - d / (rad * 3.2), 0, 1)
        cov = np.where(better, c, cov)
        light = np.where(better, lt, light)
        idx = np.where(better, i, idx)
    n = fbm(*np.mgrid[0:H, 0:W][::-1] * 0.2, seed=seed, octaves=2)
    cov = np.where(idx >= 0, cov + (n - 0.5) * 0.12, 0)
    return cov, light, idx


def explosion():
    W, H, AX, AY = 144, 138, 72, 80
    R = 2 * TILE                                                    # raio real da explosão (2 casas)
    x, y = grid(W, H, AX, AY)
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    frames = []
    # quadros 0 a 2: clarão e a bola de fogo crescendo até o raio real (com a onda de choque marcando a área)
    for k, st in enumerate([dict(r=0.25, heat=1.2), dict(r=0.6, heat=1.05), dict(r=0.86, heat=0.95, ring=True)]):
        f = blank(W, H)
        rr = st["r"] * R
        n = fbm(x * 0.09 + k * 0.7, y * 0.09 - k * 0.5, seed=21, octaves=3)
        edge = rr * (0.86 + 0.28 * n)
        d = r
        body = d <= edge
        q = np.clip(d / (edge + 1e-9), 0, 1)
        heat = st["heat"] * (1.05 - q * 0.9) + (n - 0.5) * 0.35
        paint_field(f, np.where(body, np.clip(heat, 0, 1), np.nan), FOGO)
        if k == 0:
            rays = (np.cos(6 * a + 0.4) > 0.94) & (r < R * 0.55) & (r > rr * 0.6)
            paint_field(f, np.where(rays & (f[..., 3] == 0), 0.95, np.nan), FOGO)
            disc(f, AX, AY, rr * 0.55, FOGO[6])
        if st.get("ring"):
            ring = (np.abs(r - R) < 1.1) & (f[..., 3] == 0)
            paint_field(f, np.where(ring, 0.85, np.nan), FOGO)
        frames.append(f)
    # quadros 3 a 7: a bola se quebra em bolotas que esfriam (o fogo vira fumaça de fora para dentro),
    # sobem e se desfazem. As bolotas se fundem numa nuvem só, com contorno só por fora.
    g = rng(77)
    blobs = []
    for i in range(12):
        ang = g.uniform(0, 2 * math.pi)
        dist = R * math.sqrt(g.uniform(0.0, 0.55))
        blobs.append((math.cos(ang) * dist, math.sin(ang) * dist * 0.85, R * g.uniform(0.24, 0.36), g.uniform(0.7, 1.3)))
    for k in range(3, 8):
        t = (k - 3) / 4                                             # 0..1
        f = blank(W, H)
        if k == 3:
            ring = (np.abs(r - R) < 1.0) & (hash_noise(a * 6, 3) > 0.35)
            paint_field(f, np.where(ring, 0.5, np.nan), FOGO)
        spread = 1.0 + 0.2 * t
        placed = [(AX + bx * spread, AY + by * spread - t * 24 * lift, rad * (1.05 - 0.5 * t)) for (bx, by, rad, lift) in blobs]
        cov, light, idx = cloud(W, H, placed, seed=k)
        body = cov > 0
        fire_core = 0.95 - t * 2.4                                  # o fogo ocupa o miolo e some com o tempo,
        fire = body & (cov + (1 - light) * 0.35 * (t > 0) > 1.0 - max(-0.2, fire_core))   # ficando como brasa embaixo
        alpha = 1.0 if t < 0.5 else 1 - (t - 0.5) * 1.7
        layer = blank(W, H)
        heat = np.clip(cov * 0.8 + light * 0.35 - t * 0.25, 0, 0.92)
        paint_field(layer, np.where(fire, heat, np.nan), FOGO, alpha=np.where(fire, alpha + 0.1, 0), seed=k)
        smoke = body & ~fire
        paint_field(layer, np.where(smoke, np.clip(light * 0.9 + 0.1 * t, 0, 1), np.nan), FUMACA, alpha=np.where(smoke, alpha + 0.1, 0), seed=k + 9)
        if alpha > 0.9:
            layer = outline(layer, (52, 22, 30) if t < 0.3 else FUMACA[0])
        f[layer[..., 3] > 0] = layer[layer[..., 3] > 0]
        if k <= 5:                                                  # brasas voando
            gg = rng(200 + k)
            for i in range(14):
                ang = gg.uniform(0, 2 * math.pi)
                dist = R * gg.uniform(0.8, 1.12) + (k - 3) * 4
                dot(f, AX + math.cos(ang) * dist, AY + math.sin(ang) * dist - (k - 3) * 5, FOGO[gg.integers(3, 6)])
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=65, px=2, raio=2)


# ------------------------------------------------------------------ Água: cone de 90° e 4 casas

def water():
    RANGE = 4 * TILE
    W, H, AX, AY = int(RANGE + 12), int(RANGE * 1.48), 4, int(RANGE * 0.74)
    x, y = grid(W, H, AX, AY)
    rho = np.hypot(x, y)
    phi = np.arctan2(y, x)
    frames = []
    fronts = [0.3, 0.52, 0.72, 0.87, 0.97, 1.0]
    for k, fr in enumerate(fronts):
        f = blank(W, H)
        rf = fr * RANGE
        n = fbm(rho * 0.07 - k * 0.6, phi * 3.0, seed=5, octaves=2)
        n2 = fbm(x * 0.15, y * 0.15 + k, seed=8, octaves=2)
        half = math.radians(45) * (0.88 + 0.22 * n)
        inside = (np.abs(phi) <= half) & (rho <= rf + (n - 0.5) * 10) & (rho > 5)
        band = 26 + 18 * fr
        depth = (rf - rho) / band                                       # 0 na frente da onda, cresce para trás
        wob = rho * 0.30 - k * 2.0 + (n2 - 0.5) * 3.5
        lines = np.sin(wob) > 0.78                                      # cristas das ondas (tremidas)
        tone = np.clip(0.92 - depth * 0.42 + lines * 0.3, 0, 1)
        tail = 1.15 - depth * 0.55                                      # atrás da onda, a água rareia
        fade = 1.0 if k < 4 else (0.75 if k == 4 else 0.4)
        alpha = np.where(inside, np.clip(tail, 0, 1) * fade, 0)
        paint_field(f, np.where(inside, tone, np.nan), AGUA, alpha=alpha, seed=k)
        crest = inside & (depth < 0.1) & (f[..., 3] > 0)                # espuma na frente
        f[crest] = (*AGUA[5], 255)
        g = rng(300 + k)
        for i in range(int(30 * fade)):                                 # respingos na frente e nas bordas
            if i % 3 == 0:
                ang = g.uniform(-0.8, 0.8)
                dist = rf * g.uniform(0.95, 1.12)
            else:
                ang = (1 if g.random() < 0.5 else -1) * g.uniform(0.82, 1.0) * math.pi / 4
                dist = rf * g.uniform(0.35, 1.0)
            col = AGUA[g.integers(3, 6)]
            px, py = AX + math.cos(ang) * dist, AY + math.sin(ang) * dist
            dot(f, px, py, col)
            if i % 4 == 0:
                dot(f, px + 1, py, col)
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=70, px=2, gira=True, alcance=4)


# ------------------------------------------------------------------ Relâmpago: raio em linha e choque

def bolt_points(g, length, jag, step=(9, 15)):
    pts = [(0.0, 0.0)]
    xx = 0.0
    while xx < length:
        xx = min(length, xx + g.uniform(*step))
        amp = jag * min(1.0, xx / 20)
        pts.append((xx, g.uniform(-amp, amp) if xx < length else 0.0))
    return pts


def lightning():
    L = 6.2 * TILE
    W, H, AX, AY = int(L + 4), 30, 0, 15
    x, y = grid(W, H, AX, AY)
    frames = []
    for k in range(4):
        g = rng(500 + k)
        f = blank(W, H)
        main = bolt_points(g, L, 6.5)
        d = poly_dist(x, y, main)
        for _ in range(3):                                           # galhos
            i = g.integers(2, len(main) - 2)
            bx, by = main[i]
            ang = g.uniform(-0.9, 0.9)
            br = [(bx, by)]
            for s in range(3):
                bx += math.cos(ang) * g.uniform(5, 9)
                by += math.sin(ang) * g.uniform(5, 9) + g.uniform(-2, 2)
                br.append((bx, by))
            d = np.minimum(d, poly_dist(x, y, br) + 0.6)
        glow = 1.0 if k < 3 else 0.5
        field = np.where(d < 4.6, np.clip(1 - d / 4.6, 0, 1), np.nan)
        alpha = np.where(d < 1.7, 1.0, np.where(d < 3.0, 0.85 * glow, 0.35 * glow))
        paint_field(f, field, RAIO, alpha=alpha)
        f[(d < 0.75)] = (*RAIO[4], 255)
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=45, px=2, gira=True, linha=True)


def spark():
    S = 46
    c = S / 2
    x, y = grid(S, S, c, c)
    frames = []
    for k in range(5):
        g = rng(600 + k)
        f = blank(S, S)
        d = np.full(x.shape, np.inf)
        n = 7 if k < 3 else 4
        for i in range(n):
            ang = i * 2 * math.pi / n + g.uniform(-0.3, 0.3)
            L = [9, 15, 19, 16, 12][k]
            pts = [(c, c)]
            for s in range(1, 4):
                rr = L * s / 3
                jit = g.uniform(-2.5, 2.5)
                pts.append((c + math.cos(ang) * rr - math.sin(ang) * jit, c + math.sin(ang) * rr + math.cos(ang) * jit))
            start = 0 if k < 3 else 2
            d = np.minimum(d, poly_dist(x + c, y + c, pts[start:]))
        alpha_k = [1, 1, 0.9, 0.6, 0.35][k]
        paint_field(f, np.where(d < 3.2, 1 - d / 3.2, np.nan), RAIO, alpha=np.where(d < 1.2, alpha_k, 0.5 * alpha_k))
        if k < 3:
            disc(f, c, c, [4, 5.5, 3][k], RAIO[4])
        frames.append(f)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=45, px=2)


# ------------------------------------------------------------------ Sombra: linha no chão e amarra

def shadow():
    L = 5.7 * TILE
    W, H, AX, AY = int(L + 4), 22, 0, 11
    x, y = grid(W, H, AX, AY)
    frames = []
    for k in range(6):
        f = blank(W, H)
        n = fbm(x * 0.12 - k * 0.8, y * 0.3, seed=9, octaves=2)
        center = np.sin(x * 0.16 - k * 1.1) * 2.0 * np.clip(x / 25, 0, 1)
        hw = (3.4 - 1.2 * x / L) + (n - 0.5) * 2.2
        m = (np.abs(y - center) <= hw) & (x >= 0)
        rim = np.abs(y - center) > hw - 1.1
        top = (y - center) < 0
        tone = np.where(rim & top, 0.85, np.where(rim, 0.2, 0.35 + (n - 0.5) * 0.4))
        paint_field(f, np.where(m, tone, np.nan), SOMBRA)
        g = rng(700 + k)
        for i in range(9):                                          # mãozinhas de sombra saindo da linha
            sx = g.uniform(12, L - 6)
            sy = math.sin(sx * 0.16 - k * 1.1) * 2.0
            up = -1 if g.random() < 0.5 else 1
            for s in range(int(g.integers(3, 6))):
                dot(f, AX + sx + s * 0.4 * g.uniform(-1, 1), AY + sy + up * (3 + s), SOMBRA[1 if s < 3 else 3])
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=80, px=2, gira=True, linha=True)


def bind():
    W, H, AX, AY = 48, 52, 24, 40
    x, y = grid(W, H, AX, AY)
    frames = []
    heights = [6, 14, 22, 26, 22, 12]
    for k, ht in enumerate(heights):
        f = blank(W, H)
        pool = (x / 15) ** 2 + (y / 5) ** 2 <= 1
        paint_field(f, np.where(pool, 0.25 + 0.3 * (y < -1), np.nan), SOMBRA, alpha=np.where(pool, 1.0 if k < 5 else 0.6, 0))
        for i, (bx, ph) in enumerate([(-9, 0.0), (-3, 1.7), (4, 3.1), (10, 4.4)]):
            hh = ht * (0.8 + 0.25 * ((i * 7) % 3) / 2)
            ts = np.linspace(0, 1, 30)
            pts = [(AX + bx * (1 - 0.55 * t) + math.sin(t * 5 + ph + k * 0.6) * 3.0 * t, AY - t * hh) for t in ts]
            d = poly_dist(x + AX, y + AY, pts)
            thick = 1.7
            m = d <= thick
            paint_field(f, np.where(m & (f[..., 3] == 0) | m, np.clip(0.75 - d / 3, 0, 1), np.nan), SOMBRA, alpha=np.where(m, 1.0 if k < 5 else 0.55, 0))
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=90, px=2)


# ------------------------------------------------------------------ Ilusão: espiral em volta (3 casas)

def illusion():
    R = 3 * TILE
    S = int(2 * R + 12)
    c = S / 2
    x, y = grid(S, S, c, c)
    rho = np.hypot(x, y)
    phi = np.arctan2(y, x)
    frames = []
    for k in range(8):
        t = k / 7
        f = blank(S, S)
        Rk = R * max(0.12, min(1.0, ease_out(min(1, t * 1.6))))
        fade = 1.0 if t < 0.6 else max(0.0, 1 - (t - 0.6) / 0.4)
        inside = rho <= Rk
        spiral = ((phi / (2 * math.pi) * 3 + rho / 22 - t * 1.4) % 1.0) < 0.2
        arm = inside & spiral
        paint_field(f, np.where(arm, np.clip(0.35 + rho / R * 0.5, 0, 1), np.nan), ILUSAO, alpha=np.where(arm, fade * 0.9, 0))
        tint = inside & ~spiral & (f[..., 3] == 0)
        paint_field(f, np.where(tint, 0.25, np.nan), ILUSAO, alpha=np.where(tint, 0.18 * fade, 0))
        ring = np.abs(rho - Rk) < 1.6
        paint_field(f, np.where(ring, np.clip(1 - np.abs(rho - Rk) / 1.6, 0, 1) * 0.6 + 0.4, np.nan), ILUSAO, alpha=np.where(ring, fade, 0))
        g = rng(900 + k)
        for i in range(int(18 * fade) + 2):                         # brilhos piscando
            ang = g.uniform(0, 2 * math.pi)
            dist = Rk * math.sqrt(g.uniform(0.05, 1))
            cross(f, c + math.cos(ang) * dist, c + math.sin(ang) * dist, ILUSAO[3], arm=1 if g.random() < 0.6 else 2, core=ILUSAO[4])
        frames.append(f)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=75, px=2, raio=3)


# ------------------------------------------------------------------ Cura: coluna de luz e cruzes subindo

def heal():
    W, H, AX, AY = 56, 84, 28, 68
    x, y = grid(W, H, AX, AY)
    frames = []
    g = rng(1000)
    crosses = [(g.uniform(-13, 13), g.uniform(0, 1), g.integers(1, 3)) for _ in range(7)]
    rays = [(g.uniform(-9, 9), g.uniform(0.55, 1.0), g.uniform(0, 1)) for _ in range(6)]
    for k in range(8):
        t = k / 7
        f = blank(W, H)
        fade = 1.0 if t < 0.55 else max(0.0, 1 - (t - 0.55) / 0.45)
        # anel no chão (duas linhas) e o brilho no meio
        ringr = 9 + 10 * ease_out(min(1, t * 2))
        e = np.hypot(x / ringr, y / (ringr * 0.36))
        ring = np.abs(e - 1) < 0.14
        inner = np.abs(e - 0.62) < 0.1
        paint_field(f, np.where(ring, 0.75, np.where(inner, 1.0, np.nan)), CURA, alpha=np.where(ring | inner, fade + 0.05, 0), seed=k)
        glow = (e < 0.45) & (t < 0.7)
        paint_field(f, np.where(glow, 0.9, np.nan), CURA)
        # raios de luz subindo (linhas claras de 1 a 2 px)
        top = 58 * ease_out(min(1, t * 1.8))
        for (rx, hmax, ph) in rays:
            h0 = top * hmax
            y0 = -h0 * (0.25 + 0.2 * ((ph + t) % 1))
            col = (np.abs(x - rx) < 0.6 + 0.4 * (abs(rx) < 4)) & (y <= y0 * 0.2) & (y >= -h0)
            tone = np.clip(1 - (-y) / (h0 + 1) * 0.7, 0.3, 1)
            paint_field(f, np.where(col & (f[..., 3] == 0), tone, np.nan), CURA[2:], alpha=np.where(col, fade * (1.1 - (-y) / (h0 + 1)), 0), seed=20 + k)
        for (cx, ph, arm) in crosses:
            cy = -((ph + t * 1.1) % 1.0) * 62 - 4
            if -cy > top + 6:
                continue
            cross(f, AX + cx, AY + cy, CURA[3], arm=int(arm), core=CURA[4])
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=80, px=2)


# ------------------------------------------------------------------ Pedra: rochas saindo do chão em volta

def rock_shape(g, size):
    n = int(g.integers(5, 8))
    return [(math.cos(2 * math.pi * i / n + g.uniform(-0.3, 0.3)) * size * g.uniform(0.75, 1.1),
             math.sin(2 * math.pi * i / n + g.uniform(-0.3, 0.3)) * size * g.uniform(0.75, 1.0)) for i in range(n)]


def poly_mask(x, y, pts):
    inside = np.zeros(x.shape, bool)
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
        cond = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / (by - ay + 1e-9) + ax)
        inside ^= cond
    return inside


def stone():
    W, H, AX, AY = 76, 66, 38, 46
    x, y = grid(W, H, AX, AY)
    g = rng(1100)
    rocks = []
    for i in range(8):
        ang = 2 * math.pi * i / 8 + g.uniform(-0.2, 0.2)
        rocks.append(dict(ang=ang, size=g.uniform(3.2, 5.0), shape=rock_shape(g, 1.0), delay=g.uniform(0, 0.15)))
    lifts = [0.0, 0.45, 0.85, 1.0, 0.7, 0.2]
    frames = []
    for k, lift in enumerate(lifts):
        f = blank(W, H)
        # rachaduras / poeira no chão
        if k <= 1 or k >= 4:
            ell = np.hypot(x / 24, y / 9)
            cracks = (np.abs(ell - 1) < 0.08) & (hash_noise(np.arctan2(y, x) * 6, 1) > 0.45)
            paint_field(f, np.where(cracks, 0.2, np.nan), TERRA)
        for rk in sorted(rocks, key=lambda r: math.sin(r["ang"])):
            h = max(0.0, lift - rk["delay"]) * 18
            if k == 0:
                h = 0
            px = math.cos(rk["ang"]) * 24
            py = math.sin(rk["ang"]) * 9 - h
            s = rk["size"] * (0.5 if k == 0 else 1.0) * (0.75 if k == 5 else 1.0)
            pts = [(px + u * s, py + v * s) for (u, v) in rk["shape"]]
            m = poly_mask(x, y, pts)
            if k >= 4:
                m &= hash_noise(x * 0.6 + rk["ang"], y * 0.6) > (0.25 if k == 4 else 0.55)
            light = np.clip(0.75 - (y - py) / (s * 2.2) - (x - px) / (s * 4), 0, 1)
            rock = blank(W, H)
            paint_field(rock, np.where(m, light, np.nan), TERRA)
            rock = outline(rock)
            mm = rock[..., 3] > 0
            f[mm] = rock[mm]
        if k == 3:                                                  # anel de escudo (onde as rochas giram)
            ring = (np.abs(np.hypot(x / 26, (y + 8) / 12) - 1) < 0.05) & (f[..., 3] == 0)
            paint_field(f, np.where(ring, 0.9, np.nan), TERRA, alpha=np.where(ring, 0.7, 0))
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=85, px=2)


# ------------------------------------------------------------------ Kunai voando (px 1: a mesma escala da arma)

def kunai_flying():
    W, H, AX, AY = 40, 14, 20, 7
    art = rasterize(armas.kunai_sampler(armas.KUNAI_ESCURA, armas.FAIXA_BEGE, 17.0), W, H, AX, AY, 0)
    art = outline(art)
    frames = []
    for k in range(2):
        f = blank(W, H)
        for i in range(3):                                          # rastro do movimento
            yy = AY - 2 + i * 2
            for xx in range(0, 10 - i * 2):
                if (xx + k + i) % 3:
                    dot(f, xx + i, yy, (200, 210, 226) if xx > 3 else (150, 160, 182))
        m = art[..., 3] > 0
        f[m] = art[m]
        if k == 1:
            dot(f, AX + 9, AY - 1, (255, 255, 255))
        frames.append(f)
    return frames, dict(quadro=[W, H], ancora=[AX, AY], ms=60, px=1, gira=True)


# ------------------------------------------------------------------ Shuriken Gigante voando (girando)

def fuma():
    S = 44
    c = S / 2
    frames = []
    x, y = grid(S, S, c, c)
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    for k in range(4):
        f = armas.shuriken_back(S, S, c, c, R=17.0, rot=45 + k * 22.5)
        # rastro do giro: arcos claros logo atrás de cada ponta
        trail = (np.abs(r - 17.5) < 1.0) & (((a - math.radians(45 + k * 22.5)) % (math.pi / 2)) > math.radians(55)) & (f[..., 3] == 0)
        f[trail] = (214, 220, 232, 255)
        frames.append(f)
    return frames, dict(quadro=[S, S], ancora=[S // 2, S // 2], ms=45, px=2)


EFFECTS = {
    "slash": slash, "hit": hit, "punch": punch, "dust": dust, "smoke": smoke,
    "fireball": fireball, "explosion": explosion, "water": water,
    "lightning": lightning, "spark": spark, "shadow": shadow, "bind": bind,
    "illusion": illusion, "heal": heal, "stone": stone, "kunai": kunai_flying, "fuma": fuma,
}
