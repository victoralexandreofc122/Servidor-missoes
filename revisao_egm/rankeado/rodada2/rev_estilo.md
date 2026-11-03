# Revisão de estilo e arte, rodada 2: Vale das Estátuas

**Nota: 6,5/10** (era 5)

## O que foi resolvido
- O chão agora é de lajes cinza-oliva com musgo e rachaduras, na paleta do jogo. O "estacionamento bege" sumiu.
- As estátuas estão maiores, têm silhueta de ninja (cabeça, bandana, cachecol na cor da vila) e um estandarte da vila. A cor da vila agora aparece.
- Há lanternas de pedra, estandartes com X e uma borda de rocha no fundo: o lugar começa a ter clima.
- O placar tem fundo sólido e os botões no alto ficaram legíveis.

## Achados

### Importante
1. **A arquibancada lateral continua parecendo três tábuas.** São faixas verticais marrom-laranja lisas, sem degrau, sem sombra e sem contorno, e as bandeirinhas ficam soltas. Também é a peça mais saturada da cena e briga com o azul da arena.
   *O que fazer (`drawStandsSide`):* desenhar cada degrau como um bloco de pedra oliva com o topo claro, a face voltada para a arena 2 tons mais escura e uma linha de contorno escura de 1 px. Pôr o assento de madeira só no topo (marrom dessaturado, `#5a4632`/`#3e3022`). Repetir uma emenda de laje a cada tile para quebrar a faixa contínua. Fixar as bandeiras num poste na ponta de cada degrau.
2. **A estátua tem anatomia de robô.** O tronco é feito de retângulos empilhados e tem um "parafuso" redondo no ombro. O cabelo é um serrilhado cinza que repete o do boneco. O pedestal é uma caixa cinza lisa e clara, com um ícone que parece um adesivo.
   *O que fazer (`statueBody`/`drawStatue`):* usar 3 tons de pedra (luz vindo do alto à esquerda) e afinar a cintura. Fazer os braços cruzados num selo de mão em vez da barra horizontal e trocar o círculo do ombro por uma ombreira. No pedestal, fazer 2 degraus com chanfro, escurecer a pedra para o oliva do chão e gravar o símbolo em baixo-relevo (sombra de 1 px embaixo e à direita, luz em cima e à esquerda), sem a placa colorida chapada. Acrescentar musgo na base.
3. **A tela de VITÓRIA continua sendo uma caixa preta translúcida.** Não tem moldura nem selo de faixa, e ela fica em cima do lutador. (A Derrota não foi mostrada.)
   *O que fazer:* usar uma faixa de pergaminho ou estandarte com moldura dourada de 2 px, um selo grande da faixa e a variação de Elo/ryō. Fazer a Derrota em tons frios.

### Detalhe
4. O chão é bom, mas tem muitas rachaduras e emendas finas iguais, e de longe vira ruído (imagem 1). Em `valeSlabTile`, baixar a frequência das rachaduras e do musgo para cerca de 1 a cada 4 lajes e fazer algumas lajes grandes (2x2) para dar descanso ao olho.
5. A rocha de baixo é feita de triângulos cinza e corta seca para a grama. Ela não combina com a pedra das lajes. Fazer rochas arredondadas com contorno e 2-3 tons, e uma faixa de transição com tufos.
6. O brilho amarelo das lanternas da arena continua forte e não faz sentido de dia. Reduzir o alpha do glow para cerca de 0,5x durante o dia.
7. No Ranking, a barra até a próxima faixa e o selo não aparecem quando o jogador não tem partidas. Mostrar o selo "Sem faixa" vazio.
