# Personagem chibi em camadas (64x96)

> **Aposentado na v25.** O jogo agora desenha o boneco por código: esqueleto 3D animado com o corpo e as camadas em
> pixel art (`arte/personagem-rig/`). Esta pasta fica como referência: os olhos e as paletas aprovados vieram daqui.
> Não rode mais o `export_game.py`. Ele regravaria o `public/spriteData.js` antigo, com o atlas.

Este é o personagem que o jogo usa desde a v9. Ele substitui o boneco de retângulos (`public/character.js`) e os
testes de arte anteriores (`paper-doll/`, `personagem-base/`, `rig-ia/`).

O personagem é montado por partes (corpo, olhos, boca, cabelo, chapéu, conjunto, camisa, calça) e recolorido no
próprio aparelho.

## Pastas

| Pasta | O que tem |
|---|---|
| `gerador/` | Código Python que desenha tudo (precisa de `numpy` e `Pillow`) |
| `saida/camadas/<genero>/<animacao>/` | Folhas de cada item, pintadas com as cores padrão |
| `saida/indices/<genero>/<animacao>/` | As mesmas folhas como **mapa de cores** (canal + tom) |
| `saida/paletas.json` | Todas as cores: pele, cabelo, olhos, roupas e metais |
| `saida/personagem.json` | Slots, planos, animações, vilas e lista de arquivos |
| `saida/previas/` | Pranchas, GIFs, camadas separadas, exemplos de recolor, vilas e a checagem |
| `saida/ferramentas/recolorir.py` | Recolore uma folha a partir do mapa de índices |

- Gêneros: `masculino`, `feminino`
- Animações: `parado`, `andar`, `correr`, `ataque`, `jutsu` e `golpe`, cada uma em arquivos separados

## No jogo

| Arquivo | O que é |
|---|---|
| `public/sprites/chibi_m.png`, `chibi_f.png` | Atlas de cada gênero com os mapas de índice. Cada célula fica recortada no que tem pixel (~30 KB cada) |
| `public/spriteData.js` | Retângulos das células, âncoras (mão: `[x, y, plano do braço, ângulo da lâmina]` nas 3 vistas; costas: `[x, y]`, para as armas), paletas, vilas e tempos das animações |
| `public/sprites.js` | Lê os atlas, recolore cada célula uma vez por visual (com cache) e desenha as camadas na ordem certa |

`spriteData.js` e os atlas são **gerados**: não edite à mão.

O visual do jogador é feito de **nomes de paleta**, e o servidor guarda isso no banco (migração v9):

```
{ v: 2, gender, skin, hairStyle, hairColor, eyeStyle, eyeColor, outfit, shirtColor, pantsColor, bandana, village }
```

- Os nomes válidos ficam em `src/realtime/appearance.ts`.
- O visual antigo, de 5 cores, é convertido para a cor de paleta mais parecida.
- Enquanto os atlas não carregam, o jogo desenha o boneco antigo.

Como o jogo escolhe a animação:

| Situação | Animação |
|---|---|
| Parado | `parado`, respirando |
| Andando | `andar` |
| Correndo (botão 🏃, ou alguém andando bem rápido) | `correr` |
| Ataque básico sem arma | `ataque`, alternando soco e chute |
| Ataque básico com arma | `golpe`: prepara (arma lá atrás), corta (braço estendido) e termina (braço desce) |
| Jutsu | `jutsu`: preparação (mãos juntas), lançamento (palmas para frente, grito) e volta |
| Meditando (🧘) | `jutsu` quadro 0: carregar chakra (agachado, selo do carneiro), parado |
| Morto | `parado`, quadro 0 |

## Regerar

Rode a partir de `arte/personagem-chibi/`:

```
python3 gerador/export.py         # saida/: camadas, mapas de cor, paletas, prévias e checagem
python3 gerador/export_game.py    # public/: os 2 atlas e o spriteData.js que o jogo usa
```

Depois rode `npm test`. O `test/sprites.test.ts` confere três coisas:

- os atlas e o `spriteData.js` batem;
- todo item existe em todas as animações, vistas e quadros;
- o cliente aceita exatamente os mesmos nomes que o servidor.

## Jutsu

| Quadro | Pose | Usado em |
|---|---|---|
| 0 | carregar chakra: agachado, selo do carneiro no peito | meditação (parado) |
| 1 | A, preparação: mãos juntas (palma com palma), corpo sobe | jutsu: A, depois B, depois A (110, 170 e 110 ms) |
| 2 | B, lançamento: palmas para frente, corpo desce, boca aberta | jutsu |

- O rosto fica sério (olhos `+serio`, boca `reta` ou `grito`): a pose pede com `fig.face`.
- As mãos são carimbos à parte (`HAND_STAMPS` em `gerador/body.py`), no plano `topo`, por cima das mangas.
- De costas, as mãos ficam escondidas na frente do corpo e só os cotovelos aparecem.

## Golpe com arma

| Quadro | Pose | Lâmina (`fig.grip`) |
|---|---|---|
| 0 | prepara: de frente a arma sobe ao lado da cabeça; de lado o braço puxa para trás | para cima e para fora / para trás |
| 1 | corta: de frente o braço cruza o peito; de lado estende para a frente e avança | atravessada / para a frente |
| 2 | termina: o braço desce | para baixo |

- A mão que segura é a de perto (de frente, a direita do personagem; de costas, a direita da tela). De costas, no
  corte, a mão passa na frente do corpo e some; a lâmina aparece por fora.
- O jogo desenha a arma na mão com o ângulo da âncora (`arte/armas-vfx`).

## Formato das folhas (`saida/`)

- Cada folha tem 3 colunas (quadros 0, 1, 2) e 3 linhas (frente, lado, costas). A célula mede 64x96.
- Pivô: x = 32, y = 92. A linha 92 é a sola do pé, e todos os quadros têm os pés nessa linha.
- A vista de lado olha para a **esquerda**. Para olhar para a direita, espelhe todas as camadas juntas.
- Nome do arquivo: `slot__item__plano.png`. Só existe o arquivo do plano que tem pixel.

## Ordem de desenho

```
para plano em [tras, corpo, frente, topo]:
    para slot em [corpo, calca, camisa, conjunto, sapato, punho, olhos, boca, mascara, cabelo, chapeu, acessorio]:
        desenhar(slot, plano)      # e logo depois o símbolo da vila do mesmo slot
```

Para que serve cada plano:

- **tras:** braço ou perna atrás do corpo, e a parte comprida do cabelo longo (de frente e de lado).
- **corpo:** tronco, pernas e cabeça.
- **frente:** braços na frente do corpo.
- **topo:** o punho do soco e a perna do chute vindo para a câmera.

A roupa de cada membro fica no mesmo plano do membro.

De frente, o cabelo longo fica atrás dos braços que vão para trás. É o caso das mãos da corrida ao lado do rosto.

## Itens

| Slot | Item | Cores |
|---|---|---|
| corpo | `base` | pele (a roupa de baixo é cinza fixo) |
| olhos | `masculino`, `cilios` | olho (não aparecem de costas) |
| boca | `sorriso` | pele |
| cabelo | `espetado`, `longo_lateral` | cabelo |
| chapeu | `bandana` | cor1 = faixa (cor da vila), cor2 = placa de metal (lisa) |
| chapeu | `simbolo_espiral` | símbolo da vila na placa (provisório) |
| conjunto | `vila` | cor1 = colete, cor2 = camisa e calça, cor3 = faixas. Cores da vila, travadas |
| camisa | `basica` | cor1 = camisa, cor3 = gola e punhos |
| camisa | `simbolo_espiral` | logo da vila no peito (cor2) |
| calca | `basica` | cor1 = calça folgada, cor2 = amarração e cordão |
| sapato | `sandalia` | sandália aberta: cor1 = sandália (os dedos ficam de fora, na pele) |
| sapato | `bota` | bota de cano médio, por cima da barra da calça: cor1 = couro, cor2 = dobra do cano, cor3 = sola |
| punho, mascara, acessorio | — | vazios por enquanto |

- O conjunto da vila esconde a camisa e a calça.
- O sapato é o equipamento dos pés, uma camada própria: sem sapato, o pé fica descalço (o corpo já desenha o pé).
- O canal **pele** vale em qualquer camada: os dedos de fora da sandália e o remendo da orelha no cabelo usam a pele do personagem.

## Vilas

- Cada vila tem o **conjunto** e a **bandana** com cores próprias, e só muda o **símbolo** na placa e no peito da camisa.
- As 5 vilas atuais são exemplos provisórios (`vila_1` a `vila_5`).
- As cores delas estão em `gerador/export.py` (`VILAS`). Ver `saida/previas/vilas_exemplo.png`.
- O símbolo novo de cada vila entra em `SYMBOLS` (`gerador/head_items.py` e `gerador/clothes.py`). É um desenho de 5x5 px.
- Trocar o nome de uma vila exige trocar também `VILLAGES` em `src/realtime/appearance.ts`. Os jogadores já gravados com o nome antigo caem na vila padrão.

## Recolorir (mapa de índices)

Cada pixel guarda:

- **R = canal × 32**
- **G = tom × 16**

| Canal | Nome | Tons |
|---|---|---|
| 1 | fixo | contorno, branco do olho, roupa de baixo, aço (lista `fixo`) |
| 2 | pele | 10 tons |
| 3 | cabelo | 5 tons |
| 4 | olho | 4 tons |
| 5, 6, 7 | cor1, cor2, cor3 | 5 tons cada, vindos de qualquer rampa de `roupa` |

Paletas:

- **Pele:** 10 tons reais, do mais escuro ao mais claro (ebano … porcelana).
- **Cabelo:** 16 cores.
- **Olhos:** 14 cores.
- **Roupas:** 18 cores e 3 metais (aço, ouro, bronze).

## Criar itens novos

1. Escreva a função do item em `gerador/clothes.py`, usando as existentes como modelo. As peças são moldes na pose de repouso, e o código leva os moldes para cada pose sozinho.
2. Registre o item em `ITEMS` (`clothes.py` e `export.py`).
3. Para o jogo usar o item:
   - escolha o item em `itemsFor` (`public/sprites.js`);
   - se for uma escolha nova do jogador, crie o campo também em `src/realtime/appearance.ts` e na migração.
4. Regere tudo (veja "Regerar").

A checagem em `saida/previas/checagem.txt` confere três coisas:

- os pés estão no chão;
- a roupa de baixo não aparece por baixo da roupa;
- o mapa de índices bate com a folha colorida.
