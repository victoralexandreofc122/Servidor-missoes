# Prancha de comparação: referência do Victor | boneco atual (v27) | propostas A, B, C (pose parada de frente).
# Pixel art ampliada sem suavização (NEAREST). Uso: python3 prancha.py pasta_px referencia.jpg saida.png [escala]
import sys
from PIL import Image, ImageDraw
px, ref, out = sys.argv[1], sys.argv[2], sys.argv[3]
S = int(sys.argv[4]) if len(sys.argv) > 4 else 6
BG = (205, 211, 222)
def crop(im):
    bb = im.getbbox(); return im.crop((bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4)) if bb else im
cells = []
r = Image.open(ref).convert('RGB').crop((22, 30, 128, 232))  # 1º quadro da referência (parado de frente)
h = 80 * S
cells.append(('Referência', r.resize((round(r.width * h / r.height), h), Image.LANCZOS)))
for name, f in [('Atual (v27)', 'atual.png'), ('Proposta A', 'frente_A.png'), ('Proposta B', 'frente_B.png'), ('Proposta C', 'frente_C.png')]:
    im = Image.open(f'{px}/{f}').convert('RGBA').crop((0, 8, 64, 96))
    cells.append((name, im.resize((im.width * S, im.height * S), Image.NEAREST)))
pad, top = 16, 30
W = sum(c.width for _, c in cells) + pad * (len(cells) + 1)
H = max(c.height for _, c in cells) + top + pad
sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet)
x = pad
for name, c in cells:
    d.text((x, 8), name, fill=(20, 24, 43))
    sheet.paste(c, (x, top), c if c.mode == 'RGBA' else None)
    x += c.width + pad
sheet.save(out)
print(sheet.size)
