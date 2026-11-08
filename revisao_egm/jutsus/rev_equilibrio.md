# Revisão Goldfish: Equilíbrio e PvP (jutsus-v2)

**Nota: 6/10.** As regras de adaptação (seção 2) são boas: sem invulnerabilidade, controle no orçamento, raio
máximo 5. Mas a escala de dano por tier não combina com a fórmula do PvP, há controles que ficam fora do orçamento,
e curas, escudos e buffs não têm teto no PvP.

## Bloqueadores

**B1. Escala de dano por tier x `pvpHitDamage` (tier contado duas vezes).** `HitInfo.base` é o dano do TIER 1 e a
fórmula multiplica por `PVP_TIER_POWER` (1 a 1,45). O doc dá números base por tier (T4 = 50 a 85, ou 3,4x o T1 de 25).
Se o 85 entrar como `base`, o T4 bate 85 x 1,45 = 123, contra 36 do T1 (3,4x, e não 1,45x).
*Mudar:* cada jutsu guarda `pvpBase = dano / TIER.power[tier]` (85 / 2,8 = 30; 60 / 2 = 30; 45 / 1,45 = 31). Assim
todos os tiers caem em 18 a 31 de base e a curva achatada continua valendo. Escrever no doc: "teto de base no PvP = 30".

**B2. Controles fora do orçamento.** O `CcKind` só tem stunned/rooted/sono/shock/silencio. Ficam de fora:
- Tornado Cortante: "levantado, ninguém o acerta" é invulnerabilidade disfarçada (e é contra a regra 2). *Mudar:* conta
  como `stunned` e o alvo **pode** levar dano; L3 1,1 s vira 1,0 s.
- Vórtice: puxão 1,5 s + atordoa 0,8 s = 2,3 s num lançamento. *Mudar:* novo `CcKind 'pulled'` com peso 1; puxão
  1,0 s, atordoamento no fim 0,5 s (soma 1,5 s, dentro do `perApplyMs`).
- Laço do Tempo: "congela as recargas 2 a 3 s" é um silêncio total. *Mudar:* no PvP vira `silencio` (peso 0,5) de
  1,5 s e não soma com o prender; L3 "3 s" só no PvE.
- Prisão de Água (prende enquanto você fica parado): conta como `rooted` e quebra se o lançador levar dano.

**B3. Cura e regeneração sem o fator x0,4.** `pvpHeal` não usa o `scale.jutsu`: a Palma Mística cura 30, o golpe de
Fogo do T1 tira 10. Regeneração Mitótica (10/s por 8 s = 80, x1,45 = 116) e Regeneração de Área (8/s por 4 s) ganham de
qualquer dano sustentado. *Mudar:* no PvP a cura por segundo usa x0,5 (Mitótica 5/s por 6 s; Área 4/s por 4 s) e
"cura recebida -50% por 4 s" depois de uma cura acima de 25% da vida. Pôr no simulador: duelo Médico x Fogo tem que
acabar em menos de 60 s.

## Importantes

**I1. Buffs de Ataque Básico somam.** Lâmina de Fogo (+20%), Punho de Rocha (+20%) e Bisturi (+15%) dão +55% com
classe principal + secundária. *Mudar:* um buff de Básico por vez (o novo troca o antigo); no PvP o teto é +15%
(e duração de 5 s, recarga mínima de 15 s). O "1º soco atordoa 0,5 s" (Punho L3) entra no orçamento.

**I2. Golpes passam do teto do tier.** Dança dos Mil Cortes 8 x 10 = 80, e no L4 +25% = 100 (> 85); Chidori +50% pelas
costas = 90; Destruição Magnífica 55 + queima 15 = 70 no T3. *Mudar:* "o dano total de um lançamento (golpes + queima +
bônus de condição) cabe no teto do tier"; Dança vira 8 x 8 (64, L4 80); Chidori pelas costas +25%.

**I3. Clã acaba sendo melhor que "sem clã".** Kurokage: passiva de +20% de alcance no prender + Laço 1,5 s +
Estrangulamento (12/s por 2 s + silêncio 1 s) = 1,5 + 0,5 = 2,0 s de orçamento e 24 de dano garantido num combo
de 2 botões. Hien: ver as recargas do adversário vale muito no 1x1, e o Susanoo dá escudo de 120 por 6 s. "+1 espaço"
para quem não tem clã é vago. *Mudar:* passiva Kurokage +10% de alcance (no PvP, alcance máx. 6); Estrangulamento
só causa dano, sem silêncio no PvP; Susanoo no PvP com escudo = 25% da vida máxima e 4 s; passiva Hien mostra só se
o adversário está com o T4 pronto. Simulador: clã x sem clã com as mesmas classes, a taxa de vitória tem que ficar
entre 45% e 55%.

**I4. Escudos sem regra única.** Pele de Pedra (50% do golpe), Muralha (60 a 90 de vida), Susanoo (120 a 150),
Lâminas Flutuantes (desvia 1 projétil), Regeneração "ignora 1 controle". *Mudar:* no PvP o escudo de vida vale no
máximo 25% da vida máxima e dura no máximo 4 s; "quebra escudo" = +30% de dano contra escudo (não remove tudo);
1 escudo ativo por vez.

**I5. Lentidões de zona somam.** Xarope 20 a 30% + Pântano 30% + Domínio das Sombras 30% = 90%, quase um prender fora
do orçamento. *Mudar:* lentidão total máx. 40% no PvP; acima de 30% conta como `rooted` com peso 0,3 no orçamento.
Dano de zona e queima entram na rede de segurança pelo `sourceId` de quem lançou.

## Detalhes

- D1. Dano por chakra: Fênix 3 x 14 (máx. 28 num alvo) e Agulhas 5 x 9 = 45 (T2, no teto) têm o mesmo custo do T2;
  Agulhas no PvP: 5 x 7.
- D2. Chuva de Meteoros "o último derruba 0,8 s" + aviso 0,8 s: ok, mas no PvP cada meteoro acerta o mesmo alvo uma vez só.
- D3. Investida/Impulso/Corte Iai: avanços sem recarga mínima. Recarga mínima de 6 s no PvP para todo avanço que causa dano.
- D4. Maestria "-2% de recarga por nível": tudo bem, mas conta dentro do +15% total do nível (não por fora).
- D5. Teleporte entre sombras (Domínio L3) contraria a seção 3 (fica para depois). Tirar da tabela.
- D6. Xarope + Fogo e Pântano + Fogo (inflama, vira pedra e prende 1 s): combos entre classes têm que passar pelo
  mesmo orçamento; o "vira pedra" vira lentidão de 40% por 1 s.

## O que precisa entrar no simulador (`pvpSim`)

1. Um caso por jutsu novo: dano por chakra e por segundo dentro de ±15% da média do tier.
2. Combos: Laço → Estrangulamento; Vórtice → Kirin; Pântano + Fogo; Prisão de Água + Dragão d'Água.
3. Rede de segurança com zona + queima + buff de Básico juntos (Chuva de Meteoros + Lâmina de Fogo).
4. Clã x sem clã (45 a 55%), Médico x cada classe (duelo < 60 s), escudo + cura em sequência.
