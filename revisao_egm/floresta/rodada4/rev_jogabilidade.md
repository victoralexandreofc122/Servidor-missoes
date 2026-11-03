# Revisão Goldfish, rodada 4: jogabilidade e colisão (Floresta)

Coordenadas de tela nas imagens reduzidas a 1600x1000 (multiplique por 1,6 para o original 2560x1600). Nessa escala,
1 casa ≈ 40 px. Coordenadas de mapa (casas) vêm de `forest()` em `src/realtime/maps.ts`.

## Nota: 7/10 (antes 6)

Barracas, caixotes e barris agora colidem só na base, o sumidouro colide numa oval dentro da água, a copa do Carvalho
abre um círculo em volta do boneco e a trilha está livre. O que segura a nota: o platô do paredão virou uma parede
grande que parece grama, e várias copas escondem chão andável onde nascem monstros.

## Resolvido desde a rodada anterior

- **#1 Paredes soltas na trilha:** resolvido. As duas viraram placas de madeira que colidem só no poste (0,3 casa).
  Em 1-entrada a placa (x 548-590, y 150-205) bate com o desenho. Agora há teste para a trilha sem bloqueio.
- **#3 Barracas, caixotes e barris:** resolvido. Em 2-acampamento a caixa da barraca da direita (y 289-347 na tela)
  cobre só o terço de baixo do desenho (y 205-330). O mesmo vale para os caixotes, os barris, o tronco caído e a pedra.
- **#5 Lago quadrado:** resolvido. Em 3-lago-colisao as faixas seguem a água (x 797-1083, y 215-408) e a margem de
  pedra em volta é chão.
- **#7 Copa do Carvalho:** resolvido para o jogador (5-carvalho: o círculo aberto funciona bem).
- **#6 Abismo:** em parte. As beiras da esquerda e da direita têm pedra; a de cima (encontro com o leito de seixos,
  y ≈ 700 em 4-paredao) continua uma linha reta de grama.
- **#4 Paredão em duas faixas:** em parte. Em 4-paredao há uma face só. Em 3-lago ainda aparecem duas faces de pedra
  (y 700-840 e y 910+) com uma faixa escura no meio. Conferir qual imagem está atualizada.

## Achados

### Bloqueador

**B1. O platô do paredão é uma parede invisível de 33 x 7,5 casas.**
- Onde: `cliff plateau` em x 54,5-87,5, y 25-32,5 (e x 91-100). Em 3-lago-colisao é todo o vermelho de y 540 a
  700; sem o F2 (3-lago) é só uma grama um pouco mais escura, com borda suave.
- Problema: quem desce do sumidouro para o sul bate em "grama" sem nada desenhado na beira.
- O que fazer: escolher um dos dois caminhos.
  (a) O platô vira chão andável e colide só a face, com uma beira de 0,5 casa no alto dela.
  (b) A beira norte do platô ganha leitura de obstáculo: fileira de árvores da mata (pé na linha), moitas altas ou
  rochas, e o platô deixa de usar a cor do gramado.
  Depois, um teste: nenhuma parede `plateau` pode tocar chão aberto sem peça desenhada na linha da beira.

### Importante

**I1. As copas cobrem o leito de seixos onde nascem os lodos, e também a beira do salto.**
- Onde: 4-paredao, da direita do abismo até a borda (x 850-1600, y 490-1000). As copas da mata da saliência sobem
  até y ≈ 37,5 do mapa e cobrem uns 5 casas do leito (x 72-99, y 37,5-43), justamente a zona `beira` (lodo_escuro,
  y 38-42,5). Elas cobrem também a beira direita do abismo, de onde se salta.
- Problema: o furo da copa só abre para jogadores (game.js, linhas 5719-5720). Monstro embaixo da copa some, e não se
  vê nem onde fica a beira do salto nem a saliência do outro lado.
- O que fazer: afastar as árvores da borda da mata para o pé ficar a 3 casas ou mais da beira do leito, ou abrir furo
  também para monstros e para a área do salto. Puxar a zona `beira` para fora da sombra das copas.

**I2. O boneco parece em pé em cima do tronco do Carvalho.**
- Onde: 5-carvalho, boneco em (30,37) desenhado por cima do tronco (o tronco vai de y 470 a 680 na tela; a colisão
  só começa em y 39 do mapa).
- Problema: andar por trás do tronco está certo (só o pé colide), mas o desenho mostra o boneco na frente da casca,
  como se tivesse subido no tronco.
- O que fazer: com o pé acima da base, o tronco é desenhado por cima do boneco e aparece só a silhueta dele (contorno
  claro ou o mesmo círculo translúcido da copa). Conferir no jogo nas duas alturas: pé acima e pé abaixo da base.

**I3. A Pedra-Selo 1 colide numa caixa mais larga que o desenho.**
- Onde: 6-pedra1; `seal out` em 12,3, 9,6, com 4,5 x 5,7 casas. O monólito desenhado tem uns 2,9 casas de largura
  (x 525-640 na tela).
- Problema: fica cerca de 0,8 casa de parede invisível de cada lado, no pátio de pedra, e a pedra colide em quase toda
  a altura (contra a regra "pé colide, o resto é desenho").
- O que fazer: caixa da largura do monólito e com 1 a 1,5 casa de altura na base, com o resto desenhado por cima
  (`up`), como nas barracas.

**I4. O pinheiro da beira do abismo colide em 4,5 x 8 casas.**
- Onde: `crown(54, 51.5, 7.5, 14.5)` vira uma parede `tree` em x 55,5-60, y 58-66, na terra que leva ao abismo. Não
  aparece nas imagens.
- Problema: é a regra antiga de colidir na copa, contra o pedido 1 do Victor. O teste "árvore solta colide só no pé"
  não cobre paredes do tipo `tree`.
- O que fazer: trocar por uma peça de pinheiro do catálogo (pé só no tronco) e estender o teste a todo `k: 'tree'`
  do mapa.

**I5. Faltam as imagens com colisão.**
- Só o 3-lago tem o par com F2. Não dá para conferir o acampamento, o Carvalho, a Pedra 1 e o paredão.
- O monte de pedras da saliência (rocks em 86,51,5 com 4,5x9,5 e 94,8,51,5 com 1,5x10) segue igual no código, ou
  seja, o achado #2 da rodada anterior continua sem verificação.
- O que fazer: na próxima rodada, um par `-colisao` para cada ponto, mais a saliência e o salto do abismo.

### Detalhe

- **D1. Fogueira sem colisão** (continua): 2-acampamento, x 825-895, y 435-500. Ganhou brasa e luz, mas o boneco
  passa por dentro. Pé pequeno no centro (0,8 casa) ou dano leve ao pisar.
- **D2. Água do sumidouro em degraus:** são 6 faixas, e nos cantos de cada degrau o pé entra um pouco na água. Com
  8 a 10 faixas, ou com a margem de 0,9 um pouco maior nas pontas, isso some.
- **D3. Beira de cima do abismo:** pôr a mesma beira de pedra das laterais, com uma sombra de queda, para quem vem do
  leito ler "buraco" e não "chão escuro".
- **D4. Faixa sul do acampamento embaixo das copas** (y 63-68, barracas e barril de baixo em 2-acampamento): o mesmo
  problema do I1, em escala menor. Afastar um pouco as árvores da borda.
