# Padrão das peças do Boneco Base

Toda peça (roupa, cabelo, bandana, acessório) entra no gerador por `definirPeca({...})`, em `boneco-base.js`, na seção
"peças". `node arte/boneco-base/gerar.mjs` confere todas contra este padrão antes de gerar qualquer arquivo e para com a
lista de problemas se alguma estiver fora.

## Regras fixas

- Canvas 64 x 96, pés em Y=92. Cabeça de Y=31 a 57 (27 linhas), pescoço 58 e 59, tronco 60 a 76, pernas 77 a 92.
- Eixo de simetria entre x=31 e x=32. Frente e costas são simétricas, salvo detalhe proposital (ponta de cachecol).
- 4 tons por material: contorno, sombra, base e luz. Faixas chapadas, luz de cima. Sem degradê.
- A peça é desenhada para o boneco **parado**. Nunca desenhe por pose: o gerador move a peça em todas as animações.
- 3 direções desenhadas: `frente`, `costas` e `lado` (olhando para a esquerda). A direita é o espelho.
- Nome: `id` em minúsculas, sem acento, com `_`. É um código interno; nome de item do jogo segue a regra das 3 opções.

- **Sem pontas totalmente quadradas** (regra do Victor, 12/11/2026): todo canto convexo em L perde o pixel da quina. O
  gerador aplica isso sozinho em tudo que pinta (`roundCorners` dentro de `paint`); não desenhe a quina "na mão".
- Roupa de cima é lisa: com ela, some a musculatura do corpo; no feminino fica só a sombra embaixo do busto.
- Estampa precisa de contraste com a roupa: se as cores forem parecidas, o gerador troca a estampa por branco ou preto.

## Os três modos

### Modo `cor`: roupa colada ao corpo

Só diz quais partes do corpo mudam de cor. Acompanha qualquer animação sozinha.

```js
definirPeca({ id: 'bermuda', tipo: 'inferior', modo: 'cor', partes: [PART.quadril, PART.coxa] });
```

Partes: `pescoco`, `tronco`, `quadril`, `coxa`, `canela`, `pe`, `braco`, `antebraco`, `mao`.
Tipos de roupa: `superior`, `inferior`, `pes`, `maos`.

### Modo `forma`: peça com desenho próprio

Devolve uma máscara por direção. O gerador pinta o contorno e as faixas, aplica a cor escolhida e prende à cabeça.

```js
definirPeca({
  id: 'moicano', tipo: 'cabelo', modo: 'forma',
  camada: 'cabelo',            // cabelo, bandana ou acessorio
  parte: PART.cabelo,          // define qual cor do visual pinta a peça: cabelo, bandana ou acessorio
  // sombra: (c) => ...        // opcional; sem ela vale a sombra padrão (luz no topo, sombra embaixo)
  desenho(view, k) {           // view: 'frente', 'costas' ou 'lado'
    const m = k.nova();
    for (let i = -1; i <= 9; i++) k.cabeca(m, view, i, 1);   // cobre o topo da cabeça com 1 pixel de folga
    // ... linhas próprias da peça ...
    return { frente: m };      // também aceita `tras` (atrás do corpo) e `metal` (pintado em aço)
  },
});
```

Ferramentas (`k`):

| Ferramenta | O que faz |
|---|---|
| `k.nova()` | Máscara vazia |
| `k.linhas(m, y0, [[x0, x1], ...])` | Uma faixa por linha, a partir de `y0` |
| `k.simetrico(m, y0, [meiaLargura, ...])` | Linhas centradas no eixo (frente e costas) |
| `k.cabeca(m, view, i, folga)` | Linha `i` da cabeça (0 a 26; -1 fica acima do topo), com `folga` pixels a mais |
| `k.mecha(m, x, y, ângulo, comprimento, largura, curva)` | Mecha pontuda: sai de (x, y), afina até a ponta (que termina com 2 pixels) e pode entortar |
| `k.mechas(m, lista)` / `k.mechasSim(m, lista)` | Várias mechas; `Sim` espelha cada uma (frente e costas) |
| `k.apagar(m, y0, [[x0, x1], ...])` | Tira pixels (abrir o rosto, a frente de um colete) |
| `k.HY`, `k.HEAD_HW`, `k.HEAD_SIDE` | Topo da cabeça e o contorno dela de frente e de lado |

Uma peça de forma pode ficar presa à **cabeça** (tipos `cabelo`, `bandana`, `acessorio`) ou ao **tronco** (tipo `tronco`,
camada `roupa`, `camadaTras: 'costas_tras'`, `parte: PART.peca`). A do tronco é desenhada para o tronco parado (y 60 a 76)
e o gerador a desloca junto com o corpo. Exemplos no código: `colete` e `capa`.

### Modo `estampa`: desenho sobre a roupa

Símbolo ou faixa chapada, numa cor só, por cima da roupa de cima. O gerador só pinta onde existe tronco, então a estampa
nunca vaza para fora do corpo. Basta ter desenho em uma direção (um símbolo nas costas, por exemplo).

```js
definirPeca({ id: 'faixa_dupla', tipo: 'estampa', modo: 'estampa',
  desenho: (view, k) => ({ frente: k.linhas(k.nova(), 64, [[10, 54], null, [10, 54]]) }) });
```

Peito e costas vão de y 61 a 71; o meio do tronco é o eixo entre x=31 e x=32. Largura útil: 16 a 20 pixels.

## Ordem das camadas (de baixo para cima)

`sombra`, `tras`, `costas_tras`, `cabelo_tras`, `corpo`, `inferior`, `superior`, `estampa`, `roupa`, `cabeca`, `rosto`,
`cabelo`, `bandana`, `acessorio`, `bracos`, `arma`, `efeito`.

## Passo a passo de uma peça nova

1. Escolha o modo: cabe no formato do corpo? `cor`. Tem volume ou silhueta própria? `forma`.
2. Copie um dos modelos acima para a seção "peças" e troque `id`, `tipo` e o desenho.
3. Rode `node arte/boneco-base/gerar.mjs`. Se a peça estiver fora do padrão, ele diz qual e por quê.
4. Abra `arte/boneco-base.html`: a peça já aparece nas listas de "Visual". Confira as 4 direções, a silhueta e as animações
   de andar, correr, selos e cair.
5. Gere um GIF vestido e mostre ao Victor antes de considerar a peça pronta.

## O que o padrão ainda não cobre

- Peças de forma presas aos braços ou às pernas (calça larga, saia, manga bufante): braços e pernas só aceitam o modo `cor`.
- Peças do tronco e estampas somem no quadro deitado da queda, e de lado andam com o tronco sem acompanhar a inclinação
  linha a linha.
- Estampa em mais de uma cor.

## Conferência com a skill pxl-pixel-art

Para olhar bordas com outro olho: exporte a peça como grade para um `.px.js` e rode
`node ~/.claude/skills/pxl-pixel-art/bin/pxl.js check arquivo.px.js --edges`. Ele aponta quinas em L em linhas de 1 pixel,
degraus fora de ordem e pontas soltas. São avisos para olhar, não erros.

## Todas as peças desenhadas passam pela pxl

Toda peça de modo `forma` (cabelos, bandana, máscara, cachecol, colete, capa) é desenhada pela pxl num estilo único, para
não parecer feita por artistas diferentes:

- base em tom médio, sombra de 1 ou 2 linhas embaixo e luz em cima (no cabelo, anel de brilho e fios de sombra);
- cada mecha com metade em sombra e um fio de luz na borda; mechas e cabelo de trás um tom mais escuros;
- contorno da pxl; tudo em 4 tons (contorno, sombra, base, luz), que o gerador troca pela cor escolhida.

Fluxo, sempre que criar ou mudar uma peça:

1. Descreva a forma da peça no gerador (`definirPeca`, com `k.mecha`, `k.linhas` etc.), como antes.
2. `node arte/boneco-base/pxl/exportar-para-pxl.mjs`: escreve `pxl/pecas.px.js` (gerado, não editar) com a peça.
3. `node arte/boneco-base/pxl/importar-pxl.mjs`: roda a pxl e grava o desenho no gerador.
4. `node arte/boneco-base/gerar.mjs`: prancha, GIFs e página.

Desenho à mão: para uma direção que pede mais que mechas, desenhe na pxl em `pxl/<peça>.px.js` um sprite
`_<peça>_mao_<direção>` (sem contorno; ele vem no final) e registre a direção em `MAO` no exportador. Exemplo: a juba de
costas e de lado. Esse arquivo usa a paleta e as funções do cabeçalho de `pecas.px.js`; não é construído sozinho.

Nas animações o gerador move, entorta (balanço do cabelo) e corta o desenho; não é preciso desenhar quadro por quadro.

O que não passa pela pxl: roupas do modo `cor` (são o próprio corpo recolorido) e estampas (símbolo chapado de uma cor).
