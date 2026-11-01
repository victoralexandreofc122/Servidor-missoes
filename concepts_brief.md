# Duelo 1x1 justo e rápido (primeira entrega do PvP)

* **Autor:** Victor (dono do projeto), com revisão EGM feita pelo Claude
* **Data:** 2026-11-01
* **Base:** `docs/brainstorm-pvp-invocacoes.md` (brainstorm original) e 6 revisões "Goldfish" em contexto limpo
  (arquitetura, código, produto, compreensão, prontidão para construir, estrutura).

## Overview

O PvP de hoje tem um problema concreto: o dano dos jutsus de tier alto é tão grande que, mesmo no nível 60, só uma
distribuição de pontos funciona (tudo em vida). O jogo está em pré-alpha, com cerca de 3 testadores, então fila por
MMR, 3x3, invocações e Campo de Guerra ainda não têm quem jogue.

A primeira entrega é um **duelo 1x1 por desafio** (um jogador desafia, o outro aceita), em melhor de 3 rodadas, num
mapa de duelo fixo, com o dano e o controle limitados por uma **tabela de equilíbrio própria do PvP** e conferidos por um
**simulador automático**. O objetivo é que mais de uma build funcione, que a luta dure segundos (não um golpe só) e que
o jogador aja por instinto. Cada um luta com os jutsus que já aprendeu (decisão do Victor).

## Analysis

### 1. A causa do dano absurdo está na fórmula (confirmado no código)

O dano multiplica quatro coisas: o tier (`TIER.power` = 1 / 1,45 / 2 / 2,8 em `src/realtime/jutsus.ts`), o nível de uso
(`jutsuPower`, até +30%), o Ninjutsu (até ~2,4x no nível 60, `stats.ts`) e ainda a passiva da vila e o clima. A vida
só cresce somando pontos. Num ninja nível 60 meio a meio (cerca de 286 a 290 de vida), uma Bola de Fogo tier 4 no
nível de uso 4 tira cerca de 175 (61% da vida), e Água tier 4 seguida de Relâmpago tier 4 no alvo molhado soma cerca
de 410: morte instantânea. Entre um tier 1 sem uso e um tier 4 no máximo, a diferença é de 3,6x antes dos atributos.

Por isso o "orçamento de dano" do brainstorm não basta como texto: precisa virar **números e um teste**. Mexer só em
atributos não resolve.

### 2. O controle decide a luta sozinho (confirmado no código)

O tier multiplica também o controle (`TIER.control` até 1,7x): a Ilusão tier 4 atordoa 5,1 s e a Sombra tier 4 prende
8,5 s. O teto de controle de hoje (`controlDr`, janela de 8 s) só corta a segunda aplicação; a primeira vale inteira.
Com tempo para matar de 6 a 10 s, um atordoamento de 5 s já é a luta. "Agir por instinto" não existe se o jogador
fica parado metade da luta.

### 3. Jutsus aprendidos e níveis de uso contra "vencer com a própria build"

O Victor decidiu que cada um luta com os jutsus que já aprendeu, e quer 3 níveis de uso que **mudam a mecânica** (1 Bola
de Fogo vira 3; o raio curto vira longo e atordoa a linha). Os revisores apontaram três problemas:

- No 1x1, "atordoa mais se pegar uma pessoa só" vale sempre o máximo (só há uma pessoa).
- 3 bolas de fogo inteiras estouram qualquer teto de dano.
- O tier 4 vem da Extração (20% de chance): parte do poder no duelo vira sorte.

A saída que concilia a decisão do Victor com o equilíbrio é uma regra fixa: **o nível de uso e o tier mudam a FORMA do
jutsu (quantos projéteis, alcance, área), mas o dano e o controle totais ficam dentro do orçamento do slot.** Exemplo:
3 bolas de 40% cada valem 120% de uma, com teto de +15% sobre o nível 1. Assim o veterano ganha opções e estilo, não
vantagem bruta.

Hoje o código tem **4** níveis de uso (0 / 100 / 500 / 2.000 usos, +10% cada), gravados numa coluna gerada do banco
(`player_jutsus.level`). O caminho mais seguro é **não mexer no banco**: o código passa a calcular os 3 níveis a partir
do contador de usos que já existe (proposta: 0 / 150 / 600 usos) e a coluna antiga deixa de ser lida.

Outro ponto: o uso conta em qualquer lançamento, mesmo sem acertar, então dá para subir de nível lançando no vazio.
Proposta: contar só o uso que acerta um alvo válido.

### 4. O ranking não tem como funcionar com 3 pessoas

O próprio jogo já sabe disso: o módulo PvP só liga com 60 jogadores ativos (`config.ts`, `docs/endgame.md` seção 0).
MMR, fila, faixas e temporadas com 3 testadores só medem as mesmas duplas, e a regra "no máximo 3 vezes por dia" já
bloqueia isso. Também não dá para medir "45% a 55% de vitória por classe": com 30 partidas a margem de erro é de cerca
de 18 pontos.

Consequência: na primeira entrega, o equilíbrio é medido por **simulação** (tempo para matar, maior dano em 2 s, gasto
de chakra) e por registros de cada rodada, não por taxa de vitória. O MMR do duelo pode existir, mas como prévia, sem
recompensa.

### 5. O código não tem instância de mapa, e a arena não serve para duelo entre vilas

- Não existe cópia de mapa por partida: cada mapa é único (`maps.ts`, `gameWorld.ts`). O "Vale do Fim em instância" do
  brainstorm pressupõe algo que o servidor não tem.
- A arena de hoje só deixa lutar ninjas **da vila dona** (`gameWorld.ts`, perto da linha 1820), apesar de o comentário
  em `maps.ts` falar em vila aliada. Três testadores de vilas diferentes não conseguem duelar ali.
- O `gameWorld.ts` já tem cerca de 4.700 linhas. Fila, aceite, preparação, rodadas, água que sobe e resultado dentro
  dele viram um sistema frágil.

Proposta: um módulo próprio (por exemplo `src/realtime/duel.ts`) com as etapas da partida e testes; o `gameWorld` só
hospeda a luta. Um mapa de duelo fixo (o Vale, em versão pequena), com 1 ou 2 duelos ao mesmo tempo.

### 6. O MMR de hoje não serve para o duelo

`game.pvp_kill` (migração v11) conta **por abate**, usa K = 32 fixo, só conta com diferença de nível até 10 e, na mesma
transação, mexe em karma, recompensa pela cabeça, espólio e Akatsuki. Se o duelo passasse por ela, uma luta de arena
mudaria o karma de alguém. O duelo precisa de um caminho separado no banco, por partida, com MMR por formato.

O pedido do Victor ("quem tem menos tempo ganha mais e perde menos contra veterano") tem dois riscos: o MMR deixa de
somar zero e infla com o tempo, e o Elo já dá mais pontos a quem vence alguém de MMR maior (contar duas vezes). Se for
mantido, precisa de uma definição de "tempo" e de um limite. Proposta dos revisores: "experiência" = partidas de duelo
jogadas na conta, e um fator entre 1 e 1,5 que só vale enquanto o mais novo tiver menos de 30 partidas.

### 7. Tela do celular e leitura da luta

- A câmera do celular mostra cerca de 14 casas de altura e a arena proposta para o 1x1 tinha 16. Golpes e a água
  podiam vir de fora da tela. O duelo precisa caber inteiro (no máximo 12 a 13 casas de altura) ou ter câmera fixa.
- O jogador precisa ver: o placar de rodadas, o cronômetro, os 4 jutsus do adversário com o nível de uso e as recargas
  das técnicas fortes, e o aviso no chão de todo golpe com preparo.
- Mecânicas que brigam com o instinto ficam fora: controles invertidos (Mundo Falso) e esquiva aleatória pela
  Agilidade. Trocar por efeitos legíveis (lentidão, silêncio) e bônus fixos.

### 8. Rede e recursos

- A compensação de lag do código volta até 300 ms (`maxRewindMs`); o brainstorm dizia 150 ms. Escolher um valor só
  para o duelo e testar com atraso simulado (150 ± 50 ms, 1% de perda).
- A conjuração de 0,8 s (selos) cria uma janela de interrupção que o netcode ainda não trata: fica fora da primeira
  entrega.
- O chakra só volta meditando, e o tier 4 custa 2,2x. Sem regra própria, o chakra decide o duelo mais que a build.
  Proposta: no duelo, o chakra volta um valor fixo igual para todos (por exemplo 3 por segundo).
- O registro de PvP (`PvpStats`) fica só na memória e zera a cada publicação no Render; o Render grátis ainda dorme
  depois de 15 min sem ninguém.

### 9. Duração da partida

Com aceite, preparação, 3 rodadas de 75 s e intervalos, a partida passa de 4 min, acima da meta de 1,5 a 3 min. Proposta:
rodada de 50 s, preparação de 10 s e um desempate final explícito (mais vida restante em %).

### 10. Escopo, população e marca

- Para um desenvolvedor sozinho, o brainstorm completo (36 habilidades novas, invocações, Campo de Guerra, espectador,
  3x3, arenas novas) não cabe, e o `CLAUDE.md` ainda lista outras entregas na frente (cabeça desenhada à mão, site no
  Floot, salas com imagem, Arco 1). Falta decidir por escrito se o PvP passa na frente delas.
- Sem gente para duelar, a entrega fica parada. Duas ajudas baratas: um **bot de duelo** (a máquina de estados dos
  monstros com o kit de uma classe), que serve de treino e de teste de equilíbrio, e uma **noite de duelo marcada**
  com os testadores. E uma meta de comunidade: chegar a 10 testadores, com 5 voltando na semana seguinte.
- Nomes novos da série (Vale do Fim, contratos de sapo, Grande Invocação) aumentam o risco de marca, ainda mais com
  cosméticos pagos. Usar nomes próprios ("Vale das Estátuas") desde já.

## Goals vs. Non-Goals

* **In-Scope Goals (primeira entrega):**
  - Tabela de equilíbrio do PvP num arquivo só (por exemplo `src/realtime/balance.ts`, com versão), sem mudar o PvE:
    curva de tier achatada para o dano (proposta 1 / 1,15 / 1,3 / 1,45), teto de dano por acerto e teto de controle por
    aplicação (cerca de 1,5 s de controle duro), janela do teto de controle de 15 s.
  - Simulador automático no `npm run verify`: para cada classe, tier e nível de uso, o maior dano em qualquer 2 s
    deslizantes (contando queimadura, combo, clima e nível) fica em até 45% da vida de referência, e o tempo para matar
    fica entre 6 e 10 s.
  - Regra fixa dos níveis de uso: mudam a forma, não o total (3 níveis calculados pelo contador de usos; só contam
    usos que acertam).
  - Duelo por desafio: "Desafiar" e aceitar, entre quaisquer vilas, melhor de 3, num mapa de duelo fixo que cabe na
    tela do celular, com placar de rodadas, cronômetro e desempate.
  - Regras do duelo como um perfil passado ao combate (sem passiva da vila e sem clima, chakra fixo por segundo, sem
    meditação, sem itens de cura), não como `if` espalhado.
  - Registro de cada rodada no banco (classe, kit, nível de uso, duração, maior dano em 2 s, controle sofrido, motivo
    do fim) e um alerta quando o teto for ultrapassado em jogo de verdade.
  - Bot de duelo para treino e teste.
* **Out-of-Scope Non-Goals (agora):**
  - Fila por MMR, pareamento, faixas com nome e recompensas de temporada do duelo (entram com a população).
  - Cópias (instâncias) de mapa, espectadores com atraso, mirante.
  - 3x3, invocações, Campo de Guerra, Grande Invocação.
  - Os kits de 4 habilidades novas para as 9 classes (depois do duelo estar equilibrado; piloto com 2 classes).
  - Conjuração com selos (0,8 s).
  - Ligação do PvP com a política (Kage e guerras). Quando entrar, em uma direção só: o duelo emite "pontos de vila" e a
    política decide o que fazer com eles.
  - História.

## Alternatives Weighed

- **Todos os jutsus liberados dentro da partida:** daria igualdade total, mas o Victor escolheu lutar com o que cada um
  aprendeu. Mantida a decisão, compensada pela regra "nível muda forma, não total".
- **Todo jutsu aprendido luta no nível máximo dentro do rankeado:** remove a vantagem de tempo de jogo; fica como plano
  B se a regra de forma não bastar.
- **Resolver só com atributos (mais vida):** rejeitado; o problema está nos multiplicadores do dano, e continuaria
  existindo uma build única.
- **Comprimir a curva de tier também no PvE:** rejeitado por agora; o PvE (chefes com 1.000 de vida) foi feito para os
  números atuais. Só o PvP muda.
- **Duelo dentro da arena da vila:** rejeitado; a arena só aceita a vila dona e é pequena para a tela.
- **Fila com instância desde o início:** rejeitado; o servidor não tem instâncias e não há população.
- **Usar `game.pvp_kill` para o duelo:** rejeitado; mexe em karma, recompensa e Akatsuki e conta por abate.
- **Equilibrar pela taxa de vitória por classe:** rejeitado para agora (amostra pequena demais); simulação no lugar.
- **Bônus de MMR para novatos:** pedido do Victor, com riscos de inflação e dupla contagem. Opções: fator limitado só
  nas primeiras 30 partidas do mais novo, ou só um K alto nas 10 primeiras partidas (mais simples).
- **Mapa grande do Vale (22 x 16):** rejeitado; não cabe na tela do celular. O Vale entra numa versão menor.

## Key Decisions & Staging for Next Steps

**Já decidido pelo Victor:** jutsus aprendidos no duelo; melhor de 3 rodadas; ordem das fases do brainstorm.

**Para decidir antes de escrever código:**

1. **Níveis de uso:** aceitar a regra "mudam a forma, não o total" (com teto de +15%) e os 3 níveis calculados pelo
   contador de usos (0 / 150 / 600)? Contar só usos que acertam?
2. **Bônus de MMR do novato:** fator limitado nas primeiras 30 partidas, ou só K alto nas 10 primeiras?
3. **Prioridade:** o PvP passa na frente da cabeça desenhada à mão, do site no Floot e das salas com imagem?
4. **Interruptor do duelo:** um módulo `duelo` próprio (ligado mesmo com poucos jogadores), separado do módulo `pvp`
   que liga com 60.

**Ordem proposta (revisada):**

1. Tabela de equilíbrio do PvP + simulador do teto de dano e de controle (sem migração).
2. Duelo por desafio, melhor de 3, mapa de duelo fixo, regras do duelo como perfil, registro por rodada (migração
   aditiva v15 em branch próprio até rodar no Neon: tabelas de partidas e rodadas, MMR por formato, função
   `game.duel_result` com `CREATE OR REPLACE`, módulo `duelo` com `INSERT ... ON CONFLICT DO NOTHING`, sem `DO $$`).
3. Bot de duelo e noite de duelo marcada com os testadores.
4. Kits de 4 habilidades para 2 classes, como piloto, descritos como dados.
5. O resto do brainstorm (fila, 3x3, invocações, Campo de Guerra, espectador, Vale completo) quando a população
   ligar.
