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
| `fuma` | 4 (repete) | Shuriken Gigante voando, girando | linha de 0,8 casa (atravessa) |

Os efeitos com direção são desenhados apontando para a **direita**; o jogo gira (`gira` nos dados). Os de linha
(`linha`) têm o comprimento máximo e o jogo corta no comprimento real.

## Armas (`public/assets/weapons/`)

Escala do boneco (1 pixel = 1 pixel do personagem). O jogador equipa **uma** arma de ataque por vez (o servidor
só tem um lugar para ela); o pergaminho é à parte e fica sempre nas costas.

| Arma | Fica parada | Folhas |
|---|---|---|
| `kunai_training`, `kunai`, `tanto` | na mão | `<arma>.png`: 16 ângulos |
| `katana` | nas costas | `katana.png` (3 vistas), `katana_mao.png` (desembainhada, 16 ângulos), `katana_bainha.png` (bainha vazia, 3 vistas) |
| `fuma_shuriken` | nas costas | `fuma_shuriken.png` (3 vistas), `fuma_shuriken_mao.png` (na mão, 16 ângulos); voando: o efeito `fuma` |
| `scroll` | nas costas | `scroll.png` (3 vistas; todos os pergaminhos de classe usam esta) |

- **Kunai** como nas referências: lâmina escura em folha larga, com uma face clara e outra escura que se encontram
  na crista do meio; cabo enrolado em faixa bege; argola na ponta. A de treino é mais clara, com faixa de couro.
- **Na mão:** o centro do quadro é o punho e vai na âncora da mão (`spriteData.js`: `mao = [x, y, plano, ângulo da
  lâmina]`). A arma é desenhada logo **antes** do braço: o punho fecha por cima do cabo e só a lâmina e a argola
  aparecem. No selo do jutsu ela some (as mãos estão ocupadas).
- **Ângulo da lâmina:** vem de cada quadro da animação. Parado, andando e correndo, é o antebraço girado 45° para fora
  (a lâmina sai do lado do polegar, apontando para baixo e para fora, como na pose de guarda). No golpe, a pose diz.
- **Golpe com arma** (animação `golpe` do boneco: prepara, corta, termina): o Ataque Básico com arma equipada usa
  ela. A espada sai das costas para a mão e volta no fim, deixando a bainha vazia nas costas enquanto isso. Sem
  arma, o ataque continua sendo soco e chute.
- **Shuriken Gigante (arremesso, `lanca` nos dados):** 60 px de ponta a ponta, maior que as costas (de frente, as
  lâminas saem dos dois lados da cintura). No golpe ela aparece na mão no preparo e sai voando no lançamento
  (efeito `fuma`, girando); as costas ficam vazias até ela terminar o caminho.
- **Nas costas:** o meio do desenho vai na âncora das costas mais o deslocamento da vista (`desloc` nos dados).
  A espada longa (~66 px) vai **deitada na horizontal, na altura do cinto**, como na referência das 8 vistas: as
  duas pontas passam bem dos lados do corpo, as mãos ficam na frente dela e, de costas, ela atravessa a lombar. O
  cabo fica do lado esquerdo do personagem: de frente, à direita da tela; de costas, à esquerda; de lado, para a
  frente.

Ordem de desenho (paperdoll):

- **Costas:** de frente e de lado, antes de tudo (atrás do corpo); de costas, por cima de tudo.
- **Mão:** logo antes do plano do braço que segura (se o braço está atrás do corpo, a arma também está).
