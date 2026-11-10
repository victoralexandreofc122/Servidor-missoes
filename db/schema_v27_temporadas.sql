-- =====================================================================================================================
-- v27 (Fase 2, entrega 1): Temporadas (eras) e a fase de pontos do Torneio da Temporada (Jounin).
-- Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v26. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.seasons: a era (60 dias). Uma aberta por vez. A Era 1 nasce junto com a temporada aberta do rankeado.
--     A janela da fase de pontos do Torneio (jounin_starts_at, jounin_ends_at) fica na própria era.
--  2. game.jounin_slots: as vagas de Jounin de cada vila, congeladas na abertura do Torneio
--     (1 a cada 50 ativos; mínimo 10, máximo 60).
--  3. game.jounin_points e game.jounin_matches: a fase de pontos (vitória +30, derrota -10, nunca abaixo de 0;
--     ryō +100 na vitória e +30 na derrota). Modo separado do rankeado: não mexe no MMR.
--  4. game.jounin_era: o registro permanente dos Jounin de cada era (o Colégio da era seguinte). Preenchido pela fase
--     final, que vem numa próxima migração.
--  5. Funções: jounin_slots_for (a conta das vagas), jounin_open (abre o Torneio e congela as vagas), jounin_result
--     (registra uma partida; o banco confere tudo) e jounin_standings (classificação da vila; finalistas = 2x as vagas
--     entre quem jogou 15 partidas ou mais).
-- =====================================================================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. eras
CREATE TABLE IF NOT EXISTS game.seasons (
  id                integer     PRIMARY KEY CHECK (id > 0),
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  closed_at         timestamptz,
  jounin_starts_at  timestamptz,
  jounin_ends_at    timestamptz,
  CONSTRAINT ck_seasons_time CHECK (ends_at > starts_at),
  CONSTRAINT ck_seasons_jounin CHECK ((jounin_starts_at IS NULL) = (jounin_ends_at IS NULL)
    AND (jounin_starts_at IS NULL OR (jounin_ends_at > jounin_starts_at AND jounin_starts_at >= starts_at AND jounin_ends_at <= ends_at)))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_seasons_open ON game.seasons ((true)) WHERE closed_at IS NULL;
-- A Era 1 começa junto com a temporada aberta do rankeado (v15), para os dois relógios de 60 dias andarem juntos.
INSERT INTO game.seasons (id, starts_at, ends_at)
SELECT 1, COALESCE(r.starts_at, now()), COALESCE(r.ends_at, now() + interval '60 days')
  FROM (SELECT 1) one LEFT JOIN game.ranked_seasons r ON r.closed_at IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM game.seasons)
 LIMIT 1;

-- ---------------------------------------------------------------- 2. vagas
CREATE OR REPLACE FUNCTION game.jounin_slots_for(p_active integer) RETURNS integer
LANGUAGE sql IMMUTABLE
RETURN least(60, greatest(10, floor(greatest(p_active, 0) / 50.0)::int));

CREATE TABLE IF NOT EXISTS game.jounin_slots (
  season_id      integer NOT NULL REFERENCES game.seasons (id),
  village        text    NOT NULL REFERENCES game.villages (code),
  active_players integer NOT NULL CHECK (active_players >= 0),
  slots          integer NOT NULL CHECK (slots BETWEEN 10 AND 60),
  PRIMARY KEY (season_id, village)
);

-- ---------------------------------------------------------------- 3. fase de pontos
CREATE TABLE IF NOT EXISTS game.jounin_points (
  season_id  integer     NOT NULL REFERENCES game.seasons (id),
  player_id  uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  village    text        NOT NULL REFERENCES game.villages (code),
  points     integer     NOT NULL DEFAULT 0 CHECK (points >= 0),
  wins       integer     NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses     integer     NOT NULL DEFAULT 0 CHECK (losses >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS ix_jounin_points_rank ON game.jounin_points (season_id, village, points DESC);

CREATE TABLE IF NOT EXISTS game.jounin_matches (
  id           bigserial   PRIMARY KEY,
  season_id    integer     NOT NULL REFERENCES game.seasons (id),
  winner_id    uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  loser_id     uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  counted      boolean     NOT NULL,
  winner_delta integer     NOT NULL,
  loser_delta  integer     NOT NULL,
  winner_ryo   integer     NOT NULL DEFAULT 0,
  loser_ryo    integer     NOT NULL DEFAULT 0,
  reason       text        NOT NULL,
  duration_ms  integer     NOT NULL CHECK (duration_ms >= 0),
  at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_jounin_matches_players CHECK (winner_id <> loser_id)
);
CREATE INDEX IF NOT EXISTS ix_jounin_matches_pair ON game.jounin_matches (winner_id, loser_id, at DESC);
CREATE INDEX IF NOT EXISTS ix_jounin_matches_season ON game.jounin_matches (season_id, at DESC);

-- ---------------------------------------------------------------- 4. registro permanente
CREATE TABLE IF NOT EXISTS game.jounin_era (
  season_id integer     NOT NULL REFERENCES game.seasons (id),
  player_id uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  village   text        NOT NULL REFERENCES game.villages (code),
  position  integer     NOT NULL CHECK (position > 0),
  points    integer     NOT NULL DEFAULT 0,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS ix_jounin_era_player ON game.jounin_era (player_id);

-- ---------------------------------------------------------------- 5. funções

-- Abre o Torneio da era aberta: grava a janela da fase de pontos e congela as vagas de cada vila pelos ativos de agora
-- (entraram nos últimos 7 dias, fora da Academia, sem admin). Chamar de novo não muda vagas já congeladas.
CREATE OR REPLACE FUNCTION game.jounin_open(p_starts timestamptz, p_ends timestamptz) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL FOR UPDATE;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'Nenhuma era aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_season_closed';
  END IF;
  UPDATE seasons SET jounin_starts_at = p_starts, jounin_ends_at = p_ends WHERE id = v_season;
  INSERT INTO jounin_slots (season_id, village, active_players, slots)
  SELECT v_season, v.code, count(p.id)::int, jounin_slots_for(count(p.id)::int)
    FROM villages v
    LEFT JOIN players p ON p.village = v.code AND p.last_seen_at > now() - interval '7 days' AND p.tutorial_step >= 4 AND NOT p.is_admin
   GROUP BY v.code
  ON CONFLICT (season_id, village) DO NOTHING;
  RETURN v_season;
END $$;

-- Pode disputar o Torneio: nível 40 ou mais, com vila (renegado não), e que não seja Jounin (nem ANBU ou Kage).
CREATE OR REPLACE FUNCTION game.jounin_eligible(p_player uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT EXISTS (
    SELECT 1 FROM players p JOIN ranks r ON r.id = p.current_rank_id
     WHERE p.id = p_player AND p.level >= 40 AND p.village IS NOT NULL
       AND r.code NOT IN ('JONIN', 'ANBU', 'HOKAGE')
       AND NOT EXISTS (SELECT 1 FROM jounin_era e WHERE e.player_id = p.id))
$$;

-- Registra uma partida da fase de pontos. O banco confere: Torneio aberto agora e os dois elegíveis (senão, erro e nada
-- é gravado). Conta pontos se nenhum é admin e o par não passou de 3 partidas contadas em 24 h (a mesma trava do
-- rankeado); partida que não conta fica no histórico com 0.
CREATE OR REPLACE FUNCTION game.jounin_result(p_winner uuid, p_loser uuid, p_reason text, p_duration_ms integer, p_now timestamptz DEFAULT now())
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer, winner_points integer, loser_points integer,
               winner_ryo integer, loser_ryo integer, season_id integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  w      players%ROWTYPE;
  l      players%ROWTYPE;
  v_pair integer;
BEGIN
  IF p_winner = p_loser THEN
    RAISE EXCEPTION 'Partida inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_jounin_players';
  END IF;
  PERFORM 1 FROM players WHERE id IN (p_winner, p_loser) ORDER BY id FOR UPDATE;
  SELECT * INTO w FROM players WHERE id = p_winner;
  SELECT * INTO l FROM players WHERE id = p_loser;
  IF w.id IS NULL OR l.id IS NULL THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT s.id INTO season_id FROM seasons s
   WHERE s.closed_at IS NULL AND s.jounin_starts_at <= p_now AND p_now < s.jounin_ends_at;
  IF season_id IS NULL THEN
    RAISE EXCEPTION 'O Torneio da Temporada não está na fase de pontos' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_jounin_closed';
  END IF;
  IF NOT jounin_eligible(p_winner) OR NOT jounin_eligible(p_loser) THEN
    RAISE EXCEPTION 'Jogador fora do Torneio da Temporada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_jounin_not_eligible';
  END IF;
  counted := false; winner_delta := 0; loser_delta := 0; winner_ryo := 0; loser_ryo := 0;
  INSERT INTO jounin_points (season_id, player_id, village) VALUES (season_id, p_winner, w.village), (season_id, p_loser, l.village)
  ON CONFLICT DO NOTHING;
  IF NOT w.is_admin AND NOT l.is_admin THEN
    SELECT count(*) INTO v_pair FROM jounin_matches m
     WHERE m.counted AND m.at > p_now - interval '24 hours'
       AND ((m.winner_id = p_winner AND m.loser_id = p_loser) OR (m.winner_id = p_loser AND m.loser_id = p_winner));
    IF v_pair < 3 THEN
      counted := true;
      winner_delta := 30;
      SELECT -least(10, jp.points) INTO loser_delta FROM jounin_points jp WHERE jp.season_id = jounin_result.season_id AND jp.player_id = p_loser;
      winner_ryo := 100; loser_ryo := 30;
      UPDATE jounin_points jp SET points = jp.points + winner_delta, wins = jp.wins + 1, updated_at = p_now
       WHERE jp.season_id = jounin_result.season_id AND jp.player_id = p_winner;
      UPDATE jounin_points jp SET points = jp.points + loser_delta, losses = jp.losses + 1, updated_at = p_now
       WHERE jp.season_id = jounin_result.season_id AND jp.player_id = p_loser;
      UPDATE players SET ryo = ryo + winner_ryo WHERE id = p_winner;
      UPDATE players SET ryo = ryo + loser_ryo WHERE id = p_loser;
    END IF;
  END IF;
  INSERT INTO jounin_matches (season_id, winner_id, loser_id, counted, winner_delta, loser_delta, winner_ryo, loser_ryo, reason, duration_ms, at)
  VALUES (season_id, p_winner, p_loser, counted, winner_delta, loser_delta, winner_ryo, loser_ryo, p_reason, greatest(0, p_duration_ms), p_now);
  SELECT jp.points INTO winner_points FROM jounin_points jp WHERE jp.season_id = jounin_result.season_id AND jp.player_id = p_winner;
  SELECT jp.points INTO loser_points FROM jounin_points jp WHERE jp.season_id = jounin_result.season_id AND jp.player_id = p_loser;
  RETURN NEXT;
END $$;

-- Classificação de uma vila na era. Só entra na ordem quem jogou 15 partidas ou mais (position NULL para os outros).
-- Desempate: pontos, vitórias, quem chegou primeiro aos pontos. Finalista = entre os primeiros 2x as vagas da vila.
CREATE OR REPLACE FUNCTION game.jounin_standings(p_season integer, p_village text)
RETURNS TABLE ("position" integer, player_id uuid, username text, points integer, wins integer, losses integer, qualified boolean, finalist boolean)
LANGUAGE sql STABLE SET search_path = game AS $$
  WITH base AS (
    SELECT jp.player_id, p.username, jp.points, jp.wins, jp.losses, jp.updated_at, (jp.wins + jp.losses) >= 15 AS qualified
      FROM jounin_points jp JOIN players p ON p.id = jp.player_id
     WHERE jp.season_id = p_season AND jp.village = p_village AND NOT p.is_admin
  ), ranked AS (
    SELECT b.*, CASE WHEN b.qualified THEN (row_number() OVER (PARTITION BY b.qualified ORDER BY b.points DESC, b.wins DESC, b.updated_at, b.player_id))::int END AS pos
      FROM base b
  )
  SELECT r.pos, r.player_id, r.username, r.points, r.wins, r.losses, r.qualified,
         COALESCE(r.pos <= 2 * (SELECT s.slots FROM jounin_slots s WHERE s.season_id = p_season AND s.village = p_village), false)
    FROM ranked r
   ORDER BY r.qualified DESC, r.pos, r.points DESC, r.username
$$;

COMMIT;

-- Conferência (opcional):
-- SELECT id, starts_at, ends_at FROM game.seasons WHERE closed_at IS NULL;                    -- a Era aberta
-- SELECT game.jounin_slots_for(0), game.jounin_slots_for(1000), game.jounin_slots_for(9999);  -- 10, 20, 60
