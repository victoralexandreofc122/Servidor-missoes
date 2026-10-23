"""Gera tudo que o jogo usa e as prévias.

  public/assets/vfx/<efeito>.png      folhas dos efeitos (quadros lado a lado)
  public/assets/weapons/<arma>.png    armas: 16 ângulos (na mão) ou 3 vistas (nas costas)
  public/vfxData.js                   tamanho do quadro, âncora, tempo e escala de cada efeito
  public/weaponData.js                tamanho do quadro, âncora e deslocamento de cada arma
  ../saida/previas/                   pranchas ampliadas para conferir

Rode a partir de arte/armas-vfx/:  python3 gerador/exportar.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import armas  # noqa: E402
import pix  # noqa: E402
import vfx  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PUBLIC = os.path.join(ROOT, "public")
OUT_VFX = os.path.join(PUBLIC, "assets", "vfx")
OUT_ARMAS = os.path.join(PUBLIC, "assets", "weapons")
PREVIAS = os.path.join(HERE, "..", "saida", "previas")


def js_module(name, comment, data):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"// GERADO por arte/armas-vfx/gerador/exportar.py: não edite à mão.\n// {comment}\nexport const {name} = {body};\n"


def main():
    for d in (OUT_VFX, OUT_ARMAS, PREVIAS):
        os.makedirs(d, exist_ok=True)

    efeitos = {}
    for name, fn in vfx.EFFECTS.items():
        frames, meta = fn()
        assert 1 <= len(frames) <= 8, f"{name}: {len(frames)} quadros (máximo 8)"
        assert all(f.shape == frames[0].shape for f in frames), name
        pix.save(pix.strip(frames), os.path.join(OUT_VFX, f"{name}.png"))
        efeitos[name] = dict(arquivo=f"assets/vfx/{name}.png", quadros=len(frames), **meta)
        print(f"vfx  {name:10s} {len(frames)} quadros {meta['quadro']}")

    lista = {}
    for code, (sample, size) in armas.HAND.items():
        frames = armas.hand_weapon(sample, size)
        pix.save(pix.strip(frames), os.path.join(OUT_ARMAS, f"{code}.png"))
        lista[code] = dict(arquivo=f"assets/weapons/{code}.png", onde="mao", quadro=[size, size], ancora=[size // 2, size // 2],
                           angulos=len(frames))
        print(f"arma {code:14s} mão, {len(frames)} ângulos")
    for code, spec in armas.BACK.items():
        frames = armas.back_views(code)
        pix.save(pix.strip(frames), os.path.join(OUT_ARMAS, f"{code}.png"))
        w, h = spec["size"]
        lista[code] = dict(arquivo=f"assets/weapons/{code}.png", onde="costas", quadro=[w, h], ancora=[w // 2, h // 2],
                           desloc=[list(v["off"]) for v in spec["views"]])
        print(f"arma {code:14s} costas, 3 vistas")

    with open(os.path.join(PUBLIC, "vfxData.js"), "w") as fh:
        fh.write(js_module("VFX", "Efeitos dos golpes: folhas em assets/vfx (quadros numa linha; px = pixels do boneco por pixel do efeito).",
                           dict(versao=1, casaPx=92 / 1.5, efeitos=efeitos)))
    with open(os.path.join(PUBLIC, "weaponData.js"), "w") as fh:
        fh.write(js_module("ARMAS", "Armas no boneco: na mão (16 ângulos, 0° = para a direita, de 22,5 em 22,5) ou nas costas (frente, lado, costas).",
                           dict(versao=1, armas=lista)))

    # prévias
    import subprocess
    subprocess.run([sys.executable, os.path.join(HERE, "previa.py"), "all", "2"], cwd=HERE, check=True)
    rows = []
    for code, (sample, size) in armas.HAND.items():
        rows.append(pix.strip(armas.hand_weapon(sample, size)))
    for code in armas.BACK:
        rows.append(pix.strip(armas.back_views(code)))
    W = max(r.shape[1] for r in rows)
    H = sum(r.shape[0] + 2 for r in rows)
    out = pix.blank(W, H)
    y = 0
    for r in rows:
        out[y:y + r.shape[0], :r.shape[1]] = r
        y += r.shape[0] + 2
    pix.enlarge(out, 4, (232, 234, 240, 255)).save(os.path.join(PREVIAS, "armas.png"))


if __name__ == "__main__":
    main()
