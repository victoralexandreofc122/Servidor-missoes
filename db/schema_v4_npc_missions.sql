-- =====================================================================
-- Nin Online Mobile: migração v4 (NPC Mestre e missões de abate)
--
-- Rode DEPOIS da v3 (schema_v3_auth.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada INSERT ignora o que já existe.
-- Não cria tabela nem altera coluna: usa o ciclo de sensei_missions da v2.
--
-- O que entra (tudo é catálogo, "evolui com INSERT, não ALTER"):
--  * Tipo de missão DEFEAT_MONSTER: derrotar target_quantity monstros do tipo
--    target_code (ex.: 'slime'). O servidor do jogo conta os abates.
--  * Título MASTER_DISCIPLE ("Discípulo do Mestre") e a dificuldade NPC_TRAINING
--    ("Treino do Mestre", 50 XP + esse título). XP e título da missão continuam
--    vindo do catálogo pelo trigger, nunca do cliente.
--  * O NPC Mestre como um jogador de verdade em game.players, com o rank mais alto.
--    Assim ele é o sensei_id das missões que cria e o evaluated_by das avaliações:
--    as mesmas FKs e os mesmos triggers das missões entre jogadores valem para ele.
--
-- Por que o NPC não vira uma conta que alguém usa:
--  * id fixo, sem e-mail e sem senha: o login sempre recusa (como conta antiga).
--  * Nome "Sensei Mestre", com espaço: o cadastro só aceita [A-Za-z0-9_], então
--    nenhum jogador consegue esse nome, e um jogador já chamado "Mestre" não
--    trava esta migração.
-- =====================================================================

BEGIN;

INSERT INTO game.mission_types (code, name, description) VALUES
  ('DEFEAT_MONSTER', 'Derrotar monstros', 'Derrotar target_quantity monstros do tipo target_code (contado pelo servidor do jogo)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.titles (code, name, description) VALUES
  ('MASTER_DISCIPLE', 'Discípulo do Mestre', 'Concluiu um treino do Mestre na Sala de Missões')
ON CONFLICT (code) DO NOTHING;

-- tier 5: abaixo da Básica (10). Os tiers são únicos; 5 estava livre.
INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('NPC_TRAINING', 'Treino do Mestre', 5, 50, (SELECT id FROM game.titles WHERE code = 'MASTER_DISCIPLE'))
ON CONFLICT (code) DO NOTHING;

-- Mesmo id no código do servidor (src/realtime/missions.ts, NPC_SENSEI_ID).
-- Rank mais alto que existir: todo aprendiz fica abaixo dele (regra rule_trainee_rank).
INSERT INTO game.players (id, username, current_rank_id)
VALUES ('00000000-0000-7000-8000-00000000a001', 'Sensei Mestre', (SELECT id FROM game.ranks ORDER BY tier DESC LIMIT 1))
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Conferência (opcional): deve devolver 1 linha com as 4 colunas preenchidas.
-- SELECT p.username, r.code AS rank, d.code AS dificuldade, t.code AS tipo
--   FROM game.players p
--   JOIN game.ranks r ON r.id = p.current_rank_id
--   CROSS JOIN (SELECT code FROM game.mission_difficulties WHERE code = 'NPC_TRAINING') d
--   CROSS JOIN (SELECT code FROM game.mission_types WHERE code = 'DEFEAT_MONSTER') t
--  WHERE p.id = '00000000-0000-7000-8000-00000000a001';
