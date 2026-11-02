# Revisão Goldfish: jogabilidade e colisão (Floresta)

Coordenadas nas imagens mostradas em 2000x1250 (multiplique por 1,28 para o original).

## 1. Paredes invisíveis soltas no chão (Bloqueador)
- Onde: g3_0_colisao, retângulo vermelho em x 690-730, y 375-455 (entre duas moitas, sem nada desenhado). g3_4_colisao, retângulo em x 150-190, y 515-580, em cima da trilha de terra.
- Problema: há bloqueio onde a cena mostra grama ou trilha livre.
- Por que importa: o Victor proibiu parede invisível. O jogador trava sem motivo, em plena trilha, e acha que é bug.
- Correção: achar a peça que gera esses retângulos (provavelmente moita ou pedra apagada do desenho e mantida na colisão) e remover a colisão, ou desenhar a peça. Criar um teste que falhe se existir colisão sem peça desenhada por cima.

## 2. Pilares de pedra colidem no desenho inteiro, não no pé (Importante)
- Onde: g3_6_colisao, pilar alto em x 1015-1240, y 255-725; pilar da direita x 1455-1530; pedra deitada x 1215-1465, y 255-400.
- Problema: o vermelho cobre a pedra toda, do topo à base. O boneco bate na "cabeça" do pilar ao andar por cima dele.
- Por que importa: contradiz a regra das peças (pé colide, resto é desenho). Na saliência da caverna o espaço já é pequeno; a área livre fica bem menor do que parece.
- Correção: colisão só na faixa da base (último terço do pilar, ~y 600-725) e desenhar o topo por cima do boneco, como a copa.

## 3. Barracas, caixas e barris também colidem no sprite inteiro (Importante)
- Onde: g3_3_colisao, as 4 barracas (ex. x 600-780, y 305-465) e g3_1_colisao (x 615-795, y 805-965).
- Problema: o telhado bloqueia. Não dá para passar "atrás" da barraca, só em volta.
- Por que importa: no acampamento a luta com monstros fica cheia de quinas; o jogador encalha no telhado sem entender. Fica inconsistente com as árvores.
- Correção: pé da barraca = metade de baixo (a porta e a lona do chão). O resto vira desenho que fica por cima do boneco, com transparência quando ele está atrás.

## 4. Faixa de terra entre as duas camadas do paredão parece andável e é parede (Importante)
- Onde: g3_4_colisao, faixa marrom y 250-340 entre os dois blocos de rocha.
- Problema: o desenho mostra um patamar de terra plano, igual a chão, mas está todo vermelho.
- Por que importa: o jogador tenta subir lá e bate. Lê como caminho fechado sem motivo.
- Correção: ou o paredão vira uma faixa só (já está na lista de pendências), ou o patamar ganha aparência de topo de rocha (sem cor de terra, com vegetação de borda).

## 5. Lago com colisão quadrada (Importante)
- Onde: g3_0_colisao, canto inferior direito, x 1800+, y 925+.
- Problema: o lago é redondo e o vermelho é retângulo. Os cantos de grama em volta são parede.
- Por que importa: parede invisível na margem; o boneco para longe da água.
- Correção: colisão em vários retângulos menores seguindo o círculo, ou em formato de elipse, com 1/2 tile de folga para dentro da água.

## 6. Abismo sem leitura de perigo (Importante)
- Onde: g3_4 e g3_4_colisao, bloco x 775-1325, y 775+.
- Problema: sem o F2, o abismo é só um retângulo escuro de beira reta, ao lado de um campo de pedras redondas que também bloqueia. Não fica claro qual dos dois é buraco e qual é parede.
- Por que importa: o jogador não sabe onde pode chegar, e a beira reta parece borda de mapa.
- Correção: beira de pedra com degrau e sombra (já pendente), e colisão começando um pouco antes da borda desenhada.

## 7. Copa do Velho Carvalho cobre a luta de cima (Detalhe)
- Onde: g3_1, a copa ocupa o topo da tela; g3_2, boneco sob a copa.
- Problema: em g3_2 a transparência funciona para o boneco, mas a copa inteira escurece a área e esconde as moitas. Monstros sob a copa ficam com pouco contraste.
- Por que importa: luta em área escura grande cansa e dá erro de mira.
- Correção: deixar a copa mais transparente (ou recortar só um círculo em volta do boneco e dos monstros próximos) e garantir que barras de vida fiquem sempre por cima.

## 8. Fogueira não colide (Detalhe)
- Onde: g3_3, fogueira em x 1035-1120, y 545-625; sem vermelho no par.
- Problema: parece objeto sólido com brasa e o boneco passa por dentro.
- Por que importa: pequeno, mas quebra a leitura de que objeto com contorno bloqueia.
- Correção: pé pequeno no centro da fogueira, ou dano leve de queimadura ao pisar.

## Nota: 6/10
As árvores estão boas: pé só no tronco (amarelo), espaço largo entre elas, trilha clara. O que puxa a nota para baixo são as paredes invisíveis soltas e os objetos que colidem no desenho todo, contra a regra do pé.
