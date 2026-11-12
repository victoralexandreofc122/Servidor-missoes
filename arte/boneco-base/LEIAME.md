# Boneco Base 64x96

Prancha de aprovação do boneco modular (paper doll). Nada aqui é usado pelo jogo ainda.

- `boneco-base.js`: gera as matrizes de pixels por camada (navegador e Node).
- `modelo.html` + `gerar.mjs`: `node arte/boneco-base/gerar.mjs` monta `arte/boneco-base.html` (arquivo único),
  `saida/boneco-base-sheet.png` (4 direções por 2 modelos, fundo transparente) e `saida/ancoras.json`.
- `previas/`: capturas da página.

Medidas: cabeça 27 (y 16 a 42), pescoço 3, tronco 22, pernas 25, pés em Y=92. Sobram 16 linhas acima para o cabelo.
Pele em 4 tons (contorno, sombra, base, luz), sombreado em faixas, frente e costas simétricas.

Camadas, de baixo para cima: `sombra`, `corpo` (pescoço, tronco, pernas), `inferior`, `superior`, `cabeca`, `rosto`, `bracos`.
`corpo`, `cabeca` e `bracos` formam o corpo-base. As âncoras são iguais nos dois modelos; a direita é o espelho da esquerda.
Os braços ficam por cima da roupa do tronco; a manga é uma peça própria presa ao braço.

v2 (revisão anatômica): cabeça 30 de largura, tórax 22 (M) e 20 (F), braços de 5 e 4 afastados do tronco com cotovelo,
coxa 9, joelho, panturrilha e pés de 10. Os segmentos de altura não mudaram.
