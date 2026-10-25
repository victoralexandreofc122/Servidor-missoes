"""
Monstros (v19): recorta as folhas de modelo (arte/monstros/folhas, geradas no Higgsfield no estilo "tinta e brasa") em
quadros com fundo transparente e monta um atlas por monstro + os dados das animações.

    python3 arte/monstros/recortar.py

Sai em public/assets/monsters/<tipo>.webp e public/monsterData.js (gerado; não edite à mão). Para trocar uma
animação: gere a folha de novo, ajuste os retângulos em FRAMES (coordenadas da folha em pixels) e rode de novo.

Como recorta:
- o fundo de pergaminho é estimado por partes (tem manchas e vinheta) e a transparência vem da distância de cor até
  ele, então fumaça e brilho ficam semitransparentes;
- caixas desenhadas em volta dos quadros (o slime) e os títulos da folha saem;
- o círculo vermelho (pulo) e o roxo (Esmagar) desenhados embaixo do monstro saem: o jogo desenha o círculo no lugar
  de verdade (onde o golpe vai cair);
- cada monstro tem uma escala só (todas as animações do mesmo tamanho) e cada quadro guarda onde fica o pé (âncora).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'arte' / 'monstros' / 'folhas'
OUT_DIR = ROOT / 'public' / 'assets' / 'monsters'
OUT_JS = ROOT / 'public' / 'monsterData.js'

#: pixels do atlas por casa do jogo (o cliente desenha na escala da tela)
PX_PER_TILE = 128

# Retângulos (x0, y0, x1, y1) na folha. `air`: quadro no ar (o pé fica na altura do quadro indicado).
# `ring`: apaga o círculo vermelho ('red') ou roxo ('purple') desenhado embaixo dele.
MONSTERS: dict[str, dict] = {
    'slime': {
        'height': 0.85, 'boxes': True, 'solid': True,
        'erase': [(380, 550, 485, 602)],
        'frames': {
            'front': (128, 146, 478, 482), 'side': (549, 146, 900, 482), 'back': (972, 146, 1322, 482),
            'b1': (1429, 146, 1780, 482), 'b2': (1850, 146, 2201, 482), 'b3': (2275, 146, 2625, 482),
            'm1': (127, 600, 403, 955), 'm2': (428, 560, 708, 955), 'm3': (732, 600, 1013, 955), 'm4': (1035, 600, 1313, 955),
            'a1': (1399, 600, 1682, 955), 'a2': (1710, 600, 1995, 955), 'a3': (2000, 600, 2316, 955), 'a4': (2337, 600, 2643, 955),
            'hit': (124, 1101, 441, 1418),
            'd1': (575, 1095, 1060, 1422), 'd2': (1104, 1101, 1596, 1418), 'd3': (1650, 1250, 2160, 1405), 'd4': (2240, 1130, 2560, 1420),
        },
        'air': {'m2': 'm1'},
        'anims': {
            'idle': (['b1', 'b2', 'b3', 'b2'], 5, True),
            'move': (['m1', 'm2', 'm3', 'm4'], 8, True),
            'attack': (['a1', 'a2', 'a3', 'a4'], 10, False),
            'hit': (['hit'], 4, False),
            'death': (['d1', 'd2', 'd3', 'd4'], 6, False),
        },
    },
    'lodo_escuro': {
        'height': 1.05, 'solid': True,
        'erase': [(660, 1172, 822, 1224)],
        'frames': {
            'front': (160, 128, 472, 462), 'side': (555, 128, 884, 462), 'back': (984, 128, 1298, 466),
            'b1': (1504, 138, 1816, 462), 'b2': (1908, 150, 2220, 462), 'b3': (2309, 152, 2621, 462),
            'a1': (290, 505, 634, 790), 'a2': (793, 505, 1228, 792), 'a3': (1310, 505, 1807, 795), 'a4': (1913, 505, 2266, 795),
            'l1': (172, 885, 585, 1156), 'l2': (600, 795, 1125, 1132), 'l3': (1135, 860, 1500, 1138),
            'l4': (1545, 815, 2258, 1184), 'l5': (2320, 855, 2620, 1138),
            'hit': (190, 1205, 505, 1480),
            'd1': (750, 1195, 1106, 1474), 'd2': (1132, 1236, 1645, 1480), 'd3': (1672, 1226, 2190, 1484), 'd4': (2220, 1355, 2640, 1464),
        },
        'air': {'l2': 'l1'},
        'ring': {'l1': 'red'},
        'anims': {
            'idle': (['b1', 'b2', 'b3', 'b2'], 4, True),
            'attack': (['a1', 'a2', 'a3', 'a4'], 10, False),
            'leap_windup': (['l1'], 2, True),
            'leap_land': (['l2', 'l3', 'l4', 'l5'], 10, False),
            'hit': (['hit'], 4, False),
            'death': (['d1', 'd2', 'd3', 'd4'], 6, False),
        },
    },
    'lodo_sombrio': {
        'height': 1.35,
        'erase': [(1288, 78, 1668, 126), (1290, 448, 1545, 496), (138, 742, 292, 792), (2262, 742, 2342, 792), (142, 1100, 270, 1146)],
        'frames': {
            'front': (150, 30, 450, 488), 'side': (470, 30, 760, 488), 'back': (800, 30, 1110, 490),
            'f1': (1290, 60, 1570, 438), 'f2': (1630, 55, 1905, 438), 'f3': (1965, 120, 2240, 440),
            'm1': (1245, 495, 1585, 715), 'm2': (1580, 485, 1918, 715), 'm3': (1898, 480, 2242, 712), 'm4': (2272, 485, 2605, 712),
            'a1': (150, 760, 470, 1075), 'a2': (535, 760, 1048, 1070), 'a3': (1040, 775, 1710, 1074), 'a4': (1725, 770, 2044, 1076),
            'hit': (2272, 770, 2608, 1076),
            'd1': (140, 1100, 522, 1508), 'd2': (598, 1118, 1056, 1486), 'd3': (1120, 1190, 1575, 1496), 'd4': (1660, 1395, 2112, 1494),
        },
        'anims': {
            'idle': (['f1', 'f2', 'f3', 'f2'], 6, True),
            'move': (['m1', 'm2', 'm3', 'm4'], 8, True),
            'attack': (['a1', 'a2', 'a3', 'a4'], 10, False),
            'hit': (['hit'], 4, False),
            'death': (['d1', 'd2', 'd3', 'd4'], 6, False),
        },
    },
    'rei_lodo': {
        'height': 2.5,
        'erase': [(1888, 68, 2070, 122), (64, 494, 236, 542), (1506, 904, 1630, 952)],
        'frames': {
            'front': (150, 58, 470, 474), 'side': (525, 58, 728, 476), 'back': (802, 58, 1125, 474),
            'b1': (1220, 58, 1542, 474), 'b2': (1644, 58, 1967, 474), 'b3': (2005, 58, 2329, 474),
            'a1': (45, 522, 437, 878), 'a2': (430, 525, 828, 878), 'a3': (780, 516, 1124, 878),
            'l1': (1180, 585, 1492, 904), 'l2': (1462, 488, 1755, 872), 'l3': (1703, 664, 1926, 882), 'l4': (1860, 575, 2375, 888),
            's1': (100, 950, 460, 1314), 's2': (500, 950, 862, 1326), 's3': (905, 948, 1388, 1326),
            'f1': (1540, 940, 1852, 1310), 'f2': (1890, 895, 2375, 1347),
            'c1': (80, 1365, 435, 1768), 'c2': (436, 1408, 732, 1740), 'c3': (738, 1418, 1070, 1744),
            'd1': (1130, 1384, 1422, 1744), 'd2': (1418, 1430, 1704, 1742), 'd3': (1700, 1398, 1978, 1740), 'd4': (1980, 1605, 2368, 1754),
        },
        'air': {'l2': 'l1'},
        'ring': {'l1': 'red', 'c1': 'purple'},
        'anims': {
            'idle': (['front', 'b1', 'b2', 'b3'], 4, True),
            'attack': (['a1', 'a2', 'a3'], 9, False),
            'leap_windup': (['l1'], 2, True),
            'leap_land': (['l2', 'l3', 'l4'], 10, False),
            'summon': (['s1', 's2', 's3', 's3'], 5, False),
            'fury': (['f1', 'f2', 'f2', 'f1'], 6, False),
            'fury_idle': (['f1'], 2, True),
            'crush_windup': (['c1'], 2, True),
            'crush_hit': (['c2', 'c3'], 8, False),
            'death': (['d1', 'd2', 'd3', 'd4'], 5, False),
        },
    },
}


def background(rgb: np.ndarray, lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Cor do pergaminho em cada ponto (Lab e RGB): média dos pontos claros em volta, num mapa reduzido."""
    step = 8
    small_lab, small_rgb = lab[::step, ::step], rgb[::step, ::step]
    # papel = claro e pouco saturado (o verde claro do slime e o lilás não contam como pergaminho)
    paper = (small_lab[..., 0] > 62) & (np.hypot(small_lab[..., 1], small_lab[..., 2]) < 24)
    w = paper.astype(np.float32)
    den = ndi.uniform_filter(w, 25) + 1e-6
    def smooth(a: np.ndarray) -> np.ndarray:
        out = np.empty_like(a)
        for c in range(a.shape[-1]):
            out[..., c] = ndi.uniform_filter(np.where(paper, a[..., c], 0), 25) / den
        return np.kron(out, np.ones((step, step, 1)))[: lab.shape[0], : lab.shape[1]]
    return smooth(small_lab), smooth(small_rgb)


def remove_box_lines(alpha: np.ndarray, lab: np.ndarray) -> None:
    """Some com as linhas retas cinza-escuras das caixas (só nas linhas e colunas onde elas atravessam o quadro)."""
    L, chroma = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    grey = (L < 75) & (chroma < 16)
    dark = grey & (L < 55)
    rows = dark.sum(1) > 0.35 * dark.shape[1]
    cols = dark.sum(0) > 0.35 * dark.shape[0]
    rows = ndi.binary_dilation(rows, iterations=3)
    cols = ndi.binary_dilation(cols, iterations=3)
    alpha[grey & (rows[:, None] | cols[None, :])] = 0


def remove_ring(alpha: np.ndarray, rgb: np.ndarray, kind: str) -> None:
    """O círculo no chão desenhado embaixo do monstro (só na parte de baixo do quadro)."""
    hsv = color.rgb2hsv(rgb)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if kind == 'red':
        ring = ((h < 0.055) | (h > 0.95)) & (s > 0.4) & (v > 0.3)
    else:
        ring = (h > 0.68) & (h < 0.92) & (s > 0.25) & (v > 0.25)
    low = np.zeros_like(ring)
    low[int(ring.shape[0] * 0.6):] = True
    ring = ndi.binary_dilation(ring & low, iterations=3) & low
    alpha[ring] = 0


def cleanup(alpha: np.ndarray) -> np.ndarray:
    """Tira sujeira: pedaços minúsculos e restos do quadro vizinho encostados na borda."""
    solid = alpha > 0.25
    lbl, n = ndi.label(solid)
    if n == 0:
        return alpha
    sizes = ndi.sum(solid, lbl, range(1, n + 1))
    biggest = sizes.max()
    keep = np.zeros(n + 1, bool)
    slices = ndi.find_objects(lbl)
    for i, size in enumerate(sizes, start=1):
        sl = slices[i - 1]
        touches = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == alpha.shape[0] or sl[1].stop == alpha.shape[1]
        keep[i] = size >= 30 and not (touches and size < 0.2 * biggest)
    mask = ndi.binary_dilation(keep[lbl], iterations=3)
    return np.where(mask, alpha, 0)


def fill_body(alpha: np.ndarray) -> None:
    """Gosma clara por dentro: o miolo parece pergaminho e ficaria transparente. Dentro do contorno, fica opaco."""
    inside = ndi.binary_fill_holes(alpha > 0.25)
    alpha[ndi.binary_erosion(inside, iterations=3)] = 1


def body_bottom(alpha: np.ndarray) -> int:
    """Onde fica o pé: a base do maior pedaço."""
    solid = alpha > 0.5
    lbl, n = ndi.label(solid)
    if n == 0:
        return alpha.shape[0] - 1
    sizes = ndi.sum(solid, lbl, range(1, n + 1))
    ys = np.nonzero(lbl == int(np.argmax(sizes)) + 1)[0]
    return int(ys.max())


def extract(name: str, spec: dict) -> tuple[list[dict], dict]:
    sheet = np.asarray(Image.open(SHEETS / f'{name}.jpg').convert('RGB')).astype(np.float32) / 255
    lab = color.rgb2lab(sheet)
    bg_lab, bg_rgb = background(sheet, lab)
    dist = np.sqrt(((lab - bg_lab) ** 2).sum(-1))
    alpha_all = np.clip((dist - 10) / 18, 0, 1)
    for x0, y0, x1, y1 in spec.get('erase', []):
        alpha_all[y0:y1, x0:x1] = 0
    frames: dict[str, dict] = {}
    for key, (x0, y0, x1, y1) in spec['frames'].items():
        a = alpha_all[y0:y1, x0:x1].copy()
        rgb = sheet[y0:y1, x0:x1]
        if spec.get('boxes'):
            remove_box_lines(a, lab[y0:y1, x0:x1])
        ring = spec.get('ring', {}).get(key)
        if ring:
            remove_ring(a, rgb, ring)
        a = cleanup(a)
        if spec.get('solid'):
            fill_body(a)
        # A cor sem o pergaminho por trás (a borda semitransparente não fica bege).
        bg = bg_rgb[y0:y1, x0:x1]
        safe = np.maximum(a, 0.05)[..., None]
        col = np.clip((rgb - (1 - safe) * bg) / safe, 0, 1)
        frames[key] = {'rgba': np.dstack([col, a]), 'ground': y0 + body_bottom(a), 'cx': (x0 + x1) / 2, 'x0': x0, 'y0': y0}
    for key, ref in spec.get('air', {}).items():
        frames[key]['ground'] = frames[ref]['ground']
    # Uma escala por monstro: a altura do quadro de frente parado = `height` casas.
    front = frames['front']['rgba'][..., 3] > 0.5
    ys = np.nonzero(front.any(1))[0]
    scale = spec['height'] * PX_PER_TILE / (ys.max() - ys.min() + 1)
    out = []
    for key, f in frames.items():
        rgba = f['rgba']
        ys, xs = np.nonzero(rgba[..., 3] > 0.02)
        if len(ys) == 0:
            raise SystemExit(f'{name}/{key}: quadro vazio')
        top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = (rgba[top:bottom, left:right] * 255).astype(np.uint8)
        img = Image.fromarray(crop, 'RGBA')
        w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
        img = img.resize((w, h), Image.LANCZOS)
        ax = (f['cx'] - f['x0'] - left) * scale
        ay = (f['ground'] - f['y0'] - top) * scale
        out.append({'key': key, 'img': img, 'ax': round(ax), 'ay': round(ay)})
    return out, {'scale': scale}


def pack(frames: list[dict]) -> tuple[Image.Image, list[list[int]]]:
    """Prateleiras: do mais alto para o mais baixo, até 2048 px de largura, 2 px de folga."""
    order = sorted(range(len(frames)), key=lambda i: -frames[i]['img'].height)
    width = min(2048, max(256, int(math.sqrt(sum(f['img'].width * f['img'].height for f in frames)) * 1.4)))
    x = y = shelf = 0
    pos: dict[int, tuple[int, int]] = {}
    for i in order:
        im = frames[i]['img']
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 2, 0
        pos[i] = (x, y)
        x += im.width + 2
        shelf = max(shelf, im.height)
    atlas = Image.new('RGBA', (width, y + shelf), (0, 0, 0, 0))
    rects = []
    for i, f in enumerate(frames):
        px, py = pos[i]
        atlas.paste(f['img'], (px, py))
        rects.append([px, py, f['img'].width, f['img'].height, f['ax'], f['ay']])
    return atlas, rects


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = {}
    for name, spec in MONSTERS.items():
        frames, info = extract(name, spec)
        atlas, rects = pack(frames)
        atlas.save(OUT_DIR / f'{name}.webp', quality=88, method=6)
        index = {f['key']: i for i, f in enumerate(frames)}
        anims = {a: {'frames': [index[k] for k in keys], 'fps': fps, 'loop': loop} for a, (keys, fps, loop) in spec['anims'].items()}
        data[name] = {'file': f'assets/monsters/{name}.webp', 'height': spec['height'], 'frames': rects, 'anims': anims}
        print(f'{name}: {len(frames)} quadros, atlas {atlas.width}x{atlas.height}, escala {info["scale"]:.3f}, '
              f'{(OUT_DIR / f"{name}.webp").stat().st_size // 1024} KB')
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT_JS.write_text(
        '// Gerado por arte/monstros/recortar.py a partir das folhas em arte/monstros/folhas. Não edite à mão.\n'
        '// frames: [x, y, largura, altura, pé x, pé y] no atlas; o desenho olha para a DIREITA.\n'
        f'export const PX_PER_TILE = {PX_PER_TILE};\n'
        f'export const MONSTER_ART = {body};\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
