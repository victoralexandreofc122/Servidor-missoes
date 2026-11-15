-- =====================================================================================================================
-- v35: Vínculo Ancestral e Estado Primal (v60 do jogo). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da
-- v34. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.player_vinculo: as criaturas de cada ninja (Sapo, Lobo, Águia, Gato, Lesma, Aranha, Tartaruga, Tigre), com a
--     afinidade (1 a 5) e o XP dela. `equipped` marca a criatura escolhida na aba "Vínculo Ancestral" (uma por ninja).
--  2. game.player_primal_state: o Estado Primal (até quando vale e até quando está em recarga), para o relogar não zerar.
--  3. game.vinculo_level(xp): a afinidade pelo XP (100, 300, 600 e 1000 para os níveis 2 a 5; igual a src/realtime/vinculo.ts).
--  4. game.vinculo_equip(ninja, criatura) e game.vinculo_add_xp(ninja, criatura, xp).
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.player_vinculo (
  id             bigserial   PRIMARY KEY,
  player_id      uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  creature_type  text        NOT NULL,
  affinity_level smallint    NOT NULL DEFAULT 1,
  xp             integer     NOT NULL DEFAULT 0,
  equipped       boolean     NOT NULL DEFAULT false,
  UNIQUE (player_id, creature_type)
);
ALTER TABLE game.player_vinculo DROP CONSTRAINT IF EXISTS ck_player_vinculo_creature;
ALTER TABLE game.player_vinculo ADD CONSTRAINT ck_player_vinculo_creature
  CHECK (creature_type IN ('sapo', 'lobo', 'aguia', 'gato', 'lesma', 'aranha', 'tartaruga', 'tigre'));
ALTER TABLE game.player_vinculo DROP CONSTRAINT IF EXISTS ck_player_vinculo_level;
ALTER TABLE game.player_vinculo ADD CONSTRAINT ck_player_vinculo_level CHECK (affinity_level BETWEEN 1 AND 5);
ALTER TABLE game.player_vinculo DROP CONSTRAINT IF EXISTS ck_player_vinculo_xp;
ALTER TABLE game.player_vinculo ADD CONSTRAINT ck_player_vinculo_xp CHECK (xp >= 0);
-- uma criatura equipada por ninja
CREATE UNIQUE INDEX IF NOT EXISTS ux_player_vinculo_equipped ON game.player_vinculo (player_id) WHERE equipped;

CREATE TABLE IF NOT EXISTS game.player_primal_state (
  player_id      uuid        PRIMARY KEY REFERENCES game.players(id) ON DELETE CASCADE,
  active_until   timestamptz,
  cooldown_until timestamptz
);

CREATE OR REPLACE FUNCTION game.vinculo_level(p_xp integer) RETURNS smallint
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN p_xp >= 1000 THEN 5 WHEN p_xp >= 600 THEN 4 WHEN p_xp >= 300 THEN 3 WHEN p_xp >= 100 THEN 2 ELSE 1 END)::smallint
$$;

-- Equipa a criatura (cria a linha na primeira vez) e tira a marca das outras.
CREATE OR REPLACE FUNCTION game.vinculo_equip(p_player uuid, p_creature text) RETURNS void
LANGUAGE sql AS $$
  UPDATE game.player_vinculo SET equipped = false WHERE player_id = p_player AND creature_type <> p_creature AND equipped;
  INSERT INTO game.player_vinculo (player_id, creature_type, equipped) VALUES (p_player, p_creature, true)
  ON CONFLICT (player_id, creature_type) DO UPDATE SET equipped = true;
$$;

-- Soma XP de afinidade (a criatura ganha ao lutar) e devolve o nível e o XP de agora.
CREATE OR REPLACE FUNCTION game.vinculo_add_xp(p_player uuid, p_creature text, p_xp integer)
RETURNS TABLE (affinity_level smallint, xp integer)
LANGUAGE sql AS $$
  INSERT INTO game.player_vinculo AS v (player_id, creature_type, xp, affinity_level)
  VALUES (p_player, p_creature, GREATEST(0, p_xp), game.vinculo_level(GREATEST(0, p_xp)))
  ON CONFLICT (player_id, creature_type) DO UPDATE
    SET xp = LEAST(v.xp + GREATEST(0, p_xp), 1000000), affinity_level = game.vinculo_level(LEAST(v.xp + GREATEST(0, p_xp), 1000000))
  RETURNING v.affinity_level, v.xp;
$$;

COMMIT;
