# Adaptação: Clã Nara (Estilo Sombra), Bukijutsu (Armas) e Genjutsu (Ilusão)

* **Autor:** adaptador Goldfish (EGM), 03/11/2026. Fonte: `especificacao-original.pdf`, páginas 9 a 11; regras da
  seção 2 de `docs/jutsus-v2.md`; números de `src/realtime/jutsus.ts` e `src/realtime/pvpBalance.ts`.
* **Como ler:** "base" é o dano do tier 1 equivalente (18 a 30); o tier entra só por `TIER.power` (monstros) e
  `PVP_TIER_POWER` (PvP). Custo e recarga partem do tier 1 de hoje da classe x `TIER.cost` / `TIER.cooldown`
  (1 / 1,35 / 1,7 / 2,2 e 1 / 1,15 / 1,3 / 1,5); o simulador ajusta. Casas = metros. "Controle" é o tempo **no PvP**,
  sempre cobrado do orçamento (1,5 s por golpe, 2,5 s a cada 15 s). Maestria L2 a L4 muda só números (regra do
  piloto), com -2% de recarga por nível já incluso e ganho total no PvP até +15%.
* **NOVO** = jutsu que não está no PDF (Bukijutsu e Genjutsu só trazem "destaques"); nomes da série.

## 1. Clã Nara (Estilo Sombra)

Passiva do clã (seção 5.2): +10% de alcance nos jutsus de sombra do clã. Tier 1 de hoje (Sombra): custo 25, recarga
6 s, linha 4, prende 5 s em monstro (1,5 s no PvP pelo orçamento). Esses números ficam.

| Nome | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Kage Mane no Jutsu (Possessão da Sombra), a Sombra de hoje | 1 | linha (4 direções) | sem dano; custo 25; recarga 6 s; linha 4 (4,4 com a passiva); prende 5 s em monstro; **controle 1,5 s** | linha 5 / custo -10% / empurra o alvo 1 casa para o lado ao soltar | Sua sombra corre no chão e prende o primeiro inimigo. | nenhum |
| Manipulação de Sombra (Reflexo Tático) | 1 | avanço sem dano (recuo) | sem dano; custo 15; recarga 8 s; recuo de 3 casas para trás ou para o lado; deixa rastro 2 s | 3,5 casas / rastro com lentidão 15% por 1 s / recarga -6% | Salte para trás no impulso da própria sombra. | rastro = zona da entrega 1 |
| Kage Nui (Costura de Sombra) | 2 | leque de 3 agulhas, linha 5 | base 3 x 8 (cada alvo leva 1); custo 34; recarga 6,9 s; prende **0,8 s** | 4 agulhas (cada alvo ainda leva 1) / atravessa barreira fraca / tira 8 de chakra | Agulhas de sombra brotam do chão e costuram o alvo. | nenhum (leque do Fogo) |
| Sombra Oculta (Armadilha de Chão) | 2 | armadilha (zona com gatilho), raio 1 | base 18 ao disparar; custo 34; recarga 10 s; lançada a até 4 casas; dura 10 s; prende **0,8 s** | dura 12 s / raio 1,25 / escuridão 1 s em volta de quem pisou | Poça de sombra no chão que prende quem pisar. | armadilha com gatilho; **visível** (sombra fraca), não invisível |
| Kage Kubishibari no Jutsu (Estrangulamento) | 3 | só em alvo já preso pela Sombra/Costura | base 16 (8/s por 2 s); custo 43; recarga 9 s; alcance 5; **não acrescenta controle** e não estende a prisão; sem silêncio no PvP | 9/s / -50% do chakra que o alvo recupera por 3 s / recarga -6% | A sombra sobe pelo corpo preso e aperta o pescoço. | condição "alvo preso" |
| Kage Mane Shuriken (Shuriken de Sombra) | 3 | projétil em linha 10 | base 20; custo 43; recarga 9 s; ao acertar prende **1,0 s** | linha 10 com +20% de velocidade / +10% se o alvo já estiver preso (era "crítico") / pega alvo levantado | Shuriken que leva a sua sombra até o alvo distante. | nenhum |
| Kage Tsukami (Agarre de Sombra Múltiplo) | 4 | linha 6 que se ramifica | base 22 (dividido entre os presos); custo 55; recarga 12 s; prende até **2 alvos** **1,0 s** cada (cada alvo paga o próprio orçamento) | 3 alvos (no PvE; no 1x1 não muda nada) / custo -10% / puxa os presos 1 casa um para o outro (puxão, peso 1, dentro do orçamento) | Ramos de sombra agarram até dois inimigos de uma vez. | ramificação de linha |
| Domínio das Sombras (Campo Absoluto Nara) | 4 | zona raio 5 em volta, 4 s | base 20 no fim (lanças); custo 55; recarga 13,5 s; lentidão 25%; o 1º inimigo que entrar fica preso **0,8 s** | drena 8 de chakra/s dos de dentro / lanças +10% / recarga -6% | O chão escurece: inimigos lentos e lanças no fim. | zona da entrega 1 |

Fora do PvP ou para revisão própria: o teletransporte entre pontos escuros (L3 do PDF) e "anula projétil no timing"
(L4 da Manipulação), trocados acima por números.

## 2. Bukijutsu (Armas)

Tier 1 de hoje (Chuva de Kunais): custo 10, recarga 1,2 s, 3 kunais em trilhas paralelas, linha 4, base 18, escala
com o atributo Armas; no PvP custo e recarga x2,5 (`PVP_COST_COOLDOWN`). Esses números ficam.

| Nome | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Chuva de Kunais (a de hoje) | 1 | 3 linhas paralelas, linha 4 | base 18 (1 por alvo); custo 10; recarga 1,2 s (PvP 25 e 3 s); sem controle | velocidade +10% / linha 4,5 / recarga -6% | Três kunais lado a lado; a arma equipada soma dano. | nenhum |
| Shuriken Kage Bunshin no Jutsu | 1 | projétil em linha 7 que se divide em 2 a 3 casas | base 2 x 11 (cada alvo leva no máx. 1); custo 12; recarga 1,8 s (PvP x2,5); sem controle | divide em 3 (11 cada, 1 por alvo) / leque mais aberto / custo -10% (era estamina) | Uma shuriken vira duas em pleno ar. | divisão de projétil (a mesma das fagulhas do Fogo) |
| Sōshūjin (Lâminas Flutuantes) | 2 | 3 lâminas girando em volta, raio 1,5, 3 s | base 3 x 8 (cada alvo leva no máx. 2 por uso); custo 14; recarga 4 s (PvP x2,5); sem controle | 4 lâminas / raio 2 / no fim disparam juntas em linha 5 (mesmo dano total) | Kunais presas por fios de chakra giram em volta de você. | órbita de projéteis; **sem escudo** que desvia projétil |
| Fūma Shuriken (Shuriken Gigante) **NOVO** | 2 | bumerangue em linha 8 (vai e volta) | base 24 (ida 14, volta 10; cada alvo leva as duas); custo 14; recarga 4 s (PvP x2,5); sem controle | linha 9 / volta +10% / recarga -6% | Shuriken gigante que vai e volta para a sua mão. | trajetória de volta |
| Kenjutsu: Corte Iai da Lua Crescente | 3 | avanço com dano, 4 casas em linha | base 28; custo 17; recarga **6 s** (o mínimo; no PvP fica em 6 s, sem o x2,5); sem controle | +0,5 casa / +10% se o alvo usou avanço ou teleporte nos últimos 2 s (era "contra-ataque pós-esquiva") / custo -10% | Saque relâmpago: avança e corta tudo no caminho. | nenhum (avanço do Taijutsu) |
| Kibaku Fuda: Kunai Explosiva **NOVO** | 3 | kunai em linha 6 que crava e explode 0,8 s depois (aviso no chão), raio 2 | base 26; custo 17; recarga 5 s (PvP x2,5); derruba **0,5 s** quem estiver no centro (raio 1) | raio 2,5 / aviso 0,7 s / recarga -6% | Kunai com selo explosivo: cravou, correu, explodiu. | aviso no chão (entrega 1) |
| Kenjutsu Supremo: Dança dos Mil Cortes | 4 | sequência de 8 cortes em raio 1,5 na frente, 1,6 s | base 30 no total (8 x 3,75); custo 22; recarga 12 s; durante a dança **recebe 50% menos dano** (sem invulnerabilidade); sem controle | +10% no total / +15% contra quem tem escudo (no teto do tier) / recarga -6% | Oito cortes num borrão; você aguenta firme até acabar. | redução de dano temporária |
| Sōshōryū (Dragões Gêmeos Ascendentes) **NOVO** | 4 | aviso no chão 1 s, raio 3, a até 6 casas; 4 ondas de armas | base 4 x 7,5 (30 no total); custo 22; recarga 12 s; lentidão 20% 1 s após a última onda | raio 3,5 / +10% / recarga -6% | Dois pergaminhos sobem e chovem armas na área. | aviso no chão com várias ondas |

## 3. Genjutsu (Ilusão)

Tier 1 de hoje (Ilusão): custo 30, recarga 4 s, atordoa todos em raio 3 por 3 s (monstros; no PvP 1,5 s pelo
orçamento). Esses números ficam. Hoje o tier 3 e o 4 silenciam depois; na árvore nova o silêncio fica só no Izanami.

| Nome | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Ilusão (a de hoje) | 1 | anel em volta, raio 3 | sem dano; custo 30; recarga 4 s; atordoa 3 s em monstro; **controle 1,5 s** | raio 3,25 / custo -10% / recarga -6% | Engana a mente: quem está perto fica atordoado. | nenhum |
| Genjutsu: Kai (Dissipação) | 1 | em si mesmo (instantâneo) | sem dano; custo 20; recarga 14 s; tira escuridão, lentidão e silêncio de ilusão de si; o próximo atordoamento de ilusão em 1,5 s dura metade | recarga 13 s / também num aliado a até 2 casas / custo -10% | Interrompa o próprio chakra e quebre a ilusão. | purificar efeitos |
| Magen: Narakumi no Jutsu (Visão do Inferno) | 2 | olhar em linha 5 com 0,3 s de preparo | sem dano; custo 41; recarga 4,6 s; atordoa **1,0 s**; tira 10 de chakra | linha 5,5 / tira 15 de chakra (era estamina) / -10% no dano do alvo por 2 s (era "precisão") | Visões do inferno travam o inimigo de medo. | nenhum (linha da Sombra) |
| Magen: Kasegui no Jutsu (Estaca da Ilusão) **NOVO** | 2 | linha 6, primeiro alvo | base 18; custo 41; recarga 6 s; prende **1,0 s** (anda não, ataca sim) | +10% / linha 6,5 / recarga -6% | O alvo se vê pregado no chão por estacas. | nenhum |
| Genjutsu: Kokuangyō no Jutsu (Noite Eterna) | 3 | alvo a até 6 casas | sem dano; custo 51; recarga 9 s; **escuridão em volta do alvo** (vê 2 casas) por 3 s; sem tirar interface nem minimapa | 3,5 s / raio de visão 1,5 / +10% de dano em quem está no escuro, só o seu (era "crítico") | Escuridão envolve o inimigo: ele quase não vê ao redor. | escuridão em volta do alvo |
| Magen: Jubaku Satsu (Árvore Prendedora) **NOVO** | 3 | alvo a até 5 casas | base 22 no fim; custo 51; recarga 9 s; prende **1,2 s**; o golpe sai no fim | +10% / alcance 5,5 / recarga -6% | Uma árvore ilusória prende o alvo; você golpeia por trás. | nenhum |
| Genjutsu: Izanami (Loop Mental) | 4 | alvo a até 5 casas, 0,5 s de preparo | sem dano; custo 66; recarga 15 s; prende **1,5 s** + silêncio 2 s depois (silêncio no lugar de "travar recargas"); depois lentidão 20% por 2 s (era "exaustão -50%") | +10% no próximo golpe seu em 2 s / silêncio 2,5 s / recarga -6% | Prende a mente do inimigo num ciclo sem saída. | nenhum (silêncio já existe) |
| Nehan Shōja no Jutsu (Templo do Nirvana) **NOVO** | 4 | zona de penas, raio 4, a até 5 casas, 3 s | base 20 (dano ao fim, a quem ficou); custo 66; recarga 15 s; lentidão 30% dentro; quem ficar até o fim é atordoado **0,8 s** | raio 4,5 / +10% / recarga -6% | Penas caem e dão sono; quem fica, adormece. | zona da entrega 1 |

## 4. Decisões de equilíbrio

1. **Tier 1 sem mudança:** a Sombra (linha 4, prende 5 s em monstro, custo 25, recarga 6 s), as Kunais (3 x 18,
   linha 4, custo 10, recarga 1,2 s, x2,5 no PvP) e a Ilusão (raio 3, atordoa 3 s, custo 30, recarga 4 s) ficam como
   estão. A seção 5.2 falava em linha 6 para o Kage Mane: virou o L2 (linha 5) para não mexer no tier 1.
2. **Nara com 2 por tier:** o PDF põe 4 no tier 1, 2 no 2, 1 no 3 e 1 no 4. Para a Extração sortear entre 2, o Kage Nui
   e a Sombra Oculta sobem para o tier 2, o Estrangulamento vai ao 3 (como na seção 5.2) e o Agarre Múltiplo ao 4.
3. **Combos de controle:** Sombra (1,5 s) + Estrangulamento (0 s de controle, só dano no alvo preso) = 1,5 s, dentro
   do orçamento; o Estrangulamento não estende a prisão nem silencia no PvP. Nenhum jutsu passa de 1,5 s por golpe.
   O Agarre puxa com peso 1 e cada alvo paga o próprio orçamento. Izanami usa 1,5 s de prisão; o silêncio vem depois
   e não tira movimento.
4. **Nara x Andarilho:** o Nara só ganha +10% de alcance nos jutsus de sombra (de 0,4 a 1 casa a mais) e a
   árvore tem o mesmo dano por tier que as outras; o Andarilho tem um jutsu a mais no kit e a Substituição mais rápida.
   O pacote de controle do Nara é o mesmo orçamento de todos, então o clã não pode prender mais. Critério: 45% a 55%.
5. **Sem sistemas proibidos:** a Dança dos Mil Cortes troca a invulnerabilidade por 50% menos dano; o Sōshūjin perde o
   "escudo que desvia projéteis" (não é um 2º tipo de escudo); "crítico", "perfura armadura", "esquiva" e
   "estamina" viraram bônus por condição (+10% no teto do tier) ou chakra; a Noite Eterna vira escuridão em volta do
   alvo, sem tirar tela, minimapa ou mira; a armadilha da Sombra é visível (sombra fraca).
6. **Avanços:** só o Corte Iai e a Manipulação de Sombra são avanço. O Iai tem dano, então recarga 6 s (o x2,5 das
   Armas no PvP não se aplica para não ficar 15 s); a Manipulação não tem dano e tem 8 s.
7. **Lentidão:** a maior é 30% (Templo do Nirvana); somada à de outro jutsu, o teto de 40% corta.
8. **Buff de Básico:** nenhuma das 3 árvores usa; a vaga única fica livre para as outras classes.
9. **Escudo:** nenhum jutsu daqui cria escudo; o +15% contra escudo do L3 da Dança é o único bônus contra escudo e
   precisa de aprovação (no piloto nada tem bônus contra escudo).
10. **Sistemas novos pedidos:** armadilha com gatilho (Sombra Oculta), purificar (Kai), escuridão em volta do alvo
    (Kokuangyō, também usada pelo Fogo), ramificação de linha (Kage Tsukami), órbita (Sōshūjin), bumerangue (Fūma) e
    redução de dano temporária (Dança). Zona e aviso no chão já vêm da entrega 1.
