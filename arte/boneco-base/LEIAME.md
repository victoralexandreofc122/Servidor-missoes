# Boneco Base 64x96

Prancha de aprovação do boneco modular (paper doll). Nada aqui é usado pelo jogo ainda.

- `boneco-base.js`: gera as matrizes de pixels por camada (navegador e Node).
- `modelo.html` + `gerar.mjs`: `node arte/boneco-base/gerar.mjs` monta `arte/boneco-base.html` (arquivo único),
  `saida/boneco-base-sheet.png` (4 direções por 2 modelos, fundo transparente) e `saida/ancoras.json`.
- `previas/`: capturas da página.

Medidas (v3, decisão do Victor em 12/11/2026: seguir o desenho de referência): cabeça 27 (y 31 a 57), pescoço 2,
tronco 17, pernas 16, pés em Y=92. O boneco tem 62 de altura; sobram 31 linhas acima para cabelo e chapéu.
Pele em 4 tons (contorno, sombra, base, luz), sombreado em faixas, frente e costas simétricas.

Camadas, de baixo para cima: `sombra`, `corpo` (pescoço, tronco, pernas), `inferior`, `superior`, `cabeca`, `rosto`, `bracos`.
`corpo`, `cabeca` e `bracos` formam o corpo-base. As âncoras são iguais nos dois modelos; a direita é o espelho da esquerda.
Os braços ficam por cima da roupa do tronco; a manga é uma peça própria presa ao braço.

v2 (revisão anatômica): cabeça 30 de largura, tórax 22 (M) e 20 (F), braços de 5 e 4 afastados do tronco com cotovelo,
coxa 9, joelho, panturrilha e pés de 10. Os segmentos de altura não mudaram.

## Animações

`build(sexo, direção, pose)` aceita uma pose (`bob`, `legA/B`, `liftA/B`, `armA/B`). `ANIMS` traz `parado` (4 quadros, 3 por
segundo) e `andar` (6 quadros, 9 por segundo). O gerador grava `saida/boneco-m-animacoes.png` e `boneco-f-animacoes.png`
(linha = direção, coluna = quadro), `saida/animacoes.json` e as prévias animadas `saida/previa-*.png` (APNG).
A camada `tras` guarda a perna e o braço de trás na visão de lado.
