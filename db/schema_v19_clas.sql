-- =====================================================================================================================
-- v19: os clãs (linhagem). Rode no SQL Editor do Neon, no branch `production`, depois da v18. Pode rodar de novo sem erro.
--
--  1. game.players.clan: a linhagem do ninja (rubro, umbra ou andarilho; NULL = ainda não despertou). O despertar é a
--     partir de Genin, no nível 11, e é uma vez só.
--  2. game.jutsus.clan_code: jutsu de clã (não sai na Extração; chega pelo nível depois do despertar). A regra
--     "sem classe = Academia (tier 0)" passa a valer para "sem classe e sem clã".
--  3. Os 4 jutsus do Clã Rubro. O Clã Umbra usa a árvore das sombras que já existe.
-- =====================================================================================================================
BEGIN;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS clan text;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_clan;
ALTER TABLE game.players ADD CONSTRAINT ck_players_clan CHECK (clan IS NULL OR clan IN ('rubro', 'umbra', 'andarilho'));

ALTER TABLE game.jutsus ADD COLUMN IF NOT EXISTS clan_code text;
ALTER TABLE game.jutsus DROP CONSTRAINT IF EXISTS ck_jutsus_clan;
ALTER TABLE game.jutsus ADD CONSTRAINT ck_jutsus_clan CHECK (clan_code IS NULL OR clan_code IN ('rubro', 'umbra'));
ALTER TABLE game.jutsus DROP CONSTRAINT IF EXISTS ck_jutsus_academy;
ALTER TABLE game.jutsus ADD CONSTRAINT ck_jutsus_academy CHECK ((class_code IS NULL AND clan_code IS NULL) = (tier = 0));

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('rubro_olho',     'Olho da Percepção',  NULL, 'rubro', 1),
  ('rubro_transe',   'Transe Ocular',      NULL, 'rubro', 2),
  ('rubro_chamas',   'Chamas Negras',      NULL, 'rubro', 3),
  ('rubro_guardiao', 'Guardião Espectral', NULL, 'rubro', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, clan_code = EXCLUDED.clan_code, tier = EXCLUDED.tier;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, tier FROM game.jutsus WHERE clan_code = 'rubro' ORDER BY tier;   -- 4 linhas
-- SELECT count(*) FROM game.players WHERE clan IS NOT NULL;                           -- 0 logo depois de rodar
