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

    # Cada arma: a arte de onde ela fica (mão ou costas) e, se for das costas, a da mão (no golpe) e a bainha vazia.
    lista = {}

    def sheet_hand(name, frames, size):
        pix.save(pix.strip(frames), os.path.join(OUT_ARMAS, f"{name}.png"))
        return dict(arquivo=f"assets/weapons/{name}.png", quadro=[size, size], ancora=[size // 2, size // 2], angulos=len(frames))

    def sheet_back(name, frames, spec):
        w, h = spec["size"]
        pix.save(pix.strip(frames), os.path.join(OUT_ARMAS, f"{name}.png"))
        return dict(arquivo=f"assets/weapons/{name}.png", quadro=[w, h], ancora=[w // 2, h // 2], desloc=[list(v["off"]) for v in spec["views"]])

    for code in ("kunai_training", "kunai", "tanto"):
        sample, size = armas.HAND[code]
        lista[code] = dict(onde="mao", mao=sheet_hand(code, armas.hand_weapon(sample, size), size))
    for code, spec in armas.BACK.items():
        entry = dict(onde="costas", costas=sheet_back(code, armas.back_views(code), spec))
        if code == "katana":
            sample, size = armas.HAND["katana"]
            entry["mao"] = sheet_hand("katana_mao", armas.hand_weapon(sample, size), size)
            entry["bainha"] = sheet_back("katana_bainha", armas.back_views(code, empty=True), spec)
        if code == "fuma_shuriken":
            entry["mao"] = sheet_hand("fuma_shuriken_mao", armas.shuriken_hand(), 88)
        if code in armas.THROWN:
            entry["lanca"] = True
        lista[code] = entry
    for code, e in lista.items():
        print(f"arma {code:14s} {e['onde']}: " + ", ".join(k for k in ("mao", "costas", "bainha") if k in e))

    with open(os.path.join(PUBLIC, "vfxData.js"), "w") as fh:
        fh.write(js_module("VFX", "Efeitos dos golpes: folhas em assets/vfx (quadros numa linha; px = pixels do boneco por pixel do efeito).",
                           dict(versao=1, casaPx=92 / 1.5, efeitos=efeitos)))
    with open(os.path.join(PUBLIC, "weaponData.js"), "w") as fh:
        fh.write(js_module("ARMAS", "Armas no boneco: `mao` = 16 ângulos (0° = direita, de 22,5 em 22,5; o centro é o punho); "
                           "`costas` e `bainha` = 3 vistas (frente, lado, costas). `onde` = onde a arma fica parada; `lanca` = arma de arremesso.",
                           dict(versao=2, armas=lista)))

    # prévias
    import subprocess
    subprocess.run([sys.executable, os.path.join(HERE, "previa.py"), "all", "2"], cwd=HERE, check=True)
    rows = []
    for code, (sample, size) in armas.HAND.items():
        rows.append(pix.strip(armas.hand_weapon(sample, size)[::2]))
    rows.append(pix.strip(armas.shuriken_hand()[::2]))
    for code in armas.BACK:
        rows.append(pix.strip(armas.back_views(code)))
    rows.append(pix.strip(armas.back_views("katana", empty=True)))
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
