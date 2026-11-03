-- =====================================================================================================================
-- v15: modo rankeado (Vale das Estátuas). Rode no SQL Editor do Neon, no branch `production`, ANTES de publicar o
-- código. Pode rodar de novo sem erro (avisos "already exists, skipping" são normais). Só cria coisas novas.
--
--  1. Temporadas do rankeado (60 dias), separadas das da Zona de Conflito.
--  2. Pontos (MMR) do rankeado: geral (para sempre) e por temporada. Começa em 1000.
--  3. Cada partida e cada rodada gravadas (quem venceu, placar, dano, duração, versão da tabela de equilíbrio).
--  4. game.ranked_result: grava a partida e mexe nos pontos numa transação só. Elo com K = 24 e o fator do novato
--     (quem jogou menos de 30 partidas ganha mais e perde menos). Só conta com diferença de nível até 15, no máximo 3
--     vezes por dia a mesma dupla, e nunca com conta de admin.
--  5. game.close_ranked_season: fecha a temporada vencida, paga as recompensas e abre a próxima.
-- =====================================================================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. temporadas

CREATE TABLE IF NOT EXISTS game.ranked_seasons (
  id        integer     PRIMARY KEY CHECK (id > 0),
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT ck_ranked_seasons_time CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ranked_seasons_open ON game.ranked_seasons ((true)) WHERE closed_at IS NULL;
INSERT INTO game.ranked_seasons (id, starts_at, ends_at)
SELECT 1, now(), now() + interval '60 days'
WHERE NOT EXISTS (SELECT 1 FROM game.ranked_seasons);

-- ---------------------------------------------------------------- 2. pontos

CREATE TABLE IF NOT EXISTS game.ranked_ratings (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  mmr        integer     NOT NULL DEFAULT 1000 CHECK (mmr >= 0),
  best_mmr   integer     NOT NULL DEFAULT 1000,
  wins       integer     NOT NULL DEFAULT 0,
  losses     integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ranked_ratings_mmr ON game.ranked_ratings (mmr DESC);

CREATE TABLE IF NOT EXISTS game.ranked_season_ratings (
  season_id integer NOT NULL REFERENCES game.ranked_seasons (id),
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  mmr       integer NOT NULL DEFAULT 1000 CHECK (mmr >= 0),
  wins      integer NOT NULL DEFAULT 0,
  losses    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS ix_ranked_season_ratings_rank ON game.ranked_season_ratings (season_id, mmr DESC);

-- ---------------------------------------------------------------- 3. partidas e rodadas

CREATE TABLE IF NOT EXISTS game.ranked_matches (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id       integer     REFERENCES game.ranked_seasons (id),
  winner_id       uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  loser_id        uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  winner_rounds   smallint    NOT NULL,
  loser_rounds    smallint    NOT NULL,
  reason          text        NOT NULL CHECK (reason IN ('rounds', 'forfeit')),
  duration_ms     integer     NOT NULL,
  balance_version text        NOT NULL,
  counted         boolean     NOT NULL,
  winner_delta    integer     NOT NULL DEFAULT 0,
  loser_delta     integer     NOT NULL DEFAULT 0,
  rounds          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ranked_matches_pair ON game.ranked_matches (winner_id, loser_id, at);
CREATE INDEX IF NOT EXISTS ix_ranked_matches_loser ON game.ranked_matches (loser_id, at);

CREATE TABLE IF NOT EXISTS game.ranked_season_rewards (
  season_id integer NOT NULL REFERENCES game.ranked_seasons (id),
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  position  integer NOT NULL,
  title_id  uuid    REFERENCES game.titles (id),
  ryo       integer NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

-- ---------------------------------------------------------------- 4. resultado de uma partida

-- Pontos de Elo (K = 24, escala 400) com o fator do novato: o menos experiente (menos partidas) ganha x f e perde ÷ f,
-- com f = 1 + 0,5 x (30 - n) / 30 enquanto n < 30 (com n igual, não vale). Devolve o ganho do vencedor e a perda
-- (negativa) do perdedor.
CREATE OR REPLACE FUNCTION game.ranked_elo(p_wm integer, p_lm integer, p_wn integer, p_ln integer)
RETURNS TABLE (gain integer, loss integer)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_base numeric;
  v_n    integer;
  v_f    numeric := 1;
BEGIN
  v_base := 24 * (1 - 1 / (1 + power(10, (p_lm - p_wm) / 400.0)));
  v_n := least(p_wn, p_ln);
  IF p_wn <> p_ln AND v_n < 30 THEN v_f := 1 + 0.5 * (30 - v_n) / 30.0; END IF;
  gain := greatest(1, round(v_base * (CASE WHEN p_wn < p_ln THEN v_f ELSE 1 END))::int);
  loss := -greatest(1, round(v_base / (CASE WHEN p_ln < p_wn THEN v_f ELSE 1 END))::int);
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION game.ranked_result(
  p_winner uuid, p_loser uuid, p_winner_rounds integer, p_loser_rounds integer, p_reason text,
  p_duration_ms integer, p_version text, p_rounds jsonb)
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer, winner_mmr integer, loser_mmr integer, season_id integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  w      players%ROWTYPE;
  l      players%ROWTYPE;
  v_pair integer;
  v_wm   integer;
  v_lm   integer;
  v_wn   integer;
  v_ln   integer;
  e      record;
BEGIN
  PERFORM 1 FROM players WHERE id IN (p_winner, p_loser) ORDER BY id FOR UPDATE;
  SELECT * INTO w FROM players WHERE id = p_winner;
  SELECT * INTO l FROM players WHERE id = p_loser;
  IF w.id IS NULL OR l.id IS NULL OR p_winner = p_loser THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  counted := false; winner_delta := 0; loser_delta := 0;
  SELECT s.id INTO season_id FROM ranked_seasons s WHERE s.closed_at IS NULL;
  IF NOT w.is_admin AND NOT l.is_admin AND abs(w.level - l.level) <= 15 THEN
    SELECT count(*) INTO v_pair FROM ranked_matches m
     WHERE m.counted AND m.at > now() - interval '24 hours'
       AND ((m.winner_id = p_winner AND m.loser_id = p_loser) OR (m.winner_id = p_loser AND m.loser_id = p_winner));
    IF v_pair < 3 THEN
      counted := true;
      INSERT INTO ranked_ratings (player_id) VALUES (p_winner), (p_loser) ON CONFLICT (player_id) DO NOTHING;
      SELECT r.mmr, r.wins + r.losses INTO v_wm, v_wn FROM ranked_ratings r WHERE r.player_id = p_winner;
      SELECT r.mmr, r.wins + r.losses INTO v_lm, v_ln FROM ranked_ratings r WHERE r.player_id = p_loser;
      SELECT * INTO e FROM ranked_elo(v_wm, v_lm, v_wn, v_ln);
      winner_delta := e.gain;
      loser_delta := greatest(e.loss, -v_lm);
      UPDATE ranked_ratings SET mmr = mmr + winner_delta, best_mmr = greatest(best_mmr, mmr + winner_delta), wins = wins + 1, updated_at = now()
       WHERE player_id = p_winner;
      UPDATE ranked_ratings SET mmr = mmr + loser_delta, losses = losses + 1, updated_at = now() WHERE player_id = p_loser;
      IF season_id IS NOT NULL THEN
        INSERT INTO ranked_season_ratings (season_id, player_id) VALUES (season_id, p_winner), (season_id, p_loser) ON CONFLICT DO NOTHING;
        SELECT r.mmr INTO v_wm FROM ranked_season_ratings r WHERE r.season_id = ranked_result.season_id AND r.player_id = p_winner;
        SELECT r.mmr INTO v_lm FROM ranked_season_ratings r WHERE r.season_id = ranked_result.season_id AND r.player_id = p_loser;
        SELECT * INTO e FROM ranked_elo(v_wm, v_lm, v_wn, v_ln);
        UPDATE ranked_season_ratings r SET mmr = r.mmr + e.gain, wins = r.wins + 1
         WHERE r.season_id = ranked_result.season_id AND r.player_id = p_winner;
        UPDATE ranked_season_ratings r SET mmr = greatest(0, r.mmr + e.loss), losses = r.losses + 1
         WHERE r.season_id = ranked_result.season_id AND r.player_id = p_loser;
      END IF;
    END IF;
  END IF;
  INSERT INTO ranked_matches (season_id, winner_id, loser_id, winner_rounds, loser_rounds, reason, duration_ms, balance_version,
                              counted, winner_delta, loser_delta, rounds)
  VALUES (season_id, p_winner, p_loser, p_winner_rounds, p_loser_rounds, p_reason, p_duration_ms, p_version,
          counted, winner_delta, loser_delta, coalesce(p_rounds, '[]'::jsonb));
  SELECT coalesce((SELECT r.mmr FROM ranked_ratings r WHERE r.player_id = p_winner), 1000) INTO winner_mmr;
  SELECT coalesce((SELECT r.mmr FROM ranked_ratings r WHERE r.player_id = p_loser), 1000) INTO loser_mmr;
  RETURN NEXT;
END $$;

-- ---------------------------------------------------------------- 5. fim da temporada

-- Fecha a temporada que venceu (ou à força: p_force), paga as recompensas e abre a próxima. Só entra quem fez 10+
-- partidas na temporada, sem admin. 1º: título de Campeão, 5.000 ryō e o Manto do Campeão; 2º a 10º: Elite, 2.000 ryō
-- e o manto; 11º a 50º: Veterano e 500 ryō.
CREATE OR REPLACE FUNCTION game.close_ranked_season(p_now timestamptz, p_force boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s       ranked_seasons%ROWTYPE;
  r       record;
  v_title uuid;
  v_ryo   integer;
  v_code  text;
  v_name  text;
BEGIN
  SELECT * INTO s FROM ranked_seasons WHERE closed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR (s.ends_at > p_now AND NOT p_force) THEN RETURN NULL; END IF;
  FOR r IN
    SELECT sr.player_id, row_number() OVER (ORDER BY sr.mmr DESC, sr.wins DESC, sr.player_id) AS pos
      FROM ranked_season_ratings sr JOIN players p ON p.id = sr.player_id
     WHERE sr.season_id = s.id AND sr.wins + sr.losses >= 10 AND NOT p.is_admin
     ORDER BY pos
     LIMIT 50
  LOOP
    IF r.pos = 1 THEN v_code := 'RANKED_' || s.id || '_CHAMPION'; v_name := 'Campeão do Rankeado ' || s.id; v_ryo := 5000;
    ELSIF r.pos <= 10 THEN v_code := 'RANKED_' || s.id || '_ELITE'; v_name := 'Elite do Rankeado ' || s.id; v_ryo := 2000;
    ELSE v_code := 'RANKED_' || s.id || '_VETERAN'; v_name := 'Veterano do Rankeado ' || s.id; v_ryo := 500;
    END IF;
    INSERT INTO titles (code, name, description) VALUES (v_code, v_name, 'Recompensa do rankeado, temporada ' || s.id)
    ON CONFLICT (code) DO NOTHING;
    SELECT id INTO v_title FROM titles WHERE code = v_code;
    INSERT INTO player_titles (player_id, title_id) VALUES (r.player_id, v_title) ON CONFLICT (player_id, title_id) DO NOTHING;
    UPDATE players SET ryo = ryo + v_ryo WHERE id = r.player_id;
    IF r.pos <= 10 THEN
      INSERT INTO player_items (player_id, item_code, quantity) VALUES (r.player_id, 'manto_campeao', 1)
      ON CONFLICT (player_id, item_code) DO NOTHING;
    END IF;
    INSERT INTO ranked_season_rewards (season_id, player_id, position, title_id, ryo) VALUES (s.id, r.player_id, r.pos, v_title, v_ryo)
    ON CONFLICT (season_id, player_id) DO NOTHING;
  END LOOP;
  UPDATE ranked_seasons SET closed_at = p_now WHERE id = s.id;
  INSERT INTO ranked_seasons (id, starts_at, ends_at) VALUES (s.id + 1, p_now, p_now + interval '60 days');
  RETURN s.id;
END $$;

COMMIT;
