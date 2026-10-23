"""Exporta o personagem em camadas para o cliente do jogo (Nin Online Mobile).

Saída (pasta public/ do servidor):
  sprites/chibi_m.png, sprites/chibi_f.png  atlas com os MAPAS DE ÍNDICE (canal + tom) de cada célula 64x96,
                                            recortada no que tem pixel (economiza memória no celular)
  spriteData.js                              módulo com: retângulos de cada célula no atlas, âncoras (mão, costas,
                                            topo da cabeça), paletas, vilas, animações e ordem de desenho

Uso: python3 export_game.py            (grava em public/ do servidor; ou passe outra pasta)
"""
import math
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import export as EX
from compose import PLANOS
from pal import CANAIS, FIXED

PUBLIC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public")
CW, CH = 64, 96
ANIM_NAMES = [a for _, a, _, _, _ in EX.ANIMS]


def hexc(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def cell_anchors(fig):
    """Mão que segura arma (de frente: a direita do personagem = esquerda da tela; de lado: a de perto):
    [x, y, plano do braço, ângulo do antebraço em graus]; e o meio das costas (itens nas costas)."""
    arms = {a.side: a for a in fig.limbs if a.kind == "arm"}
    side = {"front": "L", "side": "near", "back": None}[fig.view]
    hand = None
    if side and side in arms:
        j = arms[side].j
        hx = (j["wr"][0] + j["end"][0]) / 2
        hy = (j["wr"][1] + j["end"][1]) / 2
        if getattr(fig, "breath", 0) and hy <= 63:
            hy += 1
        # ângulo do antebraço (cotovelo -> ponta da mão), em graus de tela: a arma segue esse rumo
        ang = math.degrees(math.atan2(j["end"][1] - j["el"][1], j["end"][0] - j["el"][0]))
        hand = [round(hx, 1), round(hy, 1), int(arms[side].plane), int(round(ang))]
    bx = (fig.neck[0] + fig.hip[0]) / 2
    by = (fig.neck[1] + fig.hip[1]) / 2 + (1 if getattr(fig, "breath", 0) else 0)
    return dict(mao=hand, costas=[round(bx, 1), round(by, 1)])


def pack(cells):
    """cells: lista (chave, array HxW uint8 de índice) -> atlas + {chave: [x, y, w, h, ox, oy]} (shelf packing)."""
    items = []
    for key, arr in cells:
        ys, xs = np.where(arr > 0)
        if len(ys) == 0:
            continue
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        items.append((key, arr[y0:y1, x0:x1], int(x0), int(y0)))
    items.sort(key=lambda t: -t[1].shape[0])
    width = 1024
    x = y = shelf_h = 0
    placed = []
    for key, a, ox, oy in items:
        h, w = a.shape
        if x + w > width:
            x, y, shelf_h = 0, y + shelf_h + 1, 0
        placed.append((key, a, x, y, ox, oy))
        x += w + 1
        shelf_h = max(shelf_h, h)
    height = y + shelf_h
    atlas = np.zeros((height, width), np.uint8)
    rects = {}
    for key, a, px, py, ox, oy in placed:
        h, w = a.shape
        atlas[py:py + h, px:px + w] = a
        rects[key] = [px, py, w, h, ox, oy]
    return atlas, rects


def main():
    data = EX.build_all()
    out = dict(versao=1, celula=[CW, CH], pivo=[32, 92], vistas=["frente", "lado", "costas"], planos=PLANOS,
               slots=EX.SLOTS, animacoes={}, generos={})
    for fn, aname, seq, ms, loop in EX.ANIMS:
        out["animacoes"][aname] = dict(sequencia=seq, ms=ms, repete=loop)
    os.makedirs(os.path.join(PUBLIC, "sprites"), exist_ok=True)
    for g, gname in EX.GENEROS:
        cells = []
        for (gg, aname), cc in data.items():
            if gg != g:
                continue
            for slot, iid, spec, _ in EX.ITEMS:
                for (vi, f), planes in cc[(slot, iid)].items():
                    for pl in range(4):
                        p = planes[pl]
                        if not p.any():
                            continue
                        arr = np.where(p.ch > 0, (p.ch.astype(np.uint8) << 4) | (p.sh.astype(np.uint8) & 15), 0)
                        cells.append(("%s/%s/%s/%d/%d/%d" % (aname, slot, iid, pl, vi, f), arr.astype(np.uint8)))
        atlas, rects = pack(cells)
        # PNG de paleta: índice = byte (canal << 4 | tom); a cor do índice guarda canal x 32 e tom x 16
        pal_img = Image.fromarray(atlas, "P")
        palette = []
        for i in range(256):
            palette += [(i >> 4) * 32 % 256, (i & 15) * 16 % 256, 0]
        pal_img.putpalette(palette)
        path = os.path.join(PUBLIC, "sprites", "chibi_%s.png" % g)
        pal_img.save(path, optimize=True, transparency=0)
        anchors = {}
        for fn, aname, seq, ms, loop in EX.ANIMS:
            for vi, (v, vname) in enumerate(EX.VIEWS):
                for f in range(3):
                    anchors["%s/%d/%d" % (aname, vi, f)] = cell_anchors(fn(g, v, f))
        out["generos"][g] = dict(atlas="sprites/chibi_%s.png" % g, tamanho=[int(atlas.shape[1]), int(atlas.shape[0])],
                                 celulas=rects, ancoras=anchors)
        print(gname, atlas.shape, len(rects), "células", os.path.getsize(path) // 1024, "KB")
    P = EX.P
    out["paletas"] = dict(
        fixo=[hexc(c) for c in FIXED],
        pele={n: [hexc(c) for c in r] for n, r in P["pele"]},
        cabelo={n: [hexc(c) for c in r] for n, r in P["cabelo"]},
        olho={n: [hexc(c) for c in r] for n, r in P["olhos"]},
        roupa={n: [hexc(c) for c in r] for n, r in P["roupa"]},
    )
    out["vilas"] = {v["vila"].replace("vila_exemplo_", "vila_"): dict(
        conjunto=[v["conjunto"]["cor1"], v["conjunto"]["cor2"], v["conjunto"]["cor3"]], bandana=v["bandana"],
        logo=v.get("logo", "vermelho"), simbolo=v["simbolo"]) for v in EX.VILAS}
    out["canais"] = {str(k): v for k, v in CANAIS.items()}
    js = ("// GERADO por arte/personagem-chibi/gerador/export_game.py: não edite à mão.\n"
          "// Células: chave 'animação/slot/item/plano/vista/frame' -> [x, y, w, h, ox, oy] no atlas do gênero.\n"
          "// Atlas: cada pixel guarda (canal << 4 | tom) no índice da paleta do PNG; a cor vem das paletas abaixo.\n"
          "export const SPRITES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(PUBLIC, "spriteData.js"), "w", encoding="utf-8") as fh:
        fh.write(js)
    print("spriteData.js", len(js) // 1024, "KB")


if __name__ == "__main__":
    main()
