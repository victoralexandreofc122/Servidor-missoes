# Revisão de estilo e arte, rodada 3: Vale das Estátuas

**Nota: 7/10** (era 6,5)

## O que foi resolvido
- Arquibancada lateral: saiu o laranja saturado. Agora é pedra oliva com assento de madeira apagada e combina com o chão (img 8, 10).
- Estátua: tem ombreira em vez do "parafuso", pedestal oliva com degrau, musgo na base e símbolo gravado sem a placa colorida (img 10).
- PARTIDA ANULADA: caixa com moldura e título espaçado, já não é o preto translúcido de antes (img 6).

## Achados

### Importante
1. **A arquibancada ainda é uma faixa vertical lisa.** Vista de cima, são 3 colunas iguais (pedra, madeira, pedra) sem degrau nem sombra projetada, e as bandeiras ficam soltas na borda (img 8, 10).
   *O que fazer (`drawStandsSide`):* desenhar cada degrau mais baixo do que o anterior, na direção da arena: topo claro, face 2 tons mais escura e 3-4 px de sombra caindo para o lado da arena. Cortar a faixa a cada 1 tile com uma emenda escura de 1 px e um destaque claro de 1 px. Pôr as bandeiras num poste de 2 px com base quadrada.
2. **A estátua continua parecendo um robô.** O tronco é uma pilha de retângulos com cintura reta e o braço é uma barra horizontal. O cabelo serrilhado é cinza chapado e o pedestal é uma caixa com um único tom (img 1, 10).
   *O que fazer (`statueBody`):* usar 3 tons de pedra com a luz vindo do alto à esquerda (claro no lado esquerdo do tronco e da cabeça, escuro no direito), afinar a cintura em 2-4 px e fazer as mãos juntas num selo no peito em vez da barra. No pedestal, usar uma face superior mais clara e a frontal mais escura, além de um chanfro de 1 px na aresta.
3. **A tela de fim ainda não traz a faixa com selo.** Só a ANULADA foi mostrada: ela é um retângulo marrom-escuro genérico, sem selo de faixa nem ornamento, e cobre o placar. Não deu para avaliar a VITÓRIA dourada nem a DERROTA fria.
   *O que fazer (`.duel-banner`):* para a anulada, usar um pergaminho cinza com as pontas recortadas (clip-path) e um selo vazio. Mandar as imagens da VITÓRIA e da DERROTA na próxima rodada. Descer a faixa uns 20 px para ela não encostar no placar.

### Detalhe
4. A rocha de baixo continua feita de triângulos cinza e corta seca para a grama (img 1, 10). Fazer blocos arredondados com contorno e 2-3 tons, e uma faixa de tufos na transição.
5. O chão ainda tem rachaduras demais e de longe vira ruído (img 1). Baixar a frequência das rachaduras para cerca de 1 a cada 4 lajes e pôr algumas lajes 2x2.
6. O brilho das lanternas e o cone de luz azul na arena continuam fortes de dia (img 5, 9). Reduzir o alpha para cerca de 0,5.
7. Os estandartes azuis com X são iguais nos dois lados e não mostram as cores das vilas. Combinar com as estátuas mais próximas, ou deixar neutros em oliva e dourado.
