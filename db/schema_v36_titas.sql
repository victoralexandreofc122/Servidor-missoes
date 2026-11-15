-- =====================================================================================================================
-- v36: Os Titãs Ancestrais e os Portadores, o evento "Cinturão da Era" (v61 do jogo). Rode no SQL Editor do Neon, no
-- branch `production`, DEPOIS da v35. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.titan_awakenings: cada Titã de cada Era (1 a 10, um por dia nos 10 primeiros dias): a vida GLOBAL (a mesma
--     para todo o servidor, gravada para não voltar cheia num reinício), quando acordou, quando volta a dormir, quando
--     caiu e quem foi o MVP.
--  2. game.titan_damage: quanto cada ninja tirou de cada Titã (o MVP sai daqui).
--  3. game.titan_bearers: o Portador de cada Titã na Era (até o fim dela) e a recarga da Habilidade Suprema (20 min).
--     Um ninja porta no máximo um Titã por Era: se o MVP já é Portador, o título vai para o 2º em dano (e assim por diante).
--  4. Os 10 títulos "Portador ..." e as funções game.titan_add_damage, game.titan_crown e game.titan_expire.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.titan_awakenings (
  era_id        integer     NOT NULL,
  titan         smallint    NOT NULL CHECK (titan BETWEEN 1 AND 10),
  max_hp        integer     NOT NULL CHECK (max_hp > 0),
  hp            integer     NOT NULL CHECK (hp >= 0),
  spawned_at    timestamptz NOT NULL DEFAULT now(),
  sleeps_at     timestamptz NOT NULL,
  defeated_at   timestamptz,
  mvp_player_id uuid        REFERENCES game.players(id) ON DELETE SET NULL,
  PRIMARY KEY (era_id, titan)
);

CREATE TABLE IF NOT EXISTS game.titan_damage (
  era_id    integer  NOT NULL,
  titan     smallint NOT NULL,
  player_id uuid     NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  damage    bigint   NOT NULL DEFAULT 0 CHECK (damage >= 0),
  PRIMARY KEY (era_id, titan, player_id)
);

CREATE TABLE IF NOT EXISTS game.titan_bearers (
  era_id          integer     NOT NULL,
  titan           smallint    NOT NULL CHECK (titan BETWEEN 1 AND 10),
  player_id       uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  active_cd_until timestamptz,
  PRIMARY KEY (era_id, titan),
  UNIQUE (era_id, player_id)
);

-- os 10 títulos (mesma ordem de src/realtime/titans.ts)
INSERT INTO game.titles (code, name, description) VALUES
  ('TITA_CHAMA_ETERNA', 'Portador da Chama Eterna', 'MVP do Titã Chama Eterna nesta Era.'),
  ('TITA_MARE_DE_SANGUE', 'Portador da Maré de Sangue', 'MVP do Titã Maré de Sangue nesta Era.'),
  ('TITA_TROVAO_ANCESTRAL', 'Portador do Trovão Ancestral', 'MVP do Titã Trovão Ancestral nesta Era.'),
  ('TITA_VENTO_CORTANTE', 'Portador do Vento Cortante', 'MVP do Titã Vento Cortante nesta Era.'),
  ('TITA_ROCHA_ANTIGA', 'Portador da Rocha Antiga', 'MVP do Titã Rocha Antiga nesta Era.'),
  ('TITA_NOITE_ETERNA', 'Portador da Noite Eterna', 'MVP do Titã Noite Eterna nesta Era.'),
  ('TITA_PESADELO', 'Portador do Pesadelo', 'MVP do Titã Pesadelo nesta Era.'),
  ('TITA_CORPO_FECHADO', 'Portador do Corpo Fechado', 'MVP do Titã Corpo Fechado nesta Era.'),
  ('TITA_MIL_LAMINAS', 'Portador das Mil Lâminas', 'MVP do Titã Mil Lâminas nesta Era.'),
  ('TITA_VIDA', 'Portador da Vida', 'MVP do Titã Vida nesta Era.')
ON CONFLICT (code) DO NOTHING;

-- Soma o dano de vários ninjas de uma vez (o servidor junta e manda a cada 15 s).
CREATE OR REPLACE FUNCTION game.titan_add_damage(p_era integer, p_titan smallint, p_players uuid[], p_damage bigint[])
RETURNS void LANGUAGE sql AS $$
  INSERT INTO game.titan_damage AS d (era_id, titan, player_id, damage)
  SELECT p_era, p_titan, x.player, GREATEST(0, x.dmg) FROM unnest(p_players, p_damage) AS x(player, dmg)
  ON CONFLICT (era_id, titan, player_id) DO UPDATE SET damage = d.damage + EXCLUDED.damage;
$$;

-- O Titã caiu: o maior dano que ainda não porta outro Titã nesta Era vira o Portador (título junto). Devolve quem.
CREATE OR REPLACE FUNCTION game.titan_crown(p_era integer, p_titan smallint, p_title text) RETURNS uuid
LANGUAGE sql AS $$
  WITH pick AS (
    SELECT d.player_id FROM game.titan_damage d
     WHERE d.era_id = p_era AND d.titan = p_titan AND d.damage > 0
       AND NOT EXISTS (SELECT 1 FROM game.titan_bearers b WHERE b.era_id = p_era AND b.player_id = d.player_id)
       AND NOT EXISTS (SELECT 1 FROM game.titan_bearers b WHERE b.era_id = p_era AND b.titan = p_titan)
     ORDER BY d.damage DESC, d.player_id LIMIT 1
  ), bearer AS (
    INSERT INTO game.titan_bearers (era_id, titan, player_id) SELECT p_era, p_titan, player_id FROM pick
    ON CONFLICT DO NOTHING RETURNING player_id
  ), titled AS (
    INSERT INTO game.player_titles (player_id, title_id)
    SELECT b.player_id, t.id FROM bearer b JOIN game.titles t ON t.code = p_title
    ON CONFLICT (player_id, title_id) DO NOTHING RETURNING player_id
  ), done AS (
    UPDATE game.titan_awakenings SET defeated_at = COALESCE(defeated_at, now()), hp = 0,
           mvp_player_id = COALESCE((SELECT player_id FROM bearer), mvp_player_id)
     WHERE era_id = p_era AND titan = p_titan RETURNING 1
  )
  SELECT player_id FROM bearer;
$$;

-- A Era acabou: os títulos de Portador de Eras passadas saem (a passiva já deixa de valer pelo servidor).
CREATE OR REPLACE FUNCTION game.titan_expire(p_current_era integer) RETURNS integer
LANGUAGE sql AS $$
  WITH gone AS (
    DELETE FROM game.player_titles pt USING game.titles t
     WHERE pt.title_id = t.id AND t.code LIKE 'TITA\_%'
       AND NOT EXISTS (SELECT 1 FROM game.titan_bearers b WHERE b.era_id = p_current_era AND b.player_id = pt.player_id
                         AND t.code = 'TITA_' || upper(replace((ARRAY['chama_eterna','mare_de_sangue','trovao_ancestral','vento_cortante','rocha_antiga','noite_eterna','pesadelo','corpo_fechado','mil_laminas','vida'])[b.titan], ' ', '_')))
    RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

COMMIT;
