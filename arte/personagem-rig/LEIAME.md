# Boneco desenhado por código: esqueleto 3D + pixel art em camadas (v25, estilo da v26)

Este é o personagem que o jogo usa desde a v25. Ele substitui o personagem em atlas (`arte/personagem-chibi/`, v9
a v24). Não existe mais imagem do boneco: o próprio aparelho desenha cada quadro, pixel a pixel, e guarda o
resultado. Na v26, o desenho passou para o estilo da folha de referência do Victor: chibi com contorno escuro grosso,
sombreado em 2 a 3 tons, cabelo preto bagunçado em mechas, olhos grandes, casaco azul-petróleo com capuz e botas.

## Como funciona

1. **Esqueleto de palito 3D** (`public/rig.js`): quadril, cintura, peito, pescoço, cabeça, ombros, cotovelos,
   pulsos, mãos, quadris, joelhos, tornozelos, calcanhares e pontas dos pés. Cada animação é uma função do tempo
   que dá os ângulos das juntas. Como o esqueleto é 3D, a mesma animação serve para as 4 direções e para o giro
   entre elas (16 passos). Os lados são perfil puro; a esquerda é o espelho da direita.
2. **Corpo base** (`public/rigArt.js`): cada parte é uma forma simples presa num osso. Cabeça, tronco, quadril, mãos
   e pés são elipsoides; braços e pernas são tubos; panos e mechas em lâmina são triângulos. As formas são desenhadas
   pixel a pixel na célula 64 x 96 (o pé na linha 92). A luz vem de cima, da esquerda e da frente e escolhe o tom da
   rampa em faixas, sem degradê.
3. **Traço** (`OUTLINE`, um quase preto azulado, igual para tudo): por fora do boneco e por dentro, onde uma peça de
   outro grupo passa na frente da outra (a franja em cima da testa, o braço na frente do casaco). Peças do mesmo grupo
   (a calota do cabelo e as mechas de trás) não ganham traço entre si.
4. **Camadas**: as roupas são as mesmas formas do corpo, um pouco maiores e presas nos mesmos ossos. Por isso cabem
   certinho em qualquer pose e em qualquer direção.
5. **Rosto**: olhos, sobrancelhas, boca e nariz são carimbos de pixel art desenhados à mão, postos no lugar certo da
   cabeça e só onde a cabeça aparece (a franja passa na frente). Há uma versão de frente e uma de perfil. Os símbolos
   da vila na placa e no peito e os emblemas das capas também são carimbos.
6. **Física do pano**: a capa e as abas do casaco são grades de pontos presas no corpo, resolvidas a cada quadro. A
   gravidade (e o vento ao andar e correr) puxa o pano, cada elo tem comprimento fixo, e o pano é empurrado para fora
   do corpo: cabeça, tronco, ombros, braços, coxas, canelas e pés. A capa assenta nos ombros e se dobra por cima do
   braço e do joelho que vão para trás. As abas do casaco caem retas paradas, abrem andando e voam correndo. As pontas
   da bandana e da faixa são correntinhas com a mesma física. O cabelo longo pende e balança com o passo.
7. **Acabamento**: no fim de cada quadro, o vazio de 1 px cercado de traço (ou 2 px em linha) vira traço, e pedacinho
   solto de até 10 px some. Isso acontece onde uma ponta fina de mecha quase encosta em outra peça; à mão, ninguém
   desenharia esses pontinhos.
8. **No navegador** (`public/figure.js`): cada quadro é desenhado uma vez (~2,7 ms; ~4 ms com capa) e guardado. Ele é
   cortado em fatias pela profundidade, para a arma da mão e os itens das costas entrarem na frente ou atrás do corpo
   do jeito certo. Na troca de animação, a pose de antes se mistura com a nova por 120 ms. O giro pega o caminho mais
   curto; a meia-volta entre esquerda e direita passa pela frente.

## Camadas

| Camada | O que é | Cores |
|---|---|---|
| `corpo` | Cabeça, orelhas, pescoço, tronco, braços, mãos, pernas, pés e a roupa de baixo | pele |
| `olhos` | Olhos e sobrancelhas (`masculino` ou `cilios`; expressões: abertos, fechados, foco, dor) | olho |
| `boca` | Calma, sorriso, grito, dentes e o nariz (um ponto de sombra) | pele |
| `cabelo` | `espetado` (coroa de pontas, franja em lâminas), `longo_lateral` (liso, franja de lado, mechas que pendem) e `baguncado` (mechas em lâmina saindo do redemoinho) | cabelo |
| `chapeu` | Bandana: faixa, placa de metal com o símbolo da vila (riscado no renegado), rebites, nó e pontas | vila + aço |
| `camisa` | Camisa básica (manga comprida, gola, símbolo no peito), a blusa escura do conjunto ou a blusa ameixa do casaco (gola em V e faixa preta) | jogador / vila |
| `casaco` | Acessório (v27, slot Acessório): casaco com capuz por cima da roupa equipada, aberto em V, lapelas, mangas largas com punho dobrado, capuz caído nas costas, abas até o joelho com bolsos | cor do item |
| `calca` | Calça básica até a canela com faixas, a calça inteira do conjunto ou a larga do casaco (presa na bota) | jogador / vila |
| `conjunto` | Colete da vila (bolsos, zíper, gola alta, símbolo nas costas) | vila |
| `acessorio` | Porta-kunai na coxa e bolsinha (conjunto) ou o nó da faixa com as pontas (casaco) | preto, couro |
| `sapato` | Sandália ninja (dedos de fora) ou bota (cano até o meio da canela, punho dobrado, sola) | item calçado |
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

Em `previas/`: `visuais.png` (o visual da referência e outros 5, nas 4 direções), `animacoes.png` (todas as animações
de frente e de lado, com a linha vermelha da lâmina), `giro.png` (16 passos), `capas.png` (as 5 capas, parado e
correndo), `camadas.png` (cada camada sozinha e o boneco montado: o casaco de frente, de lado e de costas, o conjunto
da vila e o feminino), `rostos.png` (expressões) e `esqueleto.png` (o palito).

## Para mexer

- **Proporções**: `BODY` em `rig.js` (por gênero).
- **Pose**: `ANIMS` em `rig.js`. Use quadros-chave com `keyed` para os golpes, ou uma função de seno para os ciclos.
- **Roupa nova**: em `buildScene` (`rigArt.js`), use as formas do corpo com alguns pixels a mais (`add3(raio, d)`),
  presas nos mesmos ossos, numa camada própria. Pano solto usa `drape` (grade com física) e `emitCloth`. Para uma cor
  nova, ponha a rampa em `public/spriteData.js` e o nome em `CLOTH_BASE` (`src/realtime/appearance.ts`).
- **Penteado novo**: em `hairShapes`, use lâminas (`B(az0, el0, az1, el1, fora, largura)`: da base até a ponta, em
  graus na cabeça; `front` para a franja, com traço em cima do rosto), pontas em cone (`spike`) ou mantos (`sheets`,
  com `hang` para pender). Ponha o nome também em `HAIR_STYLES` (`src/realtime/appearance.ts`) e em `OPTIONS`
  (`public/sprites.js`).
- **Olhos**: `EYES` em `rigArt.js` (linhas 0 a 2 são a sobrancelha; K traço, P pupila, H brilho, W branco, 1 a 3
  íris). Mude no boneco de verdade, de frente, a 3/4 e de perfil, antes de decidir.
- O teste `test/sprites.test.ts` confere os pés no chão, o espelho esquerda/direita, os olhos só de frente, as
  camadas, o casaco, o giro (chega em toda direção sem trocar de sentido), o acabamento (sem furinho e sem cisco) e o
  cache.
