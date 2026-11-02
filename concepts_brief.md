# Duelo 1x1 equilibrado e rápido (primeira entrega do PvP)

* **Autor:** Victor (dono do projeto), com revisão feita pelo Claude
* **Data:** 01/11/2026 (revisado depois das fases 3, 4 e 5 da revisão, em 02/11/2026)
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
* **Kit:** o conjunto de até 4 jutsus que o ninja leva para lutar. Cada ninja monta 2 kits (A e B) e troca entre eles.
* **Mapa de PvP:** mapa onde jogador acerta jogador: Vale das Estátuas, arena das vilas e Zona de Conflito.
* **Tabela de equilíbrio:** os números do PvP em `pvpBalance.ts` (não confundir com as tabelas do banco).
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

O objetivo é medido assim: nenhuma build vence todas as outras; todo duelo dura de 6 a 30 s, e o meio a meio contra
o meio a meio de 12 a 20 s; ninguém tira mais de 50% da vida do outro em 2 s; ninguém fica sem agir mais de 2,5 s a
cada 15 s. Para isso o dano base cai no jogo todo (jutsus a 40%, Ataque Básico a 50%) e a vida cresce com o nível.
Os números de cada build estão em `revisao_egm/numeros_atributos_pvp.md`.

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

Mesmo assim, com o dano de hoje, o duelo ia de 2 a 11 s e tirava até 100% da vida em 2 s. Com os 2 kits valendo (até
8 jutsus), o Victor decidiu **reduzir o dano base no jogo todo**: jutsus a 40% e Ataque Básico e arma a 50%. Na
simulação, a build de Armas passou a vencer todas as outras pelo Ataque Básico com a Espada Longa; por isso o bônus do
atributo Armas vale pela metade no Ataque Básico. Os números finais estão no objetivo 6 (simulador).

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
banco (`player_jutsus.level`), que também é usada pelo `admin_give_jutsu` (1 a 4). Trocar
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
- O jogador precisa ver: o placar de rodadas, o cronômetro, o kit ativo do adversário com o nível de uso e as recargas
  das técnicas fortes. O aviso no chão de golpe com carga entra quando existir a conjuração com selos (hoje nenhum
  jutsu de jogador tem carga).
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
quem causou mais dano na rodada; se ainda der igual (ou se os dois morrem no mesmo instante), a rodada é repetida uma
vez, e depois vence quem causou mais dano na partida.

### 10. Escopo, população e marca

- Para um desenvolvedor sozinho, o brainstorm completo (36 habilidades novas, invocações, Campo de Guerra, espectador,
  3x3, arenas novas) não cabe numa entrega.
- Sem gente para duelar, a entrega fica parada. A ajuda mais barata é uma **noite de duelo marcada** com os
  testadores. Um **bot de duelo** ajuda no treino, mas não é barato: monstro não usa jutsu de jogador, então o bot
  precisa ser um "ninja sem conexão". Fica para depois da noite de duelo; o equilíbrio é medido pelo simulador.
- Nomes da série original (Vale do Fim, contratos de sapo, Grande Invocação) aumentam o risco de problema com a marca,
  ainda mais com cosméticos pagos. Usamos nomes próprios desde já: **Vale das Estátuas**.

## Objetivos e fora do escopo (Goals vs. Non-Goals)

**Mudanças no jogo todo (valem também contra monstros):**

- **Vida por nível:** +6 de vida por nível acima do 1, somada à Vitalidade (`hpPerLevel: 6` em `combat.attributes`
  no `config.ts`). É código, sem migração: a vida máxima não fica no banco.
- **Dano base menor:** o dano base dos jutsus vai a **40%** e o do Ataque Básico e da arma equipada vai a **50%**
  (`damageScale: { jutsu: 0.4, basic: 0.5 }` no `config.ts`). A vida dos monstros e do Rei Lodo não muda, então o
  PvE fica mais longo (Slime com 6 golpes no nível 1; Rei Lodo com 12 Fogos tier 4 no nível 60).
- **Arma no Ataque Básico:** o bônus do atributo Armas vale pela metade no Ataque Básico (nos jutsus da classe Armas
  vale inteiro). Sem isso, a build de Armas vence todas as outras (`revisao_egm/numeros_atributos_pvp.md`).

Dano de cada habilidade com essas mudanças (nível 1 = tier 1, nível de uso 1, sem pontos; nível 60 = tier 4, nível de
uso 4, 59 pontos no atributo; "contra jogador" já com a curva achatada do PvP):

| Habilidade | Nível 1 | Nível 60 contra monstro | Nível 60 contra jogador |
| --- | --- | --- | --- |
| Fogo (+ queimadura em 3 s) | 10 + 3 | 87 + 30 | 40 + 15 |
| Água | 8 | 70 | 32 |
| Relâmpago | 12 | 105 | 48 |
| Soco (Taijutsu) | 14 | 122 | 56 |
| Kunai (Armas, 1 do leque) | 12 | 106 | 67 |
| Ataque Básico | 11 (Kunai de Treino) | 30 (Espada Longa, 59 em Armas) | 30 |

**Objetivos desta entrega:**

1. **Tabela de equilíbrio do PvP**, com versão, num arquivo próprio (`src/realtime/pvpBalance.ts`). Vale nos **mapas
   de PvP**: Vale das Estátuas, arena das vilas e Zona de Conflito. Contra monstros nada muda. Contém:
   - a curva de tier achatada (1 / 1,15 / 1,3 / 1,45), que nesses mapas vale também para a cura e o escudo da Pedra,
     inclusive em si mesmo;
   - o bônus do nível de uso: +0 / +5 / +10 / +15% nos níveis 1 a 4;
   - o custo e a recarga dos jutsus de Taijutsu (x4) e de Armas (x2,5);
   - o orçamento de controle (objetivo 2) e a rede de segurança (objetivo 3);
   - cada tipo de dano entre jogadores:

     | Tipo de dano | Na tabela? |
     | --- | --- |
     | Jutsu de classe | Sim: curva, nível de uso, custo e recarga |
     | Ataque Básico e arma | Só a rede de segurança |
     | Queimadura | Sim: a força vem do jutsu que aplicou |
     | Combo do molhado (+30% no Relâmpago) | Fica, dentro da rede de segurança |
     | Poderes da Akatsuki | Desligados no duelo; na Zona de Conflito, só a rede de segurança |

2. **Orçamento único de controle por jogador:** soma o tempo sem poder agir de atordoar, prender, sono e os choques da
   paralisia (0,25 s cada); o silêncio conta pela metade. No máximo **1,5 s por aplicação** e **2,5 s em qualquer
   trecho de 15 s** (a janela anda com o tempo). Se sobra só parte do orçamento, o controle novo dura só o que sobra;
   se sobra menos de 0,2 s, não pega (o dano do golpe continua). Conta o tempo que o efeito durou de fato (o sono que
   acaba ao apanhar conta até acordar). A lentidão não conta. Vale **só quando quem causa é jogador** (inclusive
   poder da Akatsuki); controle de monstro segue o `controlDr` de hoje. O `applyStatus` ganha o argumento de quem
   causou (o `applyEffect` já tem). O estado fica na `Session` (`ccLog: { from, until, weight }[]`).
3. **Rede de segurança de dano:** o dano que um jogador recebe de **um** outro jogador, em qualquer trecho de 2 s
   (a janela anda com o tempo), fica limitado a **50% da vida máxima**. Conta o dano depois do escudo e dos Cinco
   Corações. O que passar é cortado. O histórico fica no alvo (`Map<atacante, { t, dano }[]>`, limpo a cada 2 s). No
   passo 1 o total cortado vai para o `PvpStats` (memória) e aparece no Painel do Admin com a versão da tabela; no
   passo 2 vai também para o registro da rodada.
4. **Dano por acerto no PvP:** o `cast()` monta um pacote do golpe (`HitInfo`: jutsu, tier, nível de uso, dano base,
   bônus da arma, atributo, molhado, passiva, clima) e o entrega ao `hitTarget`, ao projétil e à queimadura, que hoje
   recebem só o número pronto. Quando o alvo é jogador num mapa de PvP, o `hitTarget` calcula o dano com a função
   pura `pvpHitDamage(golpe, atacante, alvo, regras)`; quando o alvo é monstro, usa o número de hoje. Ordem: dano do
   PvP, depois escudo e Cinco Corações, depois rede de segurança, depois a vida.
5. **Custo e recarga nos mapas de PvP:** o `cast()` lê o mapa de quem lança: num mapa de PvP, cobra o custo e põe a
   recarga da tabela. O servidor manda ao cliente o custo e a recarga de verdade (hoje o cliente usa os do
   `config`).
6. **Simulador automático no `npm run verify`** (`test/pvpBalance.test.ts`). O orçamento de controle e a rede de
   segurança também são funções puras em `pvpBalance.ts`, para o simulador usar o código de verdade. Como funciona:
   1. 5 builds no nível 60 (59 pontos), cada uma com os 2 kits (8 jutsus):

      | Build | Pontos | Kit A | Kit B |
      | --- | --- | --- | --- |
      | Tanque | 59 Vitalidade | Fogo | Água |
      | Meio a meio | 30 Vitalidade + 29 Ninjutsu | Fogo | Relâmpago |
      | Dano de Ninjutsu | 59 Ninjutsu | Relâmpago | Fogo |
      | Dano de Taijutsu | 59 Taijutsu | Taijutsu | Relâmpago |
      | Dano de Armas | 59 Armas, Espada Longa | Armas | Taijutsu |

   2. Os dois começam com vida e chakra cheios e batem ao mesmo tempo, um toque a cada 0,4 s, sem errar.
   3. Em cada toque: usa o jutsu que mais dá dano, que esteja pronto e caiba no chakra; se nenhum, o Ataque Básico
      (quando a recarga dele deixa). O chakra volta 5 por segundo.
   4. O controle entra pelo orçamento de controle.
   5. Vence quem zera a vida do outro primeiro. Empate no mesmo instante = empate.
   6. Roda também o pior caso de passiva da vila e clima (para a Zona de Conflito).
   - **Passa se:** todo confronto dura de 6 a 30 s; meio a meio contra meio a meio, de 12 a 20 s; nenhuma build vence
     todas as outras; ninguém passa de 50% da vida do alvo em 2 s; ninguém fica mais de 2,5 s sem agir em 15 s.
   - **Se falhar:** mexer primeiro no custo e na recarga da classe que passou do limite; depois no fator de dano;
     por último, o plano B (atributos iguais no duelo).
   - Resultado com os números deste plano (melhor caso para quem ataca):

     | Atacante \ defensor | Tanque | Meio a meio | Build de dano |
     | --- | --- | --- | --- |
     | Tanque | 24,1 s | 20,7 s | 14,2 s |
     | Meio a meio | 20,0 s | 16,8 s | 12,0 s |
     | Dano de Ninjutsu | 18,2 s | 15,7 s | 10,9 s |
     | Dano de Taijutsu | 13,2 s | 11,6 s | 8,0 s |
     | Dano de Armas | 14,2 s | 12,1 s | 8,0 s |

     Maior parte da vida tirada em 2 s: 44%. Vitórias: Meio a meio e Taijutsu vencem 3 das 4 outras; Armas e Tanque,
     1; Ninjutsu, 0. O simulador não conta a distância: o Ninjutsu bate de longe e o Taijutsu precisa chegar perto.
7. **Duelo por desafio:** o botão "Desafiar" e o aceite, entre quaisquer vilas, para ninjas a partir do nível 20 (com
   classe), melhor de 3, no Vale das Estátuas, com as regras da seção "Como funciona por dentro".
8. **Regras do duelo como um perfil** (`DuelRules`), lido pelo combate, e não como `if` espalhado:

   | Regra | No duelo | Onde é lida |
   | --- | --- | --- |
   | Passiva da vila | Não | `passive()` |
   | Clima | Não | `skyEffectsAt()` |
   | Poderes da Akatsuki | Não | `power()` |
   | Chakra volta sozinho | Sim, 1/3 da meditação (5/s sem pontos em Chakra) | tique do jogador |
   | Vida volta sozinha | Não | tique do jogador (`hpRegenPerSec`) |
   | Meditação | Não | início da meditação |
   | Itens de cura | Não | uso de item |
   | Contador de usos | Não sobe | `cast()` |
   | Compensação de lag | 200 ms | `maxRewindMs` |

   O perfil padrão (fora do duelo) tem os valores de hoje.
9. **Os 2 kits valem no duelo:** cada um usa os kits A e B que montou (até 8 jutsus, inclusive da classe secundária e
   da Academia) e pode trocar no meio da luta, como hoje. O chakra segura o abuso.
10. **Tela do duelo:** placar de rodadas, cronômetro e o kit ativo do adversário com nível de uso e recargas (troca
    quando ele troca de kit). O aviso no chão fica para quando existir a conjuração com selos.
11. **Registro de cada partida e rodada no banco** (migração v15): kits, níveis de uso, duração, maior dano em 2 s,
    dano cortado pela rede, controle sofrido, motivo do fim e versão da tabela.
12. **Interruptor `duelo`** em `config.ts`, ligado por padrão, e no Painel do Admin (a troca pelo painel dura até a
    próxima publicação). Se a migração v15 não existir no banco, o duelo fica desligado sozinho e o log avisa (como o
    fim de jogo faz hoje com `to_regclass`).
13. **MMR de prévia** (passo 2c): calculado e gravado a cada partida, aparece só no perfil como "prévia", sem
    recompensa.

**Critério de pronto (técnico):** passos 1 e 2 publicados; o simulador e o teste do PvE passam no `npm run verify`;
pelo menos 20 duelos reais registrados, com a rede de segurança cortando dano em no máximo 1 a cada 10 rodadas.

**Meta de comunidade (medida à parte, não trava a entrega):** uma noite de duelo feita; 10 testadores, com 5 voltando
na semana seguinte.

**Fora do escopo agora:**

- Fila por MMR, pareamento, faixas com nome e recompensas de temporada do duelo (entram com a população).
- Instâncias de mapa, espectadores com atraso, mirante.
- 3x3, invocações, Campo de Guerra, Grande Invocação.
- As 4 habilidades novas por classe, inclusive o piloto com 2 classes (passo 4).
- Bot de duelo (passo 3): monstro não usa jutsu de jogador, então o bot precisa ser um "ninja sem conexão" que usa o
  mesmo `cast()`; serve só de treino.
- Ajuste do PvE (vida por nível e dano menor): tarefa própria, com o que o passo 1 anotar.
- A forma nova de cada jutsu por nível de uso e a troca de 4 para 3 níveis (entrega própria, ver Análise 3).
- Conjuração com selos (0,8 s), aviso no chão, Mundo Falso e esquiva aleatória.
- A "água que sobe" do brainstorm: o desempate por vida resolve o fim da rodada.
- Ligação do PvP com a política (Kage e guerras). Quando entrar, vai em uma direção só: o duelo gera "pontos de vila"
  e a política decide o que fazer com eles.
- História.

## Como funciona por dentro (Proposed Architecture)

Caminho de uma partida:

1. Desafio e aceite (`duel.ts`).
2. Partida e rodadas: o `gameWorld` hospeda a luta com o `DuelRules`; cada acerto passa pelo `hitTarget` e pelo
   `pvpHitDamage`.
3. Resultado gravado no banco (`game.duel_result`).

| Peça | Onde | O que faz |
| --- | --- | --- |
| Etapas da partida | `src/realtime/duel.ts` (novo, com testes) | Convite, aceite, preparação, rodadas, intervalos, desempate, desistência, queda e fim. Não conhece o mapa. |
| Perfil do duelo | `DuelRules` | Lido pelos pontos da tabela do objetivo 8. |
| Tabela de equilíbrio | `src/realtime/pvpBalance.ts` (novo) | Curva, nível de uso, custo e recarga, orçamento de controle, rede de segurança, versão. |
| Dano por acerto | `pvpHitDamage` (função pura) | Usada pelo servidor e pelo simulador. |
| Simulador | `test/pvpBalance.test.ts` | Roda no `npm run verify`. |
| Mapa | `maps.ts`: `valley` (Vale das Estátuas) | Campo novo `duelAreas` (o campo `arenas` exige vila). |
| Registro | `db/schema_v15_duelo.sql` + `game.duel_result` | Grava partida e rodadas numa transação. Não toca karma, recompensa, Akatsuki nem `pvp_kill`. |
| Tela | `public/game.js` | Botão "Desafiar", convite, placar, cronômetro, kit do adversário, câmera fixa. |
| Vida por nível | `stats.ts` e `gameWorld.ts` | `derivedStats` recebe o nível; `computeStats` roda também ao subir de nível. |
| Teste do PvE | `test/pveDamage.test.ts` | Confere o dano contra monstros com o fator novo e prova que o `pvpHitDamage` não toca monstros. |

**Por que a tabela fica fora do `config.ts`:** os números de combate continuam no `config.ts`, mas a tabela do PvP tem
versão e é lida pelo servidor e pelo simulador ao mesmo tempo; a versão gravada em cada rodada aponta para uma
tabela só.

**Ganchos no `gameWorld.ts`:**

| Ponto | Hoje | No duelo |
| --- | --- | --- |
| `canHurt` (~1827) | Fora de arena e Zona, jogador não acerta jogador | Acerta só o par do mesmo duelo (o Fogo e a Ilusão em área não pegam o outro duelo) |
| Vida zerada no `damagePlayer` (~3155) | Morte, aviso, `pvpStats` e renascer na vila | Não morre: avisa o `duel.ts` (`onZeroHp`), que fecha a rodada |
| `leave` (~937) | Apaga a sessão na hora | O `duel.ts` guarda o estado do jogador por 15 s |
| `join` (~774) | Entra na vila com vida cheia | Pergunta ao `duel.ts` se há duelo em andamento e volta à área |
| `transfer` (~1130) | Troca de mapa | Motivo novo `duel`; guarda mapa e posição de antes |

**O que volta ao início em cada rodada:** vida e chakra cheios; recargas zeradas; efeitos, atordoamento, prisão,
escudo, Substituição, Cinco Corações e outros bônus limpos; orçamento de controle e rede de segurança zerados; cada um
no seu ponto de partida da área.

**Mensagens entre o cliente e o servidor** (em `protocol.ts`):

| Mensagem | De quem | Campos | Quando |
| --- | --- | --- | --- |
| `duel_challenge` | cliente | `targetId` | Ao tocar em "Desafiar" no perfil de outro jogador |
| `duel_invite` | servidor | `challengeId`, `from`, `level`, `village`, `expiresInMs` | Para o desafiado |
| `duel_answer` | cliente | `challengeId`, `accept` | Aceitar ou recusar |
| `duel_refused` | servidor | `reason` (`busy`, `full`, `level`, `combat`, `cooldown`, `declined`, `expired`) | Para quem desafiou |
| `duel_state` | servidor | `phase`, `round`, `score`, `endsInMs` | A cada mudança de etapa |
| `duel_opponent_kit` | servidor | `kit: [{ skill, tier, useLevel, readyInMs }]` | Ao trocar de kit e a cada jutsu usado |
| `duel_leave` | cliente | nada | Botão "Desistir" |
| `duel_end` | servidor | `winner`, `reason`, `rounds` | No fim |

O mapa do Vale chega ao cliente pela mensagem de troca de mapa que já existe.

**Banco (`db/schema_v15_duelo.sql`, num branch até o Victor rodar no Neon):** tudo em `BEGIN; ... COMMIT;`, sem
`DO $$`, pode rodar de novo.

- `game.duel_matches`: `id bigserial`, `player_a uuid`, `player_b uuid`, `winner uuid` (vazio se anulada),
  `reason text`, `rounds_a smallint`, `rounds_b smallint`, `balance_version text`, `started_at`, `ended_at`.
- `game.duel_rounds`: `match_id`, `round smallint`, `winner uuid`, `reason text`, `duration_ms int`, `stats jsonb`
  (kits, níveis de uso, maior dano em 2 s, dano cortado e controle sofrido de cada um).
- `game.duel_mmr`: `player_id uuid`, `mmr int default 1000`, `matches int default 0`, `updated_at`. Nasce vazia; a
  conta entra no passo 2c.
- `game.duel_result(p jsonb) returns bigint`, com `CREATE OR REPLACE`: grava a partida e as rodadas numa transação e
  devolve o `id`.
- As listas de migrações dos testes (`test/support/testDb.ts`) passam a incluir a v14 e a v15.
- Se a gravação falhar, a partida termina normalmente para os jogadores e o erro vai para o log.
- O nome "v15" aqui é o do arquivo de migração; a versão do jogo desta entrega é a v28.

**Mapa do Vale das Estátuas:** `valley` em `maps.ts`, 40 x 14 casas: 2 áreas de 18 x 12 com 4 casas de muro entre
elas (pedras e estátuas, tipos que já existem). Cada área tem 2 pontos de partida, a 10 casas um do outro. Só se
entra levado pelo duelo. No cliente, a câmera fica fixa no centro da área (código novo; hoje ela segue o jogador).

**Regras da partida:**

- Desafio: o convite expira em 20 s; cada jogador tem no máximo 1 desafio pendente; depois de uma recusa, a mesma
  pessoa só pode ser desafiada de novo 20 s depois.
- Quem pode: ninjas a partir do nível 20, de qualquer vila (inclusive aliadas, em trégua ou da Akatsuki), fora da Zona
  de Conflito e **fora de combate** (sem dar nem levar dano há 10 s; campo novo na `Session`).
- Ocupação: com as 2 áreas ocupadas, o jogo avisa "Vale cheio" e o desafio não é enviado.
- Entrada e saída: os dois são levados para a área e voltam para onde estavam no fim. Ninguém de fora entra. A única
  saída antes do fim é o botão "Desistir", que conta como derrota da partida.
- Desconexão: o `duel.ts` guarda o estado por 15 s, com o cronômetro parado; depois disso, quem caiu perde a partida.
- **Morte dupla ou empate em tudo** (mesma vida em porcentagem e mesmo dano na rodada): a rodada é repetida uma vez; se
  empatar de novo, vence quem causou mais dano na partida.
- Queda ou publicação do servidor no meio: a partida é anulada e não conta no MMR.
- No duelo ninguém morre de verdade: não perde item, não ganha karma nem recompensa, não conta como abate.

## Riscos e mitigações (Risks & Mitigations)

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| PvE fica lento com o dano menor | Monstros e Rei Lodo cansativos | O passo 1 mede o PvE e anota o ajuste da vida dos monstros (tarefa própria). |
| Vida por nível deixa o PvE fácil | Monstros perdem a graça | O mesmo ajuste acima. |
| `pvpHitDamage` mexer no dano contra monstros | PvE quebrado sem ninguém ver | Só quando o alvo é jogador; teste do PvE. |
| Erro no passo 1 depois de publicado | Combate quebrado para todos | Sem migração no passo 1: volta com `git revert`. Interruptores no `config.ts`: `pvpBalance: false`, `hpPerLevel: 0` e `damageScale` 1. |
| Escopo grande para um desenvolvedor sozinho | Passa de 15/12/2026 | Passo 1 em partes publicáveis; bot e MMR depois; a data revê a ordem, não cobra tudo pronto. |
| Falta gente para duelar | Sem teste real | Noite de duelo marcada; bot depois; a meta de comunidade não trava o pronto técnico. |
| Servidor do Render dormindo | O primeiro espera cerca de 1 min | Aviso na tela de entrada; acordar o servidor antes da noite de duelo. |
| Dupla combinando resultado | MMR falso | No máximo 3 partidas por dia (fuso de São Paulo) do mesmo par contam no MMR; MMR só de prévia. |
| Subir nível de uso em duelo combinado | Vantagem sem jogar | No duelo o contador de usos não sobe. |
| Desafio em excesso | Jogador incomodado | 1 desafio pendente por vez; 20 s de espera depois de uma recusa. |
| MMR inflando com o fator do novato | Pontuação sem sentido | Fator só nas 30 primeiras partidas; o MMR de prévia pode ser recalculado do histórico. |
| Tabela errada em jogo de verdade | Morte em poucos golpes volta | Rede de segurança de 50% em 2 s; os cortes aparecem no Painel do Admin com a versão da tabela. |
| Mudança afetar a Zona de Conflito | Luta em grupo diferente | De propósito; o simulador roda o pior caso de passiva e clima; o efeito na Zona é observado com os testadores. |
| `gameWorld.ts` grande quebrar | Bugs fora do duelo | Etapas em `duel.ts` com testes; ganchos listados acima. |

## Alternativas consideradas (Alternatives Weighed)

- **Todos os jutsus liberados dentro da partida:** daria igualdade total, mas o Victor escolheu lutar com o que cada um
  aprendeu.
- **Todo jutsu aprendido no nível de uso máximo dentro do duelo:** tira a vantagem do tempo de jogo; plano B se o
  bônus de +15% não bastar.
- **Atributos iguais para todos no duelo:** plano B, usado só se o simulador falhar depois dos ajustes de custo,
  recarga e dano.
- **Só um kit travado no duelo:** rejeitado; o Victor quer os 2 kits, e o dano base menor e o chakra seguram o abuso.
- **Redução do dano só no PvP:** rejeitado; o Victor quer o dano base menor no jogo todo.
- **Reduções de 60%, 50%, 30% e 25%:** 60% e 50% ainda tiram mais de 50% da vida em 2 s; 30% e 25% deixam o duelo e o
  PvE lentos demais (números em `revisao_egm/numeros_atributos_pvp.md`).
- **Piso de 250 de vida e teto de 1,6x nos atributos, só no PvP:** rejeitado; o Victor preferiu a vida por nível.
- **Teto de 1,6x nos atributos para segurar Taijutsu e Armas:** rejeitado; tiraria força de todas as builds de dano.
- **Comprimir a curva de tier também no PvE:** rejeitado por agora.
- **Duelo dentro da arena da vila:** rejeitado; a arena só aceita a vila dona e é pequena para a tela.
- **Fila com instância desde o início:** rejeitado; o servidor não tem instâncias e não há população.
- **Usar `game.pvp_kill` para o duelo:** rejeitado; mexe em karma, recompensa e Akatsuki e conta por abate.
- **Equilibrar pela taxa de vitória por classe:** rejeitado para agora (amostra pequena demais).
- **K alto nas 10 primeiras partidas:** rejeitado; o Victor escolheu o fator do novato nas 30 primeiras.
- **Interruptor `duelo` na tabela `game.endgame_modules`:** rejeitado; ela só aceita `vilas`, `pvp`, `renegados` e
  `akatsuki` (`db/schema_v11_endgame.sql` linha 28).
- **Mapa grande do Vale (22 x 16 casas por área):** rejeitado; não cabe na tela do celular.

## Decisões e próximos passos (Key Decisions & Staging for Next Steps)

**Decidido pelo Victor no brainstorm:** jutsus aprendidos no duelo; melhor de 3 rodadas.

**Decidido pelo Victor na revisão (01/11/2026 e 02/11/2026):**

1. **Tier e nível de uso:** o tier dá poder (curva 1 / 1,15 / 1,3 / 1,45 nos mapas de PvP); nesta entrega os 4
   níveis de uso dão +0 / +5 / +10 / +15% nesses mapas. A forma nova, os 3 níveis (0 / 150 / 600 usos) e o limite por
   lançamento vêm numa entrega própria.
2. **MMR de prévia (passo 2c):**
   - começa em 1.000; conta por partida; Elo com escala 400 e K = 24;
   - fator do novato: `f = 1 + 0,5 x (30 - n) / 30`, em que `n` é o número de partidas de duelo do menos experiente;
     vale enquanto `n` for menor que 30; com `n` igual, não vale;
   - o menos experiente ganha mais e perde menos: ganho x `f`, perda ÷ `f`. Exemplo com `n` = 0 (`f` = 1,5): se o Elo
     daria +12, ele ganha +18; se daria -12, ele perde -8. O outro segue o Elo normal;
   - só conta com diferença de nível do ninja de até 15 e até 3 partidas por dia do mesmo par;
   - aparece só no perfil, como "prévia", sem recompensa.
3. **Prioridade:** o PvP passa na frente de tudo. A ordem é revista no critério de pronto ou em 15/12/2026, o que vier
   antes.
4. **Interruptor `duelo`:** no `config.ts` e no Painel do Admin, separado do `pvp` (que liga com 60 jogadores), sem
   banco.
5. **Escopo da tabela:** todo dano, cura e controle nos mapas de PvP (Vale, arena das vilas, Zona de Conflito).
6. **Rede de segurança:** 50% da vida em 2 s, por atacante.
7. **Atributos no duelo:** livres.
8. **Vida por nível:** +6 por nível acima do 1, no jogo todo.
9. **Taijutsu e Armas nos mapas de PvP:** custo e recarga x4 e x2,5.
10. **Dano base no jogo todo:** jutsus a 40%, Ataque Básico e arma a 50%; os monstros ficam como estão.
11. **Os 2 kits valem no duelo**, com troca livre.
12. **Empate:** a rodada é repetida uma vez; depois, vence quem causou mais dano na partida.

Proposta do Claude, confirmada pelo simulador: o bônus do atributo Armas vale pela metade no Ataque Básico.

**Ordem (substitui a ordem das fases do brainstorm):**

1. **Equilíbrio, sem migração.** Cada parte é publicada sozinha, com o `npm run verify` passando:
   - 1a. Teste do PvE (`test/pveDamage.test.ts`) com os números de hoje: cada jutsu de dano, tier 1 e 4, nível de uso 1
     e 4, com 0 e 59 pontos, e o Ataque Básico com e sem arma, contra um monstro fixo.
   - 1b. Dano base menor e bônus de Armas pela metade no Ataque Básico; o teste da 1a passa a esperar os números
     novos; anotar o PvE (Slime, Rei Lodo).
   - 1c. Vida por nível: `derivedStats(base, regras, atributos, nível)`; `computeStats` recebe o nível e roda também
     ao subir de nível; a vida atual ganha os +6 na subida; atualizar `test/v8.test.ts` (linhas 200 e 232).
   - 1d. `pvpBalance.ts`, `HitInfo` e `pvpHitDamage` ligados ao `hitTarget`, ao projétil e à queimadura; custo e
     recarga nos mapas de PvP, com o cliente lendo os valores do servidor.
   - 1e. Orçamento de controle.
   - 1f. Rede de segurança.
   - 1g. Simulador.
2. **Duelo.**
   - 2a. Migração `db/schema_v15_duelo.sql` (o Victor roda no Neon primeiro).
   - 2b. `duel.ts`, `DuelRules`, ganchos no `gameWorld`, mensagens, mapa `valley`, tela do duelo e registro.
   - 2c. MMR de prévia no perfil.
3. Noite de duelo com os testadores; depois, o bot de duelo ("ninja sem conexão", só treino).
4. As 4 habilidades novas para 2 classes, como piloto, descritas como dados.
5. O resto do brainstorm (fila, 3x3, invocações, Campo de Guerra, espectador, Vale completo) quando a população
   chegar a 60 jogadores ativos.
