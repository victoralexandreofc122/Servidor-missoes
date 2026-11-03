# Revisão de estilo e arte, rodada 4: Vale das Estátuas

**Nota: 7,5/10** (era 7)

## O que foi resolvido
- Flâmulas agora ficam em postes, com as cores das vilas (verde, azul, dourado, laranja). Já não ficam soltas (img 8, 10).
- Estátua: a cintura ficou mais fina, as mãos fazem um selo no peito e as ombreiras dão silhueta de ninja. Não parece mais um robô de caixas (img 1, 10).
- Chão: menos rachaduras, e de longe lê como laje, não como ruído (img 1, 2).
- VITÓRIA dourada e DERROTA fria existem e se distinguem pela cor da moldura e do título (img 11, 12).

## Achados

### Importante
1. **A arquibancada virou uma grade de linhas pretas.** As emendas são linhas pretas de 1-2 px cruzando as três colunas inteiras, sem destaque claro. Vista de cima, parece um trilho ou uma escada de mão, não degraus. Também não há sombra caindo para a arena (img 8, 10).
   *O que fazer (`drawStandsSide`):* trocar a emenda preta pela cor de sombra da pedra (cerca de 30% mais escura que a face) com 1 px claro logo abaixo. Desencontrar as emendas entre as colunas (meio tile de deslocamento). Em cada degrau, a face do lado da arena deve ser 2 tons mais escura que o topo, com 3-4 px de sombra (alpha 0,35) projetada sobre o degrau seguinte.
2. **As telas de fim são caixas genéricas sem selo.** VITÓRIA e DERROTA são o mesmo retângulo, mudando só a cor. A faixa (Bronze/Prata) aparece como uma pílula de texto minúscula. Na img 6, a caixa ainda cobre o placar.
   *O que fazer (`.duel-banner`):* pôr um selo da faixa à esquerda (círculo de cerca de 48 px com contorno escuro e 2 tons da cor da faixa) e cortar as pontas da caixa como fita (clip-path com entalhe triangular nas laterais). Descer a caixa uns 20 px ou esconder o placar enquanto ela estiver aberta.
3. **A estátua ainda é cinza chapada em 1-2 tons.** Falta a luz do alto à esquerda: tronco e cabeça têm o mesmo tom dos dois lados, o cabelo serrilhado é uma massa única e o pedestal é uma caixa de um tom só com a placa (img 10).
   *O que fazer (`statueBody`):* aplicar 3 tons (claro na metade esquerda de cada peça, base no meio, escuro na direita e embaixo), com um destaque de 1 px nas pontas do cabelo. No pedestal, deixar o topo mais claro que a frente e pôr um chanfro claro de 1 px na aresta.

### Detalhe
4. A rocha de baixo continua feita de triângulos cinza com corte reto para a grama (img 1, 10). Trocar por blocos arredondados com contorno e pôr uma faixa de tufos na transição.
5. O cone de luz azul e o brilho das lanternas da arena ainda estouram de dia (img 5, 6, 9). Baixar o alpha para cerca de 0,5 durante o dia.
6. Os estandartes com X junto à arena ainda são azuis e iguais (img 1, 10). Deixar neutros, em oliva e dourado.
