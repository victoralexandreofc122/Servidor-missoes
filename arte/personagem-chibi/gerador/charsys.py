"""Sistema de personagem em camadas: monta cada item (corpo, olhos, boca, roupas, cabelo, chapéu) por frame,
separado em planos, e compõe na ordem do jogo: plano a plano, e dentro do plano, slot a slot."""
import numpy as np

from body import body_parts
from compose import CORPO, FRENTE, TOPO, TRAS, compose
from geom import H, W, dilate
import head_items as HI
from pal import (CABELO, COR1, COR2, COR3, EYE_DEFAULT, FIXO, HAIR_DEFAULT, Idx, OLHO, PELE, SKIN_DEFAULT,
                 colorize)

# ordem dos slots dentro de cada plano (do fundo pra frente)
SLOTS = ["corpo", "calca", "camisa", "conjunto", "punho", "olhos", "boca", "mascara", "cabelo", "chapeu", "acessorio"]


def breath_shift(idx, cut=63):
    """Expira: tudo acima da cintura desce 1 px (mesmo deslocamento em todas as camadas)."""
    idx.ch[1:cut + 1] = idx.ch[0:cut].copy()
    idx.ch[0] = 0
    idx.sh[1:cut + 1] = idx.sh[0:cut].copy()
    idx.sh[0] = 0


def empty_planes():
    return [Idx(H, W) for _ in range(4)]


def head_mask_of(body_planes):
    """Máscara da cabeça do corpo (a cabeça sempre fica na frente da gola das roupas)."""
    from body import head_mask
    return None


class Frame:
    """Todas as camadas de um frame: {slot: [Idx por plano]}."""

    def __init__(self, fig, outfit):
        self.fig = fig
        self.layers = {}
        parts = body_parts(fig)
        self.body_parts = parts
        planes = compose(parts)
        if getattr(fig, "breath", 0):       # corpo já deslocado (as roupas são montadas sem e deslocadas no fim)
            for p in planes:
                breath_shift(p)
        self.layers["corpo"] = planes
        self.head = [p for p in parts if p.name == "cabeca"][0].mask
        v = fig.view
        for slot, item in outfit.items():
            if item is None:
                continue
            kind, style = item
            if slot in ("olhos", "boca", "cabelo", "chapeu"):
                if v == "back" and slot in ("olhos", "boca"):
                    continue
                pl = [HI.follow_head(p, fig) for p in HI.head_planes(kind, v, style)]
                if slot == "cabelo":
                    pl = HI.fit_to_pose(pl, fig, self.layers["corpo"])
                self.layers[slot] = pl
            else:
                import clothes
                self.layers[slot] = clothes.build(kind, fig, self)
        if getattr(fig, "breath", 0):
            for slot, pl in self.layers.items():
                if slot in ("corpo", "olhos", "boca", "cabelo", "chapeu"):
                    continue
                for p in pl:
                    breath_shift(p)

    def rgba(self, colors):
        """colors: {slot: {canal: rampa}} -> imagem RGBA composta."""
        out = np.zeros((H, W, 4), np.uint8)
        for pl in range(4):
            for slot in SLOTS:
                if slot not in self.layers:
                    continue
                idx = self.layers[slot][pl]
                if not idx.any():
                    continue
                img = colorize(idx, colors.get(slot, {}))
                m = img[..., 3] > 0
                out[m] = img[m]
        return out

    def slot_planes_rgba(self, slot, colors):
        return [colorize(p, colors.get(slot, {})) for p in self.layers[slot]]
