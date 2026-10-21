# Peças do boneco a partir das folhas da IA: cada vista repixelizada no tamanho do jogo.
import numpy as np
from PIL import Image
import extrair as e

# fator = pixels da imagem da IA por pixel do jogo (x, y); k = cores da paleta da folha
CFG = {
    'cabeca': (16, 16, 10), 'cabelo': (16, 16, 6), 'roupa_cima': (19.6, 30, 8), 'braco': (38, 52, 6),
    'perna': (37, 58, 6), 'calca': (20.5, 47, 7), 'munhequeira': (54, 83, 5), 'sapato': (30, 37, 6),
}
# ordem das vistas na folha da IA: frente, esquerda?, direita?, costas. Qual vista olha para a ESQUERDA:
LEFT = {'cabeca': 1, 'cabelo': 1, 'roupa_cima': 1, 'braco': 1, 'perna': 1, 'calca': 2, 'munhequeira': 1, 'sapato': 1}

_cache = {}
def views(name):
    if name in _cache: return _cache[name]
    fx, fy, k = CFG[name]
    vs = e.load(name)
    pal = e.palette(vs, k)
    out = {}
    for d, i in (('baixo', 0), ('esquerda', LEFT[name]), ('cima', 3)):
        im, fg = vs[i]
        tw, th = max(1, round(im.shape[1] / fx)), max(1, round(im.shape[0] / fy))
        out[d] = e.repixel(vs[i], pal, tw, th)
    out['direita'] = out['esquerda'].transpose(Image.FLIP_LEFT_RIGHT)
    _cache[name] = out
    return out

def weapons():
    vs = e.load('armas')
    pal = e.palette(vs, 9)
    names = ['kunai', 'espada', 'shuriken']
    f = {'kunai': 46, 'espada': 26, 'shuriken': 38}
    out = {}
    for n, v in zip(names, vs):
        im, fg = v
        out[n] = e.repixel(v, pal, max(1, round(im.shape[1] / f[n])), max(1, round(im.shape[0] / f[n])), dark_lum=30)
    return out

if __name__ == '__main__':
    for n in CFG:
        v = views(n)
        print(n, {d: v[d].size for d in v})
    print({k: w.size for k, w in weapons().items()})
