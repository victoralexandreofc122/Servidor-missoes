# Revisão de estilo (Goldfish, lente: direção de arte)

Imagens vistas: g3_0, g3_1, g3_3, ref_floresta.jpg.

## 1. Bloqueador: as bordas da mata fechada ainda são blocos retos
- Onde: g3_0 (faixa de copas no alto, dos dois lados da trilha, corte reto em y≈250) e g3_3 (coluna de copas à esquerda com cantos em degrau).
- Problema: é o mesmo retângulo de "bolinhas" que o Victor reprovou. Corte reto, sem tronco, sem sombra no chão. Parece um papel de parede colado.
- Correção: trocar a borda reta por árvores inteiras (drawTree e drawPine) em fila torta, com variação de ±1 a 2 casas na posição. Onde precisar de fundo, usar 2 fileiras com copas sobrepostas e uma sombra #1a2412 a 40% de 1 casa embaixo.

## 2. Importante: pinheiros são triângulos chapados
- Onde: g3_1 (pinheiros do centro e da direita), g3_3 (direita).
- Problema: 4 triângulos iguais empilhados, 2 tons divididos ao meio, sem contorno escuro, sem textura de agulha. Destoam das copas redondas e do boneco.
- Correção: contorno #142010 de 1 px; 3 tons (#2c4a22 sombra, #3f6a2c base, #5c8a3a luz só no lado esquerdo); borda de cada camada em zigue-zague (dentes de 2 a 3 px); camadas de largura e posição um pouco diferentes; 2 ou 3 tamanhos.

## 3. Importante: barraca, caixote e barril são formas geométricas limpas demais
- Onde: g3_3.
- Problema: barraca é um triângulo cinza-bege com furos redondos pretos (parecem bolas coladas). Caixote é um quadrado com um X. Barril é um cilindro sem volume. Pouco contorno, luz confusa.
- Correção: barraca com lona #6b5a3c / #8a7550 / #4a3e2a, dobra de pano curva, furos como rasgos irregulares (3 a 5 px, borda clara #a08a60), estaca e corda. Caixote com tábuas de 3 tons, pregos, contorno #2a1a10. Barril com aro escuro #2a2a2a e brilho vertical à esquerda. Sombra elíptica embaixo de todos.

## 4. Importante: a terra do acampamento e da trilha termina em degrau
- Onde: g3_3 (contorno da clareira em escada) e g3_0 (lados da trilha com dentes regulares).
- Problema: a borda segue as casas do grid. Fica serrilhada e repetida.
- Correção: borda com ruído de 1 a 2 casas, faixa de transição de 1 casa com tufos de grama #3a5a28 e pedrinhas, e terra com tom de mistura #4a4030 no limite.

## 5. Importante: pedra cinza azulada fria destoa
- Onde: g3_0 (pedra à direita), g3_1, g3_3.
- Problema: o cinza #8a9098 é frio e claro, e a forma é um bloco geométrico de poucas faces. Salta da paleta oliva.
- Correção: cinza esverdeado quente (#3e4238 sombra, #5c6050 base, #7c7e68 luz), musgo #4c6a2a no topo, base enterrada com tufos, contorno #1c1e18.

## 6. Importante: escala inconsistente entre peças
- Onde: g3_1 e g3_3.
- Problema: o Velho Carvalho é enorme (bom), mas as árvores comuns estão perto de 4 bonecos de altura e os pinheiros são altos e finos. Barril e caixote quase da altura do boneco; barraca baixa.
- Correção: boneco = 1. Árvore comum 4 a 5, pinheiro 4 a 6 com base mais larga, barraca 2 de altura e 3 a 4 de largura, barril 0,7, caixote 0,6, pedra grande 1.

## 7. Detalhe: tronco do Velho Carvalho é um bloco liso
- Onde: g3_1.
- Problema: marrom liso #7a4a2a, raízes como linhas retas. A referência tem casca com veios e raízes grossas.
- Correção: veios verticais em #4a2a18, luz em #9a6a3a só à esquerda, raízes em forma de garra 2 a 3 casas, brilho laranja da Pedra-Selo no tronco perto do portal.

## 8. Detalhe: arbustos e flores repetidos e saturados
- Onde: g3_0, g3_1.
- Problema: o mesmo arbusto verde vivo com bolinhas azuis/vermelhas, espalhado igual. Flores muito claras e coloridas no chão escuro.
- Correção: 3 formas de arbusto, verde #3a5a2a a #4e7232, frutas menos saturadas; agrupar em 2 a 4 perto de troncos e pedras, e deixar áreas vazias.

## Nota: 5/10
Mudança que mais aumentaria a nota: tirar os blocos de copa retos e usar árvores inteiras espalhadas na borda, com o pinheiro redesenhado no mesmo estilo de contorno e 3 tons da árvore redonda.
