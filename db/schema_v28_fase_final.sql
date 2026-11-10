-- =====================================================================================================================
-- v28 (Fase 2, passo 4): Fase Final do Torneio da Temporada (grupos e chaves), trava de troca de vila e encerramento.
-- Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v27. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.seasons ganha a etapa do Torneio (jounin_stage: pontos, grupos, chaves, encerrado) e a data do encerramento.
--  2. Trava: enquanto o Torneio está em andamento (da abertura até o encerramento), ninguém troca de uma vila para outra
--     (virar renegado continua possível; conta de admin, usada em teste, não é travada).
--  3. Fase de pontos: o banco agora também confere que os dois são da mesma vila; o placar só mostra quem continua nela.
--  4. game.tournament_groups e game.tournament_group_matches: os grupos de até 5 (cabeças de chave espalhados em
--     "cobrinha") e os jogos de todos contra todos. game.tournament_brackets: a chave da eliminatória.
--  5. Funções: tournament_start_groups (fecha os pontos e monta os grupos), tournament_group_result,
--     tournament_group_table (classificação do grupo; passam os 2 primeiros), tournament_close_groups,
--     tournament_bracket_result (grava e leva o vencedor para a rodada seguinte) e jounin_finish (registro da era,
--     patente Jounin, prêmio de consolação e fim do Torneio).
-- =====================================================================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. etapa do Torneio
ALTER TABLE game.seasons ADD COLUMN IF NOT EXISTS jounin_stage text NOT NULL DEFAULT 'pontos';
ALTER TABLE game.seasons ADD COLUMN IF NOT EXISTS jounin_closed_at timestamptz;
ALTER TABLE game.seasons DROP CONSTRAINT IF EXISTS ck_seasons_jounin_stage;
ALTER TABLE game.seasons ADD CONSTRAINT ck_seasons_jounin_stage CHECK (jounin_stage IN ('pontos', 'grupos', 'chaves', 'encerrado'));

-- ---------------------------------------------------------------- 2. trava de troca de vila
CREATE OR REPLACE FUNCTION game.jounin_village_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF OLD.village IS NOT NULL AND NEW.village IS NOT NULL AND OLD.village <> NEW.village AND NOT OLD.is_admin
     AND EXISTS (SELECT 1 FROM seasons s WHERE s.closed_at IS NULL AND s.jounin_starts_at <= now() AND s.jounin_stage <> 'encerrado') THEN
    RAISE EXCEPTION 'Troca de vila travada durante o Torneio da Temporada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_locked';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_jounin_village_lock ON game.players;
CREATE TRIGGER trg_players_jounin_village_lock BEFORE UPDATE OF village ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.jounin_village_lock();

-- ---------------------------------------------------------------- 3. fase de pontos: mesma vila
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
   WHERE s.closed_at IS NULL AND s.jounin_stage = 'pontos' AND s.jounin_starts_at <= p_now AND p_now < s.jounin_ends_at;
  IF season_id IS NULL THEN
    RAISE EXCEPTION 'O Torneio da Temporada não está na fase de pontos' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_jounin_closed';
  END IF;
  IF w.village IS DISTINCT FROM l.village THEN
    RAISE EXCEPTION 'O Torneio da Temporada é entre ninjas da mesma vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_jounin_village';
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

CREATE OR REPLACE FUNCTION game.jounin_standings(p_season integer, p_village text)
RETURNS TABLE ("position" integer, player_id uuid, username text, points integer, wins integer, losses integer, qualified boolean, finalist boolean)
LANGUAGE sql STABLE SET search_path = game AS $$
  WITH base AS (
    SELECT jp.player_id, p.username, jp.points, jp.wins, jp.losses, jp.updated_at, (jp.wins + jp.losses) >= 15 AS qualified
      FROM jounin_points jp JOIN players p ON p.id = jp.player_id
     WHERE jp.season_id = p_season AND jp.village = p_village AND p.village = jp.village AND NOT p.is_admin
  ), ranked AS (
    SELECT b.*, CASE WHEN b.qualified THEN (row_number() OVER (PARTITION BY b.qualified ORDER BY b.points DESC, b.wins DESC, b.updated_at, b.player_id))::int END AS pos
      FROM base b
  )
  SELECT r.pos, r.player_id, r.username, r.points, r.wins, r.losses, r.qualified,
         COALESCE(r.pos <= 2 * (SELECT s.slots FROM jounin_slots s WHERE s.season_id = p_season AND s.village = p_village), false)
    FROM ranked r
   ORDER BY r.qualified DESC, r.pos, r.points DESC, r.username
$$;

-- ---------------------------------------------------------------- 4. grupos e chaves
CREATE TABLE IF NOT EXISTS game.tournament_groups (
  season_id integer NOT NULL REFERENCES game.seasons (id),
  village   text    NOT NULL REFERENCES game.villages (code),
  group_no  integer NOT NULL CHECK (group_no > 0),
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  seed      integer NOT NULL CHECK (seed > 0),
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS ix_tournament_groups_group ON game.tournament_groups (season_id, village, group_no);

CREATE TABLE IF NOT EXISTS game.tournament_group_matches (
  season_id integer     NOT NULL REFERENCES game.seasons (id),
  village   text        NOT NULL REFERENCES game.villages (code),
  group_no  integer     NOT NULL,
  a_id      uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  b_id      uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  winner_id uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  a_rounds  integer     NOT NULL DEFAULT 0,
  b_rounds  integer     NOT NULL DEFAULT 0,
  reason    text,
  played_at timestamptz,
  PRIMARY KEY (season_id, a_id, b_id),
  CONSTRAINT ck_tournament_group_matches_pair CHECK (a_id < b_id),
  CONSTRAINT ck_tournament_group_matches_winner CHECK (winner_id IS NULL OR winner_id IN (a_id, b_id))
);

CREATE TABLE IF NOT EXISTS game.tournament_brackets (
  season_id integer     NOT NULL REFERENCES game.seasons (id),
  village   text        NOT NULL REFERENCES game.villages (code),
  round     integer     NOT NULL CHECK (round > 0),
  slot      integer     NOT NULL CHECK (slot > 0),
  rounds    integer     NOT NULL CHECK (rounds > 0),
  a_id      uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  b_id      uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  winner_id uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  a_rounds  integer     NOT NULL DEFAULT 0,
  b_rounds  integer     NOT NULL DEFAULT 0,
  reason    text,
  played_at timestamptz,
  PRIMARY KEY (season_id, village, round, slot),
  CONSTRAINT ck_tournament_brackets_round CHECK (round <= rounds)
);

-- ---------------------------------------------------------------- 5. funções da fase final

-- Fecha a fase de pontos e monta os grupos de cada vila com os finalistas (2x as vagas, entre quem fez 15 partidas).
-- Grupos de até 5: g = teto(n / 5) grupos, tamanhos que diferem em no máximo 1. Cabeças de chave em "cobrinha": os g
-- primeiros vão um para cada grupo, os g seguintes na ordem inversa, e assim por diante. Cria os jogos de todos contra todos.
CREATE OR REPLACE FUNCTION game.tournament_start_groups(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s seasons%ROWTYPE;
BEGIN
  SELECT * INTO s FROM seasons WHERE closed_at IS NULL FOR UPDATE;
  IF s.id IS NULL OR s.jounin_starts_at IS NULL OR s.jounin_stage <> 'pontos' OR s.jounin_starts_at >= p_now THEN
    RAISE EXCEPTION 'A fase de pontos não está aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_stage';
  END IF;
  UPDATE seasons SET jounin_ends_at = least(jounin_ends_at, p_now), jounin_stage = 'grupos' WHERE id = s.id;
  INSERT INTO tournament_groups (season_id, village, group_no, player_id, seed)
  SELECT s.id, f.village,
         CASE WHEN ((f.seed - 1) / c.g) % 2 = 0 THEN ((f.seed - 1) % c.g) + 1 ELSE c.g - ((f.seed - 1) % c.g) END,
         f.player_id, f.seed
    FROM (SELECT v.code AS village, t."position" AS seed, t.player_id
            FROM villages v CROSS JOIN LATERAL jounin_standings(s.id, v.code) t WHERE t.finalist) f
    JOIN (SELECT v.code AS village, ceil(count(*) / 5.0)::int AS g
            FROM villages v CROSS JOIN LATERAL jounin_standings(s.id, v.code) t WHERE t.finalist GROUP BY v.code) c ON c.village = f.village
  ON CONFLICT (season_id, player_id) DO NOTHING;
  INSERT INTO tournament_group_matches (season_id, village, group_no, a_id, b_id)
  SELECT a.season_id, a.village, a.group_no, a.player_id, b.player_id
    FROM tournament_groups a JOIN tournament_groups b
      ON b.season_id = a.season_id AND b.village = a.village AND b.group_no = a.group_no AND a.player_id < b.player_id
   WHERE a.season_id = s.id
  ON CONFLICT DO NOTHING;
  RETURN s.id;
END $$;

-- Resultado de um jogo de grupo (os dois têm um jogo pendente entre si). Fora disso: erro, nada gravado.
CREATE OR REPLACE FUNCTION game.tournament_group_result(p_winner uuid, p_loser uuid, p_winner_rounds integer, p_loser_rounds integer,
                                                       p_reason text, p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
  v_n      integer;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL AND jounin_stage = 'grupos';
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'A fase de grupos não está aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_stage';
  END IF;
  UPDATE tournament_group_matches m
     SET winner_id = p_winner, played_at = p_now, reason = p_reason,
         a_rounds = CASE WHEN m.a_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END,
         b_rounds = CASE WHEN m.b_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END
   WHERE m.season_id = v_season AND m.played_at IS NULL
     AND m.a_id = least(p_winner, p_loser) AND m.b_id = greatest(p_winner, p_loser);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Não há jogo pendente entre os dois' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_no_match';
  END IF;
  RETURN v_season;
END $$;

-- Classificação dos grupos de uma vila: vitórias, saldo de rodadas, rodadas vencidas e, no empate, o cabeça de chave.
-- Passam os 2 primeiros de cada grupo. Jogo encerrado sem vencedor (W.O. dos dois) é derrota para os dois.
CREATE OR REPLACE FUNCTION game.tournament_group_table(p_season integer, p_village text)
RETURNS TABLE (group_no integer, "position" integer, player_id uuid, username text, seed integer, wins integer, losses integer,
               rounds_for integer, rounds_against integer, pending integer, advanced boolean)
LANGUAGE sql STABLE SET search_path = game AS $$
  WITH res AS (
    SELECT g.group_no, g.player_id, g.seed,
           count(*) FILTER (WHERE m.winner_id = g.player_id)::int AS wins,
           count(*) FILTER (WHERE m.played_at IS NOT NULL AND m.winner_id IS DISTINCT FROM g.player_id)::int AS losses,
           COALESCE(sum(CASE WHEN m.a_id = g.player_id THEN m.a_rounds ELSE m.b_rounds END), 0)::int AS rf,
           (COALESCE(sum(CASE WHEN m.a_id = g.player_id THEN m.b_rounds ELSE m.a_rounds END), 0)
             + 2 * count(*) FILTER (WHERE m.played_at IS NOT NULL AND m.winner_id IS NULL))::int AS ra,   -- W.O. dos dois: 0 a 2 para cada
           count(*) FILTER (WHERE m.season_id IS NOT NULL AND m.played_at IS NULL)::int AS pending
      FROM tournament_groups g
      LEFT JOIN tournament_group_matches m ON m.season_id = g.season_id AND g.player_id IN (m.a_id, m.b_id)
     WHERE g.season_id = p_season AND g.village = p_village
     GROUP BY g.group_no, g.player_id, g.seed
  ), ranked AS (
    SELECT r.*, (row_number() OVER (PARTITION BY r.group_no ORDER BY r.wins DESC, r.rf - r.ra DESC, r.rf DESC, r.seed))::int AS pos FROM res r
  )
  SELECT r.group_no, r.pos, r.player_id, p.username, r.seed, r.wins, r.losses, r.rf, r.ra, r.pending, r.pos <= 2
    FROM ranked r JOIN players p ON p.id = r.player_id
   ORDER BY r.group_no, r.pos
$$;

-- Fecha a fase de grupos: jogo que não aconteceu vira derrota para os dois (W.O.) e a etapa passa para as chaves.
-- (A chave em si é montada pelo servidor, com a classificação dos grupos, e gravada em game.tournament_brackets.)
CREATE OR REPLACE FUNCTION game.tournament_close_groups(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL AND jounin_stage IN ('grupos', 'chaves') FOR UPDATE;
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'A fase de grupos não está aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_stage';
  END IF;
  UPDATE tournament_group_matches SET played_at = p_now, reason = 'wo' WHERE season_id = v_season AND played_at IS NULL;
  UPDATE seasons SET jounin_stage = 'chaves' WHERE id = v_season;
  RETURN v_season;
END $$;

-- Resultado de um jogo da chave: grava e leva o vencedor para a rodada seguinte (vaga a = jogo ímpar, vaga b = jogo par).
CREATE OR REPLACE FUNCTION game.tournament_bracket_result(p_winner uuid, p_loser uuid, p_winner_rounds integer, p_loser_rounds integer,
                                                         p_reason text, p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
  m        tournament_brackets%ROWTYPE;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL AND jounin_stage = 'chaves';
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'A eliminatória não está aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_stage';
  END IF;
  SELECT * INTO m FROM tournament_brackets b
   WHERE b.season_id = v_season AND b.winner_id IS NULL AND ((b.a_id = p_winner AND b.b_id = p_loser) OR (b.a_id = p_loser AND b.b_id = p_winner))
   FOR UPDATE;
  IF m.season_id IS NULL THEN
    RAISE EXCEPTION 'Não há jogo pendente entre os dois' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_no_match';
  END IF;
  UPDATE tournament_brackets b
     SET winner_id = p_winner, played_at = p_now, reason = p_reason,
         a_rounds = CASE WHEN b.a_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END,
         b_rounds = CASE WHEN b.b_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END
   WHERE b.season_id = m.season_id AND b.village = m.village AND b.round = m.round AND b.slot = m.slot;
  IF m.round < m.rounds THEN
    INSERT INTO tournament_brackets (season_id, village, round, slot, rounds, a_id, b_id)
    VALUES (m.season_id, m.village, m.round + 1, (m.slot + 1) / 2, m.rounds,
            CASE WHEN m.slot % 2 = 1 THEN p_winner END, CASE WHEN m.slot % 2 = 0 THEN p_winner END)
    ON CONFLICT (season_id, village, round, slot) DO UPDATE
      SET a_id = COALESCE(EXCLUDED.a_id, tournament_brackets.a_id), b_id = COALESCE(EXCLUDED.b_id, tournament_brackets.b_id);
  END IF;
  RETURN v_season;
END $$;

-- Encerra o Torneio. Recebe os novos Jounin na ordem do Rank de Jounin de cada vila (o servidor calcula pela chave e
-- pelos grupos). O banco confere: cada um disputou a fase final desta era pela vila dele e não passa das vagas da vila.
-- Grava o registro da era, dá a patente Jounin, paga o prêmio de consolação (200 ryō e o título) a quem jogou a fase de
-- pontos e ficou fora da fase final, e fecha o Torneio.
CREATE OR REPLACE FUNCTION game.jounin_finish(p_players uuid[], p_positions integer[], p_now timestamptz DEFAULT now())
RETURNS TABLE (jounin integer, consoled integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s       seasons%ROWTYPE;
  v_title uuid;
  v_bad   integer;
BEGIN
  SELECT * INTO s FROM seasons WHERE closed_at IS NULL FOR UPDATE;
  IF s.id IS NULL OR s.jounin_stage NOT IN ('grupos', 'chaves') THEN
    RAISE EXCEPTION 'A fase final não está aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_stage';
  END IF;
  IF COALESCE(cardinality(p_players), 0) <> COALESCE(cardinality(p_positions), 0) THEN
    RAISE EXCEPTION 'Lista inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_list';
  END IF;
  SELECT count(*) INTO v_bad
    FROM unnest(p_players, p_positions) AS x(player_id, pos)
    LEFT JOIN tournament_groups g ON g.season_id = s.id AND g.player_id = x.player_id
    LEFT JOIN jounin_slots sl ON sl.season_id = s.id AND sl.village = g.village
   WHERE g.player_id IS NULL OR x.pos < 1 OR x.pos > COALESCE(sl.slots, 0);
  IF v_bad > 0 OR (SELECT count(*) <> count(DISTINCT player_id) FROM unnest(p_players) AS u(player_id)) THEN
    RAISE EXCEPTION 'Lista de Jounin inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tournament_list';
  END IF;
  INSERT INTO jounin_era (season_id, player_id, village, position, points, at)
  SELECT s.id, x.player_id, g.village, x.pos, COALESCE(jp.points, 0), p_now
    FROM unnest(p_players, p_positions) AS x(player_id, pos)
    JOIN tournament_groups g ON g.season_id = s.id AND g.player_id = x.player_id
    LEFT JOIN jounin_points jp ON jp.season_id = s.id AND jp.player_id = x.player_id
  ON CONFLICT (season_id, player_id) DO NOTHING;
  GET DIAGNOSTICS jounin = ROW_COUNT;
  UPDATE players p SET current_rank_id = (SELECT id FROM ranks WHERE code = 'JONIN')
   WHERE p.id = ANY (p_players) AND p.current_rank_id IN (SELECT id FROM ranks WHERE code IN ('ACADEMY', 'GENIN', 'CHUNIN'));
  -- consolação: jogou a fase de pontos (ao menos 1 partida) e não entrou na fase final
  INSERT INTO titles (code, name, description) VALUES ('SEREI_O_PROXIMO_JOUNIN', 'Serei o próximo Jounin', 'Disputou o Torneio da Temporada e ficou fora da Fase Final')
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_title FROM titles WHERE code = 'SEREI_O_PROXIMO_JOUNIN';
  WITH c AS (
    SELECT jp.player_id FROM jounin_points jp JOIN players p ON p.id = jp.player_id
     WHERE jp.season_id = s.id AND jp.wins + jp.losses >= 1 AND NOT p.is_admin
       AND NOT EXISTS (SELECT 1 FROM tournament_groups g WHERE g.season_id = s.id AND g.player_id = jp.player_id)
  ), paid AS (
    UPDATE players p SET ryo = p.ryo + 200 FROM c WHERE p.id = c.player_id RETURNING p.id
  )
  INSERT INTO player_titles (player_id, title_id) SELECT id, v_title FROM paid ON CONFLICT (player_id, title_id) DO NOTHING;
  GET DIAGNOSTICS consoled = ROW_COUNT;
  UPDATE seasons SET jounin_stage = 'encerrado', jounin_closed_at = p_now WHERE id = s.id;
  RETURN NEXT;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT jounin_stage FROM game.seasons WHERE closed_at IS NULL;                                -- pontos
-- SELECT to_regclass('game.tournament_groups') IS NOT NULL, to_regclass('game.tournament_brackets') IS NOT NULL;   -- t, t
