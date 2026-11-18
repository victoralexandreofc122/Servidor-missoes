"""Compacta as folhas das camadas (public/assets/vfx/pfx_*.png): 128 cores com transparência, sem pontilhado.

Chamado por arte/pixelfx/camadas.mjs depois de gerar as folhas (o brilho suave do PixelFX fica pesado em PNG de
32 bits: ~3 MB viram ~0,5 MB, o que importa no celular).   Uso: python3 arte/pixelfx/compactar.py <png> [<png>...]
"""
import sys
from PIL import Image

for f in sys.argv[1:]:
    im = Image.open(f).convert('RGBA')
    q = im.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(f, 'PNG', optimize=True)
