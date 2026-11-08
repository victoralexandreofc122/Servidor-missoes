# Adaptação: Katon (Fogo) e Suiton (Água)

Fonte: `especificacao-original.pdf`, páginas 2 a 4. Regras: `docs/jutsus-v2.md`, seção 2.
Convenções: `base` = dano equivalente de tier 1 (o tier entra por `TIER.power` 1/1,45/2/2,8 contra monstros e
`PVP_TIER_POWER` 1/1,15/1,3/1,45 no PvP). Custo e recarga já são do tier (`TIER.cost`/`TIER.cooldown` sobre a
referência da mecânica). 1 casa = 1 m. Controle no PvP passa pelo orçamento (1,5 s por golpe, 2,5 s a cada 15 s).
Maestria: L2 a L4 só mudam números (exceto Chamas da Fênix, prova de forma); recarga -2% por nível (máx. -6%);
no PvP o ganho total da maestria fica em +15% sobre o L1.

## Katon (Fogo): 11 jutsus

| Jutsu | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Gōkakyū no Jutsu (Bola de Fogo) | 1 | linha (projétil que explode) | **igual ao atual**: base 25; custo 20; recarga 1,5 s; linha 9; explosão raio 2; queimadura 3/s por 3 s | L2 velocidade +10% / L3 base 27,5 / L4 queimadura 4/s | Bola de fogo que explode e deixa queimando. | nenhum |
| Karyū Endan (Sopro Incinerador) | 1 | cone 70°, rasante | base 20; custo 15; recarga 1,5 s; alcance 3; queimadura 2/s por 2 s | L2 alcance 4 / L3 lentidão 10% por 1 s / L4 poça de fogo raio 1, 1,5 s (3/s) | Sopro de fogo curto em cone que queima. | zona (só L4) |
| Kasumi Enbu no Jutsu (Névoa Inflamável) | 1 | zona | base 18 (detonação); custo 20; recarga 8 s; raio 2,5; dura 3 s; "escuridão" em volta de quem está dentro (sem tirar a interface); detona sozinha no fim | L2 dura 4,5 s / L3 dentro dela a recarga dos jutsus anda 20% mais devagar (não é controle) / L4 base 21 | Névoa que esconde e explode ao terminar. | zona + escuridão |
| Hibashiri (Linha de Fogo Rasante) | 1 | linha (chão) | base 22; custo 15; recarga 2 s; linha 5; atinge o primeiro alvo | L2 linha 8 / L3 atravessa todos na linha (perfura) / L4 rastro ardente 2 s (2/s) | Chama rasteira que corre em linha reta. | zona (só L4) |
| Hōsenka no Jutsu (Chamas da Fênix) | 2 | leque de 3 projéteis | base 10 por projétil (cada alvo leva no máx. 2; teto 20 no alvo); custo 27; recarga 2,3 s; alcance 7 | **L2 4 projéteis (prova de forma)** / L3 base 11 (o "shuriken escondido" vira dano) / L4 base 12 | Leque de chamas: até 4 bolas de fogo. | leque |
| Ryūka no Jutsu (Chamas do Dragão Guiado) | 2 | linha instantânea | base 26; custo 27; recarga 3 s; linha 8 | L2 custo -10% / L3 +20% de dano em alvo preso ou atordoado (troca do crítico) / L4 alvo queimando leva +10% por 2 s (troca da armadura) | Raio de fogo veloz; arde mais em alvo preso. | nenhum |
| Haisekishō (Nuvem de Cinzas Ardentes) | 2 | zona em volta do usuário + detonação | base 24 (detonação após 1 s); custo 30; recarga 7 s; raio 2; aviso de 1 s no chão | L2 raio 3 / L3 base 26 (+8%; PDF dava +25%) / L4 escuridão em volta do alvo 1 s | Cinzas em volta de você que explodem. | zona + aviso + escuridão |
| Lâmina de Fogo | 2 | buff de Básico | +15% de dano no Básico (vira fogo) por 5 s; custo 20; recarga 15 s; ocupa o espaço único de buff de Básico | L2 dura 6 s / L3 Básico empurra 0,5 casa / L4 3º golpe da sequência solta faísca (base 8, raio 1) | A arma pega fogo: Básico +15% por 5 s. | buff |
| Gōka Messhitsu (Destruição Magnífica) | 3 | cone largo (onda) | base 28; custo 34; recarga 6 s; alcance 5; cone 120° | L2 cone 140° / L3 queimadura 4/s por 3 s / L4 destrói muros de tier 1 e 2 | Onda de fogo que varre a frente toda. | muro (só L4, interação) |
| Karyū Hōtan (Míssil Dragão de Fogo) | 3 | linha (projétil grande que explode) | base 30; custo 34; recarga 6 s; linha 9; explosão raio 2; velocidade média | L2 velocidade +25% / L3 divide em 3 fagulhas (base 6, raio 1) / L4 escudo de 10% do dano causado (dentro da regra: ≤25% da vida, 4 s) | Dragão de fogo que explode no impacto. | escudo (só L4) |
| Tenrai Gōen (Chuva de Meteoros Flamejantes) | 4 | zona com aviso | base 30 (85/2,8), em 5 meteoros com aviso de 0,8 s cada; custo 44; recarga 12 s; raio 4 (alcance de mira 7) | L2 raio 5 / L3 chão em chamas 3 s (3/s) / L4 o último meteoro atordoa 0,5 s (peso 1, no orçamento) | Chuva de meteoros: saia das marcas no chão! | zona + aviso |

## Suiton (Água): 10 jutsus

| Jutsu | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Mizurappa (Jato d'Água Frontal) | 1 | cone | **igual ao atual** (mecânica `water`): base 20; custo 15; recarga 1 s; alcance 4; cone 90°; empurra 1,5; deixa molhado | L2 base 21 / L3 empurra 2,5 (PDF: 3) / L4 alvo molhado leva +10% do Relâmpago por 3 s | Jato em cone que empurra e deixa molhado. | nenhum |
| Suiryūdan no Jutsu (Dragão d'Água Básico) | 1 | linha (projétil) | base 18; custo 15; recarga 1,5 s; linha 8; deixa molhado | L2 velocidade +10% / L3 lentidão 10% por 1,5 s / L4 devolve 5 de chakra ao acertar | Dragão d'água em linha que molha o alvo. | nenhum |
| Suijinheki (Muro de Água) | 1 | muro (frontal) | sem dano; custo 20; recarga 10 s; largura 3; dura 3 s; segura 60 de dano de projéteis | L2 segura 100 / L3 largura 4 / L4 vira poça raio 1,5 por 3 s: Suiton recarrega 10% mais rápido ali | Muro d'água que segura projéteis. | muro |
| Kirigakure no Jutsu (Ocultação na Névoa) | 1 | zona em volta do usuário | sem dano; custo 20; recarga 12 s; raio 3 (PDF 5); dura 4 s; escuridão para inimigos dentro, nome e barra de vida do usuário somem para eles | L2 raio 4 / L3 usuário dentro leva -10% de dano (troca da esquiva) / L4 dura 5 s | Névoa que esconde você dos inimigos. | zona + escuridão |
| Suishōha (Onda de Choque Aquática) | 2 | anel em volta do usuário | base 20; custo 27; recarga 6 s; raio 3,5; empurra 2 | L2 raio 4,5 / L3 silêncio 0,5 s (interrompe; peso 0,5) / L4 recarga -15% se acertar 2+ alvos | Anel de água que empurra todos ao redor. | nenhum (anel) |
| Mizu Bunshin no Jutsu (Clone de Água) | 2 | invocação (clone parado) | sem dano; custo 30; recarga 15 s; clone com 15% da vida do usuário, dura 6 s; atrai os golpes de monstros | L2 clone aguenta +1 golpe / L3 explode ao morrer: lentidão 15% por 2 s, raio 1,5 / L4 reativar troca de lugar com o clone | Cria um clone d'água que distrai inimigos. | invocação |
| Mizuame Nabara (Xarope Pegajoso) | 2 | zona | sem dano; custo 25; recarga 10 s; raio 1,5 (3x3); dura 4 s; lentidão 20% | L2 raio 2,5 (5x5) / L3 lentidão 30% (PDF 35%; teto total 40%) / L4 Katon detona: base 18 | Chão grudento que deixa todos lentos. | zona |
| Suirō no Jutsu (Prisão de Água) | 3 | linha 4 + prisão | base 18 (afogamento em 1,5 s); custo 34; recarga 10 s; prende 1,5 s no PvP (2 s nos monstros); o usuário fica parado enquanto segura; anda e solta | L2 sai 20% mais rápido / L3 base 21 / L4 recarga -1 s (o "clone mantém" saiu) | Prende o alvo numa bolha d'água. | nenhum (usa prender) |
| Prisão Absoluta do Vórtex Negro | 4 | zona com puxão | base 26; custo 44; recarga 14 s; raio 5 (PDF 15); dura 2 s; puxa 1,5 casa para o centro (peso 1) + lentidão 20% | L2 puxão 2 casas / L3 atordoa 0,5 s no fim (o total fica ≤1,5 s no orçamento) / L4 base 28 | Redemoinho que puxa todos para o centro. | zona + puxão |

## Decisões de equilíbrio

- **Dano**: todo dano do PDF virou `base` de 18 a 30 dividindo pela curva do tier (ex.: Chuva de Meteoros 85/2,8 = 30;
  Destruição Magnífica 110/2 ≈ 28 no teto do tier 3; Míssil Dragão 130 cortado para 30). Fênix divide 20 entre projéteis.
- **Alcance**: áreas de 12 a 30 m caíram para raio ≤5 e linha ≤10 (Vórtex 15→5, Meteoros 20→4/5, Ocultação 5→3/4).
- **Controle**: Vórtex vira puxão (peso 1) + 0,5 s no L3; Prisão de Água cai de 2 s para 1,5 s no PvP; "atraso na
  conjuração" e "interrupt" viram recarga mais lenta ou silêncio curto; knockdown dos Meteoros vira 0,5 s de atordoado.
- **Conversões**: crítico → +20% em alvo preso; armadura → +10% em alvo queimando; perfuração → atravessa alvos;
  esquiva → -10% de dano; estamina não existe (L4 do Dragão d'Água devolve chakra); "cegar" → escuridão em volta do alvo.
- **Escudo/buff/lentidão**: L4 do Míssil Dragão obedece a regra única de escudo; Lâmina de Fogo é o buff de Básico
  (+15%, 5 s, recarga 15 s); Xarope cai de 35% para 30% para caber com o L3 do Dragão d'Água (10%) no teto de 40%.
- **Cortes**: "clone mantém a prisão" (Suirō L4) e "lança em direções opostas" (Vórtex L4) saíram; muro d'água dura 3 s
  para não virar parede permanente. Só a Fênix muda de forma na maestria (prova do piloto).
- **Sistemas novos**: zona, aviso, escuridão, muro, invocação (clone), puxão e escudo; os tier 1 de linha/cone usam o
  que já existe. Sugestão de ordem: zona + aviso primeiro (8 jutsus dependem), depois puxão e muro.
