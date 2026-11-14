-- =====================================================================================================================
-- v34: o ninja volta sempre ao último lugar onde estava (v59 do jogo). Rode no SQL Editor do Neon, no branch
-- `production`, DEPOIS da v33. Pode rodar de novo sem erro. Nada é apagado.
--
--  game.player_positions: o mapa e a posição (x, y em casas) da última vez que o servidor gravou (a cada 30 s com o
--  jogador andando, quando ele sai e quando o servidor desliga). Sem linha = nasce na praça da vila (conta nova, morreu,
--  saiu na arena/Vale). O servidor confere tudo ao entrar (mapa existe, fora da parede, acesso permitido).
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.player_positions (
  player_id uuid        PRIMARY KEY REFERENCES game.players(id) ON DELETE CASCADE,
  map_id    text        NOT NULL,
  x         real        NOT NULL,
  y         real        NOT NULL,
  saved_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE game.player_positions DROP CONSTRAINT IF EXISTS ck_player_positions_map;
ALTER TABLE game.player_positions ADD CONSTRAINT ck_player_positions_map CHECK (map_id ~ '^[a-z0-9_]{1,40}$');
ALTER TABLE game.player_positions DROP CONSTRAINT IF EXISTS ck_player_positions_xy;
ALTER TABLE game.player_positions ADD CONSTRAINT ck_player_positions_xy CHECK (x >= 0 AND x <= 1000 AND y >= 0 AND y <= 1000);

COMMIT;
