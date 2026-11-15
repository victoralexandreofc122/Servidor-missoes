-- =====================================================================================================================
-- v37: Progressão de Mundo e Loot dos chefes (v62 do jogo). Rode no SQL Editor do Neon, no branch `production`, DEPOIS
-- da v36. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.world_progression (uma linha): a população ativa (7 dias, game.active_population), o marco alcançado (0, 30,
--     60, 100, 150 ou 250; nunca volta atrás) e o marco forçado pelo admin (override_stage; NULL = segue a população).
--     COMEÇA EM 250 (tudo aberto) para o Teste Alpha não perder a Floresta com poucos jogadores: o admin liga a regra com
--     "/admin mundo auto" quando quiser.
--  2. game.world_progression_refresh(dias) e game.world_progression_override(admin, marco).
--  3. Relíquias (loot dos chefes): o tipo 'relic' no catálogo e as 11 relíquias (nomes da opção A; a v38 acerta os
--     nomes de quem já rodou esta); game.loot_drops (o registro de cada drop) e game.loot_revives (o Renascer usado na Era).
-- =====================================================================================================================
BEGIN;

-- A população ativa (igual à v11: a v37 não depende dela; banco sem a v11 também roda)
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
CREATE OR REPLACE FUNCTION game.active_population(p_days integer DEFAULT 7) RETURNS integer
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT count(*)::int FROM players
   WHERE last_seen_at > now() - make_interval(days => p_days) AND tutorial_step >= 4 AND NOT is_admin
$$;

CREATE TABLE IF NOT EXISTS game.world_progression (
  id             smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_players integer     NOT NULL DEFAULT 0,
  stage          smallint    NOT NULL DEFAULT 0 CHECK (stage IN (0, 30, 60, 100, 150, 250)),
  override_stage smallint    CHECK (override_stage IN (0, 30, 60, 100, 150, 250)),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO game.world_progression (id, override_stage) VALUES (1, 250) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION game.world_stage(p_population integer) RETURNS smallint
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN p_population >= 250 THEN 250 WHEN p_population >= 150 THEN 150 WHEN p_population >= 100 THEN 100
               WHEN p_population >= 60 THEN 60 WHEN p_population >= 30 THEN 30 ELSE 0 END)::smallint
$$;

-- A cada minuto: conta a população e sobe o marco (nunca desce). Devolve a população, o marco e o forçado.
CREATE OR REPLACE FUNCTION game.world_progression_refresh(p_days integer DEFAULT 7)
RETURNS TABLE (active_players integer, stage smallint, override_stage smallint)
LANGUAGE sql AS $$
  INSERT INTO game.world_progression (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  UPDATE game.world_progression w
     SET active_players = game.active_population(p_days),
         stage = GREATEST(w.stage, game.world_stage(game.active_population(p_days))),
         updated_at = now()
   WHERE w.id = 1
  RETURNING w.active_players, w.stage, w.override_stage;
$$;

-- /admin mundo <marco|auto>: força um marco (NULL volta para a população).
CREATE OR REPLACE FUNCTION game.world_progression_override(p_admin uuid, p_stage smallint) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  UPDATE world_progression SET override_stage = p_stage, updated_at = now() WHERE id = 1;
  PERFORM admin_log(p_admin, 'mundo', NULL, jsonb_build_object('stage', p_stage), true, NULL);
END $$;

-- Relíquias: o tipo novo e o catálogo
ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory', 'consumable', 'relic'));
INSERT INTO game.items (code, name, kind) VALUES
  ('reliquia_c_vida', 'Amuleto do Fôlego', 'relic'),
  ('reliquia_c_chakra', 'Amuleto da Corrente', 'relic'),
  ('reliquia_c_golpe', 'Amuleto do Punho', 'relic'),
  ('reliquia_r_firmeza', 'Selo da Firmeza', 'relic'),
  ('reliquia_r_couraca', 'Selo da Couraça', 'relic'),
  ('reliquia_r_vigor', 'Selo do Vigor', 'relic'),
  ('reliquia_e_sangue', 'Presa Rubra', 'relic'),
  ('reliquia_e_ultimo', 'Último Fôlego', 'relic'),
  ('reliquia_e_fluxo', 'Fluxo Sereno', 'relic'),
  ('reliquia_l_renascer', 'Coração da Fênix Cinza', 'relic'),
  ('reliquia_l_brasa', 'Punho da Chama Antiga', 'relic')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS game.loot_drops (
  id         bigserial   PRIMARY KEY,
  player_id  uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  item_code  text        NOT NULL REFERENCES game.items(code),
  source     text        NOT NULL,
  dropped_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_loot_drops_player ON game.loot_drops (player_id, dropped_at DESC);

-- Entrega o drop (mochila + registro) numa transação só. Devolve a quantidade que ele tem agora.
CREATE OR REPLACE FUNCTION game.loot_grant(p_player uuid, p_item text, p_source text) RETURNS integer
LANGUAGE sql AS $$
  INSERT INTO game.loot_drops (player_id, item_code, source) VALUES (p_player, p_item, p_source);
  INSERT INTO game.player_items AS i (player_id, item_code, quantity) VALUES (p_player, p_item, 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = i.quantity + 1
  RETURNING quantity;
$$;

CREATE TABLE IF NOT EXISTS game.loot_revives (
  player_id uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  era_id    integer     NOT NULL,
  used_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, era_id)
);

COMMIT;
