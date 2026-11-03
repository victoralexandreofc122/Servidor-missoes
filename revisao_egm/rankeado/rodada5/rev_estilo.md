# Revisão de estilo e arte, rodada 5: Vale das Estátuas

**Nota: 7,5/10** (igual à rodada 4)

## O que foi resolvido
- Emendas da arquibancada já não são pretas: estão mais suaves e desencontradas entre as colunas (img 10, 12).
- O pedestal da estátua tem o topo mais claro que a frente e um chanfro de musgo na base (img 1, 12).
- A luz das lanternas da borda está mais fraca de dia (img 1).
- Os estandartes azuis repetidos sumiram do topo do mapa (img 1).
- A DERROTA fria e a VITÓRIA dourada continuam bem distintas (img 7, 8).

## Achados

### Importante
1. **A arquibancada ainda parece trilho, não degraus.** São três faixas verticais lisas: a do meio é marrom e as outras cinza, sem altura, sem sombra caindo para a arena e com riscos claros finos, como dormentes (img 10, 12).
   *O que fazer (`drawStandsSide`):* desenhar cada coluna como um degrau. O topo fica claro (oliva +15%). A face do lado da arena é uma faixa de 4-6 px com 2 tons mais escura. Abaixo dela vai uma sombra de 3-4 px, alpha 0,35, sobre a coluna seguinte. Trocar a faixa marrom central por pedra do mesmo tom, com assentos de madeira curtos (blocos de 1 tile com contorno) em vez de uma tira contínua.
2. **A estátua continua chapada.** O tronco e a cabeça têm o mesmo cinza dos dois lados, e o cabelo é uma massa sem destaque. A luz extra do pedestal não chegou ao corpo (img 1, 12).
   *O que fazer (`statueBody`):* em cada peça (cabeça, tronco, braços, pernas), pintar uma faixa clara de 2-3 px no lado esquerdo e uma escura de 2-3 px no lado direito e embaixo. Pôr 1 px claro na ponta esquerda de cada mecha do cabelo. Na cabeça, pôr uma sombra de 2 px sob a bandana.
3. **A faixa de rank nas telas de fim ainda é uma pílula de texto.** VITÓRIA e DERROTA são a mesma caixa retangular, e "Bronze/Prata" é um rótulo minúsculo (img 6, 7, 8). Não vi o aviso "Subiu para PRATA!" com o selo maior em nenhuma foto, então não pude avaliar.
   *O que fazer (`.duel-banner`):* pôr um selo circular de cerca de 48 px à esquerda, com contorno escuro e 2 tons da cor da faixa. Fazer a caixa em forma de fita, com clip-path de entalhe triangular nas laterais.

### Detalhe
4. A mureta de baixo é uma faixa cinza lisa, sem contorno nem blocos (img 1). Dividir em blocos de 1 tile com uma aresta superior clara e uma linha escura embaixo.
5. A rocha à esquerda ainda é feita de triângulos cinza com corte reto para a grama (img 10, 12). Trocar por blocos arredondados e pôr uma faixa de tufos na transição.
6. Ainda há um estandarte azul com X junto à arena (img 12). Deixar em oliva e dourado.
7. O cone de luz sobre a arena ainda estoura em branco de dia (img 6, 11). Baixar o alpha para cerca de 0,25.
