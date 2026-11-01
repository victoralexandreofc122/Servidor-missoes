# Ficha técnica visual: herói em pixel art (referência V28)

A versão V28 do herói (cabelo C, pose parada de frente) é a referência principal. Toda vista, animação e personagem
novo segue estas regras. Código: `public/pixelHero.js`. Prévias: `arte/personagem-pixel/`.

## Versões

- **V28 (congelada):** as 4 vistas paradas aprovadas. Cópia fixa em `arte/personagem-pixel/v28/` (os 4 PNG e o código
  `pixelHero.v28.js`). Nunca é sobrescrita: melhorias viram V29, V30... e cada uma é comparada com a V28.
- **V29:** frente idêntica à V28 (conferido pixel a pixel). Costas: mechas da nuca com grupos de azul intermediário,
  capuz com gola, forro, tecido e 2 dobras, fenda da barra mais curta com costura. Lados: perna e bota de trás 2 px mais
  para trás, para os dois pés se lerem separados.
- **V29.1:** só a caminhada mudou; os sprites parados são os da V29. Código da V29 congelado em
  `arte/personagem-pixel/v29/`; o da V29.1 em `v29_1/codigo/`. Testes em `arte/personagem-pixel/v29_1/` (660 e 840 ms
  arquivados em `v29_1/arquivo/`).
- **V29.2 = caminhada oficial (congelada):** só a frente e as costas da caminhada mudaram (passada, abas). Cópia fixa
  em `arte/personagem-pixel/andar_oficial/` (código, folha de sprites, GIFs). Não mexer sem necessidade comprovada.

## Diretriz de produção

1. Não redesenhar a frente V28 sem autorização do Victor.
2. Não mudar proporções de cabeça, corpo, pernas ou botas.
3. Preservar a silhueta do cabelo (ver "Silhueta permanente").
4. Usar só as rampas desta ficha.
5. Luz sempre de cima, ligeiramente à esquerda **da tela**, em todas as vistas.
6. Mesmo agrupamento de pixels: faixas de tom, sem degradê, sem pixel solto.
7. Nada que não exista na V28 sem justificativa.
8. Não mudar a resolução nem a escala.
9. Cada etapa nova é mostrada antes de seguir, com as diferenças em relação à V28 apontadas.
10. Uma vista só é aprovada se for tecnicamente compatível com as outras, não só bonita.

## Medidas (quadro 64 x 96)

| Medida | Valor |
|---|---|
| Quadro | 64 x 96 px, eixo do corpo entre as colunas 31 e 32 |
| Linha dos pés | sola na linha 88, contorno na 89, em toda vista e quadro |
| Topo | pontas do cabelo na linha 8 (com contorno); cúpula do cabelo na linha ~17 |
| Altura total | 82 px com as pontas e o contorno; 72 px da cúpula do cabelo até a sola |
| Cabeça | crânio de ~27 x 25 px (linhas 22 a 47); com o cabelo, ~38 px de largura de frente |
| Olhos | 5 x 6 de frente (colunas 23-27 e 36-40, linhas 36-41); 4 x 6 de perfil |
| Tronco | ombros de 21,6 a 42,4; cintura (faixa) na linha 62-65 |
| Casaco | estreito no corpo, barra em sino até a linha 84, ponta de fora da barra até a coluna 15 |
| Mãos | elipse de ~6 x 6, centro na linha 68 (melhoria pendente) |
| Botas | cano com punho nas linhas 79-81, sola na 88 |

Medição da V28 nas 4 vistas (pixels opacos, com contorno):

| Vista | Topo | Base | Altura | Largura total | Largura da cabeça (linha 34) | Largura do corpo (linha 60) | Centro de massa x |
|---|---|---|---|---|---|---|---|
| frente | 8 | 89 | 82 | 44 | 38 | 30 | 31,5 |
| costas | 8 | 89 | 82 | 44 | 35 | 30 | 31,5 |
| direita | 8 | 89 | 82 | 43 | 32 | 14 | 30,5 |
| esquerda | 8 | 89 | 82 | 43 | 32 | 14 | 32,5 |

## Contorno

- Externo: 1 px, `#14182B` (azul-noite), vizinho em cruz, nunca preto puro, sem anti-aliasing.
- Interno (uma peça na frente de outra): 1 px no tom de **sombra** do material da frente.
- Dobras e fios: traços de 1 px no tom de sombra, nunca de contorno.

## Luz e sombreado

- Fonte única: de cima, ligeiramente à esquerda da tela. O lado esquerdo é a geometria do direito espelhada **antes**
  do sombreado, para a luz não inverter.
- 4 tons por material: luz, base, sombra, sombra profunda. A sombra profunda aparece só nas bordas de baixo e da direita.
  Exceção: o cabelo tem 3 tons (luz, base, sombra) mais o brilho; a sombra profunda do cabelo é a própria sombra,
  porque a sombra (`#10172b`) já fica a um passo do contorno. Não há quarta cor de propósito.
- Sombra projetada: a peça da frente escurece 1 a 2 px embaixo/à direita dela (franja na testa, cabeça no pescoço).
- Profundidade: o que está atrás (cabelo da nuca, perna e bota de trás no perfil) usa a rampa um tom abaixo.

## Rampas de cor

| Material | Luz | Base | Sombra | Profunda |
|---|---|---|---|---|
| Pele | `#ffe4cc` | `#f5c6a2` | `#d99784` | `#a5636e` |
| Cabelo (3 tons) | `#3e5c8a` | `#1f2a44` | `#10172b` | = sombra (brilho `#7fa3d1`, fios `#161f38`) |
| Casaco | `#4fb3bf` | `#1f7f8f` | `#145561` | `#0d3a44` |
| Camisa | `#9c3a50` | `#7a2438` | `#4d1424` | `#330c19` |
| Calça | `#565b6e` | `#3b3f50` | `#292c3a` | `#1b1d28` |
| Bota | `#4d505e` | `#33353f` | `#23242c` | `#16161d` |
| Sola | `#7a6a6c` | `#5a4c4f` | — | `#3a3033` |
| Faixa | `#4a3a4f` | `#2e2433` | `#201824` | `#150f18` |
| Olho | traço `#14182b`, pupila `#14284f`, íris `#2f6db5` / `#6fb4e8`, brilho `#ffffff` | | | |

## Silhueta permanente do cabelo (C)

- **Permanente (aparece em toda vista):** as 4 pontas do topo e a cúpula. De costas elas são espelhadas (a cabeça é
  vista do outro lado). De lado, as 2 do meio são as mesmas, a de trás aponta para trás e a da frente para a frente.
- **Só de frente e de lado:** franja em 5 pontas e as mechas laterais (2 de cada lado, a de fora mais comprida).
- **Só de costas:** 6 mechas da nuca, saindo do redemoinho em ponta e descendo até a linha ~46.
- **Detalhe de luz (pode variar):** fios escuros saindo do redemoinho, o brilho em arco no alto à esquerda.

## Animação

- Peças agrupadas em segmentos: `corpo` (cabeça, tronco, rosto), `cabelo`, `braco_e/d` (de lado: `braco`),
  `perna_e/d` (de lado: `perna_f` de perto e `perna_t` de trás), `aba_e/d` (de lado: `aba`). E/D = esquerda/direita
  da tela.
- Movimento só em pixels inteiros (deslocar e inclinar a barra), sem rotação: o agrupamento de pixels não se perde.
- Peças separadas para animar são sombreadas em conjunto com as irmãs (`shadeAlso`), e a pose neutra é igual à V28.
- **Andar oficial (`WALK`, V29.2):** 6 poses únicas por direção, 4 direções = **24 quadros**, sem quadro repetido.
  **125 ms por quadro = 750 ms por ciclo** (2 passos). No GIF, 120/130 ms alternados (o formato só aceita centésimos;
  a soma do ciclo é exatamente 750 ms). A mesma tabela vale para as 4 vistas. O corpo desce 1 px na descida e sobe
  1 px na passagem. O pé de trás ergue o calcanhar 1 px no contato e sai 2 px do chão na descida; o pé de apoio fica
  sempre na linha 88.
  - Frente e costas: no contato as pernas abrem 1 px cada (vão de 3 px entre os pés; nunca menos de 1 px) e as duas
    abas abrem 1 px na barra; na descida, a aba do lado do pé que sobe abre 1 px; na passagem, fechadas. O braço oposto
    à perna que avança desce 1 px e entra 1 px.
  - Lado: pernas e braço **giram** (inclinação a partir do quadril, linha 66, e do ombro, linha 50); bota, punho e mão
    andam inteiros. O alto da coxa fica sempre sob o casaco. Pé a 3 px para a frente/trás.
  - Cabelo: a massa vai junto com a cabeça (a franja não desliza); só as pontas acima da linha 17 atrasam 1 px
    (esticam quando o corpo desce, encolhem quando sobe). Silhueta permanente intacta.
  - Validação (`arte/personagem-pixel/validar_andar.py`): pés na linha 89 (contorno) nos 24 quadros; corpo
    0/+1/-1/0/+1/-1 nas 4 vistas; troca último→primeiro do mesmo tamanho das outras (0,89 a 0,98 da média: sem salto);
    nenhum pixel solto a mais que a pose neutra.
  - Sincronia com o deslocamento: o jogador anda 5 casas/s e uma casa vale ~61 px do boneco (`spriteScale`:
    92 / 1,5). Em 750 ms ele anda **3,75 casas (~230 px)**, enquanto o pé de apoio recua só 12 px por ciclo. Nenhum
    sprite deste tamanho cobre isso sem o pé "patinar" (o boneco atual tem o mesmo efeito). Regra: avançar o quadro
    pela **distância** andada, 1 ciclo a cada 3,75 casas (1 quadro a cada 0,625 casa). A 5 casas/s isso dá os 750 ms;
    com Lentidão ou bônus de velocidade, o passo acompanha sozinho.
  - Registro V29 → V29.1: o cabelo inteiro atrasava 1 quadro (a franja deslizava), as pernas da frente/costas só
    subiam (parecia marchar) e a perna de trás do perfil andava inteira (faixa escura atrás da barra).
  - Registro V29.1 → V29.2: abas abrindo no contato e na descida (antes balançavam juntas para um lado só), braço
    sempre com o mesmo deslocamento, velocidade 660 → 750 ms.

- **Correr (`RUN`, V30.1, em avaliação): igual à corrida do boneco anterior** (rig v27, `correr` em `public/rig.js`),
  por decisão do Victor. O protótipo V30 (braços balançando, 540 ms) foi arquivado em
  `arte/personagem-pixel/v30_corrida/arquivo_prototipo_540ms/`.
  - Como no anterior: corrida ninja com o tronco bem inclinado (de lado, cabeça e ombros 8 px à frente do quadril e
    3 px abaixo; a cabeça anda inteira), os **dois braços esticados para trás** (de lado, um desenho próprio do braço
    quase na horizontal, com a mão atrás das costas; de frente e de costas, as mãos abrem 2 px dos lados), passada
    longa (pé a 6 px para a frente/trás, joelho subindo até 5 px), um instante no ar (quadros 2 e 5) e a barra do
    casaco voando para trás (6 px, 7 px no voo). **Ciclo de 440 ms**, o mesmo do anterior: quadros de 70/80 ms
    (70, 80, 70, 70, 80, 70).
  - 6 poses únicas por direção, 4 direções = 24 quadros. Limpeza extra só nos quadros da corrida (as bordas
    inclinadas em degrau deixavam pixels sem vizinho da mesma cor).
  - Conta da passada (1 casa ≈ 61,3 px; o pé de apoio recua 12 px por passo correndo e 6 px andando):

    | | Caminhada 750 ms | Corrida 440 ms |
    |---|---|---|
    | Velocidade no jogo | 5 casas/s (307 px/s) | 8 casas/s (491 px/s), 1,6x |
    | Passos por segundo | 2,67 | 4,55 (1,70x) |
    | Distância por passo | 1,88 casa | 1,76 casa (0,94x) |
    | Pé desenhado por ciclo | 12 px | 24 px |
    | Deslocamento por ciclo | 230 px | 216 px |
    | Deslizamento (desloc. / pé) | 19,2x | 9,0x |

    A corrida parece mais rápida pela cadência (1,7x), pela postura e pelo pé desenhado com o dobro do curso; o
    deslizamento cai para menos da metade. A distância por passo fica um pouco menor que andando (0,94x): é o preço de
    manter os 440 ms do anterior. Com 8 casas/s, o quadro avança a cada 0,59 casa (1 ciclo a cada 3,52 casas).

- **Achado na validação (caminhada oficial, não corrigido):** com a regra mais rígida de pixel solto (nenhum vizinho
  da mesma cor, nem na diagonal), o quadro 0 do lado direito tem 6 pixels soltos a mais que a pose parada (punho,
  calça e barra inclinados). Correção possível: a limpeza também nos quadros inclinados. Aguarda decisão.

- **V31: animação pelo esqueleto palito 3D (em avaliação).** As mesmas peças desenhadas à mão, agora presas aos ossos
  do esqueleto de `public/rig.js` (o mesmo das animações do boneco anterior). Código: `skeletonFrame` e
  `skeletonPosed` em `public/pixelHero.js`; uso: `renderHero('C', vista, { skel: { anim, t }, limpeza: true })`.
  - Ossos: tronco (cintura → pescoço), braço (ombro → cotovelo), antebraço (cotovelo → pulso), coxa (quadril →
    joelho), canela (joelho → tornozelo) e pé (tornozelo → ponta). Juntas do herói em `PIVOTS` (por vista).
  - Cada peça gira com o osso (diferença de ângulo na tela entre a pose e a pose neutra) e encurta quando o osso
    aponta para a câmera. Osso com menos de 25% do comprimento na tela não gira (ângulo instável). Braços e pernas são
    cortados no cotovelo e no joelho com 1 linha de sobra. Bota rígida (de lado gira com o pé). Cabeça não gira (rosto
    à mão), só anda com o pescoço. Aba do casaco: metade do giro da coxa do mesmo lado mais o vento (andar 0,35,
    correr 1), cortada na linha 85. Braço que vai para trás do tronco (de frente/costas) é desenhado atrás dele.
  - Só depois de girar vêm o sombreado, os traços e o contorno. Limpeza extra: pixel sem vizinho da mesma cor vira a
    cor dos vizinhos; degrau solto de borda inclinada desce um tom; sola girada fica lisa.
  - Chão: o pé mais baixo volta para a linha 88; no ar, sobe o `air` do esqueleto (1 px na corrida).
  - Conferido: pose neutra pelo esqueleto = V29 (0 pixels diferentes nas 4 vistas); caminhada oficial V29.2
    inalterada; `validar_andar.py` OK na caminhada (pés na linha nos 6 quadros) e na corrida (no ar nos quadros
    1, 2, 4 e 5, como no esqueleto); cabe no quadro (x de 4 a 60).
  - Tempo: caminhada 750 ms (a escolhida), corrida 440 ms (como a anterior). Prévias em
    `arte/personagem-pixel/v31_esqueleto/` (com o palito desenhado por cima).

## Camadas

`corpo` (cabeça, pescoço, mãos), `olhos`, `boca` (boca, nariz, blush), `cabelo`, `camisa`, `casaco` (corpo, lapelas,
abas da barra, mangas, punhos, capuz), `calca`, `acessorio` (faixa e nó), `sapato` (bota, punho, sola).

## Pendências conhecidas

- Mãos: manter o tamanho, desenhar o polegar como parte da silhueta, separar palma e polegar por cor, sem dedos.
- Contraste do cabelo sobre água: testado em grama, terra e água (`previa_andar_no_mapa.png`). A cabeça se lê nos 3;
  na água a massa da nuca e as laterais ficam próximas do fundo. Resolver nos tons de azul, sem contorno claro.
