"""
Confere as colisões de um mapa em imagem: desenha as paredes do layout (vermelho), a água (azul), as portas e saídas
(verde) e uma grade de casas por cima da imagem esticada para o mapa.

  npx tsx -e "import {WORLD_MAPS} from './src/realtime/maps.ts'; console.log(JSON.stringify(WORLD_MAPS['poco']))" > /tmp/poco.json
  python3 arte/mapas/sobrepor.py <imagem> /tmp/poco.json saida.png [--px 32] [--recorte x0,y0,x1,y1]
"""
import argparse
import json
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('imagem'); ap.add_argument('layout'); ap.add_argument('saida')
ap.add_argument('--px', type=int, default=32)
ap.add_argument('--recorte')
a = ap.parse_args()
L = json.load(open(a.layout))
img = Image.open(a.imagem).convert('RGB')
if a.recorte:
    img = img.crop(tuple(int(v) for v in a.recorte.split(',')))
P = a.px
img = img.resize((L['width'] * P, L['height'] * P), Image.LANCZOS).convert('RGBA')
over = Image.new('RGBA', img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(over)
for x in range(L['width'] + 1):
    d.line([(x * P, 0), (x * P, L['height'] * P)], fill=(255, 255, 255, 40 if x % 5 else 110))
for y in range(L['height'] + 1):
    d.line([(0, y * P), (L['width'] * P, y * P)], fill=(255, 255, 255, 40 if y % 5 else 110))
def box(b, fill, line):
    d.rectangle([b['x'] * P, b['y'] * P, (b['x'] + b['w']) * P - 1, (b['y'] + b['h']) * P - 1], fill=fill, outline=line, width=2)
for w in L['walls']:
    box(w, (60, 120, 255, 70) if w['k'] == 'water' else (255, 40, 40, 70), (80, 140, 255, 255) if w['k'] == 'water' else (255, 60, 60, 255))
for dr in L.get('doors', []):
    box(dr, (40, 255, 80, 90), (40, 255, 80, 255))
for z in L.get('safeZones', []):
    box(z, None, (255, 255, 0, 200))
Image.alpha_composite(img, over).convert('RGB').save(a.saida)
print('ok', img.size)
