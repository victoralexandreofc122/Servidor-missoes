"""
Alinha a Folha (78 x 60) com outra vila desenhada sobre a mesma planta: a transformação afim de casas da Folha para
casas da outra (SIFT + RANSAC, precisa de scikit-image). O resultado vai para `retrace()` em src/realtime/maps.ts.

  python3 arte/mapas/alinhar.py <imagem da outra vila> <recorte x0,y0,x1,y1> <largura> <altura> <saida.json>

Névoa: escala 0,9875 e +1,49 em x (841 pontos, erro médio de 0,07 casa). Nuvem: a mesma posição da Folha.
"""
import sys, json
import numpy as np
from PIL import Image
from skimage.feature import SIFT, match_descriptors
from skimage.measure import ransac
from skimage.transform import AffineTransform
P = 12
def load(path, crop, W, H):
    im = Image.open(path).convert('L').crop(crop).resize((W * P, H * P), Image.LANCZOS)
    return np.asarray(im).astype(float) / 255
A = load('arte/vilas/referencia_folha.jpg', (21, 0, 1104, 835), 78, 60)
img, crop, W, H = sys.argv[1], tuple(int(v) for v in sys.argv[2].split(',')), int(sys.argv[3]), int(sys.argv[4])
B = load(img, crop, W, H)
ka, kb = SIFT(), SIFT()
ka.detect_and_extract(A); kb.detect_and_extract(B)
m = match_descriptors(ka.descriptors, kb.descriptors, max_ratio=0.8, cross_check=True)
src = ka.keypoints[m[:, 0]][:, ::-1] / P   # (x, y) em casas
dst = kb.keypoints[m[:, 1]][:, ::-1] / P
model, inl = ransac((src, dst), AffineTransform, min_samples=3, residual_threshold=0.6, max_trials=5000)
print('pares', len(m), 'inliers', inl.sum())
print('matriz', np.round(model.params, 4).tolist())
res = np.linalg.norm(model(src[inl]) - dst[inl], axis=1)
print('erro médio (casas)', res.mean().round(3), 'máx', res.max().round(3))
json.dump(model.params.tolist(), open(sys.argv[5], 'w'))
