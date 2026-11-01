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
