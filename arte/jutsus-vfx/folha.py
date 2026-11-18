"""Junta as fotos de cada jutsu (capturar.ts) numa folha: folha_<jutsu>.png (e peq_<jutsu>.png, menor, para conferir).

  python3 arte/jutsus-vfx/folha.py <pasta das fotos>
"""
import glob, os, re, sys
from PIL import Image, ImageDraw, ImageFont

pasta = sys.argv[1]
try:
    fonte = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except OSError:
    fonte = None
grupos = {}
for p in glob.glob(os.path.join(pasta, '*_[0-9].png')):
    m = re.match(r'(.+)_(\d)\.png$', os.path.basename(p))
    if m:
        grupos.setdefault(m.group(1), []).append((int(m.group(2)), p))
for nome, fotos in sorted(grupos.items()):
    ims = [Image.open(p).convert('RGB') for _, p in sorted(fotos)]
    w, h = ims[0].size
    cols = 3 if len(ims) <= 6 else 4
    rows = (len(ims) + cols - 1) // cols
    folha = Image.new('RGB', (cols * w + (cols - 1) * 8, rows * h + (rows - 1) * 8 + 70), (24, 26, 34))
    ImageDraw.Draw(folha).text((20, 16), nome, fill=(240, 230, 200), font=fonte)
    for i, im in enumerate(ims):
        folha.paste(im, ((i % cols) * (w + 8), 70 + (i // cols) * (h + 8)))
    folha.save(os.path.join(pasta, f'folha_{nome}.png'))
    peq = folha.copy()
    peq.thumbnail((1200, 1200))
    peq.save(os.path.join(pasta, f'peq_{nome}.png'))
    print(nome, len(ims), 'fotos')
