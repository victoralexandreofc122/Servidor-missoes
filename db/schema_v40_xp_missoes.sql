-- =====================================================================================================================
-- v40: o XP das missões da Sala de Missões (v70 do jogo; pedido do Victor, 17/11/2026). Rode no SQL Editor do Neon, no
-- branch `production`, DEPOIS da v39. Pode rodar de novo sem erro. Nada é apagado.
--
--  Fácil (NPC_EASY): 30 -> 50 XP · Normal (NPC_TRAINING, o "Treino do Mestre"): 50 -> 150 XP · Difícil (NPC_HARD): 150 -> 325 XP
--
-- A missão já aceita guarda o XP de quando foi criada (o gatilho copia na criação): o valor novo vale para as próximas.
-- Sem esta migração o jogo segue igual, com os valores antigos.
-- =====================================================================================================================
BEGIN;

UPDATE game.mission_difficulties SET xp_reward = 50  WHERE code = 'NPC_EASY';
UPDATE game.mission_difficulties SET xp_reward = 150 WHERE code = 'NPC_TRAINING';
UPDATE game.mission_difficulties SET xp_reward = 325 WHERE code = 'NPC_HARD';

COMMIT;

-- Conferência (opcional):
-- SELECT code, xp_reward FROM game.mission_difficulties WHERE code IN ('NPC_EASY', 'NPC_TRAINING', 'NPC_HARD') ORDER BY xp_reward;
