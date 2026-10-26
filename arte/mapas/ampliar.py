"""
Amplia a imagem do mapa 4x com o Real-ESRGAN (RRDBNet), em blocos, na CPU (precisa de torch, numpy e Pillow).
Para as imagens com pouca resolução para o tamanho do mapa (menos de ~40 px por casa: vilas, Floresta, Zona), antes de
fatiar (docs/mapas.md, 6.1).

  python3 -I arte/mapas/ampliar.py <pesos.pth> <entrada> <saida.png> --blocos 23

Pesos (não ficam no repositório): RealESRGAN_x4plus.pth, do lançamento oficial do projeto
(github.com/xinntao/Real-ESRGAN, releases v0.1.0), 23 blocos. É o que guarda melhor a textura do pixel art; o
RealESRGAN_x4plus_anime_6B (6 blocos) redesenha demais. Os pesos são lidos só como tensores (weights_only=True):
nada do arquivo é executado. Uma imagem de 1125 x 840 leva uns 3 minutos em 4 núcleos.
"""
import argparse
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = RDB(nf, gc)
        self.rdb2 = RDB(nf, gc)
        self.rdb3 = RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nb, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pesos')
    ap.add_argument('entrada')
    ap.add_argument('saida')
    ap.add_argument('--blocos', type=int, default=6)
    ap.add_argument('--tile', type=int, default=192)
    a = ap.parse_args()
    sd = torch.load(a.pesos, map_location='cpu', weights_only=True)
    sd = sd.get('params_ema', sd.get('params', sd))
    net = RRDBNet(a.blocos)
    net.load_state_dict(sd, strict=True)
    net.eval()
    img = np.asarray(Image.open(a.entrada).convert('RGB')).astype(np.float32) / 255.0
    h, w, _ = img.shape
    x = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
    out = torch.zeros(1, 3, h * 4, w * 4)
    T, P = a.tile, 12
    t0 = time.time()
    n = 0
    with torch.inference_mode():
        for y0 in range(0, h, T):
            for x0 in range(0, w, T):
                y1, x1 = min(y0 + T, h), min(x0 + T, w)
                py0, px0 = max(y0 - P, 0), max(x0 - P, 0)
                py1, px1 = min(y1 + P, h), min(x1 + P, w)
                o = net(x[:, :, py0:py1, px0:px1])
                out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = o[:, :, (y0 - py0) * 4:(y0 - py0 + y1 - y0) * 4, (x0 - px0) * 4:(x0 - px0 + x1 - x0) * 4]
                n += 1
    res = (out.squeeze(0).permute(1, 2, 0).clamp(0, 1).numpy() * 255.0).round().astype(np.uint8)
    Image.fromarray(res).save(a.saida)
    print(f'{a.entrada}: {w}x{h} -> {w * 4}x{h * 4} em {time.time() - t0:.0f} s ({n} blocos)')


if __name__ == '__main__':
    main()
