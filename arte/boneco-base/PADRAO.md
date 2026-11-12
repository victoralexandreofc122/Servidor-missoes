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

## Os dois modos

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
| `k.HY`, `k.HEAD_HW`, `k.HEAD_SIDE` | Topo da cabeça e o contorno dela de frente e de lado |

## Ordem das camadas (de baixo para cima)

`sombra`, `tras`, `cabelo_tras`, `corpo`, `inferior`, `superior`, `cabeca`, `rosto`, `cabelo`, `bandana`, `acessorio`,
`bracos`, `arma`, `efeito`.

## Passo a passo de uma peça nova

1. Escolha o modo: cabe no formato do corpo? `cor`. Tem volume ou silhueta própria? `forma`.
2. Copie um dos modelos acima para a seção "peças" e troque `id`, `tipo` e o desenho.
3. Rode `node arte/boneco-base/gerar.mjs`. Se a peça estiver fora do padrão, ele diz qual e por quê.
4. Abra `arte/boneco-base.html`: a peça já aparece nas listas de "Visual". Confira as 4 direções, a silhueta e as animações
   de andar, correr, selos e cair.
5. Gere um GIF vestido e mostre ao Victor antes de considerar a peça pronta.

## O que o padrão ainda não cobre

Peças com forma presas ao tronco, aos braços ou às pernas (colete, capa, calça larga, saia, cinto). Hoje só a cabeça
aceita peças de forma; o corpo aceita só o modo `cor`.
