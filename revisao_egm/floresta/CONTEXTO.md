# Contexto para os revisores Goldfish (Floresta desenhada por código)

Jogo: MMORPG 2D ninja em pixel art, para celular deitado e computador.

IMPORTANTE (decisão do Victor): o boneco chibi atual NÃO é a versão final e não serve de referência de estilo. Avalie
o mapa pela referência da Floresta (ref_floresta.jpg) e pela coerência das peças entre si. Do boneco, use só o
TAMANHO, para conferir a escala (árvores bem maiores que ele; barraca, barril e caixote em escala de gente). A Floresta deixou de ser uma pintura com colisão traçada à mão e passou a ser desenhada por
código a partir de um catálogo de peças (cada peça tem um "pé" que colide e o resto é desenho).

Pedidos do dono (Victor), em ordem:
1. Sem parede invisível. Árvore colide só no tronco; a copa não colide e fica transparente com o boneco atrás.
2. Árvores espalhadas ao acaso, poucas, com espaço para passar entre elas (ele marcou e reprovou a "mata fechada" em
   blocos: marcacao_victor_mata.jpg).
3. Árvores bem maiores que o boneco.
4. Paleta escura verde-oliva no jogo todo (inspirada na referência ref_floresta.jpg), mas NÃO seguir a referência à
   risca: lugares podem mudar.
5. Contorno escuro e 3 tons em todas as peças, coerentes entre si e com a referência (não com o boneco).
6. Divisões suaves de um chão para outro e de objeto para o chão.
7. O Velho Carvalho (árvore gigante) bloqueia só no tronco; o resto o boneco e os monstros passam por trás.
8. Pedras não podem parecer "ovo de dinossauro" (as redondas foram reprovadas; agora são angulosas).

Imagens (pasta desta nota). g3_N.png = jogo; g3_N_colisao.png = a mesma cena com a tecla F2 (vermelho = parede,
amarelo = pé de árvore, azul = pé do boneco). Pontos: 0 entrada e trilha, 1 Velho Carvalho de frente, 2 embaixo da
copa do Carvalho, 3 acampamento, 4 paredão e abismo, 5 Pedra-Selo 1, 6 saliência da caverna. celular_N.png = tela
de celular deitado (1280 x 720).

Ainda sabidamente pendente: beira de pedra no abismo, paredão (duas faixas iguais), lago (azul saturado, sem margem),
algumas bordas de chão em degrau. Mesmo assim, avalie.
