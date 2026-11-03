# Jutsus v2: as árvores do documento do Victor, adaptadas ao jogo

* **Autor:** Victor (documento "Especificação Técnica de Jutsus", versão 2.4.0), adaptado pelo Claude.
* **Data:** 03/11/2026. **Status:** rascunho para a revisão EGM (revisores Goldfish).
* **Base:** o PDF (10 árvores, ~100 jutsus, 4 níveis de maestria cada) + o jogo de hoje (`src/realtime/jutsus.ts`,
  `pvpBalance.ts`, `concepts_brief.md`).

## 1. O que o jogo tem hoje (para comparar)

- 9 classes (Cura, Sombra, Ilusão, Pedra, Fogo, Água, Taijutsu, Armas, Relâmpago) e os 2 jutsus da Academia
  (Teleporte Curto, Substituição).
- **Cada classe tem 1 mecânica**: os tiers 2 a 4 são o mesmo jutsu mais forte (`skillConfig`). Ex.: Fogo tier 1 =
  bola de fogo 25 de dano base, tier 4 = a mesma bola com dano x2,8.
- O ninja tem uma classe principal e uma secundária; aprende os tiers pela Extração (pergaminho); monta 2 kits de 4.
- Nível de uso (maestria) 1 a 4 por jutsu: 0 / 100 / 500 / 2.000 usos, +10% de efeito por nível (no PvP +0/5/10/15%).
- Números de PvP já balanceados (passo 1 do duelo): dano base x0,4 (jutsu) e x0,5 (básico), curva de tier achatada no
  PvP (1 / 1,15 / 1,3 / 1,45), **orçamento de controle** (no máximo 1,5 s por golpe e 2,5 s a cada 15 s), **rede de
  segurança** (ninguém perde mais de 50% da vida em 2 s para um só atacante), simulador de duelos no `npm run verify`.
- Habilidades em linha só saem nas 4 direções (mira no celular). A tela do celular mostra ~14 casas de altura.

## 2. O que muda em relação ao PDF (as regras de adaptação)

| Regra do PDF | No jogo | Por quê |
|---|---|---|
| Dano de 15 a 450 por tier | **Dano base em unidades do jogo:** tier 1 = 18 a 30, tier 2 = 26 a 45, tier 3 = 38 a 60, tier 4 = 50 a 85 (antes do x0,4 e da curva do PvP). O PDF vira proporção: o mais forte do tier recebe o teto. | O simulador e a rede de segurança já usam essa escala. |
| Áreas de 20 a 30 m, "global", "cataclismo" | **1 casa = 1 m; raio máximo 5 casas** (tier 4) e linhas até 10 casas. | O celular mostra ~14 casas; golpe vindo de fora da tela não dá para ler. |
| Stun 3 s, Izanami 4 s, Tsukuyomi 3 s | **Controle passa pelo orçamento de controle no PvP** (1,5 s por golpe). Contra monstros vale o número do jutsu, até 3 s. | Já decidido no duelo: controle longo decide a luta sozinho. |
| Invulnerabilidade (Susanoo, Toupeira, Dança dos Mil Cortes) | **Sem invulnerabilidade.** Vira escudo que absorve X de dano, redução de dano ou "intangível só a projéteis" por pouco tempo. | Invulnerável + dano = a luta perde a resposta. |
| Imunidade a CC 2 s, Prevenção de Stun-lock (6 s / 3 s) | **O orçamento de controle já faz isso** (melhor: soma tudo). Fica o que já existe. | Uma regra só. |
| Substituição: tempo fixo de 22 s | Fica a do jogo (30 a 15 s pelo nível). | Já balanceada e ensinada na Academia. |
| Cegar a tela, bloquear minimapa/mira | **Não.** Vira "escuridão" visual em volta do alvo (só ele vê), sem tirar a interface. | Tirar a interface no celular frustra e parece bug. |
| Velocidade do projétil em %, armadura, crítico, esquiva | O jogo **não tem armadura, crítico nem esquiva**. "Perfura armadura" vira dano a mais contra escudo; "crítico" vira dano a mais por condição (alvo preso, pelas costas), sempre dentro do teto do tier. | Não criar 3 sistemas novos por causa de 5 jutsus. |
| Estamina | **Não existe.** Tudo usa chakra. "Restaura estamina" vira "devolve X de chakra". | Um recurso só. |
| Maestria: 50/200/600 usos (T1) a 120/450/1200 (T4); recarga -2% por nível | **Usa a do jogo** (100/500/2.000) por enquanto; a recarga -2% por nível entra (máx -6%). A troca para 3 níveis já estava planejada para depois. | O banco e o PvE já usam os 4 níveis. |
| Níveis de maestria mudam a FORMA do jutsu (L2..L4) | **Entra.** É a ideia que o Victor já queria (concepts_brief, item 3): cada nível muda a forma, e no PvP o ganho total de um lançamento fica no máximo +15% sobre o nível 1. | Dá profundidade sem inflar o dano. |

## 3. Escopo: quantos jutsus e em que ordem

O PDF tem ~100 jutsus e pede sistemas que o jogo não tem: **muros e barreiras** (com vida), **poças/zonas no chão**,
**invocações** (golem, clone), **voo/suspensão**, **canalização** (segurar o botão), **armadilhas invisíveis**,
**inverter controles**. Proposta:

1. **Cada classe passa a ter 2 jutsus por tier** (8 por classe) em vez de 1. O ninja escolhe 4 por kit, como hoje.
2. Só entram agora os jutsus que usam o que o jogo **já tem** ou que precisam de **1 sistema novo pequeno**:
   - **Zona no chão** (poça de fogo, lama, xarope, área de cura): um círculo com efeito por segundo. Base pronta em
     `effects.ts` (queimadura, lentidão, regeneração).
   - **Escudo com vida** (muro de água/terra vira "escudo" no próprio ninja ou num muro curto de 1 x 3 casas).
3. Ficam para uma **entrega própria, depois**: invocações (Golem, Clone de Água), voo/suspensão, armadilha invisível,
   inverter controles, teletransporte entre sombras, quebrar paredes do mapa.
4. **Ordem:** piloto com **Fogo** (é a classe mais usada) e **1 clã**; depois as outras classes, uma por vez, cada uma
   passando pelo simulador.

## 4. Clãs (novo)

O PDF traz duas árvores de clã: **Sombra (inspirada nos Nara)** e **Olho (inspirada nos Uchiha)**.

- **Nome (marca):** o jogo já usa nomes próprios (Vale das Estátuas, e não "Vale do Fim"). Proposta: **Clã Kurokage**
  (sombras) e **Clã Hien** (o olho rubro e as chamas negras). Os jutsus também ganham nomes próprios (tabela 6).
- **O que é um clã:** uma **linhagem**, escolhida no Criador de Personagem (ou "sem clã"). É separada da classe: um
  ninja de Fogo pode ser do Clã Kurokage. O clã dá **1 passiva pequena** e **uma árvore de 4 jutsus** (1 por tier),
  aprendidos pela Extração como os outros.
- **Equilíbrio:** clã nunca é melhor que "sem clã" em dano bruto; dá **utilidade** (controle, leitura). Quem é "sem
  clã" ganha +1 espaço de jutsu na árvore da classe secundária (troca justa).
- **Como trocar:** 1 troca grátis; depois custa ryō (como redefinir atributos).
- A **Sombra** de hoje (classe) continua; a árvore do clã Kurokage é o "estilo" avançado dela. Proposta alternativa
  (revisores opinam): transformar a classe Sombra no clã e devolver os pontos.

## 5. As árvores adaptadas (primeira seleção)

Formato: **nome (inspiração no PDF)** · tier · forma · números base · o que cada nível de maestria muda (L2/L3/L4).
Dano em unidades do jogo (antes do x0,4). Custo e recarga seguem a tabela do jogo (`TIER.cost` e `TIER.cooldown`
sobre o do tier 1 da classe).

### 5.1 Fogo (Katon)

| Jutsu | Tier | Forma | Números | Maestria (L2 / L3 / L4) |
|---|---|---|---|---|
| Bola de Fogo (Gōkakyū) — **existe** | 1 | linha, explode | 25, raio 2, queima 3/s 3 s | +10% velocidade / raio +0,5 / queima +1 s |
| Sopro Incinerador (Karyū Endan) | 1 | cone 3 casas | 18 | alcance 4 / lentidão 10% 1 s / poça de fogo 1,5 s (zona) |
| Chamas da Fênix (Hōsenka) | 2 | 3 projéteis em leque | 3 x 14 (cada alvo leva no máx. 2) | 4 projéteis / leque mais aberto / leve curva para o alvo |
| Nuvem de Cinzas (Haisekishō) | 2 | zona em volta (raio 2) que detona após 1 s | 40 | raio 2,5 / +15% na detonação / escuridão 1 s no alvo |
| Destruição Magnífica (Gōka Messhitsu) | 3 | onda frontal 5 de largura x 6 | 55 | largura 6 / queima 5/s 3 s / quebra escudos |
| Míssil Dragão de Fogo (Karyū Hōtan) | 3 | projétil grande, lento | 60 | +25% velocidade / divide em 3 fagulhas (20 cada) / escudo 10% do dano causado |
| Chuva de Meteoros (Tenrai Gōen) | 4 | 3 meteoros com aviso no chão (0,8 s) num raio de 5 | 3 x 28 | raio 5,5 / chão em chamas 3 s / o último derruba (0,8 s) |
| Lâmina de Fogo | 4 (buff) | +20% no Ataque Básico por 6 s, dano de fogo | — | 8 s / empurrãozinho no golpe / faísca no 3º golpe |

### 5.2 Água (Suiton)

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Jato d'Água (Mizurappa) — **existe** (cone, empurra, molha) | 1 | cone 4 | 20, empurra 1,5 | cone mais largo / empurra 2,5 / curto-circuito: Relâmpago +40% em vez de 30% |
| Dragão d'Água Básico (Suiryūdan) | 1 | linha | 22 | +10% velocidade / lentidão 10% 1,5 s / devolve 5 de chakra |
| Onda de Choque (Suishōha) | 2 | anel em volta (raio 3), empurra | 30 | raio 3,5 / interrompe canalização / -15% recarga se pegar 2+ |
| Xarope Pegajoso (Mizuame) | 2 | zona 3x3, lentidão 20% | — | 4x4 / lentidão 30% / inflama com Fogo (queima) |
| Prisão de Água (Suirō) | 3 | prende 1 alvo até 2 s **enquanto você fica parado** | 0 (contra monstro 15/s) | cast 20% mais rápido / dano de afogamento 8/s / pode andar 50% |
| Vórtice (Prisão do Vórtex) | 4 | puxa tudo num raio 5 para o centro por 1,5 s | 50 | puxão +30% / atordoa 0,8 s no fim / joga para lados opostos |

### 5.3 Relâmpago (Raiton)

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Faísca Rasante — **existe** (linha, paralisa) | 1 | linha 4,5 | 30, paralisia 2 s | +15% velocidade / interrompe 0,2 s / devolve 4 de chakra |
| Corrente de Rasteio (Jibashi) | 1 | linha no chão 6 | 22 | alcance 8 / lentidão 10% 1 s / dobra num alvo molhado (dentro da rede) |
| Impulso Estático | 1 (mobilidade) | avanço 4 casas | — | 5,5 casas / faísca na origem (10) / -10% recarga ao desviar de projétil |
| Agulhas Elétricas (Chidori Senbon) | 2 | 5 agulhas em leque | 5 x 9 | 7 agulhas / +15% contra quem está correndo / -10% vel. de ataque do alvo 3 s |
| Lança em Cadeia (Gian) | 2 | linha que salta | 40 → salta 1 alvo (60%) | salta 2 / mantém 100% / último alvo choque 0,5 s |
| Investida Perfurante (Chidori) | 3 | avanço com carga 0,5 s, 1 alvo | 60 | carga 0,3 s / +30% contra escudo / +50% pelas costas (no teto do tier) |
| Dragão do Trovão (Kirin) | 4 | aviso 1,2 s, raio 4 | 85 | raio 4,5 / aviso 0,9 s / tira o escudo do alvo |

### 5.4 Vento (Fūton) — **classe nova**

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Palma do Vendaval (Reppūshō) | 1 | cone curto, empurra 2 | 18 | empurra +15% / -0,5 s recarga / bater na parede +10 |
| Shuriken de Vento | 1 | linha 7 (mais longa que a comum) | 20 | +10% contra escudo / 2 disparos / — |
| Esferas de Vácuo (Shinkūgyoku) | 2 | 3 esferas em linha rápida | 3 x 12 | 4 esferas / +velocidade / todas acertam: sangramento 3/s 3 s |
| Lâmina em Arco (Shinkūha) | 2 | arco frontal 3 de largura | 45 | largura +30% / quebra muro de terra tier 1 / lentidão 15% 1 s |
| Tornado Cortante (Kamaitachi) | 3 | levanta o alvo 0,8 s (ninguém o acerta nem ele age) e corta | 50 | 1,1 s (dentro do orçamento) / cortes contínuos / — |
| Shuriken Espiral (Rasenshuriken) | 4 | projétil que explode, raio 3 | 80 | raio 3,5 / anula a regeneração 4 s / alvo leva +15% de dano 4 s |

### 5.5 Terra (Doton) — **amplia a Pedra**

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Pele de Pedra — **existe** (escudo) | 1 | escudo no próximo golpe | 50% | — (fica como está) |
| Muralha de Terra (Doryūheki) | 1 | muro 1 x 3 com 60 de vida, para projéteis | — | 90 de vida / 4 de largura / vira cobertura baixa ao quebrar |
| Prisão de Pilares (Ganchūrō) | 1 | prende 1 s | 10 | pilares mais duros / +10 dano / -recarga se acertar de primeira |
| Pântano (Yomi Numa) | 2 | zona raio 3, lentidão 30% | — | raio 4 / 2 s no centro: atordoa 0,5 s / com Fogo vira pedra (prende 1 s) |
| Punho de Rocha (Kengan) | 2 (buff) | +20% no Básico 6 s | — | 8 s / 1º soco atordoa 0,5 s / -10% de dano recebido |
| Esmagamento (Ganban Kyū) | 3 | 2 lajes fecham num alvo | 55, prende 1 s | +20% velocidade / tira 20 de chakra / quebra escudos |
| Golem Titânico | 4 | **depois** (invocação) | — | — |

### 5.6 Cura → Ninjutsu Médico

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Palma Mística — **existe** (Cura) | 1 | cura 30 | — | -15% canalização / 45 / instantânea em si a 50% |
| Desintoxicação | 1 | tira 1 efeito ruim (si ou aliado) | — | mais rápida / 2 s de imunidade ao mesmo efeito / devolve 10 de chakra |
| Bisturi de Chakra | 2 (buff) | Básico +15% e sangramento leve 6 s | — | 8 s / corta armadilhas / 1º golpe sangra |
| Soco de Chakra (Chakra Enhanced Punch) | 2 | soco 1 alvo | 45, quebra escudo | cratera (lentidão perto) / +40% contra escudo / derruba 0,8 s |
| Regeneração de Área | 3 | zona raio 3, cura 8/s 4 s | — | raio 4 / imunidade a lentidão / limpa debuffs no fim |
| Regeneração Mitótica (Byakugō) | 4 | cura 10/s por 8 s em si | — | +15% dano físico / ignora 1 controle / empurra ao acabar |

### 5.7 Armas (Bukijutsu) e Ilusão (Genjutsu)

| Jutsu | Classe · Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Chuva de Kunais — **existe** | Armas · 1 | 3 kunais | 3 x 18 | — |
| Shuriken Multiplicada (Kage Bunshin Shuriken) | Armas · 1 | 1 vira 2 (3 no L2) | 2 x 15 | 3 / leque aberto / -20% custo |
| Lâminas Flutuantes (Sōshūjin) | Armas · 2 | 3 lâminas no alvo travado | 3 x 14 | 4 / escudo que desvia 1 projétil / disparo junto |
| Corte Iai | Armas · 3 | avanço + corte | 60 | cast quase zero / +40% contra escudo / x2 no contra-ataque logo após esquivar |
| Dança dos Mil Cortes | Armas · 4 | 8 golpes rápidos, 1 alvo | 8 x 10 | +25% total / **50% menos dano recebido** durante (não invulnerável) / quebra escudo |
| Dissipação (Kai) | Ilusão · 1 | tira ilusões e lentidão mental de si | — | -20% recarga / num aliado perto / 1,5 s de imunidade |
| Visão do Inferno (Narakumi) | Ilusão · 2 | atordoa 1,5 s (orçamento) | 15 | 2 s (PvE) / tira 15 de chakra / -20% de dano do alvo 3 s |
| Noite Eterna (Kokuangyō) | Ilusão · 3 | escuridão em volta do alvo 3 s (não tira a interface) | — | 4 s / alvo não vê inimigos fora de 3 casas / +15% de dano em quem está no escuro |
| Laço do Tempo (Izanami) | Ilusão · 4 | prende a mente 1,5 s (orçamento) e congela as recargas 2 s | 30 | dano contínuo / recargas congeladas 3 s / alvo -20% de dano 4 s |

### 5.8 Taijutsu

O PDF não tem árvore de Taijutsu. Fica como está (avanço e soco) e ganha os buffs de corpo (Punho de Rocha e
Lâmina de Fogo ficam nas classes deles).

## 6. Árvores de clã

### 6.1 Clã Kurokage (sombras; inspirado nos Nara)

Passiva: **+20% de alcance nos jutsus que prendem** (de qualquer classe).

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Laço de Sombra (Kage Mane) | 1 | linha 6, prende 1,5 s (orçamento) e o alvo copia seus passos | — | alcance 8 / custo menor / move o alvo para os lados |
| Costura de Sombra (Kage Nui) | 2 | 3 agulhas em leque, prendem 1 s | 3 x 10 | 5 agulhas / atravessa muros fracos / tira 10 de chakra |
| Estrangulamento (Kubishibari) | 3 | só num alvo já preso: 12/s por 2 s e silêncio 1 s | 24 | 18/s / -50% chakra que o alvo recupera / silêncio 1,5 s |
| Domínio das Sombras | 4 | zona raio 5 por 4 s: lentidão 30% e o 1º que entrar fica preso 1 s | 40 no fim | drena 10 de chakra / teleporte entre 2 sombras / lanças no fim (+20) |

### 6.2 Clã Hien (olho rubro; inspirado nos Uchiha)

Passiva: **mostra a recarga dos jutsus do adversário** (leitura, não dano).

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Olho da Percepção (Sharingan) | 1 | 4 s: o próximo golpe físico recebido erra | — | 6 s / -recarga / mostra a próxima mira do inimigo |
| Contra-Ataque (Previsão) | 2 | 5 s: o próximo golpe físico recebido volta 30% para quem bateu | — | 40% / -10% de dano físico / contra-ataque baixa -30% recarga |
| Chamas Negras (Amaterasu) | 3 | queima 8/s por 4 s, não sai com Água | 32 total | 5 s / atravessa escudo / custo menor |
| Guerreiro Etéreo (Susanoo) | 4 | escudo de 120 por 6 s; 1 corte frontal (40) | — | escudo 150 / corte +20% / ao acabar, empurra |

Ficam fora do clã (graves demais para o duelo): Tsukuyomi (3 s de atordoamento + 280 de dano + 80% do chakra) e o
Susanoo Perfeito (8 s imune a controle). Podem voltar como **poderes de evento** (chefe, Akatsuki), fora do PvP.

## 7. Como fica no código (resumo técnico)

- `jutsus.ts`: `JutsuDef` ganha `form` (linha, cone, anel, zona, projétil múltiplo, buff, escudo, avanço, aviso) e
  `mastery` (o que cada nível muda). O `skillConfig` deixa de ser "o tier 1 mais forte" e vira uma tabela por jutsu.
- Novos efeitos em `effects.ts`: zona no chão, sangramento, escuridão, "a recarga congela".
- Clã: coluna `clan` em `game.players` (**migração v16**), escolhido no Criador; a passiva entra no `statsFor`.
- Simulador: cada classe nova entra no `pvpSim` e tem que passar nos critérios antes de ir para o jogo.
- Interface: o pergaminho da Extração passa a sortear entre os 2 jutsus do tier; a tela de Kits mostra os 8.

## 8. Perguntas para o Victor

1. Clã escolhido no Criador, ou desbloqueado por missão (mais raro)?
2. Nomes próprios (Kurokage, Hien) ou os da série?
3. A classe Sombra de hoje continua, ou vira o clã?
4. Piloto: Fogo + Clã Kurokage, ou outra combinação?
