"""Composição de uma camada (item) a partir de PEÇAS, com regra de contorno e PLANOS.

Planos (o jogo desenha nesta ordem, e dentro de cada plano as camadas na ordem dos slots):
  0 TRAS   - membros atrás do corpo (braço/perna de longe, braços pra trás)
  1 CORPO  - tronco, pernas, cabeça
  2 FRENTE - braços na frente do corpo
  3 TOPO   - prioridade máxima (ex.: perna do chute vindo pra câmera)
Regra de contorno: cada peça desenha a linha só onde encosta em algo que está ATRÁS dela
(peça de z menor da mesma camada) ou no vazio. Assim não sai linha dupla.
"""
import numpy as np

from geom import H, W, blank, dilate, erode, shift
from pal import FIXO, F_OUT, Idx

TRAS, CORPO, FRENTE, TOPO = range(4)
PLANOS = ["tras", "corpo", "frente", "topo"]


class Part:
    def __init__(self, name, mask, z, plane=CORPO, paint=None, inner=(FIXO, F_OUT), soft=None, ring=True,
                 outer=(FIXO, F_OUT)):
        self.name, self.mask, self.z, self.plane, self.paint = name, mask, z, plane, paint
        self.inner, self.soft, self.ring, self.outer = inner, soft, ring, outer


def _nb_any(m):
    return shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


def compose(parts, clip=None):
    """Retorna lista de 4 Idx (um por plano). clip: {plano: máscara} de pixels removidos no fim
    (ex.: roupa recortada pela cabeça, que sempre fica na frente da gola)."""
    parts = sorted(parts, key=lambda p: (p.plane, p.z))   # plano manda (o jogo desenha plano a plano)
    allm = blank()
    for p in parts:
        allm |= p.mask
    planes = [Idx(H, W) for _ in range(4)]
    for i, p in enumerate(parts):
        above = blank()
        for q in parts[i + 1:]:
            above |= q.mask
        vis = p.mask & ~above
        if not vis.any():
            continue
        full = p.mask | above
        interior = vis & erode(full)
        tmp = Idx(H, W)
        rg = vis & ~erode(full)
        outer = rg & _nb_any(~allm)
        inner = rg & ~outer
        if p.soft is not None:
            inner &= ~p.soft
        p.inner_px = inner if p.ring else blank()   # a pintura pode usar (ex.: deixar 1 px de luz junto da linha)
        if p.paint is not None:
            p.paint(tmp, p, vis, interior)
        if p.ring:
            tmp.put(outer, *p.outer)
            tmp.put(inner, *p.inner)
        cut = getattr(p, "cut", None)        # pixels tapados por algo de OUTRA camada que fica na frente
        drawn = vis & ~cut if cut is not None else vis
        p.tmp, p.drawn = tmp, drawn
        planes[p.plane].copy_from(tmp, drawn)
    if clip:
        for pl, m in clip.items():
            planes[pl].ch[m] = 0
            planes[pl].sh[m] = 0
    clean_islands(planes)
    return planes


def clean_islands(planes):
    """Pixel solto cercado de contorno nos 4 lados (janelinha entre peças) vira contorno."""
    vis_pl = np.full((H, W), -1)
    for i, pl in enumerate(planes):
        vis_pl[pl.ch > 0] = i
    ch = np.zeros((H, W), np.uint8)
    sh = np.zeros((H, W), np.uint8)
    for i, pl in enumerate(planes):
        m = vis_pl == i
        ch[m], sh[m] = pl.ch[m], pl.sh[m]
    out = (ch == FIXO) & (sh == F_OUT)
    nb = [shift(out, 1, 0), shift(out, -1, 0), shift(out, 0, 1), shift(out, 0, -1)]
    isl = (ch > 0) & ~out & nb[0] & nb[1] & nb[2] & nb[3]
    for i, pl in enumerate(planes):
        m = isl & (vis_pl == i)
        pl.ch[m], pl.sh[m] = FIXO, F_OUT
    # buraco transparente de 1 ou 2 px cercado de contorno (entre braço, ombro e queixo): fecha com contorno,
    # no plano mais de trás entre os vizinhos (não cobre nada que esteja na frente)
    empty = ch == 0
    n_out = nb[0].astype(int) + nb[1] + nb[2] + nb[3]
    single = empty & (n_out == 4)
    e3 = empty & (n_out == 3)
    pair = e3 & (shift(e3, 1, 0) | shift(e3, -1, 0) | shift(e3, 0, 1) | shift(e3, 0, -1))
    hole = single | pair
    if hole.any():
        big = 99
        lowest = np.full((H, W), big)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nbp = np.full((H, W), big)
            src = np.where(out, vis_pl, big)
            ys = slice(max(dy, 0), H + min(dy, 0))
            yd = slice(max(-dy, 0), H + min(-dy, 0))
            xs = slice(max(dx, 0), W + min(dx, 0))
            xd = slice(max(-dx, 0), W + min(-dx, 0))
            nbp[ys, xs] = src[yd, xd]
            lowest = np.minimum(lowest, nbp)
        for i, pl in enumerate(planes):
            m = hole & (lowest == i)
            pl.ch[m], pl.sh[m] = FIXO, F_OUT


def flatten(planes):
    """Junta os planos de UMA camada (pra prévia)."""
    out = Idx(H, W)
    for pl in planes:
        m = pl.ch > 0
        out.copy_from(pl, m)
    return out


def stack(layers_planes):
    """layers_planes: lista (na ordem dos slots) de listas de 4 Idx -> lista [(plano, slot_i, Idx)] na ordem de desenho."""
    order = []
    for pl in range(4):
        for i, planes in enumerate(layers_planes):
            order.append((pl, i, planes[pl]))
    return order
