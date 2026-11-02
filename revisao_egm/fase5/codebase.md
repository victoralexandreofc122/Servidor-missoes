# Revisão EGM, fase 5 (prontidão para construir): detalhes do código

Revisor: `egm-codebase-details`. Alvo: `concepts_brief.md`, linhas 329 a 450 (com o resto do documento como
contexto). Conferido contra o branch `brainstorm-pvp-invocacoes` de `/home/user/Servidor-missoes`.

Contagem: 3 bloqueadores, 12 importantes, 10 detalhes.

## O que confere com o código

- `cast()` em `gameWorld.ts:1571` (o plano diz "perto da 1600"), `applyStatus` em `:2001`, a regra da arena em
  `:1818-1824`, `hitTarget` em `:1873`, `damagePlayer` em `:3132`. O arquivo tem 4.718 linhas.
- `TIER.power` = 1 / 1,45 / 2 / 2,8 e `TIER.control` até 1,7 (`jutsus.ts:96-103`); `jutsuPower` +10% por nível
  (`jutsus.ts:96`); níveis de uso 0 / 100 / 500 / 2.000 (`jutsus.ts:81`).
- `controlDr` só tem `stunned` e `rooted`, com contador próprio cada (`gameWorld.ts:821`, `config.ts:310`).
- Chakra só volta meditando, e a vida volta 1/s só com o chakra cheio (`gameWorld.ts:3622-3624`). A meditação sem
  pontos dá 15/s (`config.ts:306`: 5 x 3), então 1/3 dá os 5/s do plano.
- `maxRewindMs` = 300 (`config.ts:301`). O limite de 60 jogadores do `pvp` está em `config.ts:410`.
- `PvpStats` só em memória (`pvpStats.ts:5-14`). `game.pvp_kill` usa K = 32 e diferença de nível até 10
  (`db/schema_v11_endgame.sql:815-823`). A regra do `endgame_modules` está na linha 28 do mesmo arquivo.
- A vida máxima e a vida atual não ficam no banco: nenhuma coluna de vida em `db/*.sql`; o `join` sempre calcula
  `stats.maxHp` (`gameWorld.ts:785`). O cliente não calcula vida: lê `maxHp` das mensagens (`public/game.js:865`,
  `:929`, `:1078`) e o `derived` do `progress`. A vida por nível não precisa de migração.
- Próxima migração: o último arquivo é `db/schema_v14_acessorio.sql`, então a próxima é a v15 (ver Importante 6
  sobre o nome).

---

## Bloqueadores

### B1. `pvpHitDamage` não tem como entrar no `hitTarget` e no `damagePlayer` do jeito descrito

- **Onde:** "Como funciona por dentro", linhas "Dano por acerto" e o diagrama; objetivo 4. Código:
  `gameWorld.ts:1590-1593` (o dano é calculado uma vez no `cast()`), `:1712`, `:1719`, `:1730` (o `hitTarget`
  recebe o número pronto), `:1747-1750` (Fogo: o dano e a queimadura vão congelados no projétil), `:2040-2049`
  (`launch` guarda só `damage` e `burn`), `:2075`, `:2096-2102` (o impacto repassa `p.damage`), `:1873`
  (`hitTarget(target, amount, attacker, t, source, label)`).
- **Problema:** o plano diz que a função pura entra "no ponto por alvo que já existe" e que o cálculo do `cast()`
  "continua igual". Mas nesse ponto só chega um número que já tem dentro: o tier (via `skillConfig`), o
  `jutsuPower` do nível de uso, a passiva da vila, o clima, o bônus da arma e o bônus do molhado (`:1730`). Para
  aplicar a curva achatada e o +0/+5/+10/+15%, o `hitTarget` precisa do jutsu, do tier, do nível de uso na hora
  do lançamento, do atributo de quem lançou e de saber se teve combo. Nada disso chega lá hoje, nem pelo projétil.
  A queimadura (`:1747`) é calculada como proporção do `dmg` e também precisa da versão PvP. Quem for implementar
  tem que inventar como esses dados passam do `cast()` até o acerto. Isso é uma decisão de desenho que o plano não
  tomou.
- **Recomendação:** definir um objeto de golpe (por exemplo `HitSpec`: jutsu, tier, nível de uso, escala, bônus da
  arma, `wet`, valor do PvE) criado no `cast()` e no `basicAttack()`, guardado no `Projectile` e no `burn`, e
  passado ao `hitTarget`. O `hitTarget` usa `spec.pveAmount` contra monstro e `pvpHitDamage(spec, alvo, regras)`
  contra jogador. Listar as assinaturas novas de `hitTarget`, `launch`, `LaunchSpec`, `Projectile` e
  `applyEffect('queimadura')`.

### B2. Custo e recarga x4 (Taijutsu) e x2,5 (Armas) "no PvP" são cobrados antes de existir alvo

- **Onde:** objetivo 1 e Decisão 9; Ordem, passo 1. Código: `gameWorld.ts:1585-1586` (confere recarga e chakra),
  `:1698-1700` (cobra e marca a recarga antes de aplicar), `:740-760` (o `welcome` manda `cost` e `cooldownMs` de
  cada jutsu); `public/game.js:2841-2857` e `:2873` (o cliente mostra recarga e custo com esses números).
- **Problema:** o custo e a recarga saem no `cast()`, antes de saber em quem o golpe pega. No duelo dá para saber
  pelo `DuelRules`. Mas o plano diz que a tabela vale também na Zona de Conflito e na arena das vilas, onde o mesmo
  soco pode pegar monstro ou jogador. O plano não diz qual regra vale ali (pelo mapa? pela arena? sempre?). Além
  disso, o cliente mostra a recarga e o custo do `welcome`: com x4 no duelo, o botão mostra a recarga errada e o
  cliente deixa tentar antes da hora (o servidor responde `COOLDOWN`).
- **Recomendação:** decidir no plano: (a) o multiplicador vale por contexto (`DuelRules`, mapa com `conflict`,
  dentro de `arenaAt`), não por alvo; (b) o servidor manda ao cliente os números do contexto (por exemplo um
  `skills_override` ao entrar no duelo ou na Zona) e o cliente usa esses números nos botões.

### B3. Os ganchos do duelo dentro do `gameWorld` não estão listados

- **Onde:** "Como funciona por dentro", linhas "Etapas da partida" ("recebe eventos do `gameWorld`") e "Regras do
  duelo"; "Regras de borda da partida". Código: `canHurt` em `gameWorld.ts:1813-1828`; morte em `:3155-3170`;
  renascer em `:3223-3255`; `transfer` em `:1130-1148`.
- **Problema:** para hospedar a luta, o `gameWorld` precisa mudar em pontos que o plano não cita:
  1. `canHurt`: num mapa novo sem `arenas` e sem `conflict`, cai em `this.config.combat.pvp && !layout.village`
     (`:1827`), que é falso. Ninguém se acerta no Vale. Precisa de um ramo "os dois estão no mesmo duelo".
  2. Morte: `damagePlayer` marca `dead`, avisa `player_died`, conta no `pvpStats` e, fora da arena, o renascer
     manda o ninja para a vila (`:3247-3250`). No duelo a rodada tem que acabar sem morte de verdade, ou a morte
     tem que ser interceptada.
  3. Começo de cada rodada: o plano não diz o que é zerado (vida, chakra, recargas, efeitos, `stunnedUntil`,
     `rootedUntil`, `shield`, `substituteUntil`, `hearts`, `powerBuff`, `hasteUntil`, `intangibleUntil`,
     `controlDr`, o orçamento novo e a janela da rede de segurança).
  4. Entrada e volta: `transfer` precisa de um motivo novo (`MapChangeReason`, `protocol.ts:646`) e de guardar o
     mapa e a posição de antes.
  Sem essa lista, quem implementa decide sozinho a forma de cada gancho.
- **Recomendação:** acrescentar uma tabela "Ganchos no `gameWorld.ts`" com cada ponto (função e linha), o evento
  que vai para o `duel.ts` (`onHit`, `onZeroHp`, `onLeave`, `onRejoin`) e o que é zerado a cada rodada.

---

## Importantes

### I1. Vida por nível: `derivedStats` recebe o nível, mas quem chama não tem o nível, e a subida de nível não recalcula

- **Onde:** "Como funciona por dentro", linha "Vida por nível"; Ordem, passo 1. Código: `stats.ts:91`
  (`derivedStats(base, rules, a)`); `gameWorld.ts:673-689` (`statsFor(village, attributes)` e `computeStats`
  sem nível); `:785` (o `join` calcula os stats antes de `level` ser posto na sessão em `:827`); `:3105-3120`
  (`applyXp` muda `session.level` e não recalcula os stats); `:1541-1549` (`applyAdminState` põe o nível antes de
  `applyAttributes`, então ali funciona).
- **Problema:** mudar só o `derivedStats` não basta. Ao subir de nível caçando, a vida máxima não mudaria até o
  jogador gastar um ponto ou reconectar. E testes quebram:
  - `test/v8.test.ts:200`: nível 11, a conta esperada usa base 100;
  - `test/v8.test.ts:232`: nível 7, espera `maxHp` 100;
  - `test/v5.test.ts:56-61` e `test/v8.test.ts:149-164` chamam `derivedStats` com 3 argumentos (passam se o nível
    for opcional com padrão 1).
  Os testes que entram no nível 1 (a maioria de `hitbox`, `v15`, `combat`, `gameWorld`) não mudam. O protocolo não
  muda: `stats`, `player_hp`, `hit` e `player_respawned` já levam `maxHp`.
- **Recomendação:** `derivedStats(base, rules, a, level = 1)` com `hpPerLevel` em `config.combat.player`
  (`config.ts:306`); `statsFor(village, attributes, level)`; no `join` usar `player.level ?? previous?.level ?? 1`;
  no `applyXp`, quando `levelsGained > 0`, recalcular como o `applyAttributes` faz (`:2330-2342`: sobe a vida
  atual junto e manda `player_hp`). Listar os 2 testes de `v8.test.ts` que mudam de número.

### I2. Orçamento de controle: faltam o choque da paralisia, os poderes da Akatsuki e a relação com o `controlDr`

- **Onde:** objetivo 2 e "Tabela de equilíbrio" (orçamento). Código: `gameWorld.ts:1975-1984` (`shock`, "fora do
  teto de controle", chamado pelos pulsos em `:1943`); `:4356`, `:4381`, `:4389` (poderes que atordoam e prendem
  pelo `applyStatus`); `:1737-1743` (o clima multiplica o controle com `lasting`); `:2001-2017` (`applyStatus`
  junta com `Math.max` no `stunnedUntil`); `:1739` (o silêncio da Ilusão dura atordoamento + silêncio).
- **Problema:**
  - o plano cita `applyStatus` e `applyEffect`, mas o choque da paralisia passa por `shock()`, que não é citado;
  - o `applyStatus` não sabe quem causou, e os pulsos sabem (`p.sourceId`), mas o `shock` não recebe;
  - não diz se o orçamento SUBSTITUI o `controlDr` quando quem causa é jogador ou se os dois valem juntos;
  - "conta o tempo que durou de fato": hoje `stunnedUntil` é um só número com `Math.max`, sem registro do que
    durou. É preciso um registro novo por jogador;
  - Ilusão tier 3 e 4 aplicam atordoamento e silêncio: é 1 aplicação ou 2? Se o atordoamento for cortado, o
    silêncio ainda pega?
  - testes que travam o controle de hoje entre jogadores: `test/v15.test.ts:301-323` (o teto do `controlDr` em
    PvP), `test/weather.test.ts:149` (prisão de 5,25 s em jogador), `test/hitbox.test.ts:311`.
- **Recomendação:** listar `shock` entre os pontos; dizer "em controle causado por jogador, o orçamento substitui o
  `controlDr`" (ou o contrário); definir Ilusão+silêncio como uma aplicação; dizer quais desses 3 testes mudam.

### I3. `DuelRules`: pontos de entrada que o plano não cita

- **Onde:** objetivo 7 e "Regras do duelo" na tabela de peças. Código:
  - passiva da vila em 4 lugares: `gameWorld.ts:1593` (jutsu), `:1770` (cura), `:2212` (arma no Ataque Básico) e
    `:675-677` (velocidade da Névoa, já embutida em `s.stats`). A última exige recalcular os stats ao entrar e ao
    sair do duelo e mandar `stats` ao cliente, que prevê o movimento com essa velocidade;
  - clima: `skyEffectsAt(map)` em `:1364` vale para mapas `village`, `forest` e `wild` (`weather.ts:115`). Se o
    Vale for `wild`, o clima vale; se for `interior` ou `cave`, não vale e o `DuelRules` nem precisa tratar;
  - meditação: `meditate()` em `:2153` e o tick em `:3623`;
  - vida que volta: `:3624`; chakra que volta sozinho: não existe, entra no tick em `:3622`;
  - compensação de lag: `rewindMs` em `:1854-1857` lê só `config.lagComp`, sem saber da sessão em duelo;
  - nível de uso que não sobe: `countUse` em `:1800` (conta também Teleporte e Substituição);
  - Akatsuki: além do `power()` (`:4324`), os efeitos que já estão ativos ao entrar continuam: `powerBuff` no
    `hitTarget` (`:1884-1893`), `hearts` e `intangibleUntil` no `damagePlayer` (`:3133`, `:3143-3146`) e
    `hasteUntil`;
  - "itens de cura": não existe item de cura no jogo (`items.ts` só tem armas, pergaminhos, capas, sapatos e
    acessórios).
- **Recomendação:** pôr no plano a lista de campos do `DuelRules` com o ponto exato onde cada um é lido; escolher
  o `kind` do Vale (sugestão: um que não seja ao ar livre, para não ter clima); tirar "itens de cura".

### I4. A curva achatada na cura e no escudo da Pedra não tem regra clara

- **Onde:** objetivo 1 ("vale também para a cura e o escudo da Pedra"). Código: `gameWorld.ts:1765-1770`;
  `jutsus.ts:102` (`shield: [0.5, 0.6, 0.7, 0.8]`) e `:125` (`out.reduction = TIER.shield[t]`).
- **Problema:** o escudo não usa `TIER.power`: ele é uma fração do golpe que some (50% a 80%). Multiplicar por
  1 / 1,15 / 1,3 / 1,45 não tem sentido direto (0,5 x 1,45 = 0,725?). A cura é em si mesmo ou num aliado, e não é
  "de jogador em jogador": fora do duelo, o plano não diz quando a cura usa a curva do PvP (na Zona sempre? só
  perto de inimigo?). Nenhum dos dois passa pelo `hitTarget` nem pelo `damagePlayer`.
- **Recomendação:** dar os números do escudo no PvP (por exemplo 0,5 / 0,55 / 0,6 / 0,65) e a regra de quando a
  cura usa a curva (por contexto, como em B2). Citar `gameWorld.ts:1765-1770` como ponto de mudança.

### I5. O kit do duelo pode ter mais que os 4 jutsus da classe

- **Onde:** objetivo 5 (simulador: "os 4 jutsus da classe") e "Tela" (kit do adversário). Código:
  `gameWorld.ts:121` (kits A e B, 4 cada), `:991` e `:2239` (`switch_kit` a qualquer hora), `protocol.ts:206`;
  `cast()` em `:1583-1584` (só exige aprendido e no kit ativo); classe secundária a partir de Chunin; Teleporte e
  Substituição da Academia (a Substituição anula um golpe, `:3137`).
- **Problema:** um ninja nível 60 pode levar até 8 jutsus, de 2 classes, e trocar de kit no meio da rodada. O
  simulador mede um caso que não é o do jogo, e a tela "4 jutsus do adversário" não cobre a troca de kit.
- **Recomendação:** decidir: (a) o kit ativo fica travado na preparação; ou (b) os dois kits valem e o simulador
  e a tela mostram 8. Dizer se a classe secundária e a Substituição entram no simulador.

### I6. A migração v15: nome, testes e o que acontece sem ela

- **Onde:** "Como funciona por dentro", linha "Registro"; Ordem, passo 2. Código: `db/` (última:
  `schema_v14_acessorio.sql`); `test/support/testDb.ts:10` (lista `MIGRATIONS` vai só até a v13; a v14 nem está
  lá); `src/bootErrors.ts:11-14`; `src/realtime/endgameStore.ts:116` (checagem `to_regclass` em tempo de execução).
- **Problema:**
  - o número v15 está certo para o arquivo, mas "v15" já é o nome de uma versão do jogo (`README.md:517`,
    `DEPLOY.md:774`, `test/v15.test.ts`). O plano não dá o nome do arquivo;
  - as tabelas, colunas, chaves e a assinatura de `game.duel_result` não estão definidas (só "partidas, rodadas e
    MMR de prévia");
  - o teste de integração só roda a migração nova se ela entrar em `MIGRATIONS` (que já está atrasada uma versão);
  - não diz o que o servidor faz se o código subir sem a migração: cair no boot (como a v14) ou desligar o duelo
    (como o `endgameStore.available`).
- **Recomendação:** fixar `db/schema_v15_duelo.sql`, listar as tabelas e a função com tipos, pôr v14 e v15 em
  `test/support/testDb.ts:10`, e escolher: sem a v15, o interruptor `duelo` fica desligado e o log avisa (checagem
  por `to_regclass`).

### I7. "15 s para voltar" não existe: a sessão some na hora

- **Onde:** "Regras de borda": Desconexão. Código: `gameWorld.ts:937-946` (`leave` apaga a sessão e o jogador do
  mapa na hora); `:774-800` (o `join` só herda posição e vida de uma sessão que ainda está aberta, `previous`).
- **Problema:** quem cai e volta em 10 s entra como novo: na vila, com vida cheia. Não há onde guardar o
  "lugar no duelo" nem como parar o cronômetro enquanto ele está fora. "Sair de propósito" também não tem
  mensagem própria no protocolo para separar de uma queda.
- **Recomendação:** dizer que o `duel.ts` guarda o estado do jogador (mapa, posição, vida, chakra e recargas) por
  15 s depois do `leave`, e que o `join` consulta o `duel.ts` antes de escolher o lugar. Definir "sair de
  propósito" (por exemplo um botão "Desistir" com mensagem própria).

### I8. Mapa do Vale: o que custa e o que não pode ser reaproveitado

- **Onde:** "Como funciona por dentro", linha "Mapa"; Análise 5. Código: `maps.ts:28-30` (união `MapId`),
  `:1263-1273` (`buildMaps`), `:145-148` (`Arena` exige `village`), `:1286-1288` (`arenaAt`), `gameWorld.ts:547`
  (cria a lista de jogadores de cada mapa sozinho), `:1818-1824` (arena só da vila dona); `combat.ts`
  `isInCircle` (`combat.ts:72`, sem parede); `public/game.js:4827-4838` (a câmera segue o jogador).
- **Problema:** o custo de um mapa novo é baixo no servidor: um `MapId`, uma função de layout (como `refuge()`,
  `maps.ts:1240-1262`), paredes com tipos que já existem (`rock`, `pillar`), sem migração (a posição não vai ao
  banco) e sem arte em imagem (o cliente desenha pelos tipos). Mas há 3 pontos que o plano não diz:
  - não dá para usar o campo `arenas` para as 2 áreas: ele exige vila e o `canHurt` aplica a regra da vila dona;
  - a explosão do Fogo (raio até 3,5) e a Ilusão (raio até 4,5) usam círculo sem parede: com 2 áreas lado a lado,
    um golpe perto da divisa acerta o outro duelo, a não ser que o `canHurt` filtre pelo par do duelo ou a divisa
    seja mais larga que 4,5 casas;
  - "câmera fixa" é código novo no cliente: hoje a câmera só segue o jogador ou o alvo focado.
- **Recomendação:** criar um campo próprio (`duelAreas: (Box & { id: 0 | 1; spawns: [Point, Point] })[]`), filtrar
  no `canHurt` pelo par do duelo, dar o tamanho do mapa e da divisa, e pôr a câmera fixa na lista do cliente.

### I9. Mensagens novas do protocolo não estão definidas

- **Onde:** objetivos 6 e 8; "Tela". Código: `protocol.ts:206` (as mensagens do cliente são um `z.object` cada),
  `:519` e seguintes (união das mensagens do servidor), `:646` (`MapChangeReason`), `:656` (o texto de
  `INVALID_MESSAGE` lista as mensagens); `gameWorld.ts:984-1011` (o roteamento).
- **Problema:** desafiar, aceitar, recusar, desistir, estado da partida, placar, cronômetro, kit do adversário e
  "Vale cheio" precisam de mensagens com nome e campos. O plano não dá nenhuma.
- **Recomendação:** listar as mensagens com os campos (por exemplo `duel_challenge { targetId }`,
  `duel_answer { duelId, accept }`, `duel_forfeit`, `duel_state { ... }`) e o novo `MapChangeReason: 'duel'`.

### I10. Rede de segurança: ordem com escudo, Substituição e Cinco Corações

- **Onde:** objetivo 3. Código: `gameWorld.ts:3132-3152` (Máscara Intangível, Substituição, escudo da Pedra e
  Cinco Corações, nessa ordem, antes de tirar a vida).
- **Problema:** o plano diz "fica no `damagePlayer`", mas não diz se o corte de 45% é feito antes ou depois do
  escudo e das cargas, nem onde fica a janela de 2 s por atacante (campo novo na `Session`). A ordem muda o número
  cortado e o que vai para o registro.
- **Recomendação:** fixar "corta depois do escudo e das cargas, sobre o dano que de fato tiraria vida", e o campo
  novo na `Session` (por exemplo `recentHits: Map<atacanteId, {t, dano}[]>`), zerado a cada rodada.

### I11. O simulador só "testa o código de verdade" se o orçamento e a rede forem funções puras

- **Onde:** "Dano por acerto" ("o simulador testa o código de verdade, não uma cópia"); objetivo 5. Código: hoje o
  `controlDr`, a cobrança de chakra e recarga e a regra do molhado ficam em métodos privados do `gameWorld`
  (`:2001`, `:1698-1700`, `:1722-1730`).
- **Problema:** o simulador vai precisar do orçamento de controle, da rede de segurança, do custo e da recarga do
  PvP e do chakra do duelo. Se eles ficarem dentro do `gameWorld`, o teste vai copiar a conta.
- **Recomendação:** dizer que `pvpBalance.ts` exporta funções puras para tudo isso (`controlBudget`, `damageCap`,
  `pvpCost`, `pvpCooldown`, `duelChakraPerSec`) e que o `gameWorld` só chama.

### I12. "Fora de combate" não existe no código

- **Onde:** "Regras de borda": Quem pode. Código: a `Session` (`gameWorld.ts:220-340`) não tem campo de último
  dano dado ou recebido.
- **Problema:** o desafio exige "fora de combate", mas não há como saber isso hoje.
- **Recomendação:** definir a regra (por exemplo "sem dar nem levar dano há 10 s") e o campo novo na `Session`.

---

## Detalhes

### D1. `applyEffect` já recebe quem causou

- **Onde:** objetivo 2 ("o `applyStatus` e o `applyEffect` passam a receber quem causou"). Código:
  `gameWorld.ts:1904` (`source?: Session`) e `effects.ts:61` (`sourceId`).
- **Problema:** só o `applyStatus` (`:2001`) e o `shock` (`:1975`) não recebem.
- **Recomendação:** corrigir a frase.

### D2. Ninguém aplica sono em jogador hoje

- **Onde:** Análise 2 e objetivo 2. Código: só o `/admin efeito` aplica sono (`gameWorld.ts:1430`); o silêncio só
  vem da Ilusão tier 3 e 4 (`:1739`).
- **Problema:** o orçamento conta o sono, mas nenhum jutsu de jogador o aplica. Não muda nada agora.
- **Recomendação:** dizer que o sono entra no orçamento para quando existir.

### D3. `findPlayer.ts` e `ninjaStore.ts` não leem `player_jutsus.level`

- **Onde:** Análise 3 (fora do trecho, mas a "Ordem" depende dela). Código: `findPlayer.ts:14` e
  `ninjaStore.ts:70` usam `usage_count`; quem usa o nível é `admin_give_jutsu` (`db/schema_v8_admin_chat.sql:192`)
  e a coluna gerada (`db/schema_v7_progressao.sql:139`).
- **Problema:** a lista de quem depende do nível está errada em 2 dos 3 itens. Não muda esta entrega.
- **Recomendação:** corrigir a lista antes da entrega própria do passo 2 da Análise 3.

### D4. "Aviso no chão" aparece e some

- **Onde:** objetivo 8 (o aviso entra mais tarde) contra a linha "Tela" da tabela (lista "aviso no chão").
- **Problema:** o documento se contradiz.
- **Recomendação:** tirar "aviso no chão" da linha "Tela".

### D5. O teste do PvE pode crescer a partir de testes que já existem

- **Onde:** linha "Teste do PvE". Código: `test/combateLivre.test.ts:40` e `:85` já travam o dano de Água e Fogo
  tier 1 em monstro.
- **Problema:** nenhum; só falta dizer quais casos o teste novo cobre (tiers 2 a 4, níveis de uso 1 a 4, passiva,
  clima, queimadura, combo).
- **Recomendação:** listar os casos.

### D6. Interruptor `duelo` no painel

- **Onde:** objetivo 11 e Decisão 4. Código: `admin.ts:58-81` (união dos comandos), `public/adminPanel.js:195-209`
  (a seção de módulos), `db/schema_v8_admin_chat.sql:38` (a auditoria aceita `duelo`).
- **Problema:** o caminho existe, mas o plano não diz o comando (`/admin duelo on|off`) nem onde fica o estado em
  memória (`config.combat` é só leitura no resto do código).
- **Recomendação:** nomear o comando e o campo.

### D7. Testes de PvP que podem mudar de número

- **Onde:** objetivo 1 (a tabela vale também na arena e na Zona). Código: `test/hitbox.test.ts:296`, `:311`;
  `test/v15.test.ts:113-190` (arena), `test/v16.test.ts:185-290` (Zona), `test/golpeMarcado.test.ts:77`.
- **Problema:** no nível 1 com tier 1 a curva dá 1 e o nível de uso dá +0%, então a maioria fica igual. Mudam os
  que usam Taijutsu ou Armas seguidos (custo e recarga) e os de controle (I2).
- **Recomendação:** rodar a suíte depois do passo 1 e listar no plano os que mudaram de propósito.

### D8. Linhas citadas: pequenas diferenças

- **Onde:** objetivo 4 ("perto da linha 1600"). Código: `cast()` começa em `gameWorld.ts:1571`, o cálculo do dano
  está em `:1590-1593`.
- **Recomendação:** citar `:1590-1593`.

### D9. A entrada no Vale precisa mandar o layout

- **Onde:** "Entrada e saída". Código: `gameWorld.ts:707-718` (`layoutsFor` manda o mapa e os vizinhos);
  `:1144-1148` (`transfer` já manda o layout que falta).
- **Problema:** nenhum se a entrada usar `transfer`; o teste de tamanho do `welcome` (`test/maps.test.ts:315`,
  36.000 bytes) não muda, porque o Vale não é vizinho de ninguém.
- **Recomendação:** dizer que a entrada e a volta usam `transfer`.

### D10. Queda do servidor no meio

- **Onde:** "Publicação do servidor no meio: a partida é anulada". Código: tudo do duelo fica em memória até o fim.
- **Problema:** nenhum; vale anotar que nada é gravado antes do fim, então "anulada" é o comportamento natural.
- **Recomendação:** escrever isso, para não criar gravação parcial.
