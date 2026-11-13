-- =====================================================================================================================
-- v33: calendário automático da Era, Torneio dos Heróis e dos Vilões e rankeado 3v3. Rode no SQL Editor do Neon, no
-- branch `production`, DEPOIS da v32 e ANTES do código novo. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.close_era: fecha a Era (60 dias) que venceu e abre a próxima. O servidor chama a cada minuto; a abertura e o
--     fechamento do Torneio da Temporada usam as funções que já existem (v27 e v28).
--  2. Torneio dos Heróis (Jounin, menos o Kage; um por vila, título "Herói da Vila X") e Torneio dos Vilões (renegados,
--     título "Vilão Mais Forte da Era"): inscrições, chave (melhor de 3) e o campeão de cada Era.
--  3. Rankeado 3v3: pontos (MMR) próprios, começando em 1000, e cada partida gravada (Elo K = 24 com a média do time).
-- =====================================================================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. a virada da Era

-- Fecha a Era aberta que já venceu (ends_at <= p_now) e abre a próxima com 60 dias. Torneio da Temporada em andamento
-- (grupos ou chaves) segura a virada: o servidor termina a Fase Final primeiro. Devolve a Era fechada (ou NULL).
CREATE OR REPLACE FUNCTION game.close_era(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s record;   -- record (e não seasons%ROWTYPE): a função cria mesmo num banco ainda sem a v27
BEGIN
  SELECT * INTO s FROM seasons WHERE closed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR s.ends_at > p_now THEN RETURN NULL; END IF;
  IF COALESCE(to_jsonb(s) ->> 'jounin_stage', 'pontos') IN ('grupos', 'chaves') THEN RETURN NULL; END IF;
  UPDATE seasons SET closed_at = p_now WHERE id = s.id;
  INSERT INTO seasons (id, starts_at, ends_at) VALUES (s.id + 1, p_now, p_now + interval '60 days');
  RETURN s.id;
END $$;

-- ---------------------------------------------------------------- 2. Torneio dos Heróis e Torneio dos Vilões

-- Um torneio por Era: o dos Heróis, um por vila (village = a vila); o dos Vilões, um só (village = '').
CREATE TABLE IF NOT EXISTS game.champion_tournaments (
  season_id   integer     NOT NULL REFERENCES game.seasons (id),
  kind        text        NOT NULL CHECK (kind IN ('herois', 'viloes')),
  village     text        NOT NULL DEFAULT '',
  opened_at   timestamptz NOT NULL DEFAULT now(),
  bracket_at  timestamptz,
  closed_at   timestamptz,
  champion_id uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  PRIMARY KEY (season_id, kind, village)
);

CREATE TABLE IF NOT EXISTS game.champion_entries (
  season_id integer     NOT NULL REFERENCES game.seasons (id),
  kind      text        NOT NULL CHECK (kind IN ('herois', 'viloes')),
  village   text        NOT NULL DEFAULT '',
  player_id uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, kind, player_id)
);

CREATE TABLE IF NOT EXISTS game.champion_brackets (
  season_id integer     NOT NULL REFERENCES game.seasons (id),
  kind      text        NOT NULL CHECK (kind IN ('herois', 'viloes')),
  village   text        NOT NULL DEFAULT '',
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
  PRIMARY KEY (season_id, kind, village, round, slot),
  CONSTRAINT ck_champion_brackets_round CHECK (round <= rounds)
);

-- Quem pode entrar e por qual "vila" do torneio. Heróis: Jounin (ou ANBU) que não é o Kage nem renegado; um torneio por
-- vila. Vilões: renegado (o Maior Vilão ainda não existe no jogo: quando existir, fica fora daqui). NULL = não pode.
CREATE OR REPLACE FUNCTION game.champion_slot(p_player uuid, p_kind text) RETURNS text
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT CASE
    WHEN p_kind = 'herois' AND p.renegade_at IS NULL AND p.village IS NOT NULL AND r.code IN ('JONIN', 'S_JONIN', 'ANBU')
         AND NOT EXISTS (SELECT 1 FROM village_kages k WHERE k.player_id = p.id AND k.term_ends_at > now()) THEN p.village
    WHEN p_kind = 'viloes' AND p.renegade_at IS NOT NULL THEN ''
  END
  FROM players p JOIN ranks r ON r.id = p.current_rank_id
  WHERE p.id = p_player
$$;

-- Inscrição: só na Era aberta, com as inscrições do torneio abertas (sem chave ainda). Devolve a "vila" do torneio.
CREATE OR REPLACE FUNCTION game.champion_join(p_player uuid, p_kind text, p_now timestamptz DEFAULT now()) RETURNS text
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season  integer;
  v_village text;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL;
  v_village := champion_slot(p_player, p_kind);
  IF v_season IS NULL OR v_village IS NULL THEN
    RAISE EXCEPTION 'Não pode entrar neste torneio' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_champion_not_eligible';
  END IF;
  INSERT INTO champion_tournaments (season_id, kind, village, opened_at) VALUES (v_season, p_kind, v_village, p_now)
  ON CONFLICT (season_id, kind, village) DO NOTHING;
  IF EXISTS (SELECT 1 FROM champion_tournaments t WHERE t.season_id = v_season AND t.kind = p_kind AND t.village = v_village AND t.bracket_at IS NOT NULL) THEN
    RAISE EXCEPTION 'As inscrições já fecharam' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_champion_closed';
  END IF;
  INSERT INTO champion_entries (season_id, kind, village, player_id, joined_at) VALUES (v_season, p_kind, v_village, p_player, p_now)
  ON CONFLICT (season_id, kind, player_id) DO NOTHING;
  RETURN v_village;
END $$;

-- Resultado de um jogo da chave: grava e leva o vencedor para a rodada seguinte. Na final: o campeão ganha o título
-- ("Herói da <vila>" ou "Vilão Mais Forte da Era") e o torneio fecha. Devolve o campeão (ou NULL se a chave continua).
CREATE OR REPLACE FUNCTION game.champion_result(p_kind text, p_winner uuid, p_loser uuid, p_winner_rounds integer, p_loser_rounds integer,
                                                p_reason text, p_now timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
  m        record;
BEGIN
  SELECT id INTO v_season FROM seasons WHERE closed_at IS NULL;
  SELECT * INTO m FROM champion_brackets b
   WHERE b.season_id = v_season AND b.kind = p_kind AND b.winner_id IS NULL
     AND ((b.a_id = p_winner AND b.b_id = p_loser) OR (b.a_id = p_loser AND b.b_id = p_winner))
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não há jogo pendente entre os dois' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_champion_no_match';
  END IF;
  UPDATE champion_brackets b
     SET winner_id = p_winner, played_at = p_now, reason = p_reason,
         a_rounds = CASE WHEN b.a_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END,
         b_rounds = CASE WHEN b.b_id = p_winner THEN p_winner_rounds ELSE p_loser_rounds END
   WHERE b.season_id = m.season_id AND b.kind = m.kind AND b.village = m.village AND b.round = m.round AND b.slot = m.slot;
  IF m.round < m.rounds THEN
    INSERT INTO champion_brackets (season_id, kind, village, round, slot, rounds, a_id, b_id)
    VALUES (m.season_id, m.kind, m.village, m.round + 1, (m.slot + 1) / 2, m.rounds,
            CASE WHEN m.slot % 2 = 1 THEN p_winner END, CASE WHEN m.slot % 2 = 0 THEN p_winner END)
    ON CONFLICT (season_id, kind, village, round, slot) DO UPDATE
      SET a_id = COALESCE(EXCLUDED.a_id, champion_brackets.a_id), b_id = COALESCE(EXCLUDED.b_id, champion_brackets.b_id);
    RETURN NULL;
  END IF;
  PERFORM champion_crown(m.season_id, m.kind, m.village, p_winner, p_now);
  RETURN p_winner;
END $$;

-- O campeão: título permanente (com a Era no código) e o torneio fecha.
CREATE OR REPLACE FUNCTION game.champion_crown(p_season integer, p_kind text, p_village text, p_player uuid, p_now timestamptz DEFAULT now()) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_code  text;
  v_name  text;
  v_title uuid;
BEGIN
  IF p_kind = 'herois' THEN
    v_code := 'HEROI_' || p_season || '_' || upper(p_village);
    v_name := 'Herói da ' || COALESCE((SELECT name FROM villages WHERE code = p_village), p_village);
  ELSE
    v_code := 'VILAO_' || p_season;
    v_name := 'Vilão Mais Forte da Era';
  END IF;
  INSERT INTO titles (code, name, description)
  VALUES (v_code, v_name, CASE WHEN p_kind = 'herois' THEN 'Campeão do Torneio dos Heróis, Era ' ELSE 'Campeão do Torneio dos Vilões, Era ' END || p_season)
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_title FROM titles WHERE code = v_code;
  INSERT INTO player_titles (player_id, title_id) VALUES (p_player, v_title) ON CONFLICT (player_id, title_id) DO NOTHING;
  UPDATE champion_tournaments SET champion_id = p_player, closed_at = p_now
   WHERE season_id = p_season AND kind = p_kind AND village = p_village;
END $$;

-- ---------------------------------------------------------------- 3. rankeado 3v3

CREATE TABLE IF NOT EXISTS game.ranked3_ratings (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  mmr        integer     NOT NULL DEFAULT 1000 CHECK (mmr >= 0),
  best_mmr   integer     NOT NULL DEFAULT 1000,
  wins       integer     NOT NULL DEFAULT 0,
  losses     integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ranked3_ratings_mmr ON game.ranked3_ratings (mmr DESC);

CREATE TABLE IF NOT EXISTS game.ranked3_matches (
  id            bigserial   PRIMARY KEY,
  winners       uuid[]      NOT NULL,
  losers        uuid[]      NOT NULL,
  winner_rounds integer     NOT NULL,
  loser_rounds  integer     NOT NULL,
  reason        text        NOT NULL,
  duration_ms   integer     NOT NULL DEFAULT 0,
  counted       boolean     NOT NULL,
  winner_delta  integer     NOT NULL DEFAULT 0,
  loser_delta   integer     NOT NULL DEFAULT 0,
  at            timestamptz NOT NULL DEFAULT now()
);

-- Resultado de uma partida 3v3: a mesma conta de Elo do 1v1 (game.ranked_elo, K = 24) com a MÉDIA dos pontos de cada time
-- e o menor número de partidas do time (fator do novato). Cada vencedor ganha o mesmo; cada perdedor perde o mesmo (nunca
-- abaixo de 0). Recompensa: 30 ryō para quem vence, 10 para quem perde. Com conta de admin no meio, não conta.
CREATE OR REPLACE FUNCTION game.ranked3_result(p_winners uuid[], p_losers uuid[], p_winner_rounds integer, p_loser_rounds integer,
                                               p_reason text, p_duration_ms integer)
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_wm integer;
  v_lm integer;
  v_wn integer;
  v_ln integer;
  e    record;
BEGIN
  IF cardinality(p_winners) < 1 OR cardinality(p_losers) < 1 OR p_winners && p_losers THEN
    RAISE EXCEPTION 'Times inválidos' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_ranked3_teams';
  END IF;
  PERFORM 1 FROM players WHERE id = ANY (p_winners || p_losers) ORDER BY id FOR UPDATE;
  counted := NOT EXISTS (SELECT 1 FROM players WHERE id = ANY (p_winners || p_losers) AND is_admin)
             AND (SELECT count(*) FROM players WHERE id = ANY (p_winners || p_losers)) = cardinality(p_winners) + cardinality(p_losers);
  winner_delta := 0; loser_delta := 0;
  IF counted THEN
    INSERT INTO ranked3_ratings (player_id) SELECT unnest(p_winners || p_losers) ON CONFLICT (player_id) DO NOTHING;
    SELECT round(avg(mmr))::int, min(wins + losses) INTO v_wm, v_wn FROM ranked3_ratings WHERE player_id = ANY (p_winners);
    SELECT round(avg(mmr))::int, min(wins + losses) INTO v_lm, v_ln FROM ranked3_ratings WHERE player_id = ANY (p_losers);
    SELECT * INTO e FROM ranked_elo(v_wm, v_lm, v_wn, v_ln);
    winner_delta := e.gain;
    loser_delta := e.loss;
    UPDATE ranked3_ratings SET mmr = mmr + winner_delta, best_mmr = greatest(best_mmr, mmr + winner_delta), wins = wins + 1, updated_at = now()
     WHERE player_id = ANY (p_winners);
    UPDATE ranked3_ratings SET mmr = greatest(0, mmr + loser_delta), losses = losses + 1, updated_at = now() WHERE player_id = ANY (p_losers);
    UPDATE players SET ryo = ryo + 30 WHERE id = ANY (p_winners);
    UPDATE players SET ryo = ryo + 10 WHERE id = ANY (p_losers);
  END IF;
  INSERT INTO ranked3_matches (winners, losers, winner_rounds, loser_rounds, reason, duration_ms, counted, winner_delta, loser_delta)
  VALUES (p_winners, p_losers, p_winner_rounds, p_loser_rounds, p_reason, greatest(0, p_duration_ms), counted, winner_delta, loser_delta);
  RETURN NEXT;
END $$;

COMMIT;
