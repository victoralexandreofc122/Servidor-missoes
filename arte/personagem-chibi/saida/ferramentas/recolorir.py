"""Recolore uma folha de camada a partir do mapa de índices + paletas.json.

Uso:
  python recolorir.py ENTRADA_INDICES.png SAIDA.png [--pele NOME] [--cabelo NOME] [--olho NOME]
                      [--cor1 NOME] [--cor2 NOME] [--cor3 NOME] [--paletas paletas.json]

Exemplo (conjunto ninja vermelho com detalhes pretos e faixas brancas, pele "canela"):
  python recolorir.py ../indices/masculino/andar/conjunto__vila__corpo.png ninja_vermelho.png \
      --cor1 vermelho --cor2 preto --cor3 branco --pele canela

O mapa de índices guarda, em cada pixel: R = canal x 32, G = tom x 16 (A = 0 onde é transparente).
Canais: 1 fixo, 2 pele, 3 cabelo, 4 olho, 5 cor1, 6 cor2, 7 cor3. No jogo dá pra fazer o mesmo num shader
(troca de paleta): canal = round(R*255/32), tom = round(G*255/16), cor = paleta[canal][tom].
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def recolor(idx_rgba, pal, pele="claro", cabelo="castanho", olho="azul", cor1="azul_marinho", cor2="aco",
            cor3="creme"):
    ramps = {1: pal["fixo"], 2: pal["pele"][pele], 3: pal["cabelo"][cabelo], 4: pal["olho"][olho],
             5: pal["roupa"][cor1], 6: pal["roupa"][cor2], 7: pal["roupa"][cor3]}
    a = np.asarray(idx_rgba)
    ch = np.rint(a[..., 0] / 32.0).astype(int)
    sh = np.rint(a[..., 1] / 16.0).astype(int)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    on = a[..., 3] > 0
    for c, ramp in ramps.items():
        m = on & (ch == c)
        if m.any():
            r = np.array(ramp, np.uint8)
            out[m, :3] = r[np.clip(sh[m], 0, len(r) - 1)]
            out[m, 3] = 255
    return out


def main():
    ap = argparse.ArgumentParser(description="Recolore uma folha de camada (mapa de índices -> cores).")
    ap.add_argument("entrada")
    ap.add_argument("saida")
    ap.add_argument("--paletas", default=os.path.join(HERE, "..", "paletas.json"))
    for k, d in (("pele", "claro"), ("cabelo", "castanho"), ("olho", "azul"), ("cor1", "azul_marinho"),
                 ("cor2", "aco"), ("cor3", "creme")):
        ap.add_argument("--" + k, default=d)
    a = ap.parse_args()
    with open(a.paletas, encoding="utf-8") as fh:
        pal = json.load(fh)
    img = Image.open(a.entrada).convert("RGBA")
    out = recolor(img, pal, a.pele, a.cabelo, a.olho, a.cor1, a.cor2, a.cor3)
    Image.fromarray(out, "RGBA").save(a.saida)
    print("salvo:", a.saida)


if __name__ == "__main__":
    main()
