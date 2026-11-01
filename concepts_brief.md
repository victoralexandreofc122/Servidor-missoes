# Duelo 1x1 equilibrado e rápido (primeira entrega do PvP)

* **Autor:** Victor (dono do projeto), com revisão feita pelo Claude
* **Data:** 2026-11-01 (revisado depois das fases 3 e 4 da revisão)
* **Base:** `docs/brainstorm-pvp-invocacoes.md` (brainstorm original). A "revisão EGM" é um método em que leitores
  sem contexto anterior (chamados "Goldfish") leem o documento sozinhos e apontam furos; os relatórios estão em
  `revisao_egm/`.

## Glossário

* **PvP:** jogador contra jogador. **PvE:** jogador contra monstros e chefes.
* **Duelo:** a luta 1x1 desta entrega, por desafio, em melhor de 3 rodadas.
* **Tier:** o grau de um jutsu (1 a 4), que vem da Extração.
* **Nível de uso:** quanto o jogador já usou um jutsu (sobe com o contador de usos). Não confundir com o **nível do
  ninja** (1 a 60).
* **Build:** como o jogador distribuiu os pontos entre os 6 atributos (Vitalidade, Chakra, Agilidade, Taijutsu,
  Ninjutsu e Armas) e quais jutsus e arma usa.
* **Controle:** efeito que impede o alvo de agir: atordoar, prender, sono, os choques da paralisia e o silêncio.
* **Tempo para matar:** quantos segundos um ninja leva para zerar a vida de outro batendo o melhor que pode.
* **MMR:** pontuação de habilidade usada em ranking. **Elo:** a conta clássica que sobe ou desce o MMR depois de cada
  partida. **K:** o tamanho máximo do ganho ou da perda de uma partida no Elo.
* **Lag:** atraso da rede. **Compensação de lag:** o servidor "volta no tempo" alguns milissegundos para conferir se o
  golpe acertou onde o atacante viu o alvo.
* **Instância:** uma cópia separada de um mapa só para uma partida (o servidor não tem isso hoje).
* **Interruptor:** um liga/desliga de uma funcionalidade (no código ou no Painel do Admin).
* **Golpe com carga:** jutsu ou ataque que demora um tempo para sair e mostra um aviso no chão antes.
* **Migração:** o arquivo `db/*.sql` que o Victor roda no Neon para mudar o banco; "aditiva" quer dizer que só cria
  coisas novas, sem apagar nada.
* **Casa:** um quadrado do mapa (o ninja ocupa 1 casa).
* **Build de dano:** quem põe os 59 pontos do nível 60 num atributo de dano (Ninjutsu, Taijutsu ou Armas).

## Visão geral (Overview)

O PvP de hoje tem um problema medido no código: o dano dos jutsus de tier alto é tão grande que, no nível 60, só uma
build funciona (tudo em Vitalidade). Um golpe ou dois matam, então a luta não tem escolhas.

O jogo está em pré-alpha, com cerca de 3 testadores. Fila por MMR, 3x3, invocações e Campo de Guerra ainda não têm
quem jogue.

Por isso a primeira entrega é só o **duelo 1x1 por desafio**: um jogador desafia, o outro aceita, e os dois lutam em
melhor de 3 rodadas num mapa de duelo fixo. Cada um usa os jutsus que já aprendeu (decisão do Victor). O dano e o
controle entre jogadores passam a seguir uma **tabela de equilíbrio do PvP**, conferida por um **simulador
automático** a cada `npm run verify`.

O objetivo é medido assim: nenhuma build vence todas as outras; nenhum confronto termina em menos de 2 s nem passa de
12 s, e o meio a meio contra o meio a meio fica entre 6 e 10 s; ninguém fica sem agir mais de 2,5 s a cada 15 s. Os
números de cada build estão em `revisao_egm/numeros_atributos_pvp.md`.

## Análise (Analysis)

### 1. A causa do dano alto está na fórmula (confirmado no código)

O dano multiplica cinco coisas:

- o tier (`TIER.power` = 1 / 1,45 / 2 / 2,8, em `src/realtime/jutsus.ts`);
- o nível de uso (`jutsuPower`, até +30% no 4º nível de hoje);
- o Ninjutsu (até cerca de 2,4x no nível 60, em `stats.ts`);
- a passiva da vila;
- o clima.

A vida só cresce somando pontos. Num ninja nível 60 meio a meio (cerca de 286 a 290 de vida), uma Bola de Fogo tier 4
no nível de uso máximo de hoje tira cerca de 175 de vida (61% do total). Água tier 4 seguida de Relâmpago tier 4 no
alvo molhado soma cerca de 410 de dano: morte instantânea. Só entre um tier 1 sem uso e um tier 4 no máximo, o dano
muda 3,6 vezes, antes de contar os atributos.

Conclusão: o "orçamento de dano" do brainstorm precisa virar números e um teste. Só achatar o dano não basta: a vida
também tem um problema (Análise 1b).

### 1b. A build de dano tem 100 de vida (conta feita com o código)

No nível 60 há 59 pontos. A vida só sobe pela Vitalidade, então quem põe tudo em dano fica com a vida do nível 1:

| Build (nível 60) | Vida hoje | Dano dos atributos |
| --- | --- | --- |
| Tanque (59 Vitalidade) | 379 | 1x |
| Meio a meio (30 Vitalidade + 29 Ninjutsu) | 286 | 1,91x |
| Build de dano (59 em Ninjutsu, Taijutsu ou Armas) | 100 | 2,39x |

Mesmo com a curva de tier achatada, a build de dano morre com 1 golpe forte de qualquer build, e o tempo para matar
vai de 0,1 a 4,8 s. Os atributos sozinhos dão uma diferença de cerca de 9 vezes entre "ataque contra ataque" e "vida
contra vida".

Saída escolhida pelo Victor: **vida por nível no jogo todo**. Cada nível acima do 1 dá **+6 de vida** (+354 no nível
60), somada à Vitalidade. No nível 60: tanque 733, meio a meio 640, build de dano 454.

Com isso o Ninjutsu entra na faixa, mas o Taijutsu e as Armas continuam matando em 1 a 2 s: os jutsus deles são
baratos e voltam rápido (soco: 5 de chakra e 0,5 s de recarga; kunais: 10 de chakra e 1,2 s), enquanto o Ninjutsu
acaba os 100 de chakra em 2 ou 3 jutsus fortes. Por isso, **no PvP, os jutsus de Taijutsu custam e recarregam 4 vezes
mais, e os de Armas 2,5 vezes mais**. O dano por golpe não muda.

Tempo para matar com as duas mudanças, a curva achatada e o nível de uso até +15% (melhor caso para quem ataca: tudo
acerta, 0,4 s entre toques):

| Atacante \ defensor | Tanque | Meio a meio | Build de dano |
| --- | --- | --- | --- |
| Tanque | 11,1 s | 9,7 s | 6,2 s |
| Meio a meio | 9,0 s | 6,9 s | 4,1 s |
| Dano de Ninjutsu | 7,6 s | 6,2 s | 3,1 s |
| Dano de Taijutsu | 5,5 s | 4,1 s | 2,0 s |
| Dano de Armas | 4,4 s | 3,7 s | 2,3 s |

A build de dano contra a build de dano termina em 2 a 3 s: quem tudo aposta no dano mata rápido e morre rápido. Isso
fica aceito.

### 2. O controle decide a luta sozinho (confirmado no código)

O tier também multiplica o controle (`TIER.control` até 1,7x): a Ilusão tier 4 atordoa 5,1 s e a Sombra tier 4 prende
8,5 s.

O limite de controle de hoje (`controlDr` em `config.ts`, aplicado em `applyStatus` no `gameWorld.ts`, perto da linha
2001) tem dois furos:

- só cobre **atordoar** e **prender**, e cada um tem contador próprio: um atordoamento seguido de uma prisão valem
  inteiros;
- o sono (4 s), o silêncio (3 s) e a paralisia passam por `effects.ts` **sem limite nenhum**.

Com tempo para matar de 2 a 12 s, um atordoamento de 5 s já decide a luta.

O `controlDr` de hoje vale para todo controle num jogador, venha de outro jogador ou de monstro, e o `applyStatus` não
sabe quem causou o efeito.

### 3. Jutsus aprendidos e níveis de uso contra "vencer com a própria build"

O Victor decidiu que cada um luta com os jutsus que já aprendeu e quer 3 níveis de uso que **mudam a mecânica** (1
Bola de Fogo vira 3; o raio curto vira longo e atordoa a linha). Os revisores apontaram três problemas:

- No 1x1, "atordoa mais se pegar uma pessoa só" vale sempre o máximo, porque só há uma pessoa.
- 3 bolas de fogo inteiras passam de qualquer limite de dano.
- O tier 4 vem da Extração (20% de chance): parte do poder no duelo vira sorte.

A regra que concilia a decisão do Victor com o equilíbrio:

- **O tier dá poder**, numa curva achatada só para o PvP: 1 / 1,15 / 1,3 / 1,45 (o tier 4 bate no máximo 45% mais
  que o tier 1, e não 180% como hoje).
- **O nível de uso muda a forma** (quantos projéteis, alcance, área) e soma no máximo **+15% de dano** sobre o nível 1
  do mesmo tier.
- Quando existir a forma nova, esse limite vale **por lançamento**: soma o dano de todos os projéteis e da queimadura
  que o jutsu deixa. Exemplo: 3 bolas de 38% do dano de uma bola cada somam 114%, dentro do limite; 3 bolas de 40%
  somariam 120% e passariam.

Hoje o código tem 4 níveis de uso (0 / 100 / 500 / 2.000 usos, +10% de dano cada), gravados numa coluna gerada do
banco (`player_jutsus.level`), que também é lida por `ninjaStore.ts`, `findPlayer.ts` e `admin_give_jutsu`. Trocar
isso no jogo todo mudaria o PvE e o nível de quem já joga. Por isso a mudança vem em dois passos:

1. **Nesta entrega:** o nível de uso de hoje (1 a 4) continua igual em tudo, inclusive no que aparece na tela. Só
   nas contas de jogador contra jogador o bônus muda: **+0 / +5 / +10 / +15%** nos níveis 1 a 4 (em vez de +10% por
   nível). O banco, o PvE e o progresso salvo não mudam.
2. **Entrega própria, depois:** a forma nova de cada jutsu (com a lista de jutsus, a arte no cliente e a conversão de
   quem já joga), a troca de 4 para 3 níveis no jogo todo (0 / 150 / 600 usos) e o limite somado por lançamento
   (projéteis e queimadura), que só faz sentido quando existir a forma nova.

Hoje o uso conta em qualquer lançamento, mesmo sem acertar, então dá para subir de nível lançando no vazio. Isso
também fica para o passo 2: só contar o uso que acerta um alvo válido. No duelo o contador **não sobe**.

### 4. O ranking não funciona com 3 pessoas

O próprio jogo já sabe disso: o interruptor `pvp` só liga com 60 jogadores ativos (`config.ts`; `docs/endgame.md`,
seção 0). Fila, faixas e temporadas com 3 testadores só medem as mesmas duplas. Medir "45% a 55% de vitória por
classe" também não dá: com 30 partidas, a margem de erro é de cerca de 18 pontos percentuais.

Consequência: nesta entrega, o equilíbrio é medido pelo **simulador** (tempo para matar, maior dano em 2 s, tempo sem
agir, gasto de chakra) e pelos registros de cada rodada, não por taxa de vitória. O MMR do duelo existe só como
prévia (ver Decisão 2).

### 5. O servidor não tem instância de mapa, e a arena não serve para duelo entre vilas

- Não existe cópia de mapa por partida: cada mapa é único (`maps.ts`, `gameWorld.ts`). O "Vale do Fim em instância"
  do brainstorm pressupõe algo que o servidor não tem.
- A arena de hoje só deixa lutar ninjas **da vila dona** (`gameWorld.ts`, perto da linha 1820), apesar de o
  comentário em `maps.ts` falar em vila aliada. Três testadores de vilas diferentes não conseguem duelar ali.
- O `gameWorld.ts` já tem cerca de 4.700 linhas. Colocar desafio, preparação, rodadas e resultado dentro dele
  aumenta o risco de quebrar o resto.

Proposta: um arquivo próprio para o duelo (`src/realtime/duel.ts`) com as etapas da partida e testes; o
`gameWorld.ts` só hospeda a luta. O mapa é o **Vale das Estátuas**, pequeno e fixo, com **2 áreas de duelo lado a
lado** (2 duelos ao mesmo tempo, no máximo). Ver "Como funciona por dentro".

### 6. O MMR de hoje não serve para o duelo

`game.pvp_kill` (migração v11) conta **por abate**, usa K = 32 fixo, só conta com diferença de nível de até 10 e, na
mesma transação, mexe em karma, recompensa pela cabeça, espólio e Akatsuki. Se o duelo passasse por ela, uma luta de
treino mudaria o karma de alguém. O duelo precisa de um caminho próprio no banco, por partida.

O pedido do Victor ("quem joga há menos tempo ganha mais e perde menos contra veterano") tem dois riscos: o MMR deixa
de somar zero e cresce com o tempo, e o Elo já dá mais pontos a quem vence alguém de MMR maior (o bônus contaria duas
vezes). A Decisão 2 limita os dois.

### 7. Tela do celular e leitura da luta

- A câmera do celular mostra cerca de 14 casas de altura. Cada área de duelo tem **18 x 12 casas** e câmera fixa, para
  nenhum golpe vir de fora da tela.
- O jogador precisa ver: o placar de rodadas, o cronômetro, os 4 jutsus do adversário com o nível de uso e as recargas
  das técnicas fortes, e o aviso no chão de todo golpe com carga.
- O Mundo Falso (controles invertidos) e a esquiva aleatória pela Agilidade aparecem no brainstorm, mas **não existem
  no jogo hoje**. Ficam fora desta entrega, porque brigam com o "agir por instinto".

### 8. Rede e recursos

- A compensação de lag do código volta até 300 ms (`maxRewindMs`); o brainstorm dizia 150 ms. No duelo vale **200
  ms**, testado com atraso simulado de 150 ± 50 ms e 1% de pacotes perdidos.
- A conjuração com selos (0,8 s) cria uma janela de interrupção que a rede ainda não trata: fica fora desta entrega.
- Hoje o chakra só volta meditando, e o tier 4 custa 2,2 vezes mais chakra. Sem regra própria, o chakra decide o duelo
  mais que a build. No duelo, o chakra volta sozinho a **1/3 da velocidade da meditação** (`meditationChakraPerSec` em
  `stats.ts`, que já usa o rendimento decrescente dos pontos): 5 por segundo sem pontos em Chakra. A vida não volta
  sozinha no duelo (hoje ela volta 1 por segundo com o chakra cheio).
- O registro de PvP de hoje (`PvpStats`) fica só na memória e zera a cada publicação no Render. O duelo grava tudo no
  banco (ver Riscos).
- O Render grátis dorme depois de 15 min sem ninguém (ver Riscos).

### 9. Duração da partida

Com rodadas de 75 s, a partida passaria de 4 min, acima da meta de 1,5 a 3 min. Com os valores abaixo, uma partida de
3 rodadas dura cerca de 2 min 50 s:

| Etapa | Duração |
| --- | --- |
| Preparação (antes da 1ª rodada) | 10 s |
| Rodada | até 50 s |
| Intervalo entre rodadas | 5 s |
| Total no pior caso (3 rodadas) | 10 + 3 x 50 + 2 x 5 = 170 s |

Se um jogador cai da conexão, o cronômetro da rodada para enquanto ele está fora (até 15 s).

Desempate de uma rodada que chega aos 50 s: vence quem tem **mais vida restante em porcentagem**; se der igual, vence
quem causou mais dano na rodada.

### 10. Escopo, população e marca

- Para um desenvolvedor sozinho, o brainstorm completo (36 habilidades novas, invocações, Campo de Guerra, espectador,
  3x3, arenas novas) não cabe numa entrega.
- Sem gente para duelar, a entrega fica parada. A ajuda mais barata é uma **noite de duelo marcada** com os
  testadores. Um **bot de duelo** ajuda no treino, mas não é barato: monstro não usa jutsu de jogador, então o bot
  precisa ser um "ninja sem conexão". Fica para depois da noite de duelo; o equilíbrio é medido pelo simulador.
- Nomes da série original (Vale do Fim, contratos de sapo, Grande Invocação) aumentam o risco de problema com a marca,
  ainda mais com cosméticos pagos. Usamos nomes próprios desde já: **Vale das Estátuas**.

## Objetivos e fora do escopo (Goals vs. Non-Goals)

**Objetivos desta entrega:**

**Antes da tabela, no jogo todo: vida por nível** (`stats.ts`): +6 de vida por nível acima do 1, somada à
Vitalidade. É código, sem migração (a vida máxima não fica no banco). Como vale também contra monstros, o PvE fica mais fácil: o passo 1
inclui conferir o Rei Lodo e os monstros com a vida nova e anotar o ajuste, que vira uma tarefa própria.

1. **Tabela de equilíbrio do PvP**, versionada, num arquivo próprio (`src/realtime/pvpBalance.ts`). Vale para **todo
   dano, cura e controle de jogador em jogador** (duelo, Zona de Conflito e arena das vilas); contra monstros nada
   muda. Contém:
   - a curva de tier achatada (1 / 1,15 / 1,3 / 1,45), que vale também para a cura e o escudo da Pedra;
   - o bônus do nível de uso no PvP: +0 / +5 / +10 / +15% nos níveis 1 a 4;
   - o custo e a recarga dos jutsus de Taijutsu (x4) e de Armas (x2,5) no PvP;
   - o orçamento de controle (objetivo 2);
   - a rede de segurança de dano (objetivo 3);
   - a lista de cada tipo de dano entre jogadores e se entra na tabela:

     | Tipo de dano | Entra? |
     | --- | --- |
     | Jutsu de classe | Sim (curva, nível de uso, custo e recarga) |
     | Ataque Básico e arma equipada | Sim (só a rede de segurança; o dano não muda) |
     | Queimadura e outros efeitos que batem a cada segundo | Sim (a força vem do jutsu que aplicou) |
     | Combo do molhado (+30% no Relâmpago) | Sim (fica, dentro da rede de segurança) |
     | Poderes da Akatsuki | Fora do duelo (desligados nele); na Zona de Conflito, só a rede de segurança |

2. **Orçamento único de controle por jogador:** soma o tempo sem poder agir de atordoar, prender, sono e os choques da
   paralisia; o silêncio conta pela metade (dá para andar e bater). No máximo **1,5 s por aplicação** e **2,5 s a cada
   15 s**. Passou disso, o controle novo não pega (o dano do golpe continua). A lentidão não conta. Conta o tempo que
   o efeito durou de fato (o sono que acaba ao apanhar conta só até acordar). O orçamento vale **só quando quem causa
   é jogador**; controle de monstro segue o `controlDr` de hoje. Para isso, o `applyStatus` e o `applyEffect` passam a
   receber quem causou o efeito.
3. **Rede de segurança de dano no servidor:** o dano que um jogador recebe de outro jogador, num trecho qualquer de 2
   s, fica limitado a **45% da vida máxima**, contando cada atacante separado. O que passar é cortado; o total cortado
   vai para o registro da rodada (objetivo 9) e para o Painel do Admin. Fica no `damagePlayer`.
4. **Uma função pura de dano por acerto** (`pvpHitDamage`: atacante, alvo, jutsu, tier, nível de uso e regras), usada
   pelo servidor e pelo simulador. Ela entra **só quando o alvo é jogador**, no ponto por alvo que já existe
   (`hitTarget` e `damagePlayer`, no `gameWorld.ts`); o cálculo de hoje no `cast()` (perto da linha 1600) continua
   igual para os monstros. Um teste novo trava os números de dano do PvE de hoje, para provar que não mudaram.
5. **Simulador automático no `npm run verify`** (teste em `test/pvpBalance.test.ts`):
   - 5 builds de referência no nível 60 (59 pontos), iguais às de `revisao_egm/numeros_atributos_pvp.md`:
     | Build | Pontos | Classe |
     | --- | --- | --- |
     | Tanque | 59 Vitalidade | Fogo |
     | Meio a meio | 30 Vitalidade + 29 Ninjutsu | Fogo |
     | Dano de Ninjutsu | 59 Ninjutsu | Fogo, Água e Relâmpago (uma de cada vez) |
     | Dano de Taijutsu | 59 Taijutsu | Taijutsu |
     | Dano de Armas | 59 Armas, com a Espada Longa | Armas |
   - cada build usa os 4 jutsus da classe, em todos os níveis de uso, mais o Ataque Básico, com 0,4 s entre toques;
   - cada build luta contra todas as outras (incluindo ela mesma), com o chakra do duelo;
   - roda também o pior caso de passiva da vila e clima (para a Zona de Conflito).
   - **Passa se:** todo confronto fica entre 2 e 12 s; o meio a meio contra o meio a meio fica entre 6 e 10 s; nenhuma
     build vence todas as outras; nenhuma sequência passa de 45% da vida do alvo em 2 s (antes da rede de segurança);
     ninguém fica mais de 2,5 s sem agir em 15 s; o kit cabe no chakra de uma rodada de 50 s.
6. **Duelo por desafio:** o botão "Desafiar" e o aceite, entre quaisquer vilas, para ninjas a partir do nível 20 (com
   classe). Melhor de 3, no Vale das Estátuas, com placar de rodadas, cronômetro, desempate e as regras de borda da
   seção "Como funciona por dentro".
7. **Regras do duelo como um perfil passado ao combate** (`DuelRules`), não como `if` espalhado: sem passiva da vila,
   sem clima, sem poderes da Akatsuki, chakra que volta sozinho, vida que não volta sozinha, sem meditação, sem itens
   de cura, compensação de lag de 200 ms, nível de uso que não sobe.
8. **Tela do duelo:** kit do adversário com nível de uso e recargas, placar e cronômetro. (Hoje nenhum jutsu de
   jogador tem carga; o aviso no chão entra junto com a conjuração com selos, mais tarde.)
9. **Registro de cada partida e rodada no banco:** classe, kit, nível de uso, duração, maior dano em 2 s, dano cortado
   pela rede de segurança, controle sofrido, motivo do fim e versão da tabela.
10. **MMR de prévia:** calculado e gravado a cada partida, aparece só no perfil como "prévia", sem recompensa. Entra
    depois do duelo funcionar (passo 2b).
11. **Interruptor `duelo`** em `config.ts`, ligado por padrão, e no Painel do Admin. Sem banco, a troca pelo painel é
    temporária: volta ao padrão do `config.ts` a cada publicação.

**Critério de pronto (técnico):** passos 1 e 2 publicados; o simulador passa no `npm run verify`; o teste do PvE passa;
pelo menos 20 duelos reais registrados, sem a rede de segurança cortar dano em mais de 1 a cada 10 rodadas.

**Meta de comunidade (medida à parte, não trava a entrega):** uma noite de duelo feita; 10 testadores, com 5 voltando
na semana seguinte.

**Fora do escopo agora:**

- Fila por MMR, pareamento, faixas com nome e recompensas de temporada do duelo (entram com a população).
- Instâncias de mapa, espectadores com atraso, mirante.
- 3x3, invocações, Campo de Guerra, Grande Invocação.
- Os kits de 4 habilidades novas por classe, inclusive o piloto com 2 classes (é o passo 4 da ordem).
- Bot de duelo (passo 3, depois da noite de duelo). Monstro não usa jutsu de jogador: o bot precisa ser um "ninja sem
  conexão" que usa o mesmo `cast()`, e serve só de treino; o equilíbrio é medido pelo simulador.
- Ajuste do PvE por causa da vida por nível (tarefa própria, com o que o passo 1 anotar).
- A forma nova de cada jutsu por nível de uso e a troca de 4 para 3 níveis no jogo todo (entrega própria, ver Análise
  3).
- Conjuração com selos (0,8 s), Mundo Falso e esquiva aleatória.
- A "água que sobe" do brainstorm (área que encolhe no fim da rodada): o desempate por vida resolve o fim da rodada.
- Ligação do PvP com a política (Kage e guerras). Quando entrar, vai em uma direção só: o duelo gera "pontos de vila"
  e a política decide o que fazer com eles.
- História.

## Como funciona por dentro (Proposed Architecture)

```
Desafio → Aceite → Partida → Rodada 1..3 → Resultado → Banco
            (duel.ts)        (gameWorld + DuelRules; hitTarget/damagePlayer + pvpHitDamage)   (game.duel_result)
```

| Peça | Onde | O que faz |
| --- | --- | --- |
| Etapas da partida | `src/realtime/duel.ts` (novo, com testes) | Convite, aceite, preparação, rodadas, intervalos, desempate, abandono e fim. Não conhece o mapa; recebe eventos do `gameWorld`. |
| Regras do duelo | `DuelRules` (perfil) | O `gameWorld` passa o perfil ao combate quando os dois estão em duelo. |
| Tabela de equilíbrio | `src/realtime/pvpBalance.ts` (novo) | Curva de tier, limite do nível de uso, orçamento de controle, rede de segurança e a versão da tabela. |
| Dano por acerto | função pura `pvpHitDamage` | Usada pelo servidor e pelo simulador (o simulador testa o código de verdade, não uma cópia). |
| Simulador | `test/pvpBalance.test.ts` | Roda no `npm run verify`. |
| Mapa | `maps.ts`: Vale das Estátuas | 2 áreas de 18 x 12 casas, fechadas a quem não está no duelo. |
| Registro | migração v15 + `game.duel_result` | Grava partida, rodadas e MMR de prévia numa transação só. Não toca karma, recompensa, Akatsuki nem `pvp_kill`. |
| Tela | `public/` | Placar, cronômetro, kit do adversário, aviso no chão. |
| Vida por nível | `stats.ts` (`derivedStats` recebe o nível) | +6 de vida por nível acima do 1, no jogo todo. |
| Teste do PvE | `test/` | Trava os números de dano contra monstros de hoje. |

**Por que a tabela fica fora do `config.ts`:** os números de combate continuam no `config.ts`, mas a tabela do PvP tem
versão e precisa ser lida pelo servidor e pelo simulador ao mesmo tempo. Num arquivo próprio, a versão gravada em cada
rodada aponta para uma tabela só.

**Regras de borda da partida:**

- Desafio: o convite expira em 20 s; cada jogador tem no máximo 1 desafio pendente; depois de uma recusa, o mesmo
  desafio só pode ser repetido 20 s depois.
- Quem pode: ninjas a partir do nível 20, de qualquer vila (inclusive aliadas, em trégua ou da Akatsuki), fora de
  combate e fora da Zona de Conflito.
- Ocupação: se as 2 áreas estão ocupadas, o desafio avisa "Vale cheio" e não é enviado.
- Entrada e saída: os dois são levados para a área e voltam para onde estavam no fim. Ninguém de fora entra; ninguém
  sai antes do fim.
- Desconexão: 15 s para voltar, com o cronômetro parado; depois disso, quem caiu perde a partida. Sair de propósito
  conta como derrota.
- Publicação do servidor (ou queda do servidor) no meio: a partida é anulada e não conta no MMR.
- Morte no duelo não tira item, não dá karma nem recompensa e não conta como abate.

## Riscos e mitigações (Risks & Mitigations)

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Falta gente para duelar | A entrega fica sem teste real | Noite de duelo marcada; bot de duelo depois; a meta de comunidade não trava o pronto técnico. |
| Vida por nível deixa o PvE fácil | Monstros e Rei Lodo perdem a graça | O passo 1 confere o PvE com a vida nova e anota o ajuste; o ajuste vira tarefa própria. |
| `pvpHitDamage` mudar o dano contra monstros | PvE quebrado sem ninguém ver | Entra só quando o alvo é jogador; teste que trava os números do PvE. |
| Escopo grande para um desenvolvedor sozinho | A entrega passa de 15/12/2026 | Bot e MMR de prévia vêm depois do duelo funcionar; a data revê a ordem, não cobra tudo pronto. |
| Servidor do Render dormindo | O primeiro jogador espera o servidor acordar | Aviso na tela de entrada; na noite de duelo, acordar o servidor antes. |
| Registro só na memória | Dados perdidos a cada publicação | Partidas e rodadas gravadas no banco (migração v15). |
| Dupla combinando resultado | MMR falso | O mesmo par conta no máximo 3 partidas por dia no MMR; o MMR é só prévia, sem recompensa. |
| Subir nível de uso em duelo combinado | Vantagem sem jogar de verdade | No duelo o contador de usos não sobe. |
| Desafio em excesso (assédio) | Jogador incomodado | 1 desafio pendente por vez; 20 s de espera depois de uma recusa. |
| MMR inflando com o fator do novato | Pontuação sem sentido | Fator só nas 30 primeiras partidas do menos experiente; MMR de prévia pode ser recalculado do histórico. |
| Tabela errada em jogo de verdade | Morte em um golpe volta | Rede de segurança de 45% em 2 s; cada corte vai para o Painel do Admin com a versão da tabela. |
| Mudança na tabela afetar a Zona de Conflito | Luta em grupo fica diferente | A tabela vale para todo dano entre jogadores de propósito; o simulador roda o pior caso de passiva e clima; a Zona grava em `pvp_kill` e não tem registro por rodada, então o efeito lá é observado nos testes com os testadores. |
| `gameWorld.ts` grande quebrar | Bugs fora do duelo | Etapas em `duel.ts` com testes; o `gameWorld` só chama. |

## Alternativas pesadas (Alternatives Weighed)

- **Todos os jutsus liberados dentro da partida:** daria igualdade total, mas o Victor escolheu lutar com o que cada um
  aprendeu. Compensado pela curva achatada e pelo limite do nível de uso.
- **Todo jutsu aprendido luta no nível de uso máximo dentro do duelo:** tira a vantagem do tempo de jogo; fica como
  plano B se o limite de +15% não bastar.
- **Atributos iguais para todos no duelo:** tiraria os atributos da conta e facilitaria o equilíbrio. Rejeitado por
  agora, porque o Victor quer que cada um vença com a própria build. Fica como plano B se o simulador não passar.
- **Resolver só com mais vida:** rejeitado sozinho; a vida por nível entra junto com a curva achatada e o custo maior
  do Taijutsu e das Armas.
- **Piso de 250 de vida e teto de 1,6x no dano dos atributos, só no PvP:** rejeitado; o Victor preferiu a vida por
  nível, que vale no jogo todo e segue a progressão.
- **Teto de 1,6x no dano dos atributos para segurar Taijutsu e Armas:** rejeitado; tiraria força de todas as builds de
  dano. No lugar, custo e recarga maiores só para os jutsus desses dois no PvP.
- **Comprimir a curva de tier também no PvE:** rejeitado por agora; o PvE (chefes com 1.000 de vida) foi feito para os
  números atuais.
- **Duelo dentro da arena da vila:** rejeitado; a arena só aceita a vila dona e é pequena para a tela.
- **Fila com instância desde o início:** rejeitado; o servidor não tem instâncias e não há população.
- **Usar `game.pvp_kill` para o duelo:** rejeitado; mexe em karma, recompensa e Akatsuki e conta por abate.
- **Equilibrar pela taxa de vitória por classe:** rejeitado para agora (amostra pequena demais); simulação no lugar.
- **K alto nas 10 primeiras partidas (no lugar do fator do novato):** rejeitado; o Victor escolheu o fator limitado
  nas 30 primeiras partidas, que segue a ideia de "ganha mais e perde menos".
- **Interruptor `duelo` na tabela `game.endgame_modules`:** rejeitado; a tabela só aceita `vilas`, `pvp`, `renegados`
  e `akatsuki` (regra no banco, `db/schema_v11_endgame.sql` linha 28) e é feita para módulos que ligam pela população.
- **Mapa grande do Vale (22 x 16 casas):** rejeitado; não cabe na tela do celular.

## Decisões e próximos passos (Key Decisions & Staging for Next Steps)

**Decidido pelo Victor no brainstorm:** jutsus aprendidos no duelo; melhor de 3 rodadas.

**Decidido pelo Victor depois da revisão (2026-11-01):**

1. **Níveis de uso:** o tier dá poder (curva 1 / 1,15 / 1,3 / 1,45); o nível de uso muda a forma e soma no máximo
   +15%. Nesta entrega, os 4 níveis de hoje dão +0 / +5 / +10 / +15% nas contas entre jogadores. A forma nova, os 3
   níveis (0 / 150 / 600 usos) e o limite por lançamento vêm numa entrega própria.
2. **MMR de prévia do duelo:**
   - começa em 1.000; conta por partida (não por rodada); Elo com K = 24;
   - fator do novato: `f = 1 + 0,5 x (30 - n) / 30`, em que `n` é o número de partidas de duelo do menos experiente;
     só vale enquanto `n` for menor que 30;
   - o menos experiente ganha `f` vezes mais quando vence e perde `f` vezes menos quando perde; o outro segue o Elo
     normal;
   - só conta se a diferença de nível do ninja for de até 15 e no máximo 3 partidas por dia do mesmo par;
   - aparece só no perfil, como "prévia", sem recompensa.
3. **Prioridade:** o PvP passa **na frente de tudo** (cabeça desenhada à mão, site no Floot, salas com imagem e Arco
   1). A ordem é revista quando o critério de pronto for atingido ou em 15/12/2026, o que vier antes.
4. **Interruptor:** `duelo`, em `config.ts` e no Painel do Admin, separado do `pvp` (que liga com 60 jogadores), sem
   mexer no banco.
5. **Escopo da tabela:** todo dano entre jogadores (duelo e Zona de Conflito); o PvE não muda.
6. **Rede de segurança:** adotada (45% da vida em 2 s, por atacante).
7. **Atributos no duelo:** livres (cada um com a própria build).
8. **Vida por nível (ideia do Victor, depois da fase 4):** +6 de vida por nível acima do 1, no jogo todo. O PvE que
   ficar fácil ganha um ajuste próprio depois.
9. **Taijutsu e Armas no PvP:** custo e recarga dos jutsus x4 (Taijutsu) e x2,5 (Armas); o dano por golpe não muda.

**Ordem (esta substitui a ordem das fases do brainstorm):**

1. Vida por nível, tabela de equilíbrio do PvP, função de dano por acerto, orçamento de controle, rede de segurança,
   simulador e teste do PvE (sem migração). Conferir o PvE com a vida nova e anotar o ajuste.
2. Duelo por desafio, melhor de 3, Vale das Estátuas, regras do duelo como perfil e tela do duelo.
   - Migração aditiva v15 (num branch até o Victor rodar no Neon): cria as tabelas de partidas, rodadas e MMR de
     prévia e a função que grava o resultado. Pode rodar de novo sem erro.
   - 2b. MMR de prévia no perfil, depois do duelo funcionar.
3. Noite de duelo marcada com os testadores; depois, o bot de duelo ("ninja sem conexão", só treino).
4. Kits de 4 habilidades para 2 classes, como piloto, descritos como dados.
5. O resto do brainstorm (fila, 3x3, invocações, Campo de Guerra, espectador, Vale completo) quando a população
   chegar a 60 jogadores ativos.
