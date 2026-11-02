# Revisão EGM, fase 5: pronto para construir?

Alvo: `concepts_brief.md`, linhas 329 a 450 (com o resto do documento como contexto).
Pergunta: um desenvolvedor sozinho consegue codar o passo 1 e o passo 2 sem decidir nada de design?

Resposta curta: ainda não. O passo 1 tem um teste de aceite que falha com os números do próprio plano, e a função
central (`pvpHitDamage`) não encaixa no código de hoje. O passo 2 não tem protocolo, esquema de banco nem regras de
reinício da rodada.

Contagem: 6 bloqueadores, 9 importantes, 6 detalhes.

---

## Bloqueadores

### B1. O contrato de `pvpHitDamage` não encaixa no código de hoje

- **Onde:** linhas 333, 341 e 347; objetivo 4 (linha 272); `src/realtime/gameWorld.ts` (`cast` perto da linha 1571,
  `hitTarget` na 1873, projéteis nas 2075 a 2102, queimadura na 1946).
- **Problema:** o plano diz que a função recebe "atacante, alvo, jutsu, tier, nível de uso e regras" e entra no
  `hitTarget` e no `damagePlayer`. Mas o `hitTarget` recebe só um número pronto (`amount`), calculado no `cast` com
  atributos, nível de uso, passiva da vila e clima já multiplicados. Os projéteis (Fogo, Kunais) guardam `p.damage`
  pronto. A queimadura guarda `amount` pronto. Nenhum desses pontos sabe o jutsu, o tier ou o nível de uso. O
  desenvolvedor teria que decidir sozinho: a assinatura exata, como essa informação viaja do `cast` até o acerto
  (campo novo no projétil? no efeito?), onde entram a passiva e o clima (sim na Zona de Conflito, não no duelo), o
  combo do molhado (hoje aplicado fora, `WET_LIGHTNING_BONUS`), a arma no Ataque Básico e a ordem com o escudo e os
  Cinco Corações.
- **Recomendação:** escrever no plano:
  1. a assinatura, por exemplo `pvpHitDamage(hit: HitInfo, attacker: StatsView, target: StatsView, rules: PvpRules): number`;
  2. o tipo `HitInfo` com os campos (`skill`, `tier`, `useLevel`, `base`, `weaponBonus`, `scaling`, `wet`,
     `passive`, `sky`);
  3. que o `cast` monta um `HitInfo` e o passa ao `hitTarget`, ao `Projectile` e ao efeito de queimadura;
  4. que o `hitTarget` chama `pvpHitDamage` só quando `target.kind === 'player'` e usa `amount` para monstro;
  5. a ordem: `pvpHitDamage`, depois escudo/Corações, depois rede de segurança, depois a vida.

### B2. "Custo e recarga x4 e x2,5 no PvP": não diz quando vale

- **Onde:** objetivo 1 (linha 250), decisão 9 (linha 437), passo 1 (linha 441); `cast` em `gameWorld.ts`.
- **Problema:** o custo e a recarga são cobrados no `cast`, antes de saber quem foi atingido. O soco pode pegar um
  monstro e um jogador no mesmo golpe. O plano não diz se o x4 vale pelo mapa (duelo, arena, Zona de Conflito), pelo
  alvo focado, pelo que foi acertado (cobrando a diferença depois), ou sempre que o `DuelRules` estiver ativo. Também
  não diz como o cliente fica sabendo da recarga nova (hoje ele mostra a recarga do `config`).
- **Recomendação:** decidir uma regra só e escrever. Sugestão simples: vale em mapa de PvP (Vale das Estátuas, arena
  da vila e Zona de Conflito), lido de um campo `pvpCostMultiplier` no perfil de regras do mapa; o servidor manda a
  recarga efetiva no `cast` (campo `cooldownMs`) e o cliente usa esse valor.

### B3. O simulador vai falhar com os números do próprio plano, e o algoritmo dele não está escrito

- **Onde:** objetivo 5 (linhas 276 a 290), tabela da linha 94, `revisao_egm/numeros_atributos_pvp.md`, passo 1.
- **Problema 1 (contradição):** o critério diz "nenhuma sequência passa de 45% da vida do alvo em 2 s". Quem mata em
  menos de 4,4 s tira mais de 45% em algum trecho de 2 s. A tabela do plano tem 9 casos abaixo de 4,4 s (por exemplo,
  Taijutsu contra build de dano 2,0 s, Ninjutsu contra build de dano 3,1 s, Armas contra meio a meio 3,7 s). O
  critério "todo confronto entre 2 e 12 s" também fica no limite (2,0 s e 11,1 s). O passo 1 não fecha o
  `npm run verify` e o `npm run verify` trava o commit. Pelo mesmo motivo, a rede de segurança vai cortar dano em
  lutas normais de build de dano, o que briga com o critério de pronto "cortar em menos de 1 a cada 10 rodadas".
- **Problema 2 (algoritmo):** os números de hoje vêm de uma conta de um lado só (só o atacante bate, tudo acerta,
  ninguém se move, só o chakra inicial). O plano pede "chakra do duelo" (volta sozinho), "nenhuma build vence todas" e
  "tempo sem agir", que exigem uma luta dos dois lados. Não está escrito: a ordem em que cada build usa os jutsus
  (qual primeiro, quando usa o básico), qual tier entra (só tier 4? todos?), se o controle entra na luta simulada, o
  que é "vencer" (menor tempo para matar? e o empate?), a distância inicial (o soco avança), o que é "o kit cabe no
  chakra de 50 s".
- **Recomendação:** antes de codar, (a) rever o critério dos 45% (ou o número da rede) para casar com a tabela, ou
  aceitar que a build de dano fica fora desse critério, e escrever qual; (b) escrever o algoritmo do simulador em
  passos: rotação fixa por build (lista ordenada de jutsus, regra "usa o primeiro pronto e com chakra; senão básico"),
  tier 4 e todos os níveis de uso, os dois batem ao mesmo tempo a cada 0,4 s, controle aplicado com o orçamento,
  vencedor = quem zera primeiro, empate = ninguém vence; (c) dizer o que fazer quando falhar (qual número mexer
  primeiro, ou ativar o plano B das linhas 389 a 392).

### B4. As regras da rodada deixam decisões em aberto

- **Onde:** "Regras de borda da partida" (linhas 353 a 365), Análise 9 (linhas 210 a 225).
- **Problema:** não está escrito o que acontece entre rodadas: a vida, o chakra, as recargas, os efeitos, o escudo, a
  Substituição e a posição voltam ao início? Hoje a morte liga `respawnMs` e `arenaResult`; no duelo, a morte encerra
  a rodada, mas não diz se o jogador "morre" de verdade no `damagePlayer` nem quem trata isso. Faltam também: os dois
  morrem no mesmo instante (queimadura), empate na vida e no dano na rodada, empate na partida, e o que é "fora de
  combate" (o servidor não tem esse estado hoje). "Sair de propósito" não tem gatilho definido (fechar a aba vira
  desconexão).
- **Recomendação:** acrescentar uma lista: no começo de cada rodada vida e chakra cheios, recargas zeradas, efeitos,
  escudo e Substituição limpos, cada um no seu ponto de partida da área; morte no duelo não chama respawn nem
  `arenaResult`, só avisa o `duel.ts`; morte dupla = rodada empatada e repetida (ou vitória de quem tinha mais dano);
  "fora de combate" = não causou nem levou dano de jogador ou monstro nos últimos N s (dar o N); "sair de propósito" =
  mensagem `duel_leave`.

### B5. Não existe o protocolo cliente-servidor do duelo

- **Onde:** tabela da linha 336 (linhas "Etapas da partida" e "Tela"), objetivos 6 e 8; `src/realtime/protocol.ts`.
- **Problema:** o passo 2 depende de mensagens novas, e nenhuma está nomeada. O desenvolvedor teria que inventar:
  como o cliente desafia (por id do jogador?), como chega o convite, aceitar e recusar, os erros ("Vale cheio",
  "nível baixo", "em combate", "espera da recusa"), o estado da partida (etapa, rodada, placar, cronômetro), o kit do
  adversário com nível de uso e recargas, e o resultado. Também falta o código de erro de cada recusa no estilo de
  `CastFailReason`.
- **Recomendação:** escrever a tabela de mensagens com os campos. Exemplo: cliente `duel_challenge {targetId}`,
  `duel_answer {challengeId, accept}`, `duel_leave`; servidor `duel_invite {challengeId, from, level, village,
  expiresInMs}`, `duel_refused {reason}`, `duel_state {phase, round, score, endsInMs, opponentKit:[{skill, tier,
  useLevel, readyInMs}]}`, `duel_end {winner, reason, rounds}`. Dizer quando cada uma é mandada e com que frequência
  (o kit e as recargas: a cada mudança ou a cada segundo).

### B6. A migração v15 e `game.duel_result` não têm esquema, e a ordem de publicação não é segura

- **Onde:** tabela da linha 344, objetivo 9 (linha 299), passo 2 (linhas 443 a 446), `db/`.
- **Problema:** não há nome do arquivo, tabelas, colunas, tipos, chaves, índices, nem a assinatura de
  `game.duel_result` (argumentos, retorno, quem chama, permissões). Não está claro se o MMR é calculado em SQL ou no
  TypeScript, nem se a tabela de MMR entra no passo 2 ou no 2b (a linha 344 diz que a função grava o MMR "numa
  transação só", a linha 446 diz que o MMR vem depois). Também não diz o que o servidor faz se o código chegar à
  `main` e a função ainda não existir no Neon (a regra é: migração primeiro, mas um erro aqui derruba o fim da
  partida?).
- **Recomendação:** escrever o SQL esperado: arquivo `db/schema_v15_duelo.sql`; tabelas (ex.: `game.duel_matches`,
  `game.duel_rounds`, `game.duel_mmr`) com colunas e tipos (kit e níveis de uso em `jsonb`, `balance_version text`);
  `CREATE TABLE IF NOT EXISTS`; `CREATE OR REPLACE FUNCTION game.duel_result(p jsonb) RETURNS bigint`; tudo em
  `BEGIN; ... COMMIT;`, sem `DO $$`. Decidir: a tabela de MMR já nasce na v15 (vazia) e a conta entra no 2b. No
  servidor: se a gravação falhar, a partida termina normalmente para os jogadores, o erro vai para o log e o
  resultado não é perdido em silêncio.

---

## Importantes

### I1. O passo 1 junta sete peças e não tem subpassos publicáveis

- **Onde:** linhas 441 e 442.
- **Problema:** vida por nível, tabela, `pvpHitDamage`, orçamento de controle, rede de segurança, simulador e teste do
  PvE saem juntos. Se o simulador falhar (ver B3), nada sai. A ordem interna também não está dita, e o teste que trava
  o dano do PvE precisa ser escrito ANTES de qualquer mudança, para gravar os números de hoje.
- **Recomendação:** dividir em 1a teste do PvE (números de hoje); 1b vida por nível; 1c `pvpBalance.ts` e
  `pvpHitDamage` ligados ao `hitTarget`; 1d orçamento de controle; 1e rede de segurança; 1f simulador. Cada um com
  `npm run verify` verde e publicável sozinho.

### I2. Vida por nível: o contrato no código não está fechado

- **Onde:** objetivo "Antes da tabela" (linha 241), linha 346; `stats.ts` linha 91, `gameWorld.ts` `computeStats`
  (linha 680) e subida de nível (linha 3111); `test/v8.test.ts` linha 150.
- **Problema:** `computeStats(attributes)` não recebe o nível e não é chamado de novo quando o ninja sobe de nível. Não
  diz onde fica o "+6" (`AttributeRules`? `player`?), se a vida atual sobe junto na subida de nível, nem que o teste
  `v8.test.ts` (espera 379 com 59 de Vitalidade) vai quebrar e precisa ser atualizado.
- **Recomendação:** escrever: campo `hpPerLevel: 6` em `combat.attributes`; `derivedStats(base, rules, a, level)`;
  `computeStats` recebe `session.level` e roda também na subida de nível; a vida atual ganha os +6 na subida; o teste
  de v8 passa a usar nível 1 (ou espera 733 no nível 60).

### I3. Orçamento de controle: faltam as regras finas

- **Onde:** objetivo 2 (linhas 263 a 268); `applyStatus` (linha 2001), `applyEffect` (linha 1904), `effects.ts`.
- **Problema:** não diz: se a janela de 15 s é deslizante; o que fazer quando sobra só parte do orçamento (aplica
  0,5 s ou nada?); como medir "o tempo que durou de fato" (precisa guardar início e fim de cada controle e fechar
  quando o sono acaba); onde fica o estado (campo novo na `Session`?); se a Máscara Intangível continua antes; como
  passar "quem causou" ao `applyStatus` (hoje ele não tem esse argumento).
- **Recomendação:** escrever: janela deslizante; controle que excede é cortado para o que sobra, e nada se sobrar
  menos de 0,2 s (ou outro número); estado `ccLog: {from, until, weight}[]` na `Session`; nova assinatura
  `applyStatus(target, status, ms, t, source?: Session)`; com `source` jogador usa o orçamento, sem ele usa o
  `controlDr`.

### I4. Rede de segurança: faltam a janela, a ordem e o destino dos cortes

- **Onde:** objetivo 3 (linhas 269 a 271), linha 381; `damagePlayer` (linha 3132), `pvpStats.ts`.
- **Problema:** não diz se a janela de 2 s é deslizante, se conta o dano antes ou depois do escudo, onde guarda o
  histórico por atacante, nem como o corte chega ao Painel do Admin no passo 1 (sem banco; o `PvpStats` zera a cada
  publicação).
- **Recomendação:** janela deslizante; conta o dano depois do escudo; `Map<attackerId, {t, dmg}[]>` no alvo, limpo
  com o tempo; no passo 1 o corte entra no `PvpStats` (memória) com a versão da tabela e aparece no painel atual; no
  passo 2 vai também para `duel_rounds`.

### I5. `DuelRules`: falta o formato e onde cada regra é lida

- **Onde:** objetivo 7 (linha 294), linha 339.
- **Problema:** o plano pede "perfil, não `if` espalhado", mas não dá o tipo nem os pontos do código que leem cada
  campo (regeneração no tique, meditação, itens de cura, contador de usos no `cast`, `maxRewindMs`, passiva, clima,
  poderes da Akatsuki).
- **Recomendação:** dar o tipo (ex.: `{ villagePassive: boolean; weather: boolean; akatsuki: boolean;
  chakraRegenFactor: number; hpRegen: boolean; meditation: boolean; healItems: boolean; maxRewindMs: number;
  countUses: boolean }`), o perfil padrão (hoje) e o do duelo, e a lista de funções que passam a ler o perfil.

### I6. O mapa Vale das Estátuas não está desenhado

- **Onde:** linhas 175, 343, 359 e 360; `maps.ts`.
- **Problema:** só há o tamanho (2 áreas de 18 x 12). Faltam o id do mapa, o desenho (paredes, estátuas, obstáculos),
  os pontos de partida de cada lado, como se chega (só teleporte?), como guarda e devolve a posição de volta, e como o
  cliente fixa a câmera (hoje ela segue o jogador).
- **Recomendação:** anexar o mapa no formato do `maps.ts` (ou um esboço em grade), os pontos de partida, a regra de
  volta (`returnTo: {map, x, y}` guardado na partida) e a mudança no cliente para a câmera fixa.

### I7. Não há plano de volta atrás nem interruptor para o passo 1

- **Onde:** passo 1; Riscos (linha 381).
- **Problema:** o passo 1 muda todo PvP (arena e Zona de Conflito) e a vida de todos no PvE, direto na `main`. O
  interruptor `duelo` só cobre o passo 2. Se algo der errado, não está escrito como voltar.
- **Recomendação:** dizer que a volta é `git revert` do commit (não há migração no passo 1), ou criar no `config.ts`
  `combat.pvpBalance: boolean` e deixar `hpPerLevel` como número que pode ir a 0, para desligar sem reverter.

### I8. A tela do duelo e o fluxo do desafio no cliente não estão descritos

- **Onde:** objetivos 6 e 8, linha 345; `public/`.
- **Problema:** não diz onde fica o botão "Desafiar" (no perfil do jogador ao tocar nele? no menu?), como aparece o
  convite (janela com tempo?), nem onde ficam placar, cronômetro e kit do adversário no celular deitado.
- **Recomendação:** um esboço simples da tela (pode ser texto) com a posição de cada peça e o arquivo de `public/`
  que muda.

### I9. O teste do PvE não diz quais números travar

- **Onde:** objetivo 4 (linha 275), linha 347.
- **Problema:** "trava os números de dano contra monstros de hoje" pode ser muita coisa. Falta a lista de casos.
- **Recomendação:** dar a lista: cada jutsu da classe, tier 1 e 4, nível de uso 1 e 4, com 0 e 59 pontos no atributo,
  contra um monstro fixo; mais o Ataque Básico com e sem arma. Valores gravados antes do passo 1b.

---

## Detalhes

### D1. "Migração v15" se confunde com a versão v15 do jogo

- **Onde:** linhas 344, 376 e 444.
- **Problema:** a última migração é `db/schema_v14_acessorio.sql`, mas "v15" também é uma versão do jogo no README e
  já existe `test/v15.test.ts`.
- **Recomendação:** dar o nome do arquivo (`db/schema_v15_duelo.sql`) e a versão do jogo que ele acompanha (v28?).

### D2. O aviso no chão aparece e some

- **Onde:** linhas 193, 298 e 345.
- **Problema:** a tabela da linha 345 põe "aviso no chão" na tela; o objetivo 8 diz que ele fica para depois.
- **Recomendação:** tirar da linha 345.

### D3. O teste de rede não tem ferramenta

- **Onde:** Análise 8 (linhas 199 e 200).
- **Problema:** "testado com 150 ± 50 ms e 1% de perda" não diz como (teste automático? manual?).
- **Recomendação:** dizer se é um teste em `test/lagComp.test.ts` com atraso simulado ou uma conferência manual.

### D4. Interruptor `duelo` no painel: mecanismo não citado

- **Onde:** objetivo 11, decisão 4.
- **Problema:** não diz qual tela e qual rota do painel mudam o valor em memória.
- **Recomendação:** apontar a função de `admin.ts` que já faz algo parecido, ou descrever a rota nova.

### D5. MMR de prévia (2b): faltam pequenos números

- **Onde:** decisão 2 (linhas 420 a 427).
- **Problema:** não diz a escala do Elo (400 de sempre?), o fuso do "por dia" e o que fazer quando os dois têm o
  mesmo `n`.
- **Recomendação:** escala 400; dia pelo fuso de São Paulo; com `n` igual, o fator vale para nenhum (ou para os dois).

### D6. Cura e escudo "de jogador em jogador"

- **Onde:** objetivo 1 (linhas 246 a 248).
- **Problema:** a curva vale para a cura, mas não diz se vale a cura em si mesmo e o escudo em si mesmo (não há outro
  jogador envolvido).
- **Recomendação:** escrever: vale para toda cura e escudo quando o `DuelRules` ou o mapa de PvP estiver ativo.
