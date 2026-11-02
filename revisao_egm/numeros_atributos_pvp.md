# Números do PvP por build (nível 60)

Contas feitas com as fórmulas reais do jogo (`stats.ts`, `jutsus.ts`, `config.ts`), sem passiva da vila (até +10%) e
sem clima. Script: `conta.ts` no rascunho da sessão (importa o código do jogo).

## As builds (59 pontos no nível 60)

| Build | Pontos | Vida | Chakra | Dano de Ninjutsu | Dano de Taijutsu | Dano de Armas |
| --- | --- | --- | --- | --- | --- | --- |
| Tanque | 59 Vitalidade | 379 | 100 | 1x | 1x | 1x |
| Meio a meio | 30 Vitalidade + 29 Ninjutsu | 286 | 100 | 1,91x | 1x | 1x |
| Dano de Ninjutsu | 59 Ninjutsu | 100 | 100 | 2,39x | 1x | 1x |
| Dano de Taijutsu | 59 Taijutsu | 100 | 100 | 1x | 2,39x | 1x |
| Dano de Armas | 59 Armas | 100 | 100 | 1x | 1x | 2,39x |

## Dano por acerto hoje

"T1" = tier 1 no nível de uso 1; "T4" = tier 4 no nível de uso 1; "T4 nv4" = tier 4 no nível de uso 4 (o máximo).
"+N" = queimadura somada nos 3 s.

| Golpe | Build que usa | T1 | T4 | T4 nv4 |
| --- | --- | --- | --- | --- |
| Ataque básico com Espada Longa | Tanque / Ninjutsu | 40 | 40 | 40 |
| Ataque básico com Espada Longa | Taijutsu | 57 | 57 | 57 |
| Ataque básico com Espada Longa | Armas | 79 | 79 | 79 |
| Fogo | Dano de Ninjutsu | 60 + 21 | 168 + 57 | 218 + 75 |
| Água | Dano de Ninjutsu | 48 | 134 | 174 |
| Relâmpago | Dano de Ninjutsu | 72 | 201 | 261 |
| Água + Relâmpago no molhado | Dano de Ninjutsu | 142 | 395 | 513 |
| Água + Relâmpago no molhado | Meio a meio | 112 | 316 | 411 |
| Soco (Taijutsu) | Dano de Taijutsu | 84 | 235 | 305 |
| Kunai (1 do leque, com Espada Longa) | Dano de Armas | 110 | 187 | 244 |
| Relâmpago | Tanque | 30 | 84 | 109 |
| Soco (Taijutsu) | Tanque | 35 | 98 | 127 |

## Quanto cada build aguenta: golpes até cair (golpe mais forte, T4 nv4)

| Atacante (golpe) | Dano | Tanque (379) | Meio a meio (286) | Qualquer build de dano (100) |
| --- | --- | --- | --- | --- |
| Dano de Ninjutsu (Relâmpago) | 261 | 1,5 | 1,1 | 0,4 |
| Dano de Taijutsu (Soco) | 305 | 1,2 | 0,9 | 0,3 |
| Dano de Armas (Kunai) | 244 | 1,6 | 1,2 | 0,4 |
| Meio a meio (Relâmpago) | 209 | 1,8 | 1,4 | 0,5 |
| Tanque (Soco) | 127 | 3,0 | 2,3 | 0,8 |

Abaixo de 1 = morre no primeiro golpe.

## Tempo para matar hoje (segundos)

O atacante usa os 4 jutsus da classe e o ataque básico, com 0,4 s entre um toque e outro, acertando tudo e sem meditar
(só o chakra inicial). É o melhor caso para quem ataca. Nível de uso 4.

| Atacante \ defensor | Tanque | Meio a meio | Ninjutsu | Taijutsu | Armas |
| --- | --- | --- | --- | --- | --- |
| Tanque | 3,4 | 2,0 | 0,5 | 0,5 | 0,5 |
| Meio a meio | 1,1 | 0,5 | 0,1 | 0,1 | 0,1 |
| Dano de Ninjutsu | 0,9 | 0,5 | 0,1 | 0,1 | 0,1 |
| Dano de Taijutsu | 0,5 | 0,1 | 0,1 | 0,1 | 0,1 |
| Dano de Armas | 0,5 | 0,5 | 0,1 | 0,1 | 0,1 |

0,1 s = morre no primeiro golpe. A meta do plano é de 6 a 10 s.

## O que muda com cada saída (golpe mais forte, T4 nv4, golpes até cair)

- **Curva achatada (já aprovada):** tier 4 = 1,45x e nível de uso até +15% (em vez de 2,8x e +30%).
- **Piso e teto (opção 1):** além da curva, no PvP a vida mínima é 250 e o bônus de dano dos atributos vai até 1,6x.

| Golpe | Defensor | Hoje | Curva achatada | Curva + piso 250 e teto 1,6x |
| --- | --- | --- | --- | --- |
| Relâmpago (Ninjutsu) | Tanque (379) | 1,5 | 3,2 | 4,7 |
| Relâmpago (Ninjutsu) | Meio a meio (286) | 1,1 | 2,4 | 3,6 |
| Relâmpago (Ninjutsu) | Build de dano (100 → 250) | 0,4 | 0,8 | 3,1 |
| Soco (Taijutsu) | Tanque (379) | 1,2 | 2,7 | 4,1 |
| Soco (Taijutsu) | Meio a meio (286) | 0,9 | 2,0 | 3,1 |
| Soco (Taijutsu) | Build de dano (100 → 250) | 0,3 | 0,7 | 2,7 |
| Kunai (Armas) | Tanque (379) | 1,6 | 2,5 | 3,8 |
| Kunai (Armas) | Meio a meio (286) | 1,2 | 1,9 | 2,9 |
| Kunai (Armas) | Build de dano (100 → 250) | 0,4 | 0,7 | 2,5 |

## Leitura

- O problema maior é a **vida**, não só o dano: quem põe tudo em dano fica com 100 de vida e morre no primeiro golpe
  de qualquer build, mesmo com a curva achatada.
- A curva achatada sozinha dobra o número de golpes para o tanque e o meio a meio, mas a build de dano continua caindo
  com 1 golpe.
- Com piso de 250 e teto de 1,6x, todo mundo aguenta de 2,5 a 4,7 golpes fortes. Isso chega perto dos 6 a 10 s quando
  se contam recargas, chakra e erros.
- Limites destas contas: tudo acerta, ninguém se move, não há escudo da Pedra nem cura, e as builds são extremas.

## Ideia do Victor: vida por nível

Cada nível dá vida fixa (+6 por nível = +354 no nível 60), somada à Vitalidade. Contas com a curva achatada e o nível
de uso até +15%. Tempo para matar em segundos (mesmas premissas de antes: tudo acerta, 0,4 s entre toques).

Vidas no nível 60 com +6 por nível: Tanque 733, Meio a meio 640, builds de dano 454.

| Atacante \ defensor | Tanque | Meio a meio | Dano Ninjutsu | Dano Taijutsu | Dano Armas |
| --- | --- | --- | --- | --- | --- |
| Tanque | 11,1 | 9,7 | 6,2 | 6,2 | 6,2 |
| Meio a meio | 9,0 | 6,9 | 4,1 | 4,1 | 4,1 |
| Dano Ninjutsu | 7,6 | 6,2 | 3,1 | 3,1 | 3,1 |
| Dano Taijutsu | 2,1 | 1,7 | 1,3 | 1,3 | 1,3 |
| Dano Armas | 2,1 | 2,1 | 1,3 | 1,3 | 1,3 |

Outros valores: +5 por nível deixa o Ninjutsu entre 2,1 e 6,9 s; +8 por nível deixa entre 4,8 e 9,7 s. O Taijutsu e
as Armas ficam abaixo de 2,5 s em todos.

**Por que Taijutsu e Armas continuam rápidos:** os jutsus deles são baratos e voltam rápido (soco: 5 de chakra e 0,5 s
de recarga; kunais: 10 de chakra e 1,2 s). O Ninjutsu acaba o chakra (100) em 2 ou 3 jutsus fortes; o Taijutsu e as
Armas não. A vida por nível resolve a vida; a recarga desses dois precisa de um ajuste próprio no PvP.

| Ajuste extra no PvP | Dano Taijutsu contra (Tanque / Meio / Dano) | Dano Armas contra (Tanque / Meio / Dano) |
| --- | --- | --- |
| Nenhum | 2,1 / 1,7 / 1,3 | 2,1 / 2,1 / 1,3 |
| Teto de 1,6x no dano dos atributos | 3,3 / 2,9 / 2,1 | 4,3 / 2,9 / 2,1 |
| Recarga e custo: Taijutsu x4, Armas x2,5 | 5,5 / 4,1 / 2,0 | 4,4 / 3,7 / 2,3 |

## Redução do dano base no jogo todo (pedido do Victor, fase 5)

Dano base dos jutsus e do ataque básico (com a arma) multiplicado por um fator, no jogo todo. Os monstros ficam com a
vida de hoje. Nível 1 = tier 1, nível de uso 1, 0 pontos. Nível 60 = tier 4, nível de uso 4, 59 pontos no atributo.
"Contra jogador" usa a curva achatada do PvP (1,45 e +15%). Duelo: vida por nível (+6), Taijutsu x4 e Armas x2,5 na
recarga e no custo, 2 kits (8 jutsus), chakra voltando 5 por segundo, tudo acerta, 0,4 s entre toques.

| Habilidade (nível 1 / nível 60 contra monstro / nível 60 contra jogador) | Hoje | Jutsus 60%, básico 70% | Jutsus 50%, básico 60% | Jutsus 40%, básico 50% | Jutsus 30%, básico 40% | Jutsus 25%, básico 35% |
| --- | --- | --- | --- | --- | --- | --- |
| Fogo (+ queimadura) | 25+9 / 218+78 / 100+36 | 15+6 / 131+48 / 60+21 | 13+6 / 109+39 / 50+18 | 10+3 / 87+30 / 40+15 | 8+3 / 65+24 / 30+12 | 6+3 / 54+21 / 25+9 |
| Água | 20 / 174 / 80 | 12 / 105 / 48 | 10 / 87 / 40 | 8 / 70 / 32 | 6 / 52 / 24 | 5 / 44 / 20 |
| Relâmpago | 30 / 261 / 120 | 18 / 157 / 72 | 15 / 131 / 60 | 12 / 105 / 48 | 9 / 78 / 36 | 8 / 65 / 30 |
| Soco (Taijutsu) | 35 / 305 / 140 | 21 / 183 / 84 | 18 / 152 / 70 | 14 / 122 / 56 | 11 / 91 / 42 | 9 / 76 / 35 |
| Kunai (Armas) | 28 / 244 / 149 | 18 / 155 / 97 | 15 / 131 / 82 | 12 / 106 / 67 | 9 / 82 / 52 | 8 / 70 / 45 |
| Ataque básico | 22 / 79 | 15 / 55 | 13 / 47 | 11 / 40 | 9 / 32 | 8 / 28 |

| Resultado | Hoje | 60/70 | 50/60 | 40/50 | 30/40 | 25/35 |
| --- | --- | --- | --- | --- | --- | --- |
| Duelo mais rápido (dano x dano) | 2,0 s | 4,1 s | 4,8 s | 6,2 s | 8,4 s | 9,8 s |
| Meio a meio x meio a meio | 7,0 s | 11,6 s | 13,8 s | 16,8 s | 22,5 s | 26,2 s |
| Duelo mais longo (tanque x tanque) | 11,0 s | 16,3 s | 19,3 s | 24,1 s | 30,1 s | 35,2 s |
| Maior parte da vida em 2 s | 100% | 66% | 56% | 46% | 37% | 32% |
| Slime (60 de vida) no nível 1 | 3 golpes | 4 | 5 | 6 | 8 | 10 |
| Rei Lodo (1.000) com Fogo tier 4 no nível 60 | 5 Fogos | 8 | 10 | 12 | 16 | 19 |

Os tempos são o melhor caso para quem ataca; numa luta de verdade (erros, movimento, esquiva) ficam maiores. A rodada
tem 50 s.

## Escolha final (02/11/2026): jutsus 40%, Ataque Básico 50%, bônus de Armas pela metade no Ataque Básico

2 kits, chakra 5/s, vida por nível, Taijutsu x4 e Armas x2,5 nos mapas de PvP. Tempo para matar (maior parte da vida
tirada em 2 s):

| Atacante \ defensor | Tanque | Meio a meio | Dano Nin | Dano Tai | Dano Armas |
| --- | --- | --- | --- | --- | --- |
| Tanque | 24,1 s (12%) | 20,7 s (14%) | 14,2 s (20%) | 14,2 s (20%) | 14,2 s (20%) |
| Meio a meio | 20,0 s (19%) | 16,8 s (22%) | 12,0 s (30%) | 12,0 s (30%) | 12,0 s (30%) |
| Dano Nin | 18,2 s (22%) | 15,7 s (26%) | 10,9 s (36%) | 10,9 s (36%) | 10,9 s (36%) |
| Dano Tai | 13,2 s (27%) | 11,6 s (31%) | 8,0 s (44%) | 8,0 s (44%) | 8,0 s (44%) |
| Dano Armas | 14,2 s (26%) | 12,1 s (30%) | 8,0 s (42%) | 8,0 s (42%) | 8,0 s (42%) |

Vitórias (quem mata primeiro): Meio a meio 3 de 4; Taijutsu 3 de 4; Tanque 1; Armas 1; Ninjutsu 0. Sem o bônus de
Armas pela metade no Ataque Básico, a build de Armas vencia as 4.
