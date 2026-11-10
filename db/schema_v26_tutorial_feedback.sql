-- =====================================================================================================================
-- v26: Pergaminho do Mestre (tutorial paginado) e Feedback dentro do jogo. Rode no SQL Editor do Neon, no branch
-- `production`, DEPOIS da v25. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.player_tutorial: os capítulos do Pergaminho do Mestre que o jogador desbloqueou e os que já leu. O prêmio
--     (50 ryō e 100 XP) sai uma vez só por capítulo: o servidor só paga quando read_at passa de NULL para a data.
--  2. game.feedback: o relato do jogador (Menu > Feedback), com a categoria, o estado (novo ou resolvido) e o contexto
--     capturado na hora (nome, nível, classe, linhagem, mapa, posição, tela aberta, aparelho). O admin vê na aba Feedback.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.player_tutorial (
  player_id   uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  chapter     text        NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  PRIMARY KEY (player_id, chapter)
);
ALTER TABLE game.player_tutorial DROP CONSTRAINT IF EXISTS ck_player_tutorial_chapter;
ALTER TABLE game.player_tutorial ADD CONSTRAINT ck_player_tutorial_chapter CHECK (chapter ~ '^[a-z_]{2,32}$');

CREATE TABLE IF NOT EXISTS game.feedback (
  id          bigserial   PRIMARY KEY,
  player_id   uuid        REFERENCES game.players(id) ON DELETE SET NULL,
  content     text        NOT NULL,
  category    text        NOT NULL DEFAULT 'outro',
  status      text        NOT NULL DEFAULT 'novo',
  context     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid        REFERENCES game.players(id) ON DELETE SET NULL
);
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_content;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_content CHECK (char_length(content) BETWEEN 3 AND 1500);
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_category;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_category CHECK (category IN ('bug', 'sugestao', 'balanceamento', 'outro'));
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_status;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_status CHECK (status IN ('novo', 'resolvido'));
CREATE INDEX IF NOT EXISTS ix_feedback_status_created ON game.feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_feedback_player ON game.feedback (player_id);

COMMIT;

-- Conferência (opcional):
-- SELECT to_regclass('game.player_tutorial') IS NOT NULL AS tutorial, to_regclass('game.feedback') IS NOT NULL AS feedback;   -- t, t
