# Recorta cada vista das folhas geradas por IA e "repixeliza" no tamanho do jogo.
from PIL import Image
import numpy as np

SEGS = {}
def load(n):
    im = np.asarray(Image.open(f'src/{n}.jpg').convert('RGB')).astype(int)
    mx, mn = im.max(2), im.min(2)
    fg = ~((mn > 222) & (mx - mn < 30))
    cols = fg.sum(0) > 2
    segs, s = [], None
    for x, c in enumerate(list(cols) + [False]):
        if c and s is None: s = x
        if not c and s is not None:
            if x - s > 15: segs.append((s, x))
            s = None
    out = []
    for a, b in segs:
        sub = fg[:, a:b]
        rows = np.where(sub.sum(1) > 0)[0]
        y0, y1 = rows.min(), rows.max() + 1
        out.append((im[y0:y1, a:b], fg[y0:y1, a:b]))
    return out

def palette(views, k):
    px = np.concatenate([v[f] for v, f in views])
    img = Image.fromarray(px.reshape(1, -1, 3).astype('uint8'))
    q = img.quantize(colors=k, method=Image.Quantize.MAXCOVERAGE)
    pal = np.array(q.getpalette()[:k * 3]).reshape(k, 3)
    return pal

def repixel(view, pal, tw, th, dark_lum=40, outline=(20, 16, 32)):
    im, fg = view
    H, W = fg.shape
    lum = im.mean(2)
    # cor mais próxima da paleta para cada pixel
    d = ((im[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(3)
    idx = d.argmin(2)
    out = np.zeros((th, tw, 4), dtype='uint8')
    mask = np.zeros((th, tw), bool)
    for j in range(th):
        for i in range(tw):
            ya, yb = int(j * H / th), max(int(j * H / th) + 1, int((j + 1) * H / th))
            xa, xb = int(i * W / tw), max(int(i * W / tw) + 1, int((i + 1) * W / tw))
            f = fg[ya:yb, xa:xb]
            if f.mean() < 0.5: continue
            ids = idx[ya:yb, xa:xb][f]
            dk = (lum[ya:yb, xa:xb][f] < dark_lum)
            w = np.where(dk, 0.3, 1.0)       # contorno conta menos: o miolo decide a cor
            cnt = np.bincount(ids, weights=w, minlength=len(pal))
            c = pal[cnt.argmax()]
            out[j, i, :3] = c; out[j, i, 3] = 255; mask[j, i] = True
    # limpeza: pixel isolado (ruído do JPEG/IA) vira a cor da vizinhança; brilho no olho escuro fica
    lumo = out[:, :, :3].mean(2)
    for _ in range(2):
        cp = out.copy()
        for j in range(1, th - 1):
            for i in range(1, tw - 1):
                if not mask[j, i]: continue
                nb = [tuple(out[j + dy, i + dx, :3]) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and mask[j + dy, i + dx]]
                if len(nb) < 7: continue
                me = tuple(out[j, i, :3])
                if nb.count(me) >= 2: continue
                m = max(set(nb), key=nb.count)
                if nb.count(m) < 4: continue
                if sum(int(c) for c in m) / 3 < 70 and lumo[j, i] > 150: continue   # brilho do olho
                cp[j, i, :3] = m
        out = cp
    # contorno de 1 px na borda (por dentro), para todas as peças ficarem iguais
    for j in range(th):
        for i in range(tw):
            if not mask[j, i]: continue
            edge = any(not (0 <= j + dy < th and 0 <= i + dx < tw) or not mask[j + dy, i + dx]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge: out[j, i, :3] = outline
    return Image.fromarray(out, 'RGBA')
