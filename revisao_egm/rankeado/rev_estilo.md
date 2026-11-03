# Revisão de estilo e arte: Vale das Estátuas (rankeado)

**Nota: 5/10**

## O que está bom
- A arena tem identidade: piso azul-ardósia com losangos, feixes de luz e lanternas douradas nas bordas. Dá clima de "palco" e se separa bem da praça.
- Os estandartes azuis com o X cruzado ao lado da arena combinam com o tema do duelo.
- O placar (nome, vila, nível e bolinhas das rodadas, com o centro mostrando PREPARAÇÃO/RODADA/FIM) é legível e tem a cor de cada lado (azul e vermelho).
- O painel do Ranking segue o estilo escuro com dourado do HUD; o selo Bronze é discreto e legível.
- Os botões Desafio e Ranking usam a mesma moldura dourada dos outros botões.

## Achados

### Bloqueador
1. **As estátuas não parecem estátuas das vilas.** São um bloco cinza com um "braço" inclinado e um ícone pequeno no pedestal. Não dá para ler uma figura ninja, e a cor da vila (verde, azul, dourado, laranja) quase não aparece. O mapa se chama Vale das Estátuas, então elas precisam ser o destaque.
   *O que fazer:* em `drawStatue`, fazer uma figura ninja de pedra com silhueta clara (cabeça, capa e braço em selo de mão) e 2-3 tons de pedra com contorno escuro. Colocar a cor da vila num estandarte ou numa chama no pedestal e aumentar a estátua em cerca de 1,5x, com sombra no chão.
2. **O lugar não parece épico, parece um estacionamento.** A praça é um piso de tijolo bege quase branco, liso e repetido. Ela é muito mais clara que a paleta oliva escura do jogo e fica estourada sob a luz do dia. Não tem vale, montanha nem desnível, e há grandes áreas vazias. Na base da praça, uma faixa de rocha corta direto para a grama.
   *O que fazer:* escurecer e esverdear a pedra (cinza-oliva, 2-3 tons) e variar o piso com lajes maiores, rachaduras e musgo. Desenhar um círculo de pedra ou um selo no chão em volta da arena e colocar paredões de rocha ou penhascos nas bordas para formar o "vale". Encher os vazios com tochas, braseiros e lanternas.

### Importante
3. **A arquibancada parece uma cerca de madeira.** São três faixas marrons lisas com pés pretos, sem degrau visível, sem profundidade e sem plateia. O marrom-laranja também briga com o azul da arena.
   *O que fazer:* em `drawStands`, desenhar degraus de pedra com a face de cima clara e a face da frente escura, e assentos de madeira escura por cima. Pôr bandeiras das 4 vilas nas pontas. Se der, colocar silhuetas de NPCs sentados.
4. **A tela de VITÓRIA é fraca.** É uma caixa preta translúcida retangular por cima do lutador, que cobre o nome "Rival". Falta moldura, falta celebração e o selo é pequeno. A DERROTA precisa ter um tratamento claramente diferente.
   *O que fazer:* passar a caixa para o alto da tela, usar uma faixa (pergaminho ou estandarte) com moldura dourada e mostrar o selo de faixa grande com o ícone do rank e a variação de pontos animada. Na derrota, usar tons frios ou vermelho escuro.
5. **O selo de faixa é só um texto num retângulo.** Bronze, Prata, Ouro, Diamante e Lenda merecem um emblema (escudo ou losango) com a cor e o contorno da faixa.

### Detalhe
6. As bordas da arena brilham (lanternas e glow) com um amarelo saturado que destoa do resto da cena. Reduzir um pouco.
7. As duas árvores isoladas nos cantos parecem coladas. Agrupá-las ou trocá-las por pinheiros ou bambus na borda do vale.
8. No celular, a arquibancada ocupa o terço de cima da tela e cobre o placar visualmente. Escurecer o fundo atrás do placar ou dar a ele um fundo mais sólido.
9. O "Desafio" semitransparente (marrom-rosado) parece um botão desabilitado. Deixar a borda dourada sólida e baixar a transparência só no fundo.
