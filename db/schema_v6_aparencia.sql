-- =====================================================================
-- Nin Online Mobile: migração v6 (visual do personagem / paperdoll)
--
-- Rode DEPOIS da v5 (schema_v5_atributos.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro. Não apaga nem muda nada que já existe.
--
-- appearance = as cores das 5 partes do boneco, no formato que o <input type="color">
-- devolve ("#rrggbb", minúsculo):
--   {"skin":"#f1c9a0","hair":"#2b2118","shirt":"#2f5d8a","pants":"#2a2a33","cape":"#8a2b2b"}
-- NULL = o jogador ainda não passou pelo Criador de Personagem (o jogo abre a tela de
-- criação). Os outros jogadores veem o visual padrão enquanto isso.
-- O banco recusa qualquer outra coisa (chave a mais, cor inválida, texto solto).
-- =====================================================================

BEGIN;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS appearance jsonb;

CREATE OR REPLACE FUNCTION game.valid_appearance(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN a IS NULL OR (
  jsonb_typeof(a) = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(a)) = 5
  AND a ?& ARRAY['skin', 'hair', 'shirt', 'pants', 'cape']
  AND (SELECT bool_and(v ~ '^#[0-9a-f]{6}$') FROM jsonb_each_text(a) AS e(k, v))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_appearance') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_appearance CHECK (game.valid_appearance(appearance));
  END IF;
END
$$;

COMMENT ON COLUMN game.players.appearance IS 'Cores do paperdoll: skin, hair, shirt, pants, cape ("#rrggbb"). NULL = personagem ainda não criado.';

COMMIT;

-- Conferência (opcional):
-- SELECT username, appearance FROM game.players ORDER BY created_at DESC LIMIT 5;
