# Revisão EGM, fase 5, 2ª rodada: pronto para construir?

**Alvo:** `concepts_brief.md`, linhas 234 a 567, com o resto do documento como contexto. Tudo foi conferido no código
do branch `brainstorm-pvp-invocacoes` (commit `eb87e41`).

**Pergunta central:** um desenvolvedor sozinho consegue codar os passos 1a a 1g e 2a a 2c sem decidir nada de design?

**Resposta curta:** ainda não por completo, mas está perto. Nenhum bloqueador. O passo 1 dá para codar, com 7 pontos
pequenos de regra para fechar (I1 a I7). O passo 2 ainda deixa decisões no 2b: o que se guarda na desconexão, o que se
pode fazer na preparação, os testes e as partes do 2b (I8 a I10).

Contagem: 1ª rodada, 13 de 18 fechados e 5 abertos em parte. Achados novos: 0 bloqueadores, 10 importantes, 13
detalhes.

---

## Achados da 1ª rodada: fechado ou aberto

| # | Achado (1ª rodada) | Situação | Motivo |
| --- | --- | --- | --- |
| B1 | `pvpHitDamage` não encaixa | FECHADO | Pacote `HitInfo` no `cast()`, levado ao `hitTarget`, ao projétil e à queimadura; só quando o alvo é jogador; ordem escrita (objetivo 4). Sobram 3 pontos finos: ver I3. |
| B2 | Custo e recarga x4 e x2,5 sem regra | ABERTO em parte | A regra existe (pelo mapa), mas a arena não é um mapa: é uma área dentro do mapa da vila. E não diz por qual mensagem o cliente recebe o custo e a recarga do PvP. Ver I1. |
| B3 | Simulador falhava e não tinha algoritmo | FECHADO | Dano base menor, rede a 50%, critério novo e algoritmo em 6 passos. Problemas novos criados pela correção: ver I4 e I5. |
| B4 | Regras da rodada e ganchos | FECHADO | Tabela de ganchos (`canHurt`, `damagePlayer`, `leave`, `join`, `transfer`, linhas conferidas), o que volta ao início, 15 s, "fora de combate" = 10 s, "Desistir", empate. Falta o conteúdo do estado guardado: ver I8. |
| B5 | Mensagens cliente e servidor | FECHADO | Tabela com 8 mensagens, campos e quando. Pequenas faltas em D6. |
| B6 | Migração v15 sem esquema | FECHADO | Arquivo, 3 tabelas, função, regras do Neon, listas de teste (a lista em `test/support/testDb.ts:10` para mesmo na v13), duelo desligado sem a migração. Falta o nível dos jogadores: ver I10. |
| 7 | Passo 1 grande demais | FECHADO | 1a a 1g, cada um publicável. O 2b ficou grande: ver I9. |
| 8 | Vida por nível no código | FECHADO | `hpPerLevel: 6` em `combat.attributes`, `derivedStats` com o nível, recálculo na subida, vida atual sobe, `test/v8.test.ts` 200 e 232. Detalhe em D8. |
| 9 | Orçamento de controle | ABERTO em parte | Janela deslizante, sobra parcial, mínimo de 0,2 s, estado `ccLog`, choque da paralisia, Akatsuki e `applyStatus` com quem causou: tudo escrito. Falta a regra para controles ao mesmo tempo (Ilusão tier 3 e 4): ver I6. |
| 10 | Rede de segurança | FECHADO | Janela deslizante, por atacante, depois do escudo e dos Cinco Corações, histórico no alvo, `PvpStats` no passo 1. |
| 11 | `DuelRules` | FECHADO | Tabela com regra, valor no duelo e onde é lida. Uma linha aponta para código que não existe: D3. |
| 12 | Kit do duelo | FECHADO | Decisão do Victor: os 2 kits valem, troca livre. |
| 13 | Mapa do Vale | FECHADO | `valley`, 40 x 14, 2 áreas de 18 x 12, muro de 4 casas, `duelAreas`, pontos de partida, câmera fixa, `canHurt` separa os 2 duelos. Detalhe em D4. |
| 14 | Volta atrás do passo 1 | FECHADO | `git revert` e interruptores no `config.ts`. Detalhe em D7. |
| 15 | Tela e fluxo do desafio | ABERTO em parte | Diz o que aparece, mas não onde fica na tela do celular deitado nem como é o convite. Ver D12. |
| 16 | Casos do teste do PvE | FECHADO | Lista no 1a. Detalhe em D9. |
| 17 | Cura e escudo na curva | ABERTO em parte | Diz quando vale (mapas de PvP, inclusive em si mesmo), mas a curva não se aplica ao escudo do jeito escrito, e a cura não diz se leva o bônus de uso e o dano base menor. Ver I7. |
| 18 | Estilo, o que confunde | ABERTO em parte | Glossário, exemplo do fator, "Alternativas consideradas" e datas: feitos. "Passo 2" ainda tem dois sentidos (linha 148) e a Decisão 5 ainda diz mais que a tabela do objetivo 1. Ver D1 e D2. |

---

## Achados novos

### Bloqueadores

Nenhum.

### Importantes

#### I1. "Mapa de PvP" não serve para a arena, e o cliente não sabe o custo e a recarga do PvP

- **Onde:** glossário (linha 31), objetivo 1 (linha 260), objetivo 5 (linha 294), passo 1d (linha 555).
  `gameWorld.ts:1813` (`canHurt` usa `arenaAt`), `maps.ts:1286` (`arenaAt`), `gameWorld.ts:719` (`worldInfo`
  manda `skills` com `cost` e `cooldownMs`), `public/game.js:2841` e `:2856` (o cliente lê de `state.world.skills`).
- **Problema:** a arena é uma área dentro do mapa da vila (`layout.arenas`), não um mapa. Se o `cast()` olhar "o mapa
  de quem lança", o Taijutsu custa 4 vezes mais na vila inteira, fora da cerca também. Se olhar a posição, entrar e
  sair da arena muda o custo sem troca de mapa, e nenhuma mensagem avisa o cliente. O plano diz "o servidor manda ao
  cliente o custo e a recarga de verdade", mas não diz em qual mensagem nem em qual campo.
- **Recomendação:** escrever uma função só, `inPvpArea(s)`: verdadeira dentro de uma `duelAreas` do Vale, dentro de
  `arenaAt(...)` ou num mapa com `layout.conflict`. O `cast()` e o `hitTarget` usam essa função. O `welcome` manda,
  junto de `skills`, um campo novo `pvpSkills: Record<Skill, { cost, cooldownMs }>`; o cliente usa `pvpSkills` quando
  o próprio ninja está numa dessas áreas (ele já tem os layouts com as arenas). Trocar "mapa de PvP" por "área de PvP"
  no glossário.

#### I2. O dano base menor e a vida por nível quebram muitos testes que o plano não lista

- **Onde:** passos 1b e 1c (linhas 551 a 554); `damageScale` no objetivo "Mudanças no jogo todo". Testes que usam o
  `REALTIME` de verdade (`test/support/world.ts:2` e `:43`) e conferem dano pelo número da configuração:
  `test/combat.test.ts` (linhas 110, 136, 140, 165, 183, 379, 411, 433, 484, 501), `test/hitbox.test.ts:296`,
  `test/lagComp.test.ts:82` e `:90`, `test/v15.test.ts:113`, `:116` e `:190` (arena), `test/v16.test.ts`,
  `test/combateLivre.test.ts`, `test/efeitosIa.test.ts`, `test/v7.test.ts`.
- **Problema:** o plano põe `damageScale: { jutsu: 0.4, basic: 0.5 }` no `config.ts`, mas não diz onde o fator entra.
  Se entrar no `cast()` e no `basicAttack()`, todo teste que espera `SK.fire.damage` (25) ou `BA.damage` (12) passa a
  ver 10 ou 6 e falha. Se entrar na tabela dos jutsus (`skillConfig`), esses testes continuam iguais, mas o
  interruptor `damageScale` 1 não muda nada em tempo de execução e a arma equipada (que também cai a 50%) fica de
  fora. O 1b só manda atualizar o teste do 1a. O mesmo vale para o 1c: qualquer teste que entra com `level` maior que
  1 e confere a vida (por exemplo `test/v8.test.ts:194`, nível 11) muda.
- **Recomendação:** decidir e escrever: o fator entra no `cast()` (sobre `cfg.damage`, a queimadura e a arma do
  jutsu de Armas) e no `basicAttack()` (sobre o golpe e a arma), antes dos atributos, com `Math.round` no fim (os
  números da tabela do objetivo batem assim). Os testes antigos passam a esperar `Math.round(SK.x.damage * 0.4)` por
  um helper em `test/support/`. Listar no 1b e no 1c os arquivos de teste acima como "muda de propósito".

#### I3. `HitInfo`: três pontos sem regra

- **Onde:** objetivo 4 (linha 289), passo 1d. `jutsus.ts:154` (`out.damage = base x TIER.power`),
  `gameWorld.ts:1721` a `:1733` (combo do molhado, por alvo), `gameWorld.ts:2098` (queimadura vira efeito) e
  `:1935` (`tickEffects` chama o `damagePlayer` direto, sem passar pelo `hitTarget`).
- **Problema:**
  - "Dano base" é ambíguo: `combat.skills[x].damage` já vem multiplicado pelo tier de hoje (Fogo tier 4 = 70). Quem
    pegar esse número e aplicar a curva achatada multiplica o tier duas vezes.
  - O `cast()` monta o pacote uma vez, mas o molhado é de cada alvo (o Relâmpago confere alvo por alvo).
  - A queimadura não passa pelo `hitTarget`: ela é guardada como efeito com o número pronto e tirada a cada 1 s pelo
    `tickEffects`. "O `hitTarget` calcula o dano" não cobre a queimadura.
- **Recomendação:** escrever: `HitInfo.base = BASE_SKILLS[mecânica].damage` (tier 1) e `HitInfo.tier` de
  `JUTSU_BY_CODE`; o `pvpHitDamage` aplica a curva 1 / 1,15 / 1,3 / 1,45 sobre essa base. O molhado entra por alvo
  (`{ ...hit, wet }`). A queimadura do PvP é calculada no `impact()`, por alvo, quando o alvo é jogador numa área de
  PvP, e o número já calculado vai para o efeito (o `tickEffects` não muda).

#### I4. O resultado esperado do simulador não sai do algoritmo escrito, e dois confrontos estão empatados

- **Onde:** objetivo 6 (linhas 297 a 330); `revisao_egm/numeros_atributos_pvp.md`, "Escolha final".
- **Problema:**
  - A tabela foi feita com a conta de um lado só ("melhor caso para quem ataca": só o atacante bate, sem controle).
    O algoritmo escrito faz os dois baterem ao mesmo tempo, com o orçamento de controle. Os números do teste vão ser
    outros.
  - Taijutsu contra Armas dá 8,0 s contra 8,0 s, e Tanque contra Armas dá 14,2 s contra 14,2 s. O "Taijutsu vence 3
    das 4" depende desse empate exato. O Taijutsu leva Relâmpago no kit B (atordoa e paralisa) e as Armas não levam
    controle nenhum. Na luta dos dois lados, o Taijutsu tende a ganhar das Armas e então vence as 4: o critério
    "nenhuma build vence todas as outras" falha, e o 1g não passa no `npm run verify`.
  - "Se falhar: mexer primeiro no custo e na recarga" não diz quanto. Escolher o número novo é decisão de jogo.
- **Recomendação:** antes de codar o 1g, rodar o algoritmo escrito num rascunho e pôr a tabela nova no plano. Definir
  empate no simulador: diferença menor que 0,4 s (um toque) conta como empate, e "vencer todas" exige vencer as 4 sem
  empate. Dar o passo do ajuste: por exemplo, a recarga da classe que passou do limite sobe 0,5 (x4 vira x4,5), uma
  vez por rodada do teste, e cada mudança vai para o Victor aprovar. **[Decisão do Victor]**

#### I5. Dois critérios do simulador sempre passam

- **Onde:** objetivo 6, "Passa se" (linha 315); objetivos 2 e 3.
- **Problema:** o plano manda o simulador usar as funções de verdade do orçamento de controle e da rede de segurança.
  Com elas ligadas, "ninguém passa de 50% da vida em 2 s" e "ninguém fica mais de 2,5 s sem agir em 15 s" passam
  sempre, porque são os próprios cortes. O teste não pega uma tabela errada.
- **Recomendação:** o simulador mede o dano em 2 s **antes** da rede e conta os cortes. Critério: o maior dano em 2 s
  antes do corte fica abaixo de 50% (assim a rede quase nunca corta, como pede o critério de pronto). Para o controle,
  medir o controle pedido antes do orçamento e aceitar no máximo 1 corte por rodada simulada. Para o orçamento e a
  rede em si, testes de unidade próprios (ver I9).

#### I6. Orçamento de controle: controles ao mesmo tempo não têm regra

- **Onde:** objetivo 2 (linhas 277 a 283). `gameWorld.ts:1735` a `:1740`: a Ilusão tier 3 e 4 aplica o atordoamento
  e, no mesmo instante, um silêncio que dura o atordoamento mais 3 s ou 4,5 s. `effects.ts:51`: a paralisia dá choques
  durante 2 a 3,4 s.
- **Problema:** com o `ccLog: { from, until, weight }[]`, o desenvolvedor precisa decidir se o trecho em que o ninja
  está atordoado e silenciado ao mesmo tempo conta 1 + 0,5 ou só 1. Também não diz se o "1,5 s por aplicação" vale
  para o tempo real ou para o tempo com peso (um silêncio de 9,6 s pesa 4,8). E, quando o atordoamento é cortado para
  1,5 s, se o silêncio, que foi calculado como "atordoamento + 4,5 s", encolhe junto.
- **Recomendação:** escrever: conta a **união** (a cada instante vale o maior peso ativo, não a soma); o teto de 1,5 s
  por aplicação é sobre o tempo com peso; na Ilusão, o silêncio começa quando o atordoamento cortado acaba e passa
  pelo orçamento como uma aplicação própria. Pôr um exemplo com números (Ilusão tier 4 com orçamento cheio: atordoa
  1,5 s, silêncio de 2 s com peso 1,0; sobra 0).

#### I7. Escudo e cura na curva achatada

- **Onde:** objetivo 1 (linha 262), Decisão 5 (linha 535). `jutsus.ts:102` (`shield: [0.5, 0.6, 0.7, 0.8]`) e `:165`;
  `gameWorld.ts:1766` (escudo) e `:1770` (cura com `jutsuPower` e passiva).
- **Problema:** o escudo da Pedra é a fração do golpe que some (50% a 80%), não um multiplicador de poder. "Curva 1 /
  1,15 / 1,3 / 1,45 no escudo" não tem conta direta (0,5 x 1,45 = 0,725?). Na cura, não diz se o bônus de uso do PvP
  (+0 a +15%) troca o de hoje (+0 a +30%), nem se o dano base menor (40%) vale para a cura. A cura e a Pedra também
  ficam fora das builds do simulador, então nada confere esses números.
- **Recomendação:** dar os números do escudo nas áreas de PvP (por exemplo 0,5 / 0,55 / 0,6 / 0,65) e escrever: a
  cura usa a curva achatada e o bônus de uso do PvP, sem o fator de 40%. **[Decisão do Victor]**

#### I8. Desconexão, preparação e intervalo: o que acontece com os dois ninjas

- **Onde:** "Regras da partida" (linha 465), tabela de ganchos (`leave` e `join`), Análise 9 (linha 213).
  `gameWorld.ts:938` (`leave` apaga a sessão), `:774` (`join` monta a sessão nova do banco), `:1935` (efeitos
  continuam no `tickEffects`).
- **Problema:**
  - "O `duel.ts` guarda o estado por 15 s" não diz qual estado. Na volta, o `join` cria uma sessão nova com vida e
    chakra cheios. Falta a lista: vida, chakra, recargas, efeitos, kit ativo, orçamento, rede e posição.
  - Com o cronômetro parado, o adversário continua no mapa: a queimadura nele continua tirando vida? As recargas dele
    continuam andando? Pode zerar a vida dele pela queimadura de quem caiu?
  - Na preparação de 10 s e no intervalo de 5 s: dá para andar, trocar de kit, lançar jutsu? O `canHurt` acerta?
- **Recomendação:** escrever: o `duel.ts` guarda `{ hp, chakra, cooldowns (tempo restante), activeKit, x, y }` e
  descarta efeitos; na volta, o `join` aplica isso por cima da sessão nova. Durante a pausa, os efeitos do adversário
  são limpos e as recargas dele ficam paradas. Na preparação e no intervalo: andar e trocar kit sim; jutsu e Ataque
  Básico não (falha com um motivo novo `DUEL_WAIT`); o `canHurt` devolve falso.

#### I9. Faltam casos de teste do 1c ao 1f e do 2b ao 2c, e o 2b é grande demais

- **Onde:** passos 1c a 1f e 2b (linhas 553 a 562); tabela de peças ("Etapas da partida ... com testes").
- **Problema:** o padrão pede casos de teste com caminho feliz e bordas. Só o 1a (PvE) e o 1g (simulador) têm. O
  orçamento, a rede, o `duel.ts` e a função `game.duel_result` não têm nenhum caso dito. O 2b junta 7 peças (`duel.ts`,
  `DuelRules`, ganchos, mensagens, mapa, tela e registro) num passo só, e o arquivo do servidor que chama o banco do
  duelo não tem nome (hoje cada assunto tem o seu: `endgameStore.ts`, `profile.ts`).
- **Recomendação:** dividir o 2b em 2b1 `duel.ts` puro com testes (convite que expira, recusa e espera de 20 s, Vale
  cheio, rodada por vida zerada, desempate por vida e por dano, morte dupla repete 1 vez, desistência, queda de 15 s);
  2b2 mapa, ganchos e mensagens no servidor; 2b3 tela; 2b4 registro em `src/realtime/duelStore.ts` com o
  `to_regclass('game.duel_matches')`. Dar os casos: orçamento (sobra parcial, menos de 0,2 s não pega, janela de 15 s
  anda, controle de monstro segue o `controlDr`); rede (corte em 50%, por atacante, depois do escudo, janela anda);
  vida por nível (nível 60 com 59 de Vitalidade = 733; subida de nível soma 6 na vida atual); integração da v15
  (`game.duel_result` grava partida e rodadas e devolve o `id`; rodar 2 vezes a migração não dá erro).

#### I10. O registro não guarda o nível dos jogadores

- **Onde:** esquema da v15 (linhas 440 a 446), Decisão 2 ("só conta com diferença de nível de até 15"), Riscos
  (linha 485, "o MMR de prévia pode ser recalculado do histórico").
- **Problema:** `game.duel_matches` não tem o nível de cada um nem se a partida contou para o MMR. Sem isso, o MMR não
  pode ser refeito do histórico (a regra dos 15 níveis e o limite de 3 por dia dependem do momento da partida), e o
  2c pode precisar de uma migração nova. `game.duel_rounds` também está sem tipo em `match_id`, sem chave e sem
  ligação com `duel_matches`; `started_at` e `ended_at` estão sem tipo.
- **Recomendação:** acrescentar `level_a smallint`, `level_b smallint` e `counts_mmr boolean` em `duel_matches`;
  `match_id bigint REFERENCES game.duel_matches(id)` e `PRIMARY KEY (match_id, round)` em `duel_rounds`;
  `started_at timestamptz`, `ended_at timestamptz`; `player_id uuid PRIMARY KEY` em `duel_mmr`; índice em
  `duel_matches (player_a, player_b, started_at)` para a conta "3 por dia".

### Detalhes

#### D1. "Passo 2" ainda tem dois sentidos

- **Onde:** linha 148 ("Isso também fica para o passo 2").
- **Problema:** ali "passo 2" é a entrega própria da forma nova (Análise 3), mas na Ordem o passo 2 é o duelo.
- **Recomendação:** trocar por "fica para a entrega da forma nova".

#### D2. A Decisão 5 diz mais que a tabela do objetivo 1

- **Onde:** Decisão 5 (linha 535) e a tabela do objetivo 1 (linha 272).
- **Problema:** a decisão diz "todo dano"; a tabela diz que o Ataque Básico e a arma só passam pela rede.
- **Recomendação:** "a curva vale para os jutsus de classe, a queimadura, a cura e o escudo; o Ataque Básico só passa
  pela rede".

#### D3. "Itens de cura" no `DuelRules` não existem

- **Onde:** objetivo 8 (linha 343).
- **Problema:** não há item de cura nem mensagem de usar item no código (`protocol.ts`, `items.ts`).
- **Recomendação:** tirar a linha ou escrever "não existe hoje; quando existir, lê o perfil".

#### D4. Não há tipo "estátua" no mapa

- **Onde:** linha 453 ("pedras e estátuas, tipos que já existem").
- **Problema:** os tipos de parede são `rock`, `pillar` e outros (`maps.ts:50`); não há `statue`.
- **Recomendação:** "pedras (`rock`) e pilares (`pillar`)".

#### D5. Simulador: três entradas não ditas

- **Onde:** objetivo 6, passos 1 e 6.
- **Problema:** não diz o nível de uso (as contas usam 4), nem a arma das builds que não são de Armas (as contas usam
  Espada Longa em todas), nem se o pior caso da Zona usa os mesmos critérios e o chakra voltando 5 por segundo (na Zona
  o chakra só volta meditando).
- **Recomendação:** "nível de uso 4 em todos os jutsus; Espada Longa em todas as builds; o pior caso da Zona usa os
  mesmos critérios e o mesmo chakra".

#### D6. Mensagens: pequenas faltas

- **Onde:** tabela de mensagens (linha 429 e vizinhas).
- **Problema:** `duel_refused` não tem motivo para "está na Zona de Conflito", "sem classe" e "já tem um desafio
  pendente"; não diz se dá para desafiar alguém longe ou em outro mapa (o menu de jogador do cliente abre para quem
  está perto); `duel_state` só vai "a cada mudança de etapa", mas a pausa da desconexão também muda o cronômetro;
  `from` não diz se é id ou nome.
- **Recomendação:** motivos `zone`, `no_class`, `pending`; desafio só no mesmo mapa, a até 6 casas; mandar
  `duel_state` com `paused: true` na queda e na volta; `from: { id, name }`.

#### D7. O interruptor `pvpBalance` só aparece nos Riscos

- **Onde:** Riscos (linha 478).
- **Problema:** não diz onde fica (`combat.pvpBalance`?) nem o que desliga (curva, x4 e x2,5, orçamento, rede?).
- **Recomendação:** pôr no objetivo 1: `combat.pvpBalance: true`; com `false`, nada do PvP novo vale e o `controlDr`
  volta para todos.

#### D8. Vida por nível: dois pontos a mais

- **Onde:** passo 1c. `gameWorld.ts:673` (`statsFor`), `:785` (`join`), `:2333` (`applyAttributes`); comando de admin
  `nivel` (`admin.ts:136`).
- **Problema:** quem chama o `computeStats` é o `statsFor`, que também precisa do nível. O admin pode baixar o nível;
  o plano só fala em subida.
- **Recomendação:** `statsFor(village, attributes, level)`; em qualquer mudança de nível, recalcular e cortar a vida
  atual no máximo novo.

#### D9. Teste do PvE: duas pontas soltas

- **Onde:** passo 1a (linha 549) e a tabela de peças (linha 402).
- **Problema:** a tabela diz que o teste "prova que o `pvpHitDamage` não toca monstros", mas isso só existe no 1d.
  "Um monstro fixo" não diz qual.
- **Recomendação:** no 1d, acrescentar esse caso ao teste; usar o slime (60 de vida) sem armadura.

#### D10. PvP aberto fica fora das áreas de PvP

- **Onde:** objetivo 1; `gameWorld.ts:1827` (`combat.pvp && !layout.village`).
- **Problema:** se o PvP aberto for ligado, o dano entre jogadores fora das vilas segue o de hoje.
- **Recomendação:** incluir no `inPvpArea` (I1) os mapas sem vila quando `combat.pvp` estiver ligado.

#### D11. Partida anulada: quando se grava

- **Onde:** linha 440 (`winner` vazio se anulada) e linha 468.
- **Problema:** numa queda do servidor nada pode ser gravado; só numa publicação com desligamento limpo (`close()`).
- **Recomendação:** "no `close()` do servidor, as partidas em andamento são gravadas com `winner` vazio e `reason`
  `server_restart`; numa queda, nada é gravado".

#### D12. Tela do duelo sem lugar

- **Onde:** objetivo 10 (linha 350) e a linha "Tela" da tabela de peças.
- **Problema:** não diz onde ficam placar, cronômetro, kit do adversário e o convite no celular deitado. O "perfil de
  outro jogador" no código é o menu de jogador (`player-menu`, `public/game.js:50`).
- **Recomendação:** um esboço em texto: placar e cronômetro no alto, no centro; kit do adversário no alto, à direita;
  convite como janela com "Aceitar" e "Recusar" e a contagem de 20 s; botão "Desafiar" no `player-menu`.

#### D13. Empate até no dano da partida

- **Onde:** Análise 9 e "Regras da partida".
- **Problema:** se o dano da partida também empatar, não há regra.
- **Recomendação:** "vence quem tem mais vida em porcentagem na última rodada; se ainda empatar, a partida é anulada".
