# Fase 2 (Endgame): plano de arquitetura

Base: `docs/endgame-visao.md` (documento canônico). Este plano diz **como** e **em que ordem** construir. Cada etapa só
começa com o OK do Victor, tem migração própria, regras conferidas no servidor e no banco, e testes das contas.

## 1. O que já existe e será reaproveitado

| Peça | Onde | Uso na Fase 2 |
|---|---|---|
| Duelo em arena (rodadas, queda de conexão, espectadores na arquibancada) | `src/realtime/duel.ts`, `gameWorld.ts` | Motor das partidas do Torneio, dos Torneios de campeão e das chaves |
| Rankeado com MMR e temporada de 60 dias | `rankedStore.ts`, `db/schema_v15` | Modelo para o modo separado; o MMR **não** é tocado pelo Torneio |
| Vilas, Kage eleito, votos, diplomacia, renegados, recompensa, Os Cinzas | `endgame.ts`, `endgameStore.ts`, `db/schema_v11` | Base da eleição ponderada, do ANBU e da Caçada (serão alterados, não refeitos) |
| População ativa (`last_seen_at`, 7 dias) | `db/schema_v11` | Conta das vagas de Jounin e balanceamento populacional |
| Patentes `JONIN`, `ANBU`, `HOKAGE` | `game.ranks` (v23) | Passam a ser dadas pelos sistemas da Fase 2 |
| Fila de gravação por jogador e desligamento seguro | `gameWorld.ts` (v37) | Toda gravação nova entra por ela |

## 2. Decisões de arquitetura

1. **Era = `game.seasons`** (v27). É o relógio mestre de 60 dias. O rankeado (`ranked_seasons`) e a Zona de Conflito
   (`pvp_seasons`) continuam com as tabelas deles; numa etapa futura o fechamento da era fecha os três juntos.
2. **Regra no banco, decisão no servidor, desenho no cliente.** Cada regra de negócio vira função SQL que confere tudo
   de novo (janela, elegibilidade, limites). O servidor repete a conta antes de montar a partida; o cliente só pede.
3. **Um módulo por sistema**, fora do `gameWorld.ts` (que já passa de 6.000 linhas): `seasonStore.ts` (feito),
   depois `tournament.ts` (chaves), `election.ts`, `anbu.ts`, `bounty.ts`, `war.ts`. O `gameWorld` só chama.
4. **Liga e desliga por módulo** (`game.endgame_modules`, já existe): cada sistema novo entra desligado e o admin liga.
5. **Guerra final em processo separado** (etapa 5): o mesmo código do servidor, iniciado em modo guerra, com outra
   porta; o servidor principal entrega um bilhete assinado (JWT curto) para o jogador entrar. Espectador = conexão
   só de leitura.

## 3. Entrega 1 (feita neste branch): v27 e a fase de pontos

- `db/schema_v27_temporadas.sql`: `game.seasons`, `game.jounin_slots`, `game.jounin_points`, `game.jounin_matches`,
  `game.jounin_era`; funções `jounin_slots_for`, `jounin_open`, `jounin_eligible`, `jounin_result`, `jounin_standings`.
- `src/realtime/seasonStore.ts`: as mesmas contas em funções puras e o acesso ao banco.
- Testes: `test/temporada.test.ts` (contas) e `test/v27.integration.test.ts` (banco real).
- **Ainda não ligado ao jogo:** nenhuma partida chama `jounin_result` até a etapa 2 abaixo. Rodar a v27 não muda nada
  para os jogadores.

## 4. Torneio de Jounin: passo a passo

| Passo | O que entra | Migração |
|---|---|---|
| 1 (feito) | Eras, vagas, pontos, histórico, classificação | v27 |
| 2 | **Fila do Torneio no servidor:** modo novo do duelo (`mode: 'jounin'`), só na janela da fase de pontos, só elegíveis; ao fim da partida chama `jounin_result`; comando `/admin torneio abrir|fechar` | nenhuma |
| 3 | **Cliente da fase de pontos:** botão na Arena, placar da vila (posição, pontos, partidas até 15, linha de corte dos finalistas), vagas da vila | nenhuma |
| 4 | **Fase final, grupos:** fecha a fase de pontos, sorteia os finalistas (2x as vagas) em grupos, agenda as partidas, tabela dos grupos | v28 |
| 5 | **Fase final, eliminatória:** chaves, uma luta por vez com público, W.O. por ausência | v28 |
| 6 | **Encerramento:** grava `jounin_era`, promove a `JONIN`, paga 200 ryō e o título de consolação aos não classificados, anuncia | v28 |
| 7 | Teste de carga da fila e ensaio completo com bots | nenhuma |

## 5. Depois do Torneio (ordem do Victor)

| Etapa | Sistema | Base existente | Migração prevista |
|---|---|---|---|
| 2 | Eleição do Kage: só Jounin candidato, peso 1/2/3, voto secreto, sem reeleição, passiva do ex-Kage | `kage_elections`, `kage_votes` | v29 |
| 3 | ANBU: 1 a 10 por Kage, 10 armas por vila, máscara, interregno | `village_kages`, itens | v30 |
| 4 | Renegados: Torneio dos Renegados, Maior Vilão, lei da Terra Sem Lei, Caçada | renegados e recompensa da v11 | v31 |
| 5 | Guerra 20v20 semanal e guerra final (servidor isolado, espectador) | nada | v32 em diante |

## 6. Decisões que preciso do Victor (o documento canônico deixa em aberto)

1. **Adversários na fase de pontos:** só da mesma vila, ou de qualquer vila? (v27 aceita qualquer vila; a classificação
   é por vila.)
2. **Pontos negativos:** a v27 não deixa cair abaixo de 0. Confirma?
3. **Trava contra combinação de resultado:** o mesmo par conta no máximo 3 partidas em 24 h (igual ao rankeado). Confirma?
4. **"Jounin atuais":** a v27 barra quem tem patente Jounin, ANBU ou Kage e quem já está no registro de alguma era
   (título permanente = nunca disputa de novo). É isso?
5. **"Ativos" para as vagas:** entrou nos últimos 7 dias e saiu da Academia (a regra que o fim de jogo já usa). Confirma?
6. **Janela da fase de pontos:** semanas 3 e 4 da era (dias 15 a 28). A fase final ocupa quantos dias?
7. **Grupos da fase final:** tamanho do grupo e quantos passam (pendência 2 do documento canônico).
8. **Nomes novos** (regra do CLAUDE.md, 3 opções cada, antes de aparecerem no jogo): título de consolação ("Serei o
   próximo Jounin" está no documento: vale como aprovado?), as 10 armas ANBU por vila, as leis da Terra Sem Lei.
