# Duelo 1x1 equilibrado e rápido (primeira entrega do PvP)

* **Autor:** Victor (dono do projeto), com revisão feita pelo Claude
* **Data:** 2026-11-01 (revisado depois da fase 3 da revisão)
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

## Visão geral (Overview)

O PvP de hoje tem um problema medido no código: o dano dos jutsus de tier alto é tão grande que, no nível 60, só uma
build funciona (tudo em Vitalidade). Um golpe ou dois matam, então a luta não tem escolhas.

O jogo está em pré-alpha, com cerca de 3 testadores. Fila por MMR, 3x3, invocações e Campo de Guerra ainda não têm
quem jogue.

Por isso a primeira entrega é só o **duelo 1x1 por desafio**: um jogador desafia, o outro aceita, e os dois lutam em
melhor de 3 rodadas num mapa de duelo fixo. Cada um usa os jutsus que já aprendeu (decisão do Victor). O dano e o
controle entre jogadores passam a seguir uma **tabela de equilíbrio do PvP**, conferida por um **simulador
automático** a cada `npm run verify`.

O objetivo é medido assim: mais de uma build vence; o tempo para matar fica entre 6 e 10 s; ninguém fica sem agir mais
de 2,5 s a cada 15 s.

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

Conclusão: o "orçamento de dano" do brainstorm precisa virar números e um teste. Dar mais vida não resolve, porque o
problema está nos multiplicadores.

### 2. O controle decide a luta sozinho (confirmado no código)

O tier também multiplica o controle (`TIER.control` até 1,7x): a Ilusão tier 4 atordoa 5,1 s e a Sombra tier 4 prende
8,5 s.

O limite de controle de hoje (`controlDr` em `config.ts`, aplicado em `applyStatus` no `gameWorld.ts`, perto da linha
2001) tem dois furos:

- só cobre **atordoar** e **prender**, e cada um tem contador próprio: um atordoamento seguido de uma prisão valem
  inteiros;
- o sono (4 s), o silêncio (3 s) e a paralisia passam por `effects.ts` **sem limite nenhum**.

Com tempo para matar de 6 a 10 s, um atordoamento de 5 s já decide a luta.

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
- Esse limite vale **por lançamento**: soma o dano de todos os projéteis e da queimadura que o jutsu deixa. Exemplo: 3
  bolas de 38% do dano de uma bola cada somam 114%, dentro do limite; 3 bolas de 40% somariam 120% e passariam.

Hoje o código tem 4 níveis de uso (0 / 100 / 500 / 2.000 usos, +10% de dano cada), gravados numa coluna gerada do
banco (`player_jutsus.level`), que também é lida por `ninjaStore.ts`, `findPlayer.ts` e `admin_give_jutsu`. Trocar
isso no jogo todo mudaria o PvE e o nível de quem já joga. Por isso a mudança vem em dois passos:

1. **Nesta entrega:** os 3 níveis de uso valem **só nas contas de jogador contra jogador**. Eles são calculados a
   partir do contador de usos que já existe (0 / 150 / 600 usos). O banco, o PvE e o progresso salvo não mudam.
2. **Entrega própria, depois:** a forma nova de cada jutsu (com a lista de jutsus, a arte no cliente e a conversão de
   quem já joga) e a troca de 4 para 3 níveis no jogo todo.

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
  mais que a build. No duelo, o chakra volta sozinho **2 + 0,1 por ponto investido em Chakra, por segundo**, e o
  atributo continua valendo.
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

Desempate de uma rodada que chega aos 50 s: vence quem tem **mais vida restante em porcentagem**; se der igual, vence
quem causou mais dano na rodada.

### 10. Escopo, população e marca

- Para um desenvolvedor sozinho, o brainstorm completo (36 habilidades novas, invocações, Campo de Guerra, espectador,
  3x3, arenas novas) não cabe numa entrega.
- Sem gente para duelar, a entrega fica parada. Duas ajudas baratas: um **bot de duelo** (a máquina de estados dos
  monstros com o kit de uma classe), que serve de treino e de teste do equilíbrio, e uma **noite de duelo marcada**
  com os testadores.
- Nomes da série original (Vale do Fim, contratos de sapo, Grande Invocação) aumentam o risco de problema com a marca,
  ainda mais com cosméticos pagos. Usamos nomes próprios desde já: **Vale das Estátuas**.

## Objetivos e fora do escopo (Goals vs. Non-Goals)

**Objetivos desta entrega:**

1. **Tabela de equilíbrio do PvP**, versionada, num arquivo próprio (`src/realtime/pvpBalance.ts`). Vale para **todo
   dano e controle de jogador em jogador** (duelo e Zona de Conflito); contra monstros nada muda. Contém:
   - a curva de tier achatada (1 / 1,15 / 1,3 / 1,45);
   - o limite do nível de uso: +15% por lançamento sobre o nível 1;
   - o orçamento de controle (objetivo 2);
   - a rede de segurança de dano (objetivo 3).
2. **Orçamento único de controle por jogador:** soma o tempo sem poder agir de atordoar, prender, sono e os choques da
   paralisia; o silêncio conta pela metade (dá para andar e bater). No máximo **1,5 s por aplicação** e **2,5 s a cada
   15 s**. Passou disso, o controle novo não pega (o dano do golpe continua). A lentidão não conta.
3. **Rede de segurança de dano no servidor:** o dano que um jogador recebe de outro jogador, num trecho qualquer de 2
   s, fica limitado a **45% da vida máxima**, contando cada atacante separado. O que passar é cortado e registrado
   no Painel do Admin com a versão da tabela.
4. **Uma função pura de dano por acerto** (`pvpHitDamage`: atacante, alvo, jutsu, tier, nível de uso e regras), usada
   pelo servidor e pelo simulador. O dano passa a ser calculado **por alvo atingido**, e não uma vez por lançamento
   antes de saber quem foi atingido (como faz hoje o `gameWorld.ts`, perto da linha 1600).
5. **Simulador automático no `npm run verify`** (teste em `test/pvpBalance.test.ts`):
   - 4 builds de referência no nível 60, com os pontos do nível 60: **vida** (Vitalidade alta), **meio a meio**,
     **ataque** (Ninjutsu ou Taijutsu alto) e **armas** (Armas e Agilidade altas);
   - cada build com o kit de 4 jutsus mais forte que a classe dela consegue aprender, em todos os tiers e níveis de
     uso;
   - cada build luta contra as 4 builds (incluindo ela mesma), com o chakra do duelo.
   - **Passa se:** em todos os confrontos, o tempo para matar fica entre 6 e 10 s; nenhuma build vence as outras 3;
     nenhuma sequência passa de 45% da vida do alvo em 2 s (antes da rede de segurança); ninguém fica mais de 2,5 s
     sem agir em 15 s; o kit cabe no chakra de uma rodada de 50 s.
6. **Duelo por desafio:** o botão "Desafiar" e o aceite, entre quaisquer vilas, para ninjas a partir do nível 20 (com
   classe). Melhor de 3, no Vale das Estátuas, com placar de rodadas, cronômetro, desempate e as regras de borda da
   seção "Como funciona por dentro".
7. **Regras do duelo como um perfil passado ao combate** (`DuelRules`), não como `if` espalhado: sem passiva da vila,
   sem clima, chakra que volta sozinho, sem meditação, sem itens de cura, compensação de lag de 200 ms, nível de uso
   que não sobe.
8. **Tela do duelo:** kit do adversário com nível de uso e recargas, aviso no chão de todo golpe com carga, placar e
   cronômetro.
9. **Registro de cada partida e rodada no banco:** classe, kit, nível de uso, duração, maior dano em 2 s, controle
   sofrido, motivo do fim e versão da tabela.
10. **MMR de prévia:** calculado e gravado a cada partida, aparece só no perfil como "prévia", sem recompensa.
11. **Bot de duelo** para treino e teste.
12. **Interruptor `duelo`** em `config.ts` e no Painel do Admin, que funciona com poucos jogadores.

**Critério de pronto:** o simulador passa no `npm run verify`; pelo menos 20 duelos reais registrados, sem a rede de
segurança cortar dano em mais de 1 a cada 10 rodadas; uma noite de duelo feita; meta de comunidade de 10 testadores,
com 5 voltando na semana seguinte.

**Fora do escopo agora:**

- Fila por MMR, pareamento, faixas com nome e recompensas de temporada do duelo (entram com a população).
- Instâncias de mapa, espectadores com atraso, mirante.
- 3x3, invocações, Campo de Guerra, Grande Invocação.
- Os kits de 4 habilidades novas por classe, inclusive o piloto com 2 classes (é o passo 4 da ordem).
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
            (duel.ts)        (gameWorld + DuelRules + pvpHitDamage)   (game.duel_result)
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
| Bot | máquina de estados dos monstros | Usa o kit de uma classe; as rodadas do bot são gravadas marcadas como "bot" e não contam no MMR. |

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
- Desconexão: 15 s para voltar; depois disso, quem caiu perde a partida. Sair de propósito conta como derrota.
- Publicação do servidor (ou queda do servidor) no meio: a partida é anulada e não conta no MMR.
- Morte no duelo não tira item, não dá karma nem recompensa e não conta como abate.

## Riscos e mitigações (Risks & Mitigations)

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Falta gente para duelar | A entrega fica sem teste real | Bot de duelo; noite de duelo marcada; meta de 10 testadores no critério de pronto. |
| Servidor do Render dormindo | O primeiro jogador espera o servidor acordar | Aviso na tela de entrada; na noite de duelo, acordar o servidor antes. |
| Registro só na memória | Dados perdidos a cada publicação | Partidas e rodadas gravadas no banco (migração v15). |
| Dupla combinando resultado | MMR falso | O mesmo par conta no máximo 3 partidas por dia no MMR; o MMR é só prévia, sem recompensa. |
| Subir nível de uso em duelo combinado | Vantagem sem jogar de verdade | No duelo o contador de usos não sobe. |
| Desafio em excesso (assédio) | Jogador incomodado | 1 desafio pendente por vez; 20 s de espera depois de uma recusa. |
| MMR inflando com o fator do novato | Pontuação sem sentido | Fator só nas 30 primeiras partidas do menos experiente; MMR de prévia pode ser recalculado do histórico. |
| Tabela errada em jogo de verdade | Morte em um golpe volta | Rede de segurança de 45% em 2 s; cada corte vai para o Painel do Admin com a versão da tabela. |
| Mudança na tabela afetar a Zona de Conflito | Luta em grupo fica diferente | A tabela vale para todo dano entre jogadores de propósito; o registro mostra o efeito. |
| `gameWorld.ts` grande quebrar | Bugs fora do duelo | Etapas em `duel.ts` com testes; o `gameWorld` só chama. |

## Alternativas pesadas (Alternatives Weighed)

- **Todos os jutsus liberados dentro da partida:** daria igualdade total, mas o Victor escolheu lutar com o que cada um
  aprendeu. Compensado pela curva achatada e pelo limite do nível de uso.
- **Todo jutsu aprendido luta no nível de uso máximo dentro do duelo:** tira a vantagem do tempo de jogo; fica como
  plano B se o limite de +15% não bastar.
- **Atributos iguais para todos no duelo:** tiraria os atributos da conta e facilitaria o equilíbrio. Rejeitado por
  agora, porque o Victor quer que cada um vença com a própria build. Fica como plano B se o simulador não passar.
- **Resolver só com atributos (mais vida):** rejeitado; o problema está nos multiplicadores do dano.
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

1. **Níveis de uso:** o tier dá poder (curva 1 / 1,15 / 1,3 / 1,45); o nível de uso muda a forma e soma no máximo +15%
   por lançamento. 3 níveis calculados pelo contador de usos (0 / 150 / 600). Nesta entrega, só nas contas entre
   jogadores; a forma nova e a troca no jogo todo vêm numa entrega própria.
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

**Ordem (esta substitui a ordem das fases do brainstorm):**

1. Tabela de equilíbrio do PvP, função de dano por acerto, orçamento de controle, rede de segurança e simulador (sem
   migração).
2. Duelo por desafio, melhor de 3, Vale das Estátuas, regras do duelo como perfil e tela do duelo.
   - Migração aditiva v15 (num branch até o Victor rodar no Neon): cria as tabelas de partidas, rodadas e MMR de
     prévia e a função que grava o resultado. Pode rodar de novo sem erro.
3. Bot de duelo e noite de duelo marcada com os testadores.
4. Kits de 4 habilidades para 2 classes, como piloto, descritos como dados.
5. O resto do brainstorm (fila, 3x3, invocações, Campo de Guerra, espectador, Vale completo) quando a população
   chegar a 60 jogadores ativos.
