"""Prancha de prévia dos efeitos (fundo de grama e de chão escuro), ampliada."""
import sys

from PIL import Image, ImageDraw

import pix
import vfx

K = int(sys.argv[2]) if len(sys.argv) > 2 else 3
names = sys.argv[1].split(",") if len(sys.argv) > 1 and sys.argv[1] != "all" else list(vfx.EFFECTS)
rows = []
for name in names:
    fr, meta = vfx.EFFECTS[name]()
    rows.append((name, fr, meta))
W = max(sum(f.shape[1] + 4 for f in fr) for _, fr, _ in rows) * K + 120
H = sum((max(f.shape[0] for f in fr) + 6) for _, fr, _ in rows) * K + 10
img = Image.new("RGBA", (W, H), (78, 128, 62, 255))
d = ImageDraw.Draw(img)
y = 5
for name, fr, meta in rows:
    d.text((6, y + 4), name, fill=(255, 255, 255, 255))
    x = 110
    for i, f in enumerate(fr):
        bg = (78, 128, 62, 255) if i % 2 == 0 else (60, 104, 50, 255)
        tile = pix.enlarge(f, K, bg)
        img.alpha_composite(tile, (x, y))
        ax, ay = meta["ancora"]
        d.rectangle([x + ax * K - 1, y + ay * K - 1, x + ax * K + 1, y + ay * K + 1], outline=(255, 0, 255, 255))
        x += (f.shape[1] + 4) * K
    y += (max(f.shape[0] for f in fr) + 6) * K
img.save("../saida/previas/vfx_%s.png" % ("todos" if names == list(vfx.EFFECTS) else "_".join(names)))
print(img.size)
