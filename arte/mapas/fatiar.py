"""
Arte do mapa em imagem: transforma a imagem gerada (Canva) nos blocos de chão que o jogo carrega.

  python3 arte/mapas/fatiar.py <imagem> <pasta> <largura> <altura> [--recorte x0,y0,x1,y1]

- <pasta>: o campo `art` do mapa (src/realtime/maps.ts); os blocos vão para public/mapas/<pasta>/.
- <largura> e <altura>: o tamanho do mapa em casas. A imagem (ou o recorte, em pixels) é esticada para o mapa inteiro,
  a 48 px por casa (16 unidades x ART 3, a mesma resolução do chão desenhado por código).
- Cada bloco tem 8 x 8 casas (384 px), em WebP: <cx>_<cy>.webp. O cliente carrega só os blocos perto da câmera.
- Também grava <pasta>/mini.webp (4 px por casa) para o minimapa.
"""
import argparse
import os
from PIL import Image

PX = 48          # pixels por casa
CHUNK = 8        # casas por bloco (CHUNK em public/game.js)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('imagem')
    ap.add_argument('pasta')
    ap.add_argument('largura', type=int)
    ap.add_argument('altura', type=int)
    ap.add_argument('--recorte', help='x0,y0,x1,y1 em pixels da imagem')
    a = ap.parse_args()
    img = Image.open(a.imagem).convert('RGB')
    if a.recorte:
        img = img.crop(tuple(int(v) for v in a.recorte.split(',')))
    full = img.resize((a.largura * PX, a.altura * PX), Image.LANCZOS)
    raiz = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'mapas', a.pasta)
    os.makedirs(raiz, exist_ok=True)
    for f in os.listdir(raiz):
        if f.endswith('.webp'):
            os.remove(os.path.join(raiz, f))
    n = 0
    for cy in range((a.altura + CHUNK - 1) // CHUNK):
        for cx in range((a.largura + CHUNK - 1) // CHUNK):
            box = (cx * CHUNK * PX, cy * CHUNK * PX, min(a.largura, (cx + 1) * CHUNK) * PX, min(a.altura, (cy + 1) * CHUNK) * PX)
            full.crop(box).save(os.path.join(raiz, f'{cx}_{cy}.webp'), 'WEBP', quality=88, method=6)
            n += 1
    full.resize((a.largura * 4, a.altura * 4), Image.LANCZOS).save(os.path.join(raiz, 'mini.webp'), 'WEBP', quality=85)
    print(f'{n} blocos em public/mapas/{a.pasta}/ ({a.largura}x{a.altura} casas)')

if __name__ == '__main__':
    main()
