# Design dos mapas: o mundo do Arco 1

Como o mundo do **Vontade do Fogo** se organiza, com a planta de cada mapa que o [Arco 1](historia/arco-1.md) pede.
O [design geral](design-do-jogo.md) e o [fim de jogo](endgame.md) continuam valendo; este documento cuida de
**onde as coisas ficam** e **por quê**.

Coordenadas em casas (1 casa = 16 px de pixel art), com x para a direita e y para baixo, como no código
(`src/realtime/maps.ts`). Cada ponto que uma missão usa tem nome no código (`FOREST_POI`, `CAVE_POI`...), para o
sistema de história (o "IR ATÉ") apontar para ele sem número solto.

---

## 1. Princípios

O jogo é jogado num celular deitado, com a câmera vendo cerca de **20 x 11 casas**. Tudo parte disso.

1. **Um marco por tela.** Andando em linha reta, a cada ~20 casas o jogador vê algo que reconhece (uma pedra que
   brilha, o carvalho gigante, o paredão). Quem se perde num MMO de celular fecha o jogo.
2. **A trilha conta a direção.** A trilha de terra sai da entrada e se divide numa encruzilhada com placa. Seguir a
   terra sempre leva a um lugar que importa; sair dela é caçar.
3. **Mais longe, mais perigoso.** O nível dos monstros sobe com a distância da Vila: o jogador sente que avança sem
   precisar ler um número. Perto da entrada, slimes; no fundo, Lodos Escuros.
4. **Clareira para lutar, corredor para andar.** Lugares de luta são abertos (8 x 8 ou mais, para os jutsus em área
   e o joystick); passagens têm 2 a 4 casas (o teste mede).
5. **O mapa conta a história.** A cachoeira seca existe porque a água do riacho agora some num buraco no chão (é a
   mesma água que sobe no canal da Vila, M2). O acampamento está queimado porque os Cinzas queimam o que deixam.
6. **Segredo com dica.** O que é escondido (a pedra atrás da cachoeira, a caverna do outro lado do abismo) sempre
   tem uma pista visível: a trilha termina numa fresta, as pegadas param na beira.
7. **Desafio que o jogador já conhece.** O abismo se atravessa com o Teleporte, o mesmo vão da Sala de Jutsus da
   Academia (2 casas). O jogo ensina lá e cobra aqui.
8. **Leitura antes de beleza.** Parede é parede (contorno escuro, sombra), chão é chão. Água, vão e lodo têm cores
   que não se confundem com grama. Pedra-Selo acesa é quente (laranja, brilha); apagada é fria (cinza-azulada).

---

## 2. O mundo

```
                 ┌────────────────────┐
                 │  Vila da Folha     │  80 x 80 · segura
                 │  (Poço sob a Praça)│──── poço lacrado ────► Poço sob a Praça (24 x 18) · M13
                 └─────────┬──────────┘
                     portão sul
                 ┌─────────┴──────────┐
                 │      Floresta      │  100 x 100 · caça, níveis 1 a 13
                 │  Pedras-Selo 1 a 3 │
                 │  Acampamento, Abismo│── Teleporte por cima do abismo ──► Caverna do Lodo (56 x 44) · M11
                 └─────────┬──────────┘
                  passagem sul (troncos)
                 ┌─────────┴──────────┐
                 │  Clareira Queimada │  44 x 40 · Pedra 4 · chefe Kagerō · M14
                 └────────────────────┘

   Vilas (fim de jogo): Folha, Névoa, Nuvem, Areia ──Posto de Viagem──► Floresta, Zona de Conflito
   Refúgio dos Renegados ──Posto de Viagem──► Zona de Conflito
```

- **A Vila da Folha** é o centro do Arco 1. As outras vilas, a Zona de Conflito e o Refúgio são do fim de jogo e já
  existem ([endgame.md](endgame.md)).
- **A Floresta** é o mapa grande do arco: quase todas as missões passam por ela.
- **Os mapas novos** saem dela: a Caverna do Lodo (pelo abismo) e a Clareira Queimada (pela passagem sul). O Poço
  sai da Vila.
- **Trancados até a história chegar lá:** a passagem sul da Floresta está fechada por troncos queimados e o poço da
  Praça tem uma tampa de pedra. Quem passa por ali vê que há algo do outro lado (é o gancho). Os mapas já existem;
  o sistema de história abre a passagem para quem estiver na missão.

---

## 3. Floresta (100 x 100)

### 3.1 Planta

```
x:  0        14   22  27      39 42 46 53          62   76  83        98 100
y 0 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃ENTRADA ┃▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    ▓ árvores          ┌ Clareira da Entrada ┐                        ≈≈≈≈ riacho
    ▓                  │   Posto(46,6)  placa │                  ≈≈≈≈≈▓  (vem do leste)
 14 ▓                  └────────║║║──────────┘            ≈≈≈≈≈▓
    ▓    ┌ Clareira da Pedra ┐  ║║║                  ≈≈≈≈▓
 20 ▓    │   ◆ Pedra 1 (apagada) ══║║║     ◎ sumidouro ≈▓       leito seco ░
    ▓    └───────────────────┘  ║║║    (a água entra na terra)    ░
    ▓  árvores                   ║║║                               ░
 32 ▓                            ║║║        ████████████┌─ fresta ─┐██████████
    ▓  ┌ Velho Carvalho ┐  ┌ Encruzilhada ┐ █ paredão   │ ◆ Pedra 3 │ paredão █
 37 ▓  │  (copa enorme) ═══════ placa ═══════════════════ cachoeira seca      █
    ▓  │   ▲ tronco      │  └──────║║║──┘                                  ▓
 47 ▓  │   ◆ Pedra 2     │         ║║║                                     ▓
    ▓  └─────────────────┘         ║║║        mata funda (slimes)           ▓
 62 ▓  ┌ Acampamento Queimado ┐    ║║║                                     ▓
    ▓  │ barracas · fogueira  │    ║║║                 beira (Lodos Escuros) ▓
 70 ▓  │ apagada · kunais ═══════════║║║                                    ▓
 76 ▓  └──────────────────────┘    ║║║═══════════════════ pegadas ▓        ▓
 82 ▓                              ║║║            ██ ▒▒▒▒▒▒▒▒ ABISMO ▒▒▒▒▒▒▒▒▓
    ▓                              ║║║            ██  saliência (só com    ▓
 90 ▓                           ┌─troncos─┐       ██  Teleporte) ⌂ caverna  ▓
    ▓                           │ lacrado │       ██                        ▓
100 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃  SAÍDA SUL ┃▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

### 3.2 Lugares

| Lugar | Onde (casas) | O que é | Missões |
|---|---|---|---|
| **Clareira da Entrada** | x 27..53, y 0..14 | chegada do portão da Vila; Posto de Viagem; placa; sem árvores e sem monstro nascendo | todas |
| **Trilha principal** | x 39..42, y 0..92 | terra batida do portão até a passagem sul | |
| **Clareira da Pedra** | x 14..30, y 16..28 | a **Pedra-Selo 1**, apagada, que a Tsubaki achou | M3, M5 |
| **Riacho e sumidouro** | do leste (x 98, y 12) até o buraco (x 56..60, y 17..21) | a água desce e some na terra: é a água que sobe no canal da Vila | M2 |
| **Leito seco** | x 74..82, y 21..31 | onde o riacho corria antes, até a cachoeira | M8 |
| **Encruzilhada** | x 33..48, y 34..42 | placa com três setas (Carvalho, Cachoeira, Fundo) | |
| **Velho Carvalho** | clareira x 4..28, y 36..58; tronco em (12, 42) | a árvore mais velha da Floresta; a **Pedra-Selo 2** fica nas raízes | M8 |
| **Cachoeira Seca** | paredão x 62..98, y 32..38 | a trilha leste termina numa fresta no paredão; atrás dela, a **Pedra-Selo 3** | M8, M10 |
| **Acampamento Queimado** | x 6..32, y 62..82 | barracas queimadas, fogueira apagada, kunais marcadas no chão | M6, M7 |
| **Beira do Abismo** | trilha x 42..64, y 76..78; abismo x 60..98, y 82..84 | as pegadas param na beira | M10 |
| **Saliência e Caverna** | x 62..98, y 84..98 | só se chega com o Teleporte; a boca da Caverna do Lodo fica na face sul da rocha (contorna-se a rocha) | M11 |
| **Passagem sul** | x 38..46, y 92..100 | fechada por troncos queimados até a M14 | M14 |

### 3.3 Caça por nível

| Zona | Onde | Monstro | Níveis | Peso |
|---|---|---|---|---|
| Bosque | y 16..40 | Slime | 1 a 5 | 5 |
| Mata funda | y 40..64 | Slime | 4 a 8 | 4 |
| Fundo | x 4..60, y 64..94 | Slime | 6 a 10 | 3 |
| Leito seco | x 62..96, y 21..31 | Lodo Escuro | 8 a 11 | 1 |
| Beira | x 64..96, y 40..80 | Lodo Escuro | 9 a 13 | 2 |

- O **peso** diz quanto dos monstros do mapa nasce em cada zona (o total continua sendo 10 + 3 por jogador, até
  40). Cada monstro anda só dentro da zona dele: o Lodo Escuro não sobe até a entrada.
- **Clareira da Entrada:** nenhum monstro nasce nem entra (é onde se chega).
- O **Batedor das Cinzas** (ninja inimigo, M6 e M7) vai morar no Acampamento quando os inimigos do arco chegarem.

---

## 4. Caverna do Lodo (56 x 44)

```
x: 0          25   31                       56
y 0 ████████████████████████████████████████████
    █ ┌──────────── ◇ o fundo ─────────────┐ █   M11: "IR ATÉ o fundo" (Kenji preso)
  6 █ │         ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈        │ █
    █ │  ▲      ≈≈≈ lago de lodo ≈≈≈    ▲ │ █   o lago brilha (chakra derretido)
 16 █ └──┐  ┌─────────────────────── ┐  ┌─┘ █
    █    │tú│ █   rocha do meio   █ │tú│    █
 24 █──┐ └──┘ ████████████████████ └──┘ ┌──█
    █  │  galeria (estalagmites)          │  █   Lodos Escuros
 32 █──┘       ┌──┴──┐                   └──█
    █ rocha    │túnel│              rocha   █
 44 ███████████┃saída┃███████████████████████   saída: volta para a saliência da Floresta
```

- **Entrada:** pela boca da caverna, na face sul da rocha da saliência (a face que aparece na tela). Entra-se
  andando para o norte, então a caverna começa embaixo e o fundo fica em cima. Logo depois da porta há um pedaço
  seguro (quem chega não apanha na hora). Na saída, quem continua andando para o sul se afasta da boca e não entra
  de novo sem querer.
- **Caminho:** túnel de entrada, galeria, dois túneis (oeste e leste) que sobem para a câmara do lago. Os dois
  lados levam ao mesmo lugar: em grupo, cada um vai por um.
- **O lago de lodo** é parede (ninguém entra) e brilha. **O fundo** fica logo acima do lago: é o objetivo da M11.
- **Monstros:** Lodos Escuros na caverna toda (menos a entrada). Níveis 11 a 13.
- **Chefe (v19):** o **Rei Lodo** mora no canto leste da câmara do lago (x 38..48, y 3..16), longe do fundo da M11:
  quem vai só cumprir a missão não precisa enfrentá-lo.
- **Clima:** escuro. A tela fica escura em volta do jogador, com uma luz no meio (a caverna é o lugar mais tenso do
  arco até o chefe).

---

## 5. Clareira Queimada (44 x 40)

```
x: 0     18      26        44
y 0 ▓▓▓▓▓▓┃entrada┃▓▓▓▓▓▓▓▓▓▓   vem da passagem sul da Floresta
    ▓ árvores mortas         ▓
    ▓   ░░ cinzas e brasas ░░ ▓
 18 ▓   ░░░   ◆ Pedra 4   ░░░ ▓   arena do chefe (Kagerō, fase 2: o Braço do Lodo)
    ▓   ░░ chão queimado ░░░  ▓
 36 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

- **O coração da Floresta**, onde fica a Pedra-Selo 4. Arena redonda (cerca de 30 casas de diâmetro livre), sem
  coluna no meio: o chefe tem ataque em área no chão e o jogador precisa de espaço para fugir.
- Fechada até a M14 (troncos na passagem sul). Sem caça: quem aparece aqui é o chefe e os ecos dele.

---

## 6. Poço sob a Praça (24 x 18)

```
x: 0   8      16   24
y 0 ████┃escada┃█████    parede das tochas; a escada sobe para o poço da Praça
    █   plataforma    █
  7 █≈≈≈≈≈≈≈║═║≈≈≈≈≈≈≈█   canal de água com uma ponte de pilares
    █  salão de pedra  █   M13: o Mestre luta junto
 13 █ ░░███┃🔥┃███ ≈≈ █   porta lacrada (a chama): a Quinta Pedra (Arco 2); entulho e poça nos cantos
```

- **Entrada:** o poço da Praça da Vila, hoje com uma **tampa de pedra** lacrada (dá para ver, não dá para abrir).
- Pequeno de propósito: é uma cena de luta e uma revelação, não um lugar para caçar.
- A **porta lacrada** do fundo leva à Quinta Pedra, que é do Arco 2.
- **Mapa em imagem** (v23, seção 6.1): o chão é `arte/mapas/referencia_poco.jpg`. O mapa passou de 24 x 20 para
  24 x 18 para ter a proporção da imagem (casas quadradas, sem esticar o desenho).

### 6.1 Mapas em imagem (v23)

Um mapa com `art` no layout (`src/realtime/maps.ts`) é desenhado com a **imagem gerada por IA**, sem nada por
código por cima: o chão, as paredes, as tochas e os enfeites já estão no desenho.

1. **Fatiar:** `python3 arte/mapas/fatiar.py <imagem> <art> <largura> <altura> [--recorte x0,y0,x1,y1]` estica a
   imagem para o mapa a 48 px por casa (a resolução do chão do jogo) e grava `public/mapas/<art>/<cx>_<cy>.webp`
   (blocos de 8 x 8 casas) e `mini.webp` (o minimapa). O `--recorte` tira a moldura preta da imagem. Escolha o tamanho
   do mapa com a **proporção da imagem**, ou o desenho fica esticado.
2. **Colisão:** as paredes do layout seguem o desenho. `python3 arte/mapas/sobrepor.py <imagem> <layout.json> <saída.png>
   --recorte ...` desenha as paredes (vermelho), a água (azul) e as portas (verde) por cima da imagem, numa grade de
   casas, para conferir.
3. **Luzes:** `lights` no layout marca a chama de cada tocha ou lanterna do desenho: de noite e na caverna, o jogo
   acende a luz ali.
4. O servidor serve os blocos de todo mapa com `art` (`src/web/staticFiles.ts`); o cliente carrega só os blocos perto
   da câmera e monta o chão com eles (`chunkCanvas` em `public/game.js`). Paredes, enfeites e árvores desses mapas não
   são desenhados (só dão colisão).

| Mapa | Imagem | Recorte | Tamanho |
|---|---|---|---|
| Poço sob a Praça | `arte/mapas/referencia_poco.jpg` (1500 x 1120) | `37,34,1464,1087` | 24 x 18 |
| Vila da Folha | `arte/vilas/folha_ampliada.jpg` (4500 x 3360, ampliada) | `84,0,4416,3340` | 78 x 60 |
| Armaria | `arte/mapas/referencia_armaria.jpg` (2000 x 1493) | `56,52,1944,1493` | 17 x 13 |
| Casa dos Pergaminhos | `arte/mapas/referencia_pergaminhos.jpg` (2000 x 1493) | `75,59,1925,1493` | 17 x 13 |

As lojas em imagem têm cada uma a sua planta (`SHOP_ART` e `shopRoom()` em `src/realtime/maps.ts`): o lojista, a
frente do balcão, a chegada e a porta de saída. A Alfaiataria continua na sala 15 x 15 desenhada por código (`ROOM`)
até ter imagem.

**Resolução:** o jogo mostra ~50 px por casa. Imagens com menos de ~40 px por casa (as vilas, a Floresta e a Zona
de Conflito, com 10 a 19) ficam borradas se só esticadas: passam antes pelo ampliador de IA (`arte/mapas/ampliar.py`,
Real-ESRGAN x4plus, 4x), e o fatiador usa a ampliada.

**Vilas em imagem:** cada uma tem a sua planta (`VillagePlan`: renascimento, Mestre, praça, Posto de Viagem, portão,
prédios das lojas e da Academia, arena, zona segura, poço e grade). O servidor pega tudo dela (`villagePlan(mapa)`):
os NPCs, onde se nasce e renasce, onde se chega de viagem e o fim do tutorial.

---

## 7. Vila da Folha (o que muda)

- **Grade do canal** (M2): onde o rio do oeste passa por baixo da muralha sul, uma grade de ferro. "A água desse
  canal vem da Floresta. Por baixo da terra."
- **Tampa do poço** na Praça, à esquerda da rosa dos ventos: tampa de pedra com um selo gravado.

**Em imagem (v23):** a Folha é `arte/vilas/referencia_folha.jpg`, ampliada 4x (`folha_ampliada.jpg`), em **78 x 60**
casas. A planta dela (`villagePlan('map_1')` em `src/realtime/maps.ts`) foi medida no desenho:

| O quê | Onde (casas) |
|---|---|
| Renascimento / Mestre | (38; 24,4) / (40; 23,4), na rua em frente à escada da sede |
| Praça (fim do tutorial) | (38, 45), sobre a rosa dos ventos; a praça inteira é zona segura |
| Posto de Viagem | (37; 51,5), na praça, perto do portão |
| Lojas (porta no meio da fachada) | Armas x 24,6..31,6 · Roupas x 46,4..53,2 · Pergaminhos x 58,5..65; fachadas em y 35 |
| Academia | x 50,1..64,6, porta embaixo (y 21,8) |
| Arena | dentro da cerca (x 58,8..74,2, y 41,5..52,6), entrada só pela esquerda; quem perde renasce em (56,6; 47,4) |
| Portão sul (Floresta) | x 36,5..41,4; voltando da Floresta, chega-se em y 57 |
| Poço / grade do rio | o poço da praça (x 47,3..50,4) / a grade no braço do rio (y 49,4..52,8) |

As árvores bloqueiam só o tronco e a parte de baixo da copa (`crown`): entre duas árvores sobra passagem. As outras
vilas continuam na planta antiga (80 x 80, `BASE_PLAN`) até ganharem a sua.

### 7.1 Névoa, Nuvem e Areia (v22)

Névoa, Nuvem e Areia têm a **mesma planta** (as mesmas colisões, portas e praça); o desenho muda com o tema do mapa,
seguindo as artes de referência em `arte/vilas/` (a prévia de cada uma no jogo está ao lado, `jogo_*.jpg`).

| Vila | O que muda no desenho |
|---|---|
| Folha | telhado vermelho, cerejeiras, grama verde (a base) |
| Névoa | telhado azul, **bambu** no lugar das cerejeiras, grama úmida (verde frio) e **poças** no chão; a neblina é o clima "neblina" |
| Nuvem | telhado vinho, **nuvens** no alto do morro e **bandeiras** vinho com a nuvem branca na praça e na avenida (só enfeite) |
| Areia | tudo de **arenito**: sede em cúpula com faixa de janelas e duas torres, hospital de cúpula clara com cruz vermelha, Academia em duas torres ligadas por ponte de pedra, lojas redondas com toldos e a mercadoria na porta, casas em torre; **cânion** no lugar da muralha, **mesa** de arenito no lugar do morro, chão de deserto, pontes de pedra, palmeiras e cactos, vasos de barro, arena de terra batida |

O tema chega ao desenho pelo mapa (`theme` no layout): paredes e árvores levam `t` (em `visibleWalls`), enfeites
também (`visibleDeco`), e o chão troca na hora de pintar (`groundKind` em `public/game.js`: na Areia a grama vira
`desert` e a ponte `stonebridge`; na Névoa a grama vira `moss`). As janelas e a lâmpada das lojas da Areia ficam onde
a fachada comum as teria, então as luzes da noite continuam no lugar certo.

---

## 8. Arte

| Peça | Como é | Leitura |
|---|---|---|
| Pedra-Selo | pedra alta com uma chama gravada | **acesa:** chama laranja e brilho que pulsa; **apagada:** cinza-azulada, sem brilho |
| Velho Carvalho | tronco largo com raízes; a copa (10 x 8 casas) passa **por cima** de quem anda embaixo | o marco que se vê de longe |
| Paredão | rocha em camadas, mais alta que larga; a cachoeira seca é uma faixa clara de pedra lisa | parede intransponível |
| Riacho | água azul com reflexo; o sumidouro é um buraco escuro com pedras em volta | água não é chão |
| Leito seco | seixos e areia cinza | caminho que já foi rio |
| Acampamento | barracas de lona rasgada e queimada, cinzas no chão, fogueira apagada, kunais cravadas | "alguém esteve aqui" |
| Abismo | o mesmo vão escuro da Academia | "aqui só com o Teleporte" |
| Caverna | rocha escura arroxeada, chão de pedra úmida, lago de lodo roxo que brilha | escuro, perigo |
| Clareira Queimada | árvores mortas, chão queimado, brasas | fim de jogo do arco |
| Monstros | cada tipo com a sua cor: Slime vermelho, Lodo Escuro roxo-escuro, Lodo Sombrio azul-petróleo | o perigo se lê pela cor |

---

## 9. Próximos passos

1. **Sistema de história** (missões por jogador, diálogo, IR ATÉ nos POIs deste documento): é o que abre a passagem
   sul e o poço, apaga e acende as pedras por jogador e coloca o Kenji, a Tsubaki e o Kagerō nos mapas.
2. **Inimigos do arco:** Batedor das Cinzas (arremessa kunai), Eco de Kagerō, Kagerō e o Braço do Lodo.
3. **As outras três vilas** com planta própria (hoje usam a planta da Folha, cada uma com o seu desenho: seção 7.1).
