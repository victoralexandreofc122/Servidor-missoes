-- =====================================================================================================================
-- v39: os fragmentos da Crônica gravados no banco (v65 do jogo; decisão do Victor, 15/11/2026). Rode no SQL Editor do
-- Neon, no branch `production`, DEPOIS da v38. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.player_fragments: quem achou qual fragmento e quando. O servidor confere que o ninja estava no lugar do
--     fragmento antes de gravar, e paga o prêmio (30 ryō e 60 XP) só na 1ª vez de cada um.
--
-- Sem esta migração o jogo segue como na v64: o fragmento fica guardado só no aparelho, sem prêmio.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.player_fragments (
  player_id      uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  fragment_code  text        NOT NULL,
  found_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, fragment_code)
);
ALTER TABLE game.player_fragments DROP CONSTRAINT IF EXISTS ck_player_fragments_code;
ALTER TABLE game.player_fragments ADD CONSTRAINT ck_player_fragments_code CHECK (fragment_code ~ '^FRG_[0-9]{2}$');

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.player_fragments;                                 -- 0 logo depois de rodar
-- SELECT fragment_code, count(*) FROM game.player_fragments GROUP BY 1 ORDER BY 1;   -- quantos acharam cada um
