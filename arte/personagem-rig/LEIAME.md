# Boneco desenhado por código: esqueleto 3D + pixel art em camadas (v25)

Este é o personagem que o jogo usa desde a v25. Ele substitui o personagem em atlas (`arte/personagem-chibi/`, v9
a v24). Não existe mais imagem do boneco: o próprio aparelho desenha cada quadro, pixel a pixel, e guarda o
resultado.

## Como funciona

1. **Esqueleto de palito 3D** (`public/rig.js`): quadril, cintura, peito, pescoço, cabeça, ombros, cotovelos,
   pulsos, mãos, quadris, joelhos, tornozelos, calcanhares e pontas dos pés. Cada animação é uma função do tempo
   que dá os ângulos das juntas. Como o esqueleto é 3D, a mesma animação serve para as 4 direções e para o giro
   entre elas (16 passos).
2. **Corpo base** (`public/rigArt.js`): cada parte é uma forma simples presa num osso. Cabeça, tronco, quadril, mãos
   e pés são elipsoides; braços, pernas e mechas são tubos. As formas são desenhadas pixel a pixel na célula 64 x 96
   (a mesma do boneco antigo, com o pé na linha 92). A luz vem de cima, da esquerda e da frente e escolhe o tom da
   rampa em faixas, sem degradê. O contorno escuro é desenhado por fora e o traço por dentro onde uma parte passa
   na frente da outra.
3. **Camadas**: as roupas são as mesmas formas do corpo, um pouco maiores e presas nos mesmos ossos. Por isso cabem
   certinho em qualquer pose e em qualquer direção.
4. **Rosto**: olhos (os aprovados do boneco antigo), sobrancelhas e boca são carimbos de pixel art desenhados à mão,
   postos no lugar certo da cabeça. Eles não deformam: há uma versão de frente e uma de lado. Os símbolos da vila
   na placa e no peito e os emblemas das capas também são carimbos.
5. **Física do pano**: a capa é uma grade de pontos presa por cima dos ombros, resolvida a cada quadro. A gravidade
   (e o vento ao andar e correr) puxa o pano, cada elo tem comprimento fixo, e o pano é empurrado para fora do
   corpo: cabeça, tronco, ombros, braços, coxas, canelas e pés. O pano assenta nos ombros e se dobra por cima do
   braço e do joelho que vão para trás. As pontas da bandana são correntinhas com a mesma física. O cabelo longo
   pende na direção da gravidade e balança com o passo.
6. **No navegador** (`public/figure.js`): cada quadro é desenhado uma vez (~2 ms; ~3 ms com capa) e guardado. Ele é
   cortado em fatias pela profundidade, para a arma da mão e os itens das costas entrarem na frente ou atrás do corpo
   do jeito certo. Na troca de animação, a pose de antes se mistura com a nova por 120 ms.

## Camadas

| Camada | O que é | Cores |
|---|---|---|
| `corpo` | Cabeça, orelhas, pescoço, tronco, braços, mãos, pernas, pés e a roupa de baixo | pele |
| `olhos` | Olhos e sobrancelhas (`masculino` ou `cilios`; expressões: abertos, fechados, foco, dor) | olho |
| `boca` | Calma, sorriso, grito, dentes | pele |
| `cabelo` | `espetado` (pontas, franja em pontas) e `longo_lateral` (liso, franja de lado, mechas) | cabelo |
| `chapeu` | Bandana: faixa, placa de metal com o símbolo da vila (riscado no renegado), nó e pontas | vila + aço |
| `camisa` | Camisa básica (manga comprida, gola, símbolo no peito) ou a blusa escura do conjunto | jogador / vila |
| `calca` | Calça básica até a canela com faixas, ou a calça inteira do conjunto | jogador / vila |
| `conjunto` | Colete da vila (bolsos, zíper, gola alta, símbolo nas costas) | vila |
| `acessorio` | Porta-kunai na coxa e bolsinha na cintura (com o conjunto) | preto, couro |
| `sapato` | Sandália ninja (dedos de fora) ou bota | item calçado |
| `capa` | Capa de viagem, da vila, do Kage (影), da Akatsuki (nuvens) e do campeão | capa |
| armas | Arte das armas (`public/assets/weapons`) na âncora da mão, com o ângulo da lâmina saindo do antebraço | arma |

## Animações

`parado` (guarda leve, respira, pisca), `andar`, `correr` (corrida ninja: corpo inclinado, braços para trás),
`soco`, `chute`, `jutsu` (selo de mão e palmas para a frente), `meditar` (agachado com o selo), `golpe` (corte com
arma), `dano` (tranco ao levar golpe) e `morto` (de joelhos).

## Prancha e prévias

```
node arte/personagem-rig/prancha.mjs saida.png [visuais|anim|giro|capas|camadas|olhos] [escala]
node arte/personagem-rig/prancha_esqueleto.mjs saida.rgba
```

Em `previas/`: `visuais.png` (5 visuais nas 4 direções), `animacoes.png` (todas as animações de frente e de lado,
com a linha vermelha da lâmina), `giro.png` (16 passos), `capas.png` (as 5 capas, parado e correndo),
`camadas.png` (cada camada sozinha e o boneco montado), `rostos.png` (expressões) e `esqueleto.png` (o palito).

## Para mexer

- **Proporções**: `BODY` em `rig.js` (por gênero).
- **Pose**: `ANIMS` em `rig.js`. Use quadros-chave com `keyed` para os golpes, ou uma função de seno para os ciclos.
- **Roupa nova**: em `buildScene` (`rigArt.js`), use as formas do corpo com alguns pixels a mais (`add3(raio, d)`),
  presas nos mesmos ossos, numa camada própria. Para uma cor nova, ponha a rampa em `public/spriteData.js`.
- **Penteado novo**: em `hairShapes`, use pontas (`spike`), franja (`bang`) ou mantos (`sheets`, com `hang` para
  pender). Ponha o nome também em `HAIR_STYLES` (`src/realtime/appearance.ts`) e em `OPTIONS` (`public/sprites.js`).
- O teste `test/sprites.test.ts` confere os pés no chão, o espelho esquerda/direita, os olhos só de frente, as
  camadas e o cache.
