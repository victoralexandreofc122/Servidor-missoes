# Imagens de prévia: peças separadas (vista explodida), armas e um teste de caminhada
# montado SÓ movendo as peças (prova de que a separação serve para animar).
from PIL import Image, ImageDraw, ImageFont
import gerar as g

OUT = 'previa'
BG = (235, 232, 222, 255)
Z = 6
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except OSError:
    FONT = ImageFont.load_default()

NAMES = {
    'cabeca': 'cabeça', 'cabelo': 'cabelo', 'tronco': 'tronco', 'braco_esq': 'braço esq.', 'braco_dir': 'braço dir.',
    'perna_esq': 'perna esq.', 'perna_dir': 'perna dir.', 'roupa_cima': 'roupa de cima', 'munhequeira_esq': 'munhequeira esq.',
    'munhequeira_dir': 'munhequeira dir.', 'calca_esq': 'calça esq.', 'calca_dir': 'calça dir.', 'sapato_esq': 'sapato esq.',
    'sapato_dir': 'sapato dir.', 'bandana': 'bandana',
}


def up(img, z=Z):
    return img.resize((img.width * z, img.height * z), Image.NEAREST)


def explodida():
    cols, cell_w, cell_h = 5, g.W * Z + 30, g.H * Z + 34
    rows = (len(g.PARTS) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w + 20, rows * cell_h + 20), BG)
    d = ImageDraw.Draw(sheet)
    for k, name in enumerate(g.PARTS):
        x, y = 10 + (k % cols) * cell_w, 10 + (k // cols) * cell_h
        d.rectangle([x + 4, y + 4, x + cell_w - 10, y + cell_h - 8], outline=(200, 194, 180), width=2)
        sheet.alpha_composite(up(g.part_img('baixo', name)), (x + 12, y + 6))
        d.text((x + cell_w / 2 - 5, y + cell_h - 24), NAMES[name], fill=(40, 34, 30), font=FONT, anchor='mm')
    sheet.save(f'{OUT}/arte-pecas-separadas.png')


def direcoes():
    labels = ['baixo (frente)', 'esquerda', 'direita', 'cima (costas)']
    sheet = Image.new('RGBA', (4 * (g.W * 8 + 20) + 20, g.H * 8 + 50), BG)
    d = ImageDraw.Draw(sheet)
    for k, dr in enumerate(g.DIRS):
        x = 20 + k * (g.W * 8 + 20)
        sheet.alpha_composite(up(g.compose(dr), 8), (x, 10))
        d.text((x + g.W * 4, g.H * 8 + 30), labels[k], fill=(40, 34, 30), font=FONT, anchor='mm')
    sheet.save(f'{OUT}/arte-4-direcoes.png')


def armas():
    imgs = [(n, up(g.weapon_img(n), 10)) for n in ['kunai', 'espada', 'shuriken']]
    w = sum(i.width for _, i in imgs) + 40 * (len(imgs) + 1)
    h = max(i.height for _, i in imgs) + 70
    sheet = Image.new('RGBA', (w, h), BG)
    d = ImageDraw.Draw(sheet)
    x = 40
    for n, i in imgs:
        sheet.alpha_composite(i, (x, (h - 40 - i.height) // 2))
        d.text((x + i.width // 2, h - 22), n, fill=(40, 34, 30), font=FONT, anchor='mm')
        x += i.width + 40
    sheet.save(f'{OUT}/arte-armas.png')


# Caminhada de teste: cada quadro só DESLOCA peças inteiras (pernas, braços e o resto do corpo).
GROUPS = {
    'perna_esq': ('perna_esq', 'calca_esq', 'sapato_esq'), 'perna_dir': ('perna_dir', 'calca_dir', 'sapato_dir'),
    'braco_esq': ('braco_esq', 'munhequeira_esq'), 'braco_dir': ('braco_dir', 'munhequeira_dir'),
}


def frame(dr, off):
    """off: grupo -> (dx, dy). O corpo (resto) usa a chave 'corpo'."""
    img = Image.new('RGBA', (g.W, g.H + 2), (0, 0, 0, 0))
    for name in g.LAYERS[dr]:
        key = next((k for k, v in GROUPS.items() if name in v), 'corpo')
        dx, dy = off.get(key, (0, 0))
        img.alpha_composite(g.part_img(dr, name), (dx, dy + 1))
    return img


def caminhada():
    side = [  # olhando para a esquerda: perna perto vai para frente (x-), a longe para trás
        {'perna_esq': (-2, 0), 'perna_dir': (1, 0), 'braco_esq': (1, 0), 'braco_dir': (-1, 0), 'corpo': (0, 0)},
        {'perna_esq': (0, -1), 'perna_dir': (0, 0), 'corpo': (0, -1), 'braco_esq': (0, -1), 'braco_dir': (0, -1)},
        {'perna_esq': (1, 0), 'perna_dir': (-2, 0), 'braco_esq': (-1, 0), 'braco_dir': (1, 0), 'corpo': (0, 0)},
        {'perna_esq': (0, 0), 'perna_dir': (0, -1), 'corpo': (0, -1), 'braco_esq': (0, -1), 'braco_dir': (0, -1)},
    ]
    front = [
        {'perna_esq': (0, -1), 'braco_dir': (0, -1), 'corpo': (0, 0)},
        {'corpo': (0, -1), 'braco_esq': (0, -1), 'braco_dir': (0, -1)},
        {'perna_dir': (0, -1), 'braco_esq': (0, -1), 'corpo': (0, 0)},
        {'corpo': (0, -1), 'braco_esq': (0, -1), 'braco_dir': (0, -1)},
    ]
    frames = []
    for k in range(4):
        canvas = Image.new('RGBA', ((g.W * 3) * 6, (g.H + 2) * 6), BG)
        canvas.alpha_composite(up(frame('baixo', front[k])), (0, 0))
        canvas.alpha_composite(up(frame('esquerda', side[k])), (g.W * 6, 0))
        canvas.alpha_composite(up(frame('cima', front[(k + 2) % 4])), (g.W * 12, 0))
        frames.append(canvas.convert('RGB'))
    frames[0].save(f'{OUT}/arte-teste-caminhada.gif', save_all=True, append_images=frames[1:], duration=160, loop=0)


if __name__ == '__main__':
    import os; os.makedirs(OUT, exist_ok=True)
    explodida()
    direcoes()
    armas()
    caminhada()
