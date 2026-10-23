# Armas e efeitos dos golpes (pixel art)

Arte das armas no boneco e dos efeitos visuais (VFX) dos golpes. Tudo é desenhado **por código** (Python, com
`numpy` e `Pillow`), no estilo do personagem chibi: contorno escuro `#141022`, rampas de 4 a 7 tons, luz vindo
de cima e da esquerda, e nada de semitransparência (os efeitos somem se desfazendo em pedaços).

## Pastas

| Pasta | O que tem |
|---|---|
| `gerador/pix.py` | Ferramentas: rasterizar com supersampling, contorno, faixas de cor, dissolver, ruído |
| `gerador/armas.py` | Kunai de treino, kunai, espada curta (na mão); espada longa, Shuriken Gigante, pergaminho (nas costas) |
| `gerador/vfx.py` | Os 16 efeitos |
| `gerador/exportar.py` | Grava as folhas e os dados que o jogo usa, e as prévias |
| `gerador/previa.py` | Prancha ampliada de alguns efeitos: `python3 previa.py slash,explosion 3` |
| `saida/previas/` | `vfx_todos.png` e `armas.png` |

## Regerar

Rode a partir de `arte/armas-vfx/`:

```
python3 gerador/exportar.py
```

Ele grava:

- `public/assets/vfx/<efeito>.png` e `public/vfxData.js`;
- `public/assets/weapons/<arma>.png` e `public/weaponData.js`.

Os dados são **gerados**: não edite à mão. Folha nova (efeito ou arma) também precisa entrar na lista fechada de
`src/web/staticFiles.ts` (`sheets(...)`); o `test/vfx.test.ts` avisa se faltar.

## Efeitos (`public/assets/vfx/`)

Cada folha tem os quadros lado a lado (no máximo 8). `px` = pixels do boneco por pixel do efeito (2 na maioria:
efeitos grandes ficam leves e o "grão" combina com o boneco).

| Efeito | Quadros | Quando toca | Tamanho real (hitbox do servidor) |
|---|---|---|---|
| `slash` | 5 | Ataque Básico, girado para o alvo | arco de 90° e 1,6 casa |
| `hit` | 5 | qualquer dano, e a kunai batendo | — |
| `punch` | 6 | golpe do Taijutsu, no alvo | círculo de 1 casa |
| `dust` | 6 | onde o Taijutsu saiu (avanço) | — |
| `smoke` | 7 | Teleporte e Substituição | — |
| `fireball` | 4 (repete) | Fogo voando | — |
| `explosion` | 8 | Fogo batendo; a onda de choque marca o raio | círculo de 2 casas (escala com o raio) |
| `water` | 6 | Água, girada | cone de 90° e 4 casas (escala com o alcance) |
| `lightning` | 4 | Relâmpago, cortado no ponto onde bateu | linha |
| `spark` | 5 | choque do Relâmpago, no alvo | — |
| `shadow` | 6 | Sombra no chão, cortada no ponto onde bateu | linha de 4 casas |
| `bind` | 6 | amarra da Sombra, no alvo | — |
| `illusion` | 8 | Ilusão, em volta do jogador | círculo de 3 casas (escala com o raio) |
| `heal` | 8 | Cura, em quem foi curado | — |
| `stone` | 6 | Pedra, em volta do jogador | — |
| `kunai` | 2 (repete) | kunai voando (px = 1, a escala da arma) | — |

Os efeitos com direção são desenhados apontando para a **direita**; o jogo gira (`gira` nos dados). Os de linha
(`linha`) têm o comprimento máximo e o jogo corta no comprimento real.

## Armas (`public/assets/weapons/`)

Escala do boneco (1 pixel = 1 pixel do personagem).

| Arma | Onde | Folha |
|---|---|---|
| `kunai_training`, `kunai`, `tanto` | mão | 16 ângulos (0° = direita, de 22,5° em 22,5°); o centro do quadro é o meio do cabo |
| `katana` | costas | 3 vistas: frente, lado, costas |
| `fuma_shuriken` | costas | 3 vistas |
| `scroll` | costas | 3 vistas (todos os pergaminhos de classe usam esta) |

- **Na mão:** o meio do cabo vai na âncora da mão (`spriteData.js`, `mao = [x, y, plano, ângulo]`) e a lâmina
  segue o ângulo do antebraço daquele quadro. No selo do jutsu a arma da mão some (as mãos estão ocupadas).
- **Nas costas:** o meio do desenho vai na âncora das costas mais o deslocamento da vista (`desloc` nos dados).
  De frente, a espada fica quase deitada e mais comprida, com o cabo saindo de um lado do quadril e a ponta do
  outro. Essa posição foi medida na silhueta do boneco: com a cabeça chibi grande, uma espada na diagonal some
  inteira atrás do corpo.

Ordem de desenho (paperdoll):

- **Costas, de frente e de lado:** antes de tudo, atrás do corpo.
- **Costas, de costas:** por cima da roupa e por baixo do cabelo (o cabelo longo cobre o cabo).
- **Mão:** logo depois do plano do braço que segura (atrás do corpo, se o braço está atrás).
