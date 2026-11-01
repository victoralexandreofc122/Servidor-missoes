# Validação técnica da caminhada (e da corrida): ciclo, pés, 4 direções, pixels soltos, duração e deslocamento.
#   python3 validar_andar.py pasta_dos_quadros prefixo [ms_por_quadro] [voo]
#   (quadros: <prefixo>_<vista>_<k>.png, de andar_quadros.mjs; voo = quadros em que os 2 pés saem do chão, ex. 2,5)
import sys
from PIL import Image
pasta, pref = sys.argv[1], sys.argv[2]
VS = ['frente', 'costas', 'direita', 'esquerda']; N = 6
MS = int(sys.argv[3]) if len(sys.argv) > 3 else 125
VOO = {int(x) for x in sys.argv[4].split(',')} if len(sys.argv) > 4 else set()
OUT = (20, 24, 43)
def load(v, k): return Image.open(f'{pasta}/{pref}_{v}_{k}.png').convert('RGBA')
def px(im): return im.load()
ok = True
print(f'Poses únicas por direção: {N} | direções: 4 | quadros totais: {N*4} (poses únicas = quadros, sem repetição no ciclo)')
print(f'Duração: {N} x {MS} ms = {N*MS} ms por ciclo (2 passos)')
for v in VS:
    fr = [load(v, k) for k in range(N)]
    P = [px(f) for f in fr]
    # pés
    bots = [max(y for y in range(96) for x in range(64) if p[x, y][3]) for p in P]
    # mudança entre quadros (incluindo último -> primeiro)
    diffs = [sum(1 for y in range(96) for x in range(64) if P[k][x, y] != P[(k + 1) % N][x, y]) for k in range(N)]
    # sobe-e-desce do corpo: deslocamento vertical que melhor encaixa o rosto e o peito (linhas 34-56) do quadro
    # na pose neutra (C_<vista>.png, exportar.mjs) — mede a cabeça sem as pontas do cabelo, que têm movimento próprio
    neutro = Image.open(f'{pasta}/../px/C_{v}.png').convert('RGBA').load()
    def bob(p):
        best = None
        for dy in range(-3, 4):
            m = max(sum(1 for y in range(34, 57) for x in range(16, 48) if p[x + dx, y + dy] == neutro[x, y]) for dx in range(-3, 4))
            if best is None or m > best[0]: best = (m, dy)
        return best[1]
    heads = [bob(p) for p in P]
    # pixels soltos: cor sem nenhum vizinho (nem na diagonal) da mesma cor, fora o contorno e o rosto (olhos e boca são carimbos)
    def soltos(p):
        c = 0
        for y in range(1, 95):
            for x in range(1, 63):
                q = p[x, y]
                if q[3] == 0 or q[:3] == OUT: continue
                if 33 <= y <= 46 and 18 <= x <= 46: continue
                # solto = nenhum dos 8 vizinhos tem a mesma cor (traço diagonal de 1 px é desenho, não sujeira)
                if all(p[x + dx, y + dy] != q for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy): c += 1
        return c
    sl0 = soltos(neutro)
    sl = [soltos(p) - sl0 for p in P]
    jump = diffs[-1] / (sum(diffs[:-1]) / (N - 1))
    print(f'{v:9s} pés(linha mais baixa)={bots} corpo dy={heads} mudança entre quadros={diffs} '
          f'(último->primeiro / média = {jump:.2f}) pixels soltos a mais que a pose neutra={sl}')
    if any(b != 89 for k, b in enumerate(bots) if k not in VOO): ok = False; print('  ERRO: pé de apoio fora da linha 89')
    if any(b == 89 for k, b in enumerate(bots) if k in VOO): ok = False; print('  ERRO: quadro de voo com pé no chão')
    if max(heads) - min(heads) > (3 if VOO else 2): ok = False; print('  ERRO: a cabeça sobe e desce demais')
    if max(sl) > 4: ok = False; print('  ERRO: a animação criou pixels soltos')
    if jump > 1.5: ok = False; print('  ERRO: salto entre o último e o primeiro quadro')
print('OK' if ok else 'FALHOU')
