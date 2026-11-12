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

`build(sexo, direção, pose)` aceita uma pose (`bob`, `legA/B`, `liftA/B`, `armA/B`). `ANIMS` traz `parado`, `andar`, `correr` (corrida ninja), `selos`, `soco`, `chute`, `espada`, `shuriken`,
`levar_golpe` e `cair`. O gerador grava `saida/boneco-m-animacoes.png` e `boneco-f-animacoes.png`
(linha = direção, coluna = quadro), `saida/animacoes.json` e um GIF por animação em `saida/gif/` (regra do Victor: toda animação nova é entregue em GIF).
A camada `tras` guarda a perna e o braço de trás na visão de lado.

## Roupas, cabelos, bandana e acessórios

`build(sexo, direção, pose, visual)`. Cada pixel de pele do corpo guarda a parte a que pertence (`PART`: pescoço, tronco,
quadril, coxa, canela, pé, braço, antebraço, mão). A roupa é uma troca de cor por parte (`TECIDOS`, 4 tons cada), então
acompanha todas as animações sem desalinhar. Cabelo, bandana e acessório são peças desenhadas no espaço da cabeça, por
direção, e andam junto com ela. Catálogo em `CATALOGO`; os nomes das peças são descrições provisórias, não nomes do jogo.
`saida/visuais.png` mostra 4 exemplos e `saida/gif/vestido-*.gif` mostra as animações vestidas.
