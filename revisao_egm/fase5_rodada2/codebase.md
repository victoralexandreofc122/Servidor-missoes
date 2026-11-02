# Revisão EGM, fase 5, 2ª rodada: detalhes do código

Revisor: `egm-codebase-details`. Alvo: `concepts_brief.md`, linhas 234 a 567 (o resto como contexto). Conferido contra
o branch `brainstorm-pvp-invocacoes` (commit `eb87e41`), só leitura.

Contagem: 11 dos 15 achados da 1ª rodada fecharam, 4 seguem abertos. Novos: 2 bloqueadores, 7 importantes,
11 detalhes.

## Achados da 1ª rodada: fechado ou aberto

| # | Achado | Situação | Motivo |
| --- | --- | --- | --- |
| B1 | `pvpHitDamage` sem dados no `hitTarget` | FECHADO | O `HitInfo` sai do `cast()` e vai ao `hitTarget`, ao projétil e à queimadura; a ordem (PvP, escudo e Corações, rede, vida) está escrita. Falta a fórmula da função (ver novo I1). |
| B2 | Custo e recarga cobrados antes de ter alvo | ABERTO | A regra virou "por mapa de PvP", mas a arena não é um mapa: ela é uma caixa dentro do mapa da vila (`arenaAt`, `maps.ts:1286`; `canHurt`, `gameWorld.ts:1818`). "O `cast()` lê o mapa" daria x4 no Taijutsu na vila inteira, ou nunca na arena. O PvP aberto (`combat.pvp`, `gameWorld.ts:1827`, usado em `hitbox`, `v15`, `lagComp`, `weather`) não está em nenhum lado da regra. E não há mensagem para mandar o custo e a recarga ao cliente: o `welcome` manda os números fixos (`gameWorld.ts:723-733`), o `cast` não leva recarga e o cliente usa a do `world` (`public/game.js:942`, `:2843`, `:2856`, `:2873`). A tabela de 8 mensagens não tem nenhuma para isso. |
| B3 | Ganchos do duelo no `gameWorld` | FECHADO | Tabela com `canHurt`, vida zerada, `leave`, `join` e `transfer`, e a lista do que volta ao início da rodada. As linhas conferem (`:1813-1828`, `:3154`, `:937`, `:774`, `:1130`). |
| I1 | Vida por nível sem o nível em quem chama | FECHADO | `derivedStats` com o nível, `computeStats` na subida, +6 na vida atual, `v8.test.ts:200` e `:232` listados (conferido). Cuidado só no `join`: os stats são calculados em `:785`, antes de `level` entrar na sessão (`:827`); usar `player.level ?? previous?.level ?? 1`. |
| I2 | Orçamento de controle: choque, Ilusão, `controlDr`, testes | ABERTO | A relação com o `controlDr` foi decidida (jogador: orçamento; monstro: `controlDr`). Continua faltando: (a) o `shock()` (`gameWorld.ts:1975`) não recebe quem causou, e o pulso já tem `p.sourceId` (`:1943`, `effects.ts:106`); (b) Ilusão tier 3 e 4 aplica atordoamento e silêncio (`:1737-1739`, o silêncio dura atordoamento + silêncio): é 1 aplicação ou 2, e o silêncio que cobre o atordoamento conta em dobro?; (c) os testes que mudam não estão listados: `test/v15.test.ts:301-323` (espera metade, um quarto e imune; com o orçamento, 4 Relâmpagos de 0,4 s passam inteiros), `test/weather.test.ts:149` (prisão de 5,25 s num jogador; vira 1,5 s), `test/hitbox.test.ts:311`. |
| I3 | `DuelRules`: pontos de leitura | ABERTO | A tabela existe e quase todos os pontos conferem (`passive()` `:3795`, `skyEffectsAt()` `:1364`, `power()` `:4325`, tique `:3622-3624`, `meditate()` `:2153`, `countUse` no fim do `cast()` `:1800`). Falta: (a) a velocidade da Névoa não passa por `passive()`: o `statsFor` lê `passiveOf` direto (`:675`), então segue valendo no duelo; (b) "Itens de cura / uso de item" não existe: não há item de cura nem mensagem de uso de item (`items.ts:26`, tipos `weapon`, `scroll`, `cape`, `shoes`, `accessory`); (c) o `kind` do `valley` não foi escolhido: com `wild`, `forest` ou `village` o clima vale (`weather.ts:115`) e o cliente mostra as setas do clima; com `interior` ou `cave`, o `skyEffectsAt` já devolve `null` e a linha some; (d) a compensação de lag é lida em `rewindMs()` (`:1854-1857`), que recebe a sessão; `maxRewindMs` é só o campo do `config`. |
| I4 | Curva achatada na cura e no escudo | ABERTO | A cura ficou clara (nos mapas de PvP, inclusive em si mesmo). O escudo não: ele é uma fração (`TIER.shield` 0,5 / 0,6 / 0,7 / 0,8, `jutsus.ts:102`; `shieldedDamage`, `combat.ts:153`), e "aplicar a curva 1 / 1,15 / 1,3 / 1,45" não diz qual número sai (0,5 x 1,45 = 0,725?). Faltam os 4 valores do escudo no PvP. |
| I5 | Kit com mais de 4 jutsus | FECHADO | Os 2 kits valem, com troca livre; o simulador usa 8 jutsus; a tela troca o kit do adversário. |
| I6 | Migração v15 | FECHADO | Nome do arquivo, tabelas, função, `testDb.ts` e "desligado sem a migração" estão escritos. Os tipos de id batem: `game.players.id` é `uuid` (`db/schema_ranks_missoes_sensei.sql:121`). Lacunas novas no esquema em I6 novo. |
| I7 | "15 s para voltar" | FECHADO | O `duel.ts` guarda o estado por 15 s, o `join` pergunta, há botão "Desistir" e `duel_leave`. Pequena falta: quais campos são guardados (o `join` herda posição, vida, chakra, recargas e efeitos só de `previous`, `:799-870`). |
| I8 | Mapa do Vale | FECHADO | Campo `duelAreas`, filtro pelo par no `canHurt`, tamanho e câmera fixa. Falhas novas no texto do mapa em B2 novo e I5 novo. |
| I9 | Mensagens do protocolo | FECHADO | Tabela com 8 mensagens e `MapChangeReason` `duel`. Ambiguidades de campo em D5. |
| I10 | Rede de segurança: ordem e estado | FECHADO | Depois do escudo e dos Cinco Corações; histórico no alvo. |
| I11 | Simulador com funções puras | FECHADO | Orçamento e rede em `pvpBalance.ts`, como funções puras. |
| I12 | "Fora de combate" | FECHADO | 10 s sem dar nem levar dano, campo novo na `Session` (ver D9). |

---

## Bloqueadores

### B1. Onde o `damageScale` entra não está decidido, e a queimadura e a Kunai mudam conforme a escolha

- **Onde:** objetivos, "Dano base menor" (linhas 240-242) e a tabela de dano (249-256); passo 1b (551). Código:
  `gameWorld.ts:1599-1600` (dano do jutsu: `(cfg.damage + weaponBonus) x multiplicadores`), `:1747` (queimadura =
  `cfg.burn x dmg / cfg.damage`), `:2212-2213` (Ataque Básico), `jutsus.ts:136-161` (`skillConfig` monta
  `combat.skills`), `config.ts:306`.
- **Problema:** há dois lugares naturais para o fator, e eles dão números diferentes:
  - no `cast()` (multiplicando o `dmg`): a queimadura cai junto, porque a proporção `dmg / cfg.damage` já leva o 0,4.
    Fogo tier 4 no nível 60: 87 + 30. É o que a tabela do plano mostra;
  - no `skillConfig` (baixando `damage` na tabela de jutsus): a proporção da queimadura cancela o fator e ela fica
    inteira. Fogo tier 4 no nível 60: 87 + 75 (25 por pulso em vez de 10).
  O mesmo vale para a Kunai do jutsu de Armas: hoje a arma soma no dano base (`(18 + 10) x ...`). Com 0,4 em tudo dá
  11 no nível 1; a tabela diz 12, que só sai com 0,4 no jutsu e 0,5 na arma (`18 x 0,4 + 10 x 0,5`). O nome
  `damageScale.basic` não diz que ele vale também para a arma dentro do jutsu de Armas. Quem implementa escolhe o
  lugar e pode errar a queimadura em 2,5 vezes sem nenhum teste avisar (a tabela do plano não vira teste).
- **Recomendação:** escrever: "o fator entra no `cast()`, no cálculo do `dmg`: `(cfg.damage x jutsu + arma x basic)
  x multiplicadores`; o `skillConfig` não muda; a queimadura segue a proporção de hoje". E pôr a tabela de dano
  (nível 1 e nível 60, contra monstro) como casos do `test/pveDamage.test.ts` da 1b.

### B2. "Estátuas, tipos que já existem": não existe parede do tipo estátua

- **Onde:** "Mapa do Vale das Estátuas" (linha 452-453). Código: `maps.ts:49-50` (lista fechada de `Wall['k']`) e
  `public/mapArt.js` (desenho por tipo).
- **Problema:** os tipos que existem são `rock`, `pillar`, `wall`, `cliff`, `cave` e outros; não há `statue`. Uma
  estátua pede tipo novo no servidor e desenho novo no cliente (arte comparada com a referência, pela regra do
  projeto). O plano diz que não precisa.
- **Recomendação:** ou "pedras (`rock`) e pilares (`pillar`)", ou listar o tipo novo `statue` com o desenho no
  `mapArt.js` como parte do passo 2b.

---

## Importantes

### I1. A fórmula do `pvpHitDamage` não está escrita

- **Onde:** objetivo 4 (linhas 289-293) e Análise 3. Código: `gameWorld.ts:1599-1600`, `jutsus.ts:96` (`jutsuPower`),
  `:136-161`, `:1730` (`WET_LIGHTNING_BONUS`), `:1747` (queimadura).
- **Problema:** o plano lista o que vai no `HitInfo`, mas não a conta. Os números da tabela (Fogo 40 + 15, Água 32,
  Relâmpago 48, Soco 56, Kunai 67) só saem com uma ordem precisa: dano base do **tier 1** (`BASE_SKILLS`) x curva
  achatada x 0,4, mais a arma x 0,5 **sem** a curva, vezes o atributo, vezes (1 + bônus do nível de uso), vezes
  passiva e clima, arredondado uma vez; molhado x 1,3 depois; queimadura pela mesma proporção. Quem implementa pode
  aplicar a curva sobre o `cfg.damage` do tier (que já tem `TIER.power`), pôr a curva na arma ou arredondar duas
  vezes.
- **Recomendação:** escrever a fórmula como pseudocódigo, com o arredondamento, e usar a coluna "contra jogador" da
  tabela como casos do teste de `pvpHitDamage`.

### I2. O passo 1b quebra cerca de 45 asserções em 11 arquivos e o tutorial da Academia

- **Onde:** passo 1b (linha 551: "o teste da 1a passa a esperar os números novos"). Código e testes:
  - `combat.test.ts` (10), `hitbox.test.ts` (11), `v5.test.ts` (6), `v6.test.ts` (5), `v15.test.ts` (3),
    `weather.test.ts` (3), `combateLivre.test.ts` (2), `lagComp.test.ts` (2), `efeitosIa.test.ts:113`: todos esperam
    `M.maxHp - SK.x.damage` ou `100 - BA.damage`. Com o fator no `cast()` (B1), todos mudam;
  - tutorial: o boneco tem 24 de vida (`config.ts:338-339`, comentário "2 golpes cada"); o Ataque Básico sem arma vai
    de 12 para 6, então são 4 golpes. `test/v7.test.ts:148` bate 2 vezes em cada boneco e espera passar de etapa;
  - não quebram: `golpeMarcado` (dano de monstro), `painelAdmin` (usa o dano medido), `v16:209` (diferença
    relativa), `npcMissions:230`.
- **Problema:** o `npm run verify` não passa na 1b com o que o plano descreve, e o tutorial pede uma decisão de
  desenho (boneco com 12 de vida ou 4 golpes).
- **Recomendação:** listar os arquivos que mudam na 1b, decidir o boneco (sugestão: `maxHp: 12`, mantém "2 golpes") e
  dizer se as asserções passam a usar uma função auxiliar (`pveDamage(skill)`) em vez do número cru.

### I3. Cliente: o adversário do duelo não é "inimigo", e não existe perfil de outro jogador

- **Onde:** "Tela" (linha 400) e `duel_challenge` "ao tocar em Desafiar no perfil de outro jogador" (linha 426).
  Código: `public/game.js:1860-1865` (`isFoe` só conhece arena e Zona), `:1882-1913` (foco e ciclo de alvo),
  `:4732` (sai do foco fora da arena), `:6578` (nome em vermelho), `:3166` (o "Perfil" é a ficha do próprio jogador).
- **Problema:** no Vale, o cliente trata o adversário como aliado: o botão de alvo não o escolhe, o nome não fica
  vermelho e os jutsus que miram mandam `targetId` de ninguém. E o "perfil de outro jogador" não existe: hoje tocar
  num ninja fora da arena e da Zona só o foca como aliado (para a Cura). O lugar do botão "Desafiar" é tela nova.
- **Recomendação:** pôr na lista do cliente: `isFoe` com um ramo "meu adversário no duelo" (o servidor manda o id em
  `duel_state`), e a tela de onde sai o desafio (por exemplo um cartão ao focar um ninja, com nome, nível e
  "Desafiar").

### I4. A ligação entre o `duel.ts` e o `gameWorld` não está definida

- **Onde:** "Como funciona por dentro" (linhas 384-420). Código: `gameWorld.ts:531-546` (construtor com `now` e
  `WorldOptions` injetados), `src/server.ts:72` e `:135` (as lojas do banco são criadas e passadas aqui),
  `endgameStore.ts:116` (`available` com `to_regclass`).
- **Problema:** a tabela diz o que o `gameWorld` avisa ao `duel.ts` (`onZeroHp`, queda, volta), mas não o caminho de
  volta: quem leva os dois ao Vale, quem zera a rodada e põe cada um no ponto de partida, quem manda as mensagens,
  quem devolve no fim. Também não diz de onde vem o tempo do `duel.ts` (o relógio injetado `now` e o `tick`, ou
  `setTimeout`): os testes usam relógio falso, então `setTimeout` não funciona neles. E o arquivo que grava no banco
  (`game.duel_result`), como ele entra no `WorldOptions` e quem roda o `to_regclass` não aparecem. A lista de arquivos
  também não marca o que é criado e o que é mudado: faltam `protocol.ts`, `config.ts`, `admin.ts`,
  `public/adminPanel.js`, `pvpStats.ts`, `src/server.ts`, `public/mapArt.js` e a loja do duelo.
- **Recomendação:** definir uma interface (por exemplo `DuelHost`: `now()`, `startRound(duelo)`,
  `endDuel(duelo, resultado)`, `send(id, msg)`) que o `gameWorld` implementa; o `duel.ts` avança no `tick()` com o
  `now` injetado; criar `src/realtime/duelStore.ts` (`available()`, `saveResult(p)`) passado em `WorldOptions.duel`.
  Fechar a lista de arquivos com Criar ou Mudar em cada um.

### I5. A Cura passa para o outro duelo

- **Onde:** gancho do `canHurt` (linha 412) e o mapa (452-454). Código: `gameWorld.ts:1660-1671` (aliado = quem
  `canHurt` recusa), `jutsus.ts:150` (raio da Cura no tier 4: 3 + 1,5 = 4,5).
- **Problema:** se o `canHurt` só deixa acertar o par do duelo, os 2 ninjas do outro duelo viram "aliados" para a
  Cura. A Cura tier 4 tem raio 4,5, maior que o muro de 4 casas: quem está encostado no muro cura (ou é curado por)
  alguém do outro duelo, inclusive escolhendo-o pelo foco.
- **Recomendação:** no Vale, a Cura só pega a si mesmo (dizer isso no gancho e testar).

### I6. Esquema da v15: chaves, nulos e o formato do `jsonb`

- **Onde:** "Banco" (linhas 437-450). Código de referência: `db/schema_v8_admin_chat.sql:35-43` (padrão com
  `NOT NULL`, `REFERENCES game.players (id)` e `CHECK`), `db/schema_v14_acessorio.sql` (cabeçalho e função com
  `SET search_path = game`).
- **Problema:**
  - nenhuma chave primária em `duel_rounds` e `duel_mmr`; nenhuma referência a `game.players (id)`; nenhum
    `NOT NULL`; os tipos de `started_at`, `ended_at`, `updated_at` e `match_id` não estão escritos;
  - a rodada repetida no empate (linha 466) deixa duas linhas com o mesmo `round`: uma chave `(match_id, round)` dá
    erro. É preciso dizer se a repetida ganha outro número ou uma coluna `replay`;
  - os valores de `reason` (partida e rodada) não estão listados;
  - o formato do `jsonb` que `game.duel_result(p)` recebe não está escrito (nomes dos campos, rodadas como lista);
  - nenhum teste de integração para a função (o nome `test/v15.test.ts` já existe e é da versão v15 do jogo).
- **Recomendação:** escrever o `CREATE TABLE` de cada tabela com chave, nulos e `REFERENCES ... ON DELETE RESTRICT`,
  um exemplo do `jsonb` e um `test/duelo.integration.test.ts` que roda a função.

### I7. O dano menor vale para os poderes da Akatsuki?

- **Onde:** "Dano base menor" (linha 240) e a linha "Poderes da Akatsuki" da tabela (275). Código:
  `akatsuki.ts:37` (Argila Viva 45), `:42` (Chuva de Papel 20 x 7), `gameWorld.ts:4340` (escalam por Ninjutsu, sem
  passar pelo `cast()`).
- **Problema:** se o fator ficar só no `cast()` e no Ataque Básico, a Argila Viva continua com 107 no nível 60 (45 x
  2,39), enquanto o Fogo tier 4 cai para 87 em monstro e 40 em jogador. Na Zona de Conflito, o poder passa a valer
  2,5 vezes mais em relação aos jutsus. O plano não diz.
- **Recomendação:** decidir se `damageScale.jutsu` vale nos poderes (no `dmg()` de `power()`, `:4340`).

---

## Detalhes

### D1. Interruptores no `config.ts` sem lugar e sem tipo

- **Onde:** Riscos, linha 478; objetivo 12. Código: `config.ts:303-330`, `admin.ts:57-70`.
- **Problema:** `damageScale 1` (número) não bate com `{ jutsu, basic }` (objeto); o lugar de `pvpBalance` e de
  `duelo` no `config` não é dito; o comando do admin para o `duelo` não tem nome; `combat.attributes` tem o tipo
  `AttributeRules` (`stats.ts:24`), que ganha `hpPerLevel`.
- **Recomendação:** escrever os caminhos (`combat.damageScale`, `combat.pvpBalance`, `combat.duel`) e o comando
  (`/admin duelo on|off`).

### D2. "Armas pela metade no Ataque Básico": a conta

- **Onde:** linhas 243-244. Código: `gameWorld.ts:2213`, `stats.ts:104`.
- **Problema:** o 30 da tabela só sai com `1 + (weaponMultiplier - 1) / 2` (6 + 14 x 1,70 = 30); `weaponMultiplier / 2`
  daria 23. Não diz se vale também para a Shuriken Gigante lançada (`:2214-2219`).
- **Recomendação:** escrever a fórmula e incluir a arma lançada.

### D3. `ccLog: { from, until, weight }`

- **Onde:** objetivo 2. Código: `gameWorld.ts:1922-1925` (`wakeOnDamage`), `effects.ts:144` (`breakOnDamage`).
- **Problema:** `from` pode ser a hora ou o atacante. "O sono que acaba ao apanhar conta até acordar" pede mexer no
  `until` dentro do `wakeOnDamage`, que não está citado.
- **Recomendação:** `startedAt` e `sourceId` com nomes claros; citar `wakeOnDamage`.

### D4. Rede de segurança: "limpo a cada 2 s" contra "a janela anda"

- **Onde:** objetivo 3 (linhas 284-286).
- **Problema:** limpar tudo a cada 2 s é janela fixa; a frase anterior pede janela que anda.
- **Recomendação:** "a cada golpe, tira as entradas com mais de 2 s".

### D5. Mensagens com campos em aberto

- **Onde:** tabela de mensagens (424-433). Código: `protocol.ts:206`, `:519`, `:656`.
- **Problema:** `phase` e `duel_end.reason` sem lista de valores; `score` sem forma; `from` é id ou nome?; o
  `duel_opponent_kit` também é preciso no começo de cada rodada; o cliente precisa saber qual área do `duelAreas` é a
  dele para a câmera fixa; o texto de `INVALID_MESSAGE` (`:656`) lista as mensagens e muda junto.
- **Recomendação:** completar os tipos na tabela.

### D6. Golpes do duelo no `PvpStats`

- **Onde:** objetivo 3. Código: `gameWorld.ts:3150` (`pvpStats.hit` em todo dano com `by`), `pvpStats.ts:66`
  (lugares `arena`, `conflito`, `aberto`).
- **Problema:** os golpes do duelo entram misturados nos números do PvP do painel, e o relatório não tem o lugar
  "duelo".
- **Recomendação:** decidir: lugar `duelo` próprio ou fora do `PvpStats`.

### D7. `/admin ir` entra no Vale

- **Onde:** "Só se entra levado pelo duelo" (linha 454). Código: `admin.ts:66`.
- **Problema:** o admin pode ir ao `valley`. Não apanha (o `canHurt` filtra), mas a regra escrita não vale para ele.
- **Recomendação:** dizer se o `ir` recusa o `valley`.

### D8. O que o cliente mostra fica errado

- **Onde:** passo 1b. Código: `public/game.js:3184-3186` (multiplicadores na ficha), `:3175` (texto do próximo
  ponto), `:2870-2877` (setas do clima).
- **Problema:** com Armas pela metade no Ataque Básico, o "x2,39" da ficha não vale para o golpe; o texto do ponto
  de Taijutsu fala em "+% Ataque Básico".
- **Recomendação:** ajustar os textos no passo 1b.

### D9. "Fora de combate" e monstros

- **Onde:** linha 461.
- **Problema:** não diz se dano de monstro conta, nem o nome do campo.
- **Recomendação:** "qualquer dano dado ou recebido, de jogador ou monstro"; campo `lastCombatAt`.

### D10. Bônus do nível de uso na Cura

- **Onde:** objetivo 1. Código: `gameWorld.ts:1770` (`jutsuPower(level)` na cura).
- **Problema:** a curva vale para a cura nos mapas de PvP; o +0 / +5 / +10 / +15% não é citado para ela.
- **Recomendação:** dizer se troca o `jutsuPower` também na cura.

### D11. O teto de controle de hoje continua nos testes de PvP aberto

- **Onde:** objetivo 2 ("vale só quando quem causa é jogador"). Código: `test/v15.test.ts:301-323` roda no mapa
  `map_2` com `pvp: true`.
- **Problema:** o orçamento não fala em mapa, então vale também no PvP aberto. Junto com B2 da 1ª rodada (que regra
  vale no PvP aberto), isso decide se esse teste muda ou fica.
- **Recomendação:** uma frase: "o orçamento e a rede valem em todo dano e controle de jogador em jogador, em
  qualquer mapa".
