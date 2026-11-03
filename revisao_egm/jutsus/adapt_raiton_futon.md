# Adaptação Raiton e Fūton (adaptador Goldfish, 2026-11-03)

Fonte: `especificacao-original.pdf`, páginas 4 a 6 (Raiton: 9 jutsus) e 6 a 7 (Fūton: 8 jutsus). Todos os 17 entram.
Regras: seção 2 de `docs/jutsus-v2.md`. Números conferidos em `src/realtime/jutsus.ts` (`BASE_SKILLS`, `TIER`) e
`src/realtime/pvpBalance.ts` (`PVP_TIER_POWER` 1/1,15/1,3/1,45; orçamento 1,5 s por golpe, 2,5 s a cada 15 s).

Convenções da tabela:
- **base** = dano do tier 1 equivalente (dano do PDF dividido por `TIER.power` 1/1,45/2/2,8, preso entre 18 e 30).
  O jogo multiplica pelo tier sozinho; não somar o tier de novo.
- Custo e recarga escritos **no tier 1**; o tier aplica `TIER.cost` e `TIER.cooldown`. No PvP o Relâmpago já tem
  `PVP_COST_COOLDOWN` x2 (mantido).
- Alcance e raio em casas (1 casa = 1 m), **sem** o `TIER.reach` (o jogo soma +0,5/+1/+1,5). Conferido que o total
  fica em raio ≤ 5 e linha ≤ 10.
- Controle em segundos é o pedido; no PvP o orçamento corta para no máximo 1,5 s por golpe.
- Maestria L2 a L4: só números (piloto), ganho total no PvP ≤ +15% sobre o L1; recarga -2% por nível já está implícita.
- "PvE" no texto da maestria = vale só contra monstros.

## Raiton (Relâmpago): velocidade, avanço, ricochete e paralisia

| Jutsu | Tier | Forma | Números do jogo (tier 1) | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Sandāboruto (Faísca Rasante) | 1 | projétil reto | **mantém o atual:** base 30, custo 20, recarga 2 s, alcance 4,5, atordoa 0,4 s, paralisia 2 s | L2 velocidade do projétil +15% / L3 interrompe canalização (0,2 s de atordoado, dentro do orçamento) / L4 devolve 4 de chakra ao acertar | Faísca rápida que atordoa e paralisa. | nenhum (L3 usa canalização, que só existe quando ela entrar) |
| Jibashi (Corrente Rasteira) | 1 | linha no chão | base 22, custo 18, recarga 4 s, linha 6, lentidão 10% por 1 s (L3) | L2 linha 8 / L3 lentidão 10% por 1 s / L4 alvo molhado (Suiton) leva +15% e linha 9 | Choque que corre pelo chão até o alvo. | condição "molhado" (ver Suiton) |
| Shuriken Eletrificada (Shuriken do Trovão) | 1 | projétil reto | base 24 (o "+15% perfurante" vira +15% contra alvo paralisado, dentro do teto), custo 15, recarga 3 s, alcance 7 | L2 velocidade +15% / L3 respingo raio 1 com 40% do dano / L4 segunda shuriken com 50% do dano (total ≤ +15% no PvP) | Shuriken rápida; dói mais em alvo paralisado. | nenhum |
| Impulso Estático (Raiton: Shunshin) | 1 | avanço sem dano | sem dano, custo 15, recarga 8 s, avanço 4 | L2 avanço 5 / L3 deixa faísca na origem: base 18, raio 1, 1 vez / L4 recarga -10% se passar por um projétil | Avanço elétrico curto para fugir ou fechar. | nenhum (L3 vira avanço com dano: recarga já ≥ 6 s) |
| Chidori Senbon (Agulhas de Trovão) | 2 | leque de 5 projéteis | base 6 por agulha (30 total no mesmo alvo), custo 20, recarga 5 s, alcance 6, leque 40° | L2 agulhas 6 (o total no mesmo alvo continua ≤ 34) / L3 +10% contra alvo em movimento (era "crítico") / L4 lentidão 10% por 1,5 s | Leque de agulhas elétricas à média distância. | nenhum |
| Gian (Lança de Raio) | 2 | projétil que ricocheteia | base 26, custo 25, recarga 7 s, alcance 7, salto até 3 casas, 1 salto; cada salto -30% | L2 2 saltos / L3 salto perde só 15% / L4 último alvo atordoado 0,5 s | Lança de raio que salta entre inimigos. | ricochete (alvo seguinte) |
| Chidori Nagashi (Fluxo Elétrico) | 2 | aura em volta de si | base 20, custo 25, recarga 12 s, raio 2, paralisia 1 s em quem está colado | L2 raio 2,5 / L3 por 3 s, quem bate corpo a corpo leva base 10 (1 vez por 1 s) / L4 paralisia 1,2 s | Descarga em volta do corpo que paralisa quem cola. | retaliação (dano ao ser atingido); o "imune a atordoamento" do PDF saiu |
| Chidori (Grito do Falcão) | 3 | avanço em linha | base 30, custo 30, recarga 9 s, linha 5, para no primeiro alvo, atordoa 0,5 s; +25% pelas costas (dentro do teto do tier) | L2 preparação 0,4→0,3 s / L3 +5% de dano / L4 recarga 8 s | Investida com a mão em raios. Mais forte pelas costas. | bônus "pelas costas" (direção do alvo) |
| Kirin (Dragão do Trovão) | 4 | área no chão com aviso | base 30, custo 45, recarga 30 s, raio 3,5 (4 no total com o tier, ≤ 5), aviso 1 s, atordoa 0,6 s | L2 raio +0,5 (5 no total) / L3 aviso 0,8 s / L4 quebra o escudo do alvo atingido (sem dano extra) | Raio do céu cai sobre a área marcada. | aviso no chão (telegraph); L4 = remover escudo |

## Fūton (Vento, classe nova): empurrar, cortar de longe e levantar

Identidade: **controle de espaço**. O Vento não paralisa nem atordoa direto (isso é do Relâmpago e da Terra): ele
**empurra, afasta e levanta**. Dano por golpe igual ou abaixo das outras classes; o ganho está no posicionamento.

| Jutsu | Tier | Forma | Números do jogo (tier 1) | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Reppūshō (Palma do Vendaval) | 1 | cone curto | base 18, custo 15, recarga 4 s, cone 2 casas 60°, empurra 2 | L2 empurra 2,3 / L3 recarga 3,5 s / L4 bater na parede: base 8 extra | Lufada que empurra quem está na frente. | nenhum (`push` já existe); L4 = colisão com parede |
| Shuriken Estendida (Shuriken do Vento) | 1 | projétil reto | base 20, custo 12, recarga 3 s, alcance 9 (o maior do tier 1) | L2 +5% de dano / L3 segunda shuriken com 40% do dano / L4 +10% contra alvo levantado | Shuriken levada pelo vento até longe. | nenhum |
| Escudo de Vento Básico (Véu de Vento) | 1 | escudo em si | escudo único: 12% da vida máx., 3 s, só contra projéteis; custo 20, recarga 15 s | L2 3,5 s / L3 14% da vida / L4 ao acabar empurra 1,5 quem está a 1,5 casa | Película de ar que segura tiros. | escudo (regra única); filtro "só projétil" |
| Impulso de Salto (Passo Aéreo) | 1 | salto sem dano | sem dano, custo 15, recarga 9 s, salto 4 (atravessa monstros, não paredes) | L2 salto 4,8 / L3 recarga 8 s / L4 deixa lufada na origem: empurra 1 | Salto de vento para fugir ou se reposicionar. | salto (passar por cima) |
| Shinkūgyoku (Esferas de Vácuo) | 2 | rajada de 3 projéteis | base 8 por esfera (24 se as 3 acertarem), custo 20, recarga 5 s, alcance 7 | L2 4 esferas, 6,5 cada (26) / L3 velocidade +15% / L4 todas acertam: corte de base 4 por s, 3 s | Rajada de esferas de ar comprimido. | sangramento (dano por tempo, igual a queimadura) |
| Shinkūha (Lâmina em Arco) | 2 | linha larga | base 28 (60 / 1,45 = 41, preso em 30 e cortado a 28 por ser larga), custo 25, recarga 7 s, linha 7, largura 3 | L2 largura 4 / L3 PvE: corta muro de Terra tier 1 / L4 lentidão 15% por 1 s | Foice de vento que corta em linha. | interação com muro (só quando o muro existir) |
| Kamaitachi (Tornado Cortante) | 3 | área pequena | base 22, custo 30, recarga 14 s, raio 2, levanta 0,8 s (conta como atordoado, pode levar dano) | L2 levanta 1 s / L3 cortes base 5 durante o tempo no ar / L4 recarga 13 s | Redemoinho que joga o alvo no ar. | levantado (já previsto) |
| Rasenshuriken (Estrela Espiral) | 4 | projétil que explode em área | base 30, custo 45, recarga 30 s, alcance 8, raio 2,5 (3 no total), cura recebida -50% por 4 s | L2 raio +0,5 (3,5 total) / L3 corte de cura por 5 s / L4 PvE: alvos levam +10% por 4 s (era "armadura -50%") | Estrela de vento que explode e corta a cura. | "cura reduzida" (já existe na regra anti-cura) |

## Decisões de equilíbrio

1. **Faísca Rasante intocada.** Virou o Sandāboruto (o PDF tem o mesmo papel: projétil rápido). Base 30, custo 20,
   recarga 2 s, alcance 4,5, atordoa 0,4 s, paralisia 2 s. A maestria só acrescenta coisas pequenas.
2. **Dano do PDF dividido pelo tier.** Kirin 380/2,8 = 136, Chidori 140/2 = 70, Rasenshuriken 360/2,8 = 129: todos
   ficam em base 30 (teto). Shinkūha 60/1,45 = 41 virou 28 porque acerta numa área larga.
3. **Raio e linha dentro do limite.** Kirin "8 m, L2 11 m" virou raio 3,5 (4 com tier) e 4,5 no L2 (5 com tier);
   Rasenshuriken 3 casas; Jibashi 6 a 9; Shuriken do Vento 9 (+0 de tier). Nada passa de 5 de raio ou 10 em linha.
4. **Controle no orçamento.** Nenhum golpe pede mais de 1,2 s. Kamaitachi "levanta" 0,8 a 1 s e o alvo pode levar
   dano no ar (não é invulnerável). O Chidori Nagashi perdeu "imune a atordoamento"; o Kirin atordoa só 0,6 s.
5. **Sem armadura, crítico, esquiva e estamina.** "Perfura armadura" virou bônus contra paralisado (Shuriken do
   Trovão) ou pelas costas (Chidori +25%, dentro do teto, como pede a revisão de equilíbrio); "crítico contra
   velozes" virou +10% contra alvo em movimento; "restaura estamina" virou 4 de chakra; "armadura -50%" virou
   +10% de dano recebido só no PvE.
6. **Avanço com dano: recarga ≥ 6 s.** Chidori 9 s; Impulso Estático 8 s (o L3 deixa faísca, então já cumpre).
   Passo Aéreo não dá dano, mas tem 9 s para o Vento não fugir sem parar.
7. **Escudo regra única.** O Véu de Vento é o único escudo das duas árvores: 12 a 14% da vida, ≤ 3,5 s, um por vez,
   e só segura projéteis (o corpo a corpo passa). O "anula dano de queda" do Passo Aéreo saiu (o jogo não tem).
8. **Lentidão ≤ 40%.** A maior aqui é 15% (Shinkūha L4); somada com Jibashi dá 25%.
9. **Nenhum buff de Básico** nestas árvores, então não disputa com outros.
10. **Vento não pode ser melhor que as outras classes.** Ele não tem paralisia nem atordoamento direto, o dano por
    golpe é o menor do tier 1 (18 a 20 contra 30 da Faísca), e o único corte de cura (Rasenshuriken) é de tier 4
    com recarga de 30 s. A força dele é tirar o inimigo do lugar e lutar de longe (alcance 9). Precisa passar no
    simulador contra Fogo e Relâmpago antes de ser liberado.
11. **Sistemas novos exigidos** (por ordem de custo): ricochete (Gian), aviso no chão (Kirin), levantado
    (Kamaitachi), sangramento (reaproveita a queimadura), retaliação (Nagashi L3), condição "molhado" (Jibashi L4),
    filtro de escudo só para projétil, colisão com parede (Reppūshō L4), salto. O Vento como classe ainda precisa
    de `game.classes`, mestre e Missão de Genin (ver `rev_escopo.md` item 8: pode ficar para depois do piloto).
