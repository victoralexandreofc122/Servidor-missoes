-- =====================================================================
-- Vontade do Fogo: migração v11 (fim de jogo: vilas, política, PvP, renegados, Akatsuki e capas)
--
-- Rode DEPOIS da v10 (schema_v10_design.sql), no SQL Editor do Neon (branch production).
-- Pode rodar de novo sem erro. O servidor SOBE sem ela: os módulos de fim de jogo só ficam desligados
-- (o log do boot avisa). A especificação está em docs/endgame.md.
--
-- O BANCO é a autoridade das regras que não podem ser burladas:
--  0. MÓDULOS: game.endgame_modules (ligado pela população ativa ou à força pelo admin). Uma vez ligado, fica.
--  1. VILAS: game.villages (Folha, Pedra, Névoa, Nuvem, Areia) e players.village. A vila é do servidor, não do
--     visual. Escolha livre na criação; depois, uma troca só. Kage eleito por vila (game.village_kages,
--     game.kage_elections, game.kage_votes), diplomacia (guerra, aliança, paz), eventos globais e o preço das lojas.
--  2. PVP: Elo global e por temporada (game.pvp_ratings, game.pvp_season_ratings), temporadas de 60 dias com
--     recompensas, partidas registradas (contra combinação de vitórias). Admin nunca entra no ranking.
--  3. RENEGADOS: players.renegade_at (IRREVERSÍVEL: só o admin desfaz), banimento pelo Kage, denúncias, karma
--     (20 ninjas da própria vila) e a recompensa pela cabeça.
--  4. AKATSUKI: 10 vagas no servidor inteiro (game.akatsuki_members, vagas 1 a 10), convites do líder.
--  5. CAPAS: itens do tipo capa, capa equipada e o que mostrar no boneco (capa, arma, pergaminho).
--  6. ADMIN: comandos novos (game.admin_*), todos na auditoria.
-- Nada aqui usa bloco anônimo de código (o SQL Editor do Neon corta o bloco).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 0. módulos e população

CREATE TABLE IF NOT EXISTS game.endgame_modules (
  code         text        PRIMARY KEY CHECK (code IN ('vilas', 'pvp', 'renegados', 'akatsuki')),
  mode         text        NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'on', 'off')),
  activated_at timestamptz
);
COMMENT ON TABLE game.endgame_modules IS
  'Módulos de fim de jogo. auto = liga sozinho quando a população chega no limite (e fica ligado); on/off = forçado pelo admin.';
INSERT INTO game.endgame_modules (code) VALUES ('vilas'), ('pvp'), ('renegados'), ('akatsuki') ON CONFLICT (code) DO NOTHING;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
COMMENT ON COLUMN game.players.last_seen_at IS 'Última vez que entrou no jogo (população ativa dos módulos de fim de jogo).';

-- O módulo vale? (mode on, ou auto já ativado) E os módulos de que ele depende também.
CREATE OR REPLACE FUNCTION game.endgame_active(p_code text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT COALESCE(bool_and(m.mode = 'on' OR (m.mode = 'auto' AND m.activated_at IS NOT NULL)), false)
    FROM endgame_modules m
   WHERE m.code = ANY (CASE p_code
           WHEN 'vilas'     THEN ARRAY['vilas']
           WHEN 'pvp'       THEN ARRAY['vilas', 'pvp']
           WHEN 'renegados' THEN ARRAY['vilas', 'pvp', 'renegados']
           WHEN 'akatsuki'  THEN ARRAY['vilas', 'pvp', 'renegados', 'akatsuki']
           ELSE ARRAY[]::text[] END)
$$;

-- Jogadores ativos: entraram nos últimos p_days dias, já fora da Academia, sem contar admin.
CREATE OR REPLACE FUNCTION game.active_population(p_days integer DEFAULT 7) RETURNS integer
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT count(*)::int FROM players
   WHERE last_seen_at > now() - make_interval(days => p_days) AND tutorial_step >= 4 AND NOT is_admin
$$;

-- A população chegou no limite: liga o módulo (uma vez só; depois ele não desliga sozinho).
CREATE OR REPLACE FUNCTION game.endgame_activate(p_code text) RETURNS boolean
LANGUAGE sql SET search_path = game AS $$
  WITH up AS (
    UPDATE endgame_modules SET activated_at = now() WHERE code = p_code AND activated_at IS NULL RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM up)
$$;

-- ---------------------------------------------------------------- 1. vilas e membros

CREATE TABLE IF NOT EXISTS game.villages (
  code       text     PRIMARY KEY CHECK (code ~ '^vila_[1-5]$'),
  name       text     NOT NULL UNIQUE,
  sort_order smallint NOT NULL UNIQUE
);
COMMENT ON TABLE game.villages IS 'As cinco vilas (os nomes mudam aqui e em src/realtime/villages.ts).';
INSERT INTO game.villages (code, name, sort_order) VALUES
  ('vila_1', 'Folha', 1), ('vila_2', 'Pedra', 2), ('vila_3', 'Névoa', 3), ('vila_4', 'Nuvem', 4), ('vila_5', 'Areia', 5)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS village          text REFERENCES game.villages (code);
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS village_switches smallint NOT NULL DEFAULT 0;
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS renegade_at      timestamptz;
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS renegade_from    text REFERENCES game.villages (code);
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS renegade_reason  text;
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS own_village_kills integer NOT NULL DEFAULT 0;
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS bounty_ryo       bigint NOT NULL DEFAULT 0;
COMMENT ON COLUMN game.players.village IS 'Vila do ninja (do servidor; o visual só mostra as cores dela). NULL = renegado.';
COMMENT ON COLUMN game.players.own_village_kills IS 'Karma: ninjas da própria vila derrotados na Zona de Conflito. Em 20, vira renegado. O jogador não vê.';

-- Quem já jogava: a vila que escolheu no Criador antes de as vilas travarem, ou a Folha.
UPDATE game.players
   SET village = CASE WHEN appearance ->> 'village' IN ('vila_1', 'vila_2', 'vila_3', 'vila_4', 'vila_5') THEN appearance ->> 'village' ELSE 'vila_1' END
 WHERE village IS NULL AND renegade_at IS NULL;
ALTER TABLE game.players ALTER COLUMN village SET DEFAULT 'vila_1';
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_village;
ALTER TABLE game.players ADD CONSTRAINT ck_players_village CHECK ((village IS NULL) = (renegade_at IS NOT NULL));
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_bounty;
ALTER TABLE game.players ADD CONSTRAINT ck_players_bounty CHECK (bounty_ryo >= 0 AND own_village_kills >= 0);

-- Renegado é para sempre: só um comando de admin (flag local game.admin_action) desfaz.
CREATE OR REPLACE FUNCTION game.trg_players_renegade_final() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF OLD.renegade_at IS NOT NULL AND NEW.renegade_at IS NULL
     AND current_setting('game.admin_action', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Renegado não volta para a vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_renegade_final';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_renegade_final ON game.players;
CREATE TRIGGER trg_players_renegade_final BEFORE UPDATE OF renegade_at ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.trg_players_renegade_final();

-- Tier do rank (Academia 10, Genin 20, Chunin 30...).
CREATE OR REPLACE FUNCTION game.rank_tier(p_player uuid) RETURNS smallint
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT r.tier FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = p_player
$$;

-- Escolher a vila: livre na criação do personagem (visual ainda vazio); depois, UMA troca, se não for Kage,
-- candidato nem da Akatsuki. Renegado não escolhe. Só com o módulo de vilas ligado.
CREATE OR REPLACE FUNCTION game.choose_village(p_player uuid, p_village text) RETURNS text
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v players%ROWTYPE;
BEGIN
  SELECT * INTO v FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM villages WHERE code = p_village) THEN
    RAISE EXCEPTION 'Vila inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_unknown';
  END IF;
  IF v.renegade_at IS NOT NULL THEN
    RAISE EXCEPTION 'Renegado não tem vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_renegade_no_village';
  END IF;
  IF v.village = p_village THEN RETURN p_village; END IF;
  IF NOT endgame_active('vilas') THEN
    RAISE EXCEPTION 'Ainda não' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_module_off';
  END IF;
  IF v.appearance IS NULL THEN
    UPDATE players SET village = p_village WHERE id = p_player;
    RETURN p_village;
  END IF;
  IF v.village_switches >= 1 THEN
    RAISE EXCEPTION 'Troca já usada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_switch_used';
  END IF;
  IF kage_village_of(p_player) IS NOT NULL OR EXISTS (SELECT 1 FROM hokage_candidates WHERE player_id = p_player)
     OR akatsuki_slot_of(p_player) IS NOT NULL THEN
    RAISE EXCEPTION 'Kage, candidato ou Akatsuki' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_switch_blocked';
  END IF;
  UPDATE players SET village = p_village, village_switches = village_switches + 1 WHERE id = p_player;
  RETURN p_village;
END $$;

-- ---------------------------------------------------------------- 2. Kage e eleições

CREATE TABLE IF NOT EXISTS game.village_kages (
  village      text        PRIMARY KEY REFERENCES game.villages (code),
  player_id    uuid        NOT NULL UNIQUE REFERENCES game.players (id) ON DELETE CASCADE,
  since        timestamptz NOT NULL DEFAULT now(),
  term_ends_at timestamptz NOT NULL
);
COMMENT ON TABLE game.village_kages IS 'O Kage de cada vila (um por vila, ninguém é Kage de duas). Mandato de 28 dias.';

CREATE TABLE IF NOT EXISTS game.kage_elections (
  id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  village   text        NOT NULL REFERENCES game.villages (code),
  opens_at  timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL,
  closed_at timestamptz,
  winner_id uuid        REFERENCES game.players (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kage_elections_open ON game.kage_elections (village) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS game.kage_votes (
  election_id  bigint      NOT NULL REFERENCES game.kage_elections (id) ON DELETE CASCADE,
  voter_id     uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  candidate_id uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  voted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (election_id, voter_id)
);

COMMENT ON TABLE game.hokage_candidates IS 'Candidatos a Kage (nível 60, com o Diretor). Concorrem na eleição da própria vila.';

-- Vila em que o jogador é Kage agora (NULL = não é Kage).
CREATE OR REPLACE FUNCTION game.kage_village_of(p_player uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT village FROM village_kages WHERE player_id = p_player AND term_ends_at > now()
$$;

-- Voto na eleição da própria vila: Genin+, conta com mais de 7 dias, um voto por eleição, em candidato da vila.
CREATE OR REPLACE FUNCTION game.kage_vote(p_voter uuid, p_candidate uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_village  text;
  v_created  timestamptz;
  v_election bigint;
BEGIN
  SELECT village, created_at INTO v_village, v_created FROM players WHERE id = p_voter FOR UPDATE;
  IF v_village IS NULL THEN
    RAISE EXCEPTION 'Sem vila, sem voto' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_no_village';
  END IF;
  SELECT id INTO v_election FROM kage_elections WHERE village = v_village AND closed_at IS NULL AND closes_at > now();
  IF v_election IS NULL THEN
    RAISE EXCEPTION 'Não há eleição aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_no_election';
  END IF;
  IF rank_tier(p_voter) < 20 OR v_created > now() - interval '7 days' THEN
    RAISE EXCEPTION 'Só Genin+ com conta de 7 dias votam' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_eligibility';
  END IF;
  PERFORM 1 FROM hokage_candidates c JOIN players p ON p.id = c.player_id
   WHERE c.player_id = p_candidate AND p.village = v_village;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidato inválido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_candidate';
  END IF;
  IF EXISTS (SELECT 1 FROM kage_votes WHERE election_id = v_election AND voter_id = p_voter) THEN
    RAISE EXCEPTION 'Já votou' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_once';
  END IF;
  INSERT INTO kage_votes (election_id, voter_id, candidate_id) VALUES (v_election, p_voter, p_candidate);
END $$;

-- Fecha a eleição: ganha quem tem mais votos (empate: quem se candidatou antes), se ainda for da vila.
CREATE OR REPLACE FUNCTION game.close_kage_election(p_election bigint, p_now timestamptz) RETURNS uuid
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_village text;
  v_winner  uuid;
BEGIN
  SELECT village INTO v_village FROM kage_elections WHERE id = p_election AND closed_at IS NULL FOR UPDATE;
  IF v_village IS NULL THEN RETURN NULL; END IF;
  SELECT v.candidate_id INTO v_winner
    FROM kage_votes v
    JOIN players p ON p.id = v.candidate_id
    JOIN hokage_candidates c ON c.player_id = v.candidate_id
   WHERE v.election_id = p_election AND p.village = v_village
   GROUP BY v.candidate_id, c.applied_at
   ORDER BY count(*) DESC, c.applied_at ASC
   LIMIT 1;
  UPDATE kage_elections SET closed_at = p_now, winner_id = v_winner WHERE id = p_election;
  IF v_winner IS NOT NULL THEN
    DELETE FROM village_kages WHERE player_id = v_winner AND village <> v_village;
    INSERT INTO village_kages (village, player_id, since, term_ends_at) VALUES (v_village, v_winner, p_now, p_now + interval '28 days')
    ON CONFLICT (village) DO UPDATE SET player_id = EXCLUDED.player_id, since = EXCLUDED.since, term_ends_at = EXCLUDED.term_ends_at;
  END IF;
  RETURN v_winner;
END $$;

-- ---------------------------------------------------------------- 3. diplomacia, eventos e economia

CREATE TABLE IF NOT EXISTS game.village_relations (
  village_a   text        NOT NULL REFERENCES game.villages (code),
  village_b   text        NOT NULL REFERENCES game.villages (code),
  state       text        NOT NULL CHECK (state IN ('guerra', 'alianca')),
  declared_by text        NOT NULL REFERENCES game.villages (code),
  since       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (village_a, village_b),
  CONSTRAINT ck_village_relations_pair CHECK (village_a < village_b)
);
COMMENT ON TABLE game.village_relations IS 'Guerra ou aliança entre duas vilas (sem linha = neutras). declared_by: quem declarou a guerra / propôs a aliança.';

CREATE TABLE IF NOT EXISTS game.village_pair_changes (
  village_a      text        NOT NULL REFERENCES game.villages (code),
  village_b      text        NOT NULL REFERENCES game.villages (code),
  last_change_at timestamptz NOT NULL,
  PRIMARY KEY (village_a, village_b)
);

CREATE TABLE IF NOT EXISTS game.diplomacy_proposals (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         text        NOT NULL CHECK (kind IN ('alianca', 'paz')),
  from_village text        NOT NULL REFERENCES game.villages (code),
  to_village   text        NOT NULL REFERENCES game.villages (code),
  proposed_by  uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  answered_at  timestamptz,
  accepted     boolean
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_diplomacy_open ON game.diplomacy_proposals (least(from_village, to_village), greatest(from_village, to_village), kind)
  WHERE answered_at IS NULL;

CREATE TABLE IF NOT EXISTS game.world_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       text        NOT NULL CHECK (kind IN ('guerra', 'tregua')),
  village_a  text        REFERENCES game.villages (code),
  village_b  text        REFERENCES game.villages (code),
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL,
  note       text,
  created_by uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  CONSTRAINT ck_world_events_pair CHECK (
    (village_a IS NULL AND village_b IS NULL AND kind = 'tregua') OR (village_a IS NOT NULL AND village_b IS NOT NULL AND village_a < village_b)),
  CONSTRAINT ck_world_events_time CHECK (ends_at > starts_at)
);
COMMENT ON TABLE game.world_events IS 'Eventos globais: guerra forçada entre duas vilas, ou trégua (entre duas ou entre todas). Valem por cima dos Kages.';

CREATE TABLE IF NOT EXISTS game.kage_actions (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  village       text        NOT NULL REFERENCES game.villages (code),
  kage_id       uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  action        text        NOT NULL,
  target_village text       REFERENCES game.villages (code),
  target_player uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  reason        text,
  at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.kage_actions IS 'Tudo que um Kage fez (guerra, aliança, paz, banimento, denúncia): quem, quando e por quê.';

-- Estado de fato entre duas vilas agora: mesma, tregua, guerra, alianca ou neutro (eventos valem por cima).
CREATE OR REPLACE FUNCTION game.village_relation(p_a text, p_b text, p_now timestamptz DEFAULT now()) RETURNS text
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT CASE
    WHEN p_a IS NULL OR p_b IS NULL THEN 'neutro'
    WHEN p_a = p_b THEN 'mesma'
    WHEN EXISTS (SELECT 1 FROM world_events e WHERE e.kind = 'tregua' AND p_now >= e.starts_at AND p_now < e.ends_at
                   AND (e.village_a IS NULL OR (e.village_a = least(p_a, p_b) AND e.village_b = greatest(p_a, p_b)))) THEN 'tregua'
    WHEN EXISTS (SELECT 1 FROM world_events e WHERE e.kind = 'guerra' AND p_now >= e.starts_at AND p_now < e.ends_at
                   AND e.village_a = least(p_a, p_b) AND e.village_b = greatest(p_a, p_b)) THEN 'guerra'
    ELSE COALESCE((SELECT r.state FROM village_relations r WHERE r.village_a = least(p_a, p_b) AND r.village_b = greatest(p_a, p_b)), 'neutro')
  END
$$;

-- O Kage de verdade de alguma vila (e qual); senão, recusa.
CREATE OR REPLACE FUNCTION game.assert_kage(p_kage uuid) RETURNS text
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_village text := kage_village_of(p_kage);
BEGIN
  IF v_village IS NULL OR NOT endgame_active('vilas') THEN
    RAISE EXCEPTION 'Só o Kage' USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'rule_kage_only';
  END IF;
  RETURN v_village;
END $$;

-- 24 h entre duas mudanças da mesma dupla de vilas.
CREATE OR REPLACE FUNCTION game.diplomacy_cooldown(p_a text, p_b text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM village_pair_changes WHERE village_a = least(p_a, p_b) AND village_b = greatest(p_a, p_b)
               AND last_change_at > now() - interval '24 hours') THEN
    RAISE EXCEPTION 'Espere 24 h' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_diplomacy_cooldown';
  END IF;
  INSERT INTO village_pair_changes (village_a, village_b, last_change_at) VALUES (least(p_a, p_b), greatest(p_a, p_b), now())
  ON CONFLICT (village_a, village_b) DO UPDATE SET last_change_at = EXCLUDED.last_change_at;
END $$;

CREATE OR REPLACE FUNCTION game.assert_other_village(p_mine text, p_target text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF p_target IS NULL OR p_target = p_mine OR NOT EXISTS (SELECT 1 FROM villages WHERE code = p_target) THEN
    RAISE EXCEPTION 'Vila inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_unknown';
  END IF;
END $$;

-- Declarar guerra: sozinho. Não vale contra aliada, nem em trégua.
CREATE OR REPLACE FUNCTION game.kage_declare_war(p_kage uuid, p_target text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
  v_rel  text;
BEGIN
  PERFORM assert_other_village(v_mine, p_target);
  v_rel := village_relation(v_mine, p_target);
  IF v_rel = 'alianca' THEN RAISE EXCEPTION 'Aliada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_war_on_ally'; END IF;
  IF v_rel = 'guerra' THEN RAISE EXCEPTION 'Já em guerra' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_already_war'; END IF;
  IF v_rel = 'tregua' THEN RAISE EXCEPTION 'Trégua' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_truce_active'; END IF;
  PERFORM diplomacy_cooldown(v_mine, p_target);
  INSERT INTO village_relations (village_a, village_b, state, declared_by) VALUES (least(v_mine, p_target), greatest(v_mine, p_target), 'guerra', v_mine);
  UPDATE diplomacy_proposals SET answered_at = now(), accepted = false
   WHERE answered_at IS NULL AND least(from_village, to_village) = least(v_mine, p_target) AND greatest(from_village, to_village) = greatest(v_mine, p_target);
  INSERT INTO kage_actions (village, kage_id, action, target_village) VALUES (v_mine, p_kage, 'guerra', p_target);
END $$;

-- Encerrar guerra: quem declarou encerra sozinho (o outro lado propõe paz).
CREATE OR REPLACE FUNCTION game.kage_end_war(p_kage uuid, p_target text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
BEGIN
  PERFORM assert_other_village(v_mine, p_target);
  IF NOT EXISTS (SELECT 1 FROM village_relations WHERE village_a = least(v_mine, p_target) AND village_b = greatest(v_mine, p_target)
                   AND state = 'guerra' AND declared_by = v_mine) THEN
    RAISE EXCEPTION 'Só quem declarou encerra' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_end_war_declarer';
  END IF;
  PERFORM diplomacy_cooldown(v_mine, p_target);
  DELETE FROM village_relations WHERE village_a = least(v_mine, p_target) AND village_b = greatest(v_mine, p_target) AND state = 'guerra';
  INSERT INTO kage_actions (village, kage_id, action, target_village) VALUES (v_mine, p_kage, 'fim_guerra', p_target);
END $$;

-- Proposta de aliança (vilas neutras, no máximo 1 aliança por vila) ou de paz (em guerra). Vale 48 h.
CREATE OR REPLACE FUNCTION game.kage_propose(p_kage uuid, p_target text, p_kind text) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
  v_rel  text;
  v_id   bigint;
BEGIN
  PERFORM assert_other_village(v_mine, p_target);
  v_rel := village_relation(v_mine, p_target);
  IF p_kind = 'alianca' THEN
    IF v_rel <> 'neutro' THEN RAISE EXCEPTION 'Só entre vilas neutras' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_alliance_state'; END IF;
    IF EXISTS (SELECT 1 FROM village_relations WHERE state = 'alianca' AND (village_a IN (v_mine, p_target) OR village_b IN (v_mine, p_target))) THEN
      RAISE EXCEPTION 'Uma aliança por vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_alliance_limit';
    END IF;
  ELSIF p_kind = 'paz' THEN
    IF NOT EXISTS (SELECT 1 FROM village_relations WHERE village_a = least(v_mine, p_target) AND village_b = greatest(v_mine, p_target) AND state = 'guerra') THEN
      RAISE EXCEPTION 'Não estão em guerra' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_peace_state';
    END IF;
  ELSE
    RAISE EXCEPTION 'Proposta inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_unknown';
  END IF;
  IF EXISTS (SELECT 1 FROM diplomacy_proposals WHERE answered_at IS NULL AND kind = p_kind
               AND least(from_village, to_village) = least(v_mine, p_target) AND greatest(from_village, to_village) = greatest(v_mine, p_target)) THEN
    RAISE EXCEPTION 'Proposta já aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_proposal_open';
  END IF;
  INSERT INTO diplomacy_proposals (kind, from_village, to_village, proposed_by, expires_at)
  VALUES (p_kind, v_mine, p_target, p_kage, now() + interval '48 hours') RETURNING id INTO v_id;
  INSERT INTO kage_actions (village, kage_id, action, target_village) VALUES (v_mine, p_kage, 'propoe_' || p_kind, p_target);
  RETURN v_id;
END $$;

-- Resposta do Kage da vila que recebeu a proposta. Aceitou: vira aliança (ou acaba a guerra).
CREATE OR REPLACE FUNCTION game.kage_answer(p_kage uuid, p_proposal bigint, p_accept boolean) RETURNS text
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
  p      diplomacy_proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM diplomacy_proposals WHERE id = p_proposal AND to_village = v_mine AND answered_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_proposal_missing';
  END IF;
  IF p_accept THEN
    IF p.kind = 'alianca' THEN
      IF village_relation(p.from_village, p.to_village) <> 'neutro' THEN
        RAISE EXCEPTION 'Só entre vilas neutras' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_alliance_state';
      END IF;
      IF EXISTS (SELECT 1 FROM village_relations WHERE state = 'alianca' AND (village_a IN (p.from_village, p.to_village) OR village_b IN (p.from_village, p.to_village))) THEN
        RAISE EXCEPTION 'Uma aliança por vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_alliance_limit';
      END IF;
      PERFORM diplomacy_cooldown(p.from_village, p.to_village);
      INSERT INTO village_relations (village_a, village_b, state, declared_by)
      VALUES (least(p.from_village, p.to_village), greatest(p.from_village, p.to_village), 'alianca', p.from_village);
    ELSE
      PERFORM diplomacy_cooldown(p.from_village, p.to_village);
      DELETE FROM village_relations
       WHERE village_a = least(p.from_village, p.to_village) AND village_b = greatest(p.from_village, p.to_village) AND state = 'guerra';
    END IF;
  END IF;
  UPDATE diplomacy_proposals SET answered_at = now(), accepted = p_accept WHERE id = p_proposal;
  INSERT INTO kage_actions (village, kage_id, action, target_village)
  VALUES (v_mine, p_kage, CASE WHEN p_accept THEN 'aceita_' ELSE 'recusa_' END || p.kind, p.from_village);
  RETURN p.kind;
END $$;

-- Desfazer aliança: qualquer um dos dois Kages.
CREATE OR REPLACE FUNCTION game.kage_break_alliance(p_kage uuid, p_target text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
BEGIN
  PERFORM assert_other_village(v_mine, p_target);
  IF NOT EXISTS (SELECT 1 FROM village_relations WHERE village_a = least(v_mine, p_target) AND village_b = greatest(v_mine, p_target) AND state = 'alianca') THEN
    RAISE EXCEPTION 'Não são aliadas' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_allied';
  END IF;
  PERFORM diplomacy_cooldown(v_mine, p_target);
  DELETE FROM village_relations WHERE village_a = least(v_mine, p_target) AND village_b = greatest(v_mine, p_target) AND state = 'alianca';
  INSERT INTO kage_actions (village, kage_id, action, target_village) VALUES (v_mine, p_kage, 'rompe_alianca', p_target);
END $$;

-- Preço nas lojas para quem é da vila: +10% com alguma guerra (esforço de guerra), −5% com aliança (comércio).
CREATE OR REPLACE FUNCTION game.village_price_factor(p_village text) RETURNS numeric
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT CASE WHEN p_village IS NULL OR NOT endgame_active('vilas') THEN 1.0
    ELSE (CASE WHEN EXISTS (SELECT 1 FROM villages v WHERE v.code <> p_village AND village_relation(p_village, v.code) = 'guerra') THEN 1.10 ELSE 1.0 END)
       * (CASE WHEN EXISTS (SELECT 1 FROM villages v WHERE v.code <> p_village AND village_relation(p_village, v.code) = 'alianca') THEN 0.95 ELSE 1.0 END)
  END
$$;

-- A compra da v7, com o preço da vila (o catálogo continua sendo o preço base).
CREATE OR REPLACE FUNCTION game.buy_item(p_player uuid, p_item text, p_qty integer) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_price integer;
  v_total bigint;
  v_ryo   bigint;
BEGIN
  SELECT price_ryo INTO v_price FROM items WHERE code = p_item AND shop IS NOT NULL;
  IF v_price IS NULL OR p_qty NOT BETWEEN 1 AND 99 THEN
    RAISE EXCEPTION 'Item não está à venda' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_item_not_for_sale';
  END IF;
  v_total := ceil(v_price * p_qty * village_price_factor((SELECT village FROM players WHERE id = p_player)));
  UPDATE players SET ryo = ryo - v_total WHERE id = p_player AND ryo >= v_total RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ryō insuficiente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_enough_ryo';
  END IF;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, p_item, p_qty)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + p_qty;
  RETURN v_ryo;
END $$;

-- Posto de Viagem para vila aliada: 50 ryō (o mesmo de config.endgame.allyTravelRyo; o teste confere). Só com aliança
-- valendo agora. Devolve o ryō que sobrou. A viagem de graça (casa, Floresta, Zona) nem passa pelo banco.
CREATE OR REPLACE FUNCTION game.pay_travel(p_player uuid, p_village text) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text;
  v_ryo  bigint;
BEGIN
  SELECT village INTO v_mine FROM players WHERE id = p_player FOR UPDATE;
  IF NOT endgame_active('vilas') THEN
    RAISE EXCEPTION 'Ainda não' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_module_off';
  END IF;
  IF v_mine IS NULL OR village_relation(v_mine, p_village) <> 'alianca' THEN
    RAISE EXCEPTION 'Só para vila aliada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_travel_not_allied';
  END IF;
  UPDATE players SET ryo = ryo - 50 WHERE id = p_player AND ryo >= 50 RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ryō insuficiente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_enough_ryo';
  END IF;
  RETURN v_ryo;
END $$;

-- ---------------------------------------------------------------- 4. renegados (antes do PvP: o karma usa)

CREATE TABLE IF NOT EXISTS game.village_reports (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  village     text        NOT NULL REFERENCES game.villages (code),
  reporter_id uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  target_id   uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  decided_by  uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  approved    boolean,
  CONSTRAINT ck_village_reports_not_self CHECK (reporter_id <> target_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_village_reports_open ON game.village_reports (reporter_id, target_id) WHERE decided_at IS NULL;

CREATE TABLE IF NOT EXISTS game.bounty_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  renegade_id uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  other_id    uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('aumento', 'cobranca')),
  amount      bigint      NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bounty_events_pair ON game.bounty_events (renegade_id, other_id, kind, at);

-- Vira renegado (uso interno): sai da vila, do cargo de Kage e da candidatura; denúncias contra ele se fecham.
CREATE OR REPLACE FUNCTION game.make_renegade(p_player uuid, p_reason text) RETURNS boolean
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  UPDATE players
     SET renegade_from = village, village = NULL, renegade_at = now(), renegade_reason = left(p_reason, 300)
   WHERE id = p_player AND renegade_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM village_kages WHERE player_id = p_player;
  DELETE FROM hokage_candidates WHERE player_id = p_player;
  UPDATE village_reports SET decided_at = now(), approved = false WHERE target_id = p_player AND decided_at IS NULL;
  RETURN true;
END $$;

-- Limite do Kage: 5 expulsões (banimento ou denúncia aprovada) a cada 7 dias.
CREATE OR REPLACE FUNCTION game.assert_exile_limit(p_village text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF (SELECT count(*) FROM kage_actions WHERE village = p_village AND action IN ('banir', 'aprova_denuncia') AND at > now() - interval '7 days') >= 5 THEN
    RAISE EXCEPTION 'Limite de expulsões' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_exile_limit';
  END IF;
END $$;

-- Banimento pelo Kage: ninja da vila dele, com justificativa. Irreversível.
CREATE OR REPLACE FUNCTION game.kage_exile(p_kage uuid, p_target uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
BEGIN
  IF NOT endgame_active('renegados') THEN
    RAISE EXCEPTION 'Ainda não' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_module_off';
  END IF;
  IF p_target = p_kage OR NOT EXISTS (SELECT 1 FROM players WHERE id = p_target AND village = v_mine) THEN
    RAISE EXCEPTION 'Só ninjas da sua vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_exile_target';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'Justificativa' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_reason_length';
  END IF;
  PERFORM assert_exile_limit(v_mine);
  PERFORM make_renegade(p_target, 'banido: ' || btrim(p_reason));
  INSERT INTO kage_actions (village, kage_id, action, target_player, reason) VALUES (v_mine, p_kage, 'banir', p_target, btrim(p_reason));
END $$;

-- Denúncia ao Kage: da mesma vila, rank igual ou maior que o do denunciado.
CREATE OR REPLACE FUNCTION game.report_player(p_reporter uuid, p_target uuid, p_reason text) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_village text;
  v_id      bigint;
BEGIN
  IF NOT endgame_active('renegados') THEN
    RAISE EXCEPTION 'Ainda não' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_module_off';
  END IF;
  SELECT village INTO v_village FROM players WHERE id = p_reporter;
  IF v_village IS NULL OR p_target = p_reporter OR NOT EXISTS (SELECT 1 FROM players WHERE id = p_target AND village = v_village) THEN
    RAISE EXCEPTION 'Só ninjas da sua vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_report_target';
  END IF;
  IF rank_tier(p_reporter) < rank_tier(p_target) THEN
    RAISE EXCEPTION 'Rank menor' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_report_rank';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'Justificativa' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_reason_length';
  END IF;
  IF EXISTS (SELECT 1 FROM village_reports WHERE reporter_id = p_reporter AND target_id = p_target AND decided_at IS NULL) THEN
    RAISE EXCEPTION 'Denúncia aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_report_open';
  END IF;
  INSERT INTO village_reports (village, reporter_id, target_id, reason) VALUES (v_village, p_reporter, p_target, btrim(p_reason)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- O Kage decide a denúncia. Aprovada: o denunciado vira renegado.
CREATE OR REPLACE FUNCTION game.kage_decide_report(p_kage uuid, p_report bigint, p_approve boolean) RETURNS uuid
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mine text := assert_kage(p_kage);
  r      village_reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM village_reports WHERE id = p_report AND village = v_mine AND decided_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denúncia não encontrada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_report_missing';
  END IF;
  IF p_approve THEN
    IF r.target_id = p_kage THEN
      RAISE EXCEPTION 'Contra o próprio Kage' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_exile_target';
    END IF;
    PERFORM assert_exile_limit(v_mine);
  END IF;
  UPDATE village_reports SET decided_at = now(), decided_by = p_kage, approved = p_approve WHERE id = p_report;
  IF p_approve THEN
    PERFORM make_renegade(r.target_id, 'denúncia: ' || r.reason);
  END IF;
  INSERT INTO kage_actions (village, kage_id, action, target_player, reason)
  VALUES (v_mine, p_kage, CASE WHEN p_approve THEN 'aprova_denuncia' ELSE 'recusa_denuncia' END, r.target_id, r.reason);
  RETURN r.target_id;
END $$;

-- ---------------------------------------------------------------- 5. PvP: ranking e temporadas

CREATE TABLE IF NOT EXISTS game.pvp_seasons (
  id        integer     PRIMARY KEY CHECK (id > 0),
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT ck_pvp_seasons_time CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pvp_seasons_open ON game.pvp_seasons ((true)) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS game.pvp_ratings (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  mmr        integer     NOT NULL DEFAULT 1000 CHECK (mmr >= 0),
  wins       integer     NOT NULL DEFAULT 0,
  losses     integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game.pvp_season_ratings (
  season_id integer NOT NULL REFERENCES game.pvp_seasons (id),
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  mmr       integer NOT NULL DEFAULT 1000 CHECK (mmr >= 0),
  wins      integer NOT NULL DEFAULT 0,
  losses    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS ix_pvp_season_ratings_rank ON game.pvp_season_ratings (season_id, mmr DESC);

CREATE TABLE IF NOT EXISTS game.pvp_matches (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id    integer     REFERENCES game.pvp_seasons (id),
  winner_id    uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  loser_id     uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  counted      boolean     NOT NULL,
  winner_delta integer     NOT NULL DEFAULT 0,
  loser_delta  integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_pvp_matches_pair ON game.pvp_matches (winner_id, loser_id, at);

CREATE TABLE IF NOT EXISTS game.pvp_season_rewards (
  season_id integer NOT NULL REFERENCES game.pvp_seasons (id),
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  position  integer NOT NULL,
  title_id  uuid    REFERENCES game.titles (id),
  ryo       integer NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

-- ---------------------------------------------------------------- 6. Akatsuki

CREATE TABLE IF NOT EXISTS game.akatsuki_members (
  slot       smallint    PRIMARY KEY CHECK (slot BETWEEN 1 AND 10),
  player_id  uuid        NOT NULL UNIQUE REFERENCES game.players (id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  invited_by uuid        REFERENCES game.players (id) ON DELETE SET NULL
);
COMMENT ON TABLE game.akatsuki_members IS 'A Akatsuki: exatamente 10 vagas no servidor (vaga 1 = líder). Cada vaga tem o seu poder único.';

CREATE TABLE IF NOT EXISTS game.akatsuki_invites (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  slot       smallint    NOT NULL UNIQUE CHECK (slot BETWEEN 2 AND 10),
  invited_by uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION game.akatsuki_slot_of(p_player uuid) RETURNS smallint
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT slot FROM akatsuki_members WHERE player_id = p_player
$$;

-- Convite do líder para uma vaga livre (2 a 10). Nível 40+. Vale 48 h.
CREATE OR REPLACE FUNCTION game.akatsuki_invite(p_leader uuid, p_target uuid, p_slot integer) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NOT endgame_active('akatsuki') OR akatsuki_slot_of(p_leader) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Só o líder' USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'rule_akatsuki_leader';
  END IF;
  IF p_slot NOT BETWEEN 2 AND 10 OR EXISTS (SELECT 1 FROM akatsuki_members WHERE slot = p_slot) THEN
    RAISE EXCEPTION 'Vaga ocupada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_slot';
  END IF;
  IF akatsuki_slot_of(p_target) IS NOT NULL OR NOT EXISTS (SELECT 1 FROM players WHERE id = p_target AND level >= 40 AND NOT is_admin) THEN
    RAISE EXCEPTION 'Alvo inválido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_target';
  END IF;
  DELETE FROM akatsuki_invites WHERE slot = p_slot OR player_id = p_target;
  INSERT INTO akatsuki_invites (player_id, slot, invited_by, expires_at) VALUES (p_target, p_slot, p_leader, now() + interval '48 hours');
END $$;

-- Aceitar: vira renegado (se ainda não for: irreversível) e ganha a vaga e o poder.
CREATE OR REPLACE FUNCTION game.akatsuki_accept(p_player uuid) RETURNS smallint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v akatsuki_invites%ROWTYPE;
BEGIN
  SELECT * INTO v FROM akatsuki_invites WHERE player_id = p_player AND expires_at > now() FOR UPDATE;
  IF NOT FOUND OR NOT endgame_active('akatsuki') THEN
    RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_invite';
  END IF;
  IF EXISTS (SELECT 1 FROM akatsuki_members WHERE slot = v.slot) OR NOT EXISTS (SELECT 1 FROM players WHERE id = p_player AND level >= 40) THEN
    RAISE EXCEPTION 'Vaga ocupada' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_slot';
  END IF;
  PERFORM make_renegade(p_player, 'akatsuki');
  INSERT INTO akatsuki_members (slot, player_id, invited_by) VALUES (v.slot, p_player, v.invited_by);
  DELETE FROM akatsuki_invites WHERE player_id = p_player;
  RETURN v.slot;
END $$;

CREATE OR REPLACE FUNCTION game.akatsuki_decline(p_player uuid) RETURNS void
LANGUAGE sql SET search_path = game AS $$
  DELETE FROM akatsuki_invites WHERE player_id = p_player
$$;

-- O líder expulsa um membro (a vaga fica livre; ele continua renegado).
CREATE OR REPLACE FUNCTION game.akatsuki_expel(p_leader uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF akatsuki_slot_of(p_leader) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Só o líder' USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'rule_akatsuki_leader';
  END IF;
  DELETE FROM akatsuki_members WHERE player_id = p_target AND slot <> 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não é membro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_target';
  END IF;
END $$;

-- Sair por vontade própria (continua renegado). O líder saindo deixa a vaga 1 para o admin.
CREATE OR REPLACE FUNCTION game.akatsuki_leave(p_player uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  DELETE FROM akatsuki_members WHERE player_id = p_player;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não é membro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_target';
  END IF;
END $$;

-- ---------------------------------------------------------------- 7. a luta entre jogadores (Zona de Conflito)

-- Um jogador derrotou outro na Zona de Conflito. Tudo numa transação: ranking, karma, espólio de guerra,
-- recompensa pela cabeça e a caça da Akatsuki. Conta de admin não mexe em nada disso.
CREATE OR REPLACE FUNCTION game.pvp_kill(p_winner uuid, p_loser uuid)
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer, winner_mmr integer, loser_mmr integer,
               loot_ryo integer, became_renegade boolean, bounty_paid bigint, winner_bounty bigint, loser_bounty bigint,
               kage_hunted text, ryo_winner bigint)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  w        players%ROWTYPE;
  l        players%ROWTYPE;
  v_admin  boolean;
  v_season integer;
  v_wm     integer;
  v_lm     integer;
  v_delta  integer := 0;
  v_pair   integer;
  v_kills  integer;
  v_kage   text;
  v_pay    bigint := 0;
  v_add    bigint;
BEGIN
  -- trava as duas linhas sempre na mesma ordem (sem deadlock entre duas mortes cruzadas)
  PERFORM 1 FROM players WHERE id IN (p_winner, p_loser) ORDER BY id FOR UPDATE;
  SELECT * INTO w FROM players WHERE id = p_winner;
  SELECT * INTO l FROM players WHERE id = p_loser;
  IF w.id IS NULL OR l.id IS NULL OR p_winner = p_loser THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  v_admin := w.is_admin OR l.is_admin;
  counted := false; winner_delta := 0; loser_delta := 0; loot_ryo := 0; became_renegade := false; bounty_paid := 0; kage_hunted := NULL;

  -- 1. ranking (Elo): nada de admin, no máximo 3 vezes a mesma dupla por dia, diferença de nível até 10
  IF endgame_active('pvp') AND NOT v_admin AND abs(w.level - l.level) <= 10 THEN
    SELECT count(*) INTO v_pair FROM pvp_matches m
     WHERE m.winner_id = p_winner AND m.loser_id = p_loser AND m.counted AND m.at > now() - interval '24 hours';
    IF v_pair < 3 THEN
      counted := true;
      INSERT INTO pvp_ratings (player_id) VALUES (p_winner), (p_loser) ON CONFLICT (player_id) DO NOTHING;
      SELECT r.mmr INTO v_wm FROM pvp_ratings r WHERE r.player_id = p_winner;
      SELECT r.mmr INTO v_lm FROM pvp_ratings r WHERE r.player_id = p_loser;
      v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_lm - v_wm) / 400.0))))::int);
      UPDATE pvp_ratings SET mmr = mmr + v_delta, wins = wins + 1, updated_at = now() WHERE player_id = p_winner;
      UPDATE pvp_ratings SET mmr = greatest(0, mmr - v_delta), losses = losses + 1, updated_at = now() WHERE player_id = p_loser;
      SELECT s.id INTO v_season FROM pvp_seasons s WHERE s.closed_at IS NULL;
      IF v_season IS NOT NULL THEN
        INSERT INTO pvp_season_ratings (season_id, player_id) VALUES (v_season, p_winner), (v_season, p_loser) ON CONFLICT DO NOTHING;
        SELECT r.mmr INTO v_wm FROM pvp_season_ratings r WHERE r.season_id = v_season AND r.player_id = p_winner;
        SELECT r.mmr INTO v_lm FROM pvp_season_ratings r WHERE r.season_id = v_season AND r.player_id = p_loser;
        v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_lm - v_wm) / 400.0))))::int);
        UPDATE pvp_season_ratings SET mmr = mmr + v_delta, wins = wins + 1 WHERE season_id = v_season AND player_id = p_winner;
        UPDATE pvp_season_ratings SET mmr = greatest(0, mmr - v_delta), losses = losses + 1 WHERE season_id = v_season AND player_id = p_loser;
      END IF;
      winner_delta := v_delta;
      loser_delta := -v_delta;
    END IF;
  END IF;
  INSERT INTO pvp_matches (season_id, winner_id, loser_id, counted, winner_delta, loser_delta)
  VALUES ((SELECT s.id FROM pvp_seasons s WHERE s.closed_at IS NULL), p_winner, p_loser, counted, winner_delta, loser_delta);

  -- 2. karma: derrotar ninja da PRÓPRIA vila. No 20º, vira renegado (sem aviso antes).
  IF endgame_active('renegados') AND NOT v_admin AND w.village IS NOT NULL AND w.village = l.village THEN
    UPDATE players SET own_village_kills = own_village_kills + 1 WHERE id = p_winner RETURNING own_village_kills INTO v_kills;
    IF v_kills >= 20 THEN
      became_renegade := make_renegade(p_winner, 'karma: 20 ninjas da própria vila');
    END IF;
  END IF;

  -- 3. espólio de guerra: inimigo de uma vila em guerra com a sua
  IF NOT v_admin AND w.village IS NOT NULL AND l.village IS NOT NULL AND village_relation(w.village, l.village) = 'guerra' THEN
    loot_ryo := 25 + 2 * l.level;
    UPDATE players SET ryo = ryo + loot_ryo WHERE id = p_winner;
  END IF;

  -- 4. recompensa pela cabeça (uma vez por dia por dupla, em cada sentido)
  IF endgame_active('renegados') AND NOT v_admin THEN
    IF w.renegade_at IS NOT NULL AND l.village IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM bounty_events b WHERE b.renegade_id = p_winner AND b.other_id = p_loser AND b.kind = 'aumento' AND b.at > now() - interval '24 hours') THEN
      v_add := 50 + 5 * l.level;
      UPDATE players SET bounty_ryo = bounty_ryo + v_add WHERE id = p_winner;
      INSERT INTO bounty_events (renegade_id, other_id, kind, amount) VALUES (p_winner, p_loser, 'aumento', v_add);
    END IF;
    IF l.renegade_at IS NOT NULL AND w.village IS NOT NULL AND l.bounty_ryo > 0 AND NOT EXISTS (
         SELECT 1 FROM bounty_events b WHERE b.renegade_id = p_loser AND b.other_id = p_winner AND b.kind = 'cobranca' AND b.at > now() - interval '24 hours') THEN
      v_pay := l.bounty_ryo / 2;
      IF v_pay > 0 THEN
        UPDATE players SET bounty_ryo = bounty_ryo - v_pay WHERE id = p_loser;
        UPDATE players SET ryo = ryo + v_pay WHERE id = p_winner;
        INSERT INTO bounty_events (renegade_id, other_id, kind, amount) VALUES (p_loser, p_winner, 'cobranca', v_pay);
        IF v_pay >= 1000 THEN
          INSERT INTO player_items (player_id, item_code, quantity)
          SELECT p_winner, 'scroll_' || c.primary_class, 1 FROM player_classes c WHERE c.player_id = p_winner
          ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
        END IF;
      END IF;
      bounty_paid := v_pay;
    END IF;
  END IF;

  -- 5. Akatsuki caça Kages (e ninjas de nível 50+)
  IF endgame_active('akatsuki') AND NOT v_admin AND akatsuki_slot_of(p_winner) IS NOT NULL THEN
    v_kage := kage_village_of(p_loser);
    IF v_kage IS NOT NULL THEN
      kage_hunted := v_kage;
      UPDATE players SET ryo = ryo + 3000 WHERE id = p_winner;
      INSERT INTO titles (code, name, description) VALUES ('KAGE_HUNTER', 'Caçador de Kages', 'Membro da Akatsuki que derrotou um Kage')
      ON CONFLICT (code) DO NOTHING;
      INSERT INTO player_titles (player_id, title_id) SELECT p_winner, t.id FROM titles t WHERE t.code = 'KAGE_HUNTER'
      ON CONFLICT (player_id, title_id) DO NOTHING;
    ELSIF l.level >= 50 THEN
      UPDATE players SET ryo = ryo + 200 WHERE id = p_winner;
    END IF;
  END IF;

  SELECT r.mmr INTO winner_mmr FROM pvp_ratings r WHERE r.player_id = p_winner;
  SELECT r.mmr INTO loser_mmr FROM pvp_ratings r WHERE r.player_id = p_loser;
  SELECT p.bounty_ryo, p.ryo INTO winner_bounty, ryo_winner FROM players p WHERE p.id = p_winner;
  SELECT p.bounty_ryo INTO loser_bounty FROM players p WHERE p.id = p_loser;
  RETURN NEXT;
END $$;

-- Fecha a temporada que venceu (ou à força: p_force) e abre a próxima. Recompensas: só quem fez 10+ lutas, sem admin.
CREATE OR REPLACE FUNCTION game.close_pvp_season(p_now timestamptz, p_force boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s       pvp_seasons%ROWTYPE;
  r       record;
  v_title uuid;
  v_ryo   integer;
  v_code  text;
  v_name  text;
BEGIN
  SELECT * INTO s FROM pvp_seasons WHERE closed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR (s.ends_at > p_now AND NOT p_force) THEN RETURN NULL; END IF;
  FOR r IN
    SELECT sr.player_id, row_number() OVER (ORDER BY sr.mmr DESC, sr.wins DESC, sr.player_id) AS pos
      FROM pvp_season_ratings sr JOIN players p ON p.id = sr.player_id
     WHERE sr.season_id = s.id AND sr.wins + sr.losses >= 10 AND NOT p.is_admin
     ORDER BY pos
     LIMIT 50
  LOOP
    IF r.pos = 1 THEN v_code := 'SEASON_' || s.id || '_CHAMPION'; v_name := 'Campeão da Temporada ' || s.id; v_ryo := 5000;
    ELSIF r.pos <= 10 THEN v_code := 'SEASON_' || s.id || '_ELITE'; v_name := 'Elite da Temporada ' || s.id; v_ryo := 2000;
    ELSE v_code := 'SEASON_' || s.id || '_VETERAN'; v_name := 'Veterano da Temporada ' || s.id; v_ryo := 500;
    END IF;
    INSERT INTO titles (code, name, description) VALUES (v_code, v_name, 'Recompensa do ranking PvP da temporada ' || s.id)
    ON CONFLICT (code) DO NOTHING;
    SELECT id INTO v_title FROM titles WHERE code = v_code;
    INSERT INTO player_titles (player_id, title_id) VALUES (r.player_id, v_title) ON CONFLICT (player_id, title_id) DO NOTHING;
    UPDATE players SET ryo = ryo + v_ryo WHERE id = r.player_id;
    IF r.pos <= 10 THEN
      INSERT INTO player_items (player_id, item_code, quantity) VALUES (r.player_id, 'manto_campeao', 1)
      ON CONFLICT (player_id, item_code) DO NOTHING;
    END IF;
    INSERT INTO pvp_season_rewards (season_id, player_id, position, title_id, ryo) VALUES (s.id, r.player_id, r.pos, v_title, v_ryo)
    ON CONFLICT (season_id, player_id) DO NOTHING;
  END LOOP;
  UPDATE pvp_seasons SET closed_at = p_now WHERE id = s.id;
  INSERT INTO pvp_seasons (id, starts_at, ends_at) VALUES (s.id + 1, p_now, p_now + interval '60 days');
  RETURN s.id;
END $$;

-- ---------------------------------------------------------------- 8. capas e o que mostrar no boneco

ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape'));
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('capa_viagem',    'Capa de Viagem',    'cape', NULL, NULL, 400,  'clothes'),
  ('capa_vila',      'Capa da Vila',      'cape', NULL, NULL, 900,  'clothes'),
  ('manto_kage',     'Manto do Kage',     'cape', NULL, NULL, NULL, NULL),
  ('manto_akatsuki', 'Manto da Akatsuki', 'cape', NULL, NULL, NULL, NULL),
  ('manto_campeao',  'Manto do Campeão',  'cape', NULL, NULL, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_cape text REFERENCES game.items (code);
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS display jsonb NOT NULL DEFAULT '{"cape": true, "weapon": true, "scroll": true}'::jsonb;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_display;
ALTER TABLE game.players ADD CONSTRAINT ck_players_display CHECK (
  jsonb_typeof(display -> 'cape') = 'boolean' AND jsonb_typeof(display -> 'weapon') = 'boolean' AND jsonb_typeof(display -> 'scroll') = 'boolean');

-- Pode usar a capa? As do inventário, o Manto do Kage (enquanto for Kage) e o da Akatsuki (membros).
CREATE OR REPLACE FUNCTION game.cape_allowed(p_player uuid, p_cape text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT CASE p_cape
    WHEN 'manto_kage' THEN kage_village_of(p_player) IS NOT NULL
    WHEN 'manto_akatsuki' THEN akatsuki_slot_of(p_player) IS NOT NULL
    ELSE EXISTS (SELECT 1 FROM player_items i JOIN items it ON it.code = i.item_code
                  WHERE i.player_id = p_player AND i.item_code = p_cape AND it.kind = 'cape' AND i.quantity > 0)
  END
$$;

CREATE OR REPLACE FUNCTION game.equip_cape(p_player uuid, p_cape text) RETURNS text
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF p_cape IS NOT NULL AND NOT cape_allowed(p_player, p_cape) THEN
    RAISE EXCEPTION 'Capa que você não tem' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_cape_owned';
  END IF;
  UPDATE players SET equipped_cape = p_cape WHERE id = p_player;
  RETURN p_cape;
END $$;

-- ---------------------------------------------------------------- 9. manutenção (o servidor chama a cada minuto)

-- Eleições, mandatos, propostas e convites vencidos, temporadas e capas que perderam o direito.
-- Devolve o que mudou, para o servidor anunciar.
CREATE OR REPLACE FUNCTION game.endgame_tick(p_now timestamptz DEFAULT now())
RETURNS TABLE (kind text, village text, player_id uuid, info jsonb)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  e        record;
  v_winner uuid;
  v_season integer;
BEGIN
  IF endgame_active('vilas') THEN
    FOR e IN DELETE FROM village_kages k WHERE k.term_ends_at <= p_now RETURNING k.village, k.player_id LOOP
      kind := 'kage_fim'; village := e.village; player_id := e.player_id; info := NULL; RETURN NEXT;
    END LOOP;
    FOR e IN SELECT k.id, k.village FROM kage_elections k WHERE k.closed_at IS NULL AND k.closes_at <= p_now LOOP
      v_winner := close_kage_election(e.id, p_now);
      kind := 'eleicao_fechada'; village := e.village; player_id := v_winner; info := NULL; RETURN NEXT;
    END LOOP;
    FOR e IN
      INSERT INTO kage_elections (village, opens_at, closes_at)
      SELECT v.code, p_now, p_now + interval '7 days' FROM villages v
       WHERE NOT EXISTS (SELECT 1 FROM kage_elections k WHERE k.village = v.code AND k.closed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM village_kages k WHERE k.village = v.code AND k.term_ends_at > p_now + interval '7 days')
      RETURNING kage_elections.village
    LOOP
      kind := 'eleicao_aberta'; village := e.village; player_id := NULL; info := NULL; RETURN NEXT;
    END LOOP;
    UPDATE diplomacy_proposals SET answered_at = p_now, accepted = false WHERE answered_at IS NULL AND expires_at <= p_now;
  END IF;
  DELETE FROM akatsuki_invites WHERE expires_at <= p_now;
  IF endgame_active('pvp') THEN
    IF NOT EXISTS (SELECT 1 FROM pvp_seasons) THEN
      INSERT INTO pvp_seasons (id, starts_at, ends_at) VALUES (1, p_now, p_now + interval '60 days');
      kind := 'temporada_aberta'; village := NULL; player_id := NULL; info := jsonb_build_object('season', 1); RETURN NEXT;
    END IF;
    v_season := close_pvp_season(p_now, false);
    IF v_season IS NOT NULL THEN
      kind := 'temporada_fechada'; village := NULL; player_id := NULL; info := jsonb_build_object('season', v_season); RETURN NEXT;
    END IF;
  END IF;
  UPDATE players SET equipped_cape = NULL
   WHERE (equipped_cape = 'manto_kage' AND kage_village_of(id) IS NULL)
      OR (equipped_cape = 'manto_akatsuki' AND akatsuki_slot_of(id) IS NULL);
END $$;

-- ---------------------------------------------------------------- 10. comandos do administrador

-- /admin endgame <módulo> <on|off|auto>. Ligar liga também os que ele precisa; desligar desliga os que dependem dele.
CREATE OR REPLACE FUNCTION game.admin_endgame_mode(p_admin uuid, p_code text, p_mode text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_order text[] := ARRAY['vilas', 'pvp', 'renegados', 'akatsuki'];
  v_pos   integer := array_position(v_order, p_code);
BEGIN
  PERFORM assert_admin(p_admin);
  IF v_pos IS NULL OR p_mode NOT IN ('on', 'off', 'auto') THEN
    RAISE EXCEPTION 'Módulo ou modo inválido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_endgame';
  END IF;
  UPDATE endgame_modules SET mode = p_mode WHERE code = p_code;
  IF p_mode = 'on' THEN
    UPDATE endgame_modules SET mode = 'on' WHERE code = ANY (v_order[1:v_pos - 1]) AND NOT endgame_active(code);
  ELSIF p_mode = 'off' THEN
    UPDATE endgame_modules SET mode = 'off' WHERE code = ANY (v_order[v_pos + 1:4]);
  END IF;
  PERFORM admin_log(p_admin, 'endgame', NULL, jsonb_build_object('module', p_code, 'mode', p_mode), true, NULL);
END $$;

-- /admin vila <nome> <vila>
CREATE OR REPLACE FUNCTION game.admin_set_village(p_admin uuid, p_target uuid, p_village text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  IF NOT EXISTS (SELECT 1 FROM villages WHERE code = p_village) THEN
    RAISE EXCEPTION 'Vila inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_village_unknown';
  END IF;
  UPDATE players SET village = p_village WHERE id = p_target AND renegade_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Renegado: use /admin renegado <nome> off' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_renegade_no_village';
  END IF;
  DELETE FROM village_kages WHERE player_id = p_target AND village <> p_village;
  PERFORM admin_log(p_admin, 'vila', p_target, jsonb_build_object('village', p_village), true, NULL);
END $$;

-- /admin kage <vila> <nome>: põe no cargo por 28 dias (precisa ser da vila).
CREATE OR REPLACE FUNCTION game.admin_set_kage(p_admin uuid, p_village text, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_target AND village = p_village) THEN
    RAISE EXCEPTION 'Precisa ser da vila' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_kage_village';
  END IF;
  DELETE FROM village_kages WHERE player_id = p_target;
  INSERT INTO village_kages (village, player_id, since, term_ends_at) VALUES (p_village, p_target, now(), now() + interval '28 days')
  ON CONFLICT (village) DO UPDATE SET player_id = EXCLUDED.player_id, since = EXCLUDED.since, term_ends_at = EXCLUDED.term_ends_at;
  PERFORM admin_log(p_admin, 'kage', p_target, jsonb_build_object('village', p_village), true, NULL);
END $$;

-- /admin eleicao <vila>: fecha a eleição aberta agora.
CREATE OR REPLACE FUNCTION game.admin_close_election(p_admin uuid, p_village text) RETURNS uuid
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_id     bigint;
  v_winner uuid;
BEGIN
  PERFORM assert_admin(p_admin);
  SELECT id INTO v_id FROM kage_elections WHERE village = p_village AND closed_at IS NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sem eleição aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_vote_no_election';
  END IF;
  v_winner := close_kage_election(v_id, now());
  PERFORM admin_log(p_admin, 'eleicao', v_winner, jsonb_build_object('village', p_village), true, NULL);
  RETURN v_winner;
END $$;

-- /admin evento <guerra|tregua> <vila|todas> [vila] <horas>
CREATE OR REPLACE FUNCTION game.admin_world_event(p_admin uuid, p_kind text, p_a text, p_b text, p_hours integer) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_hours NOT BETWEEN 1 AND 720 OR (p_a IS NOT NULL AND p_a = p_b) THEN
    RAISE EXCEPTION 'Evento inválido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_event';
  END IF;
  INSERT INTO world_events (kind, village_a, village_b, ends_at, note, created_by)
  VALUES (p_kind, least(p_a, p_b), greatest(p_a, p_b), now() + make_interval(hours => p_hours), 'admin', p_admin) RETURNING id INTO v_id;
  PERFORM admin_log(p_admin, 'evento', NULL, jsonb_build_object('kind', p_kind, 'a', p_a, 'b', p_b, 'hours', p_hours), true, NULL);
  RETURN v_id;
END $$;

-- /admin renegado <nome> <on|off>. off é a ÚNICA forma de desfazer (volta para a vila de antes, sem karma nem recompensa).
CREATE OR REPLACE FUNCTION game.admin_renegade(p_admin uuid, p_target uuid, p_on boolean) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_on THEN
    IF NOT make_renegade(p_target, 'admin') THEN
      RAISE EXCEPTION 'Já é renegado' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_renegade';
    END IF;
  ELSE
    PERFORM set_config('game.admin_action', 'on', true);
    UPDATE players SET village = COALESCE(renegade_from, 'vila_1'), renegade_at = NULL, renegade_from = NULL, renegade_reason = NULL,
           own_village_kills = 0, bounty_ryo = 0
     WHERE id = p_target AND renegade_at IS NOT NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM set_config('game.admin_action', 'off', true);
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Não é renegado' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_renegade';
    END IF;
    DELETE FROM akatsuki_members WHERE player_id = p_target;
  END IF;
  PERFORM admin_log(p_admin, 'renegado', p_target, jsonb_build_object('on', p_on), true, NULL);
END $$;

-- /admin akatsuki lider <nome>: vira o líder (vaga 1; quem estava lá sai). Não sendo renegado, passa a ser.
CREATE OR REPLACE FUNCTION game.admin_akatsuki_leader(p_admin uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  IF EXISTS (SELECT 1 FROM players WHERE id = p_target AND is_admin) THEN
    RAISE EXCEPTION 'Admin não entra na Akatsuki' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_target';
  END IF;
  DELETE FROM akatsuki_members WHERE slot = 1 OR player_id = p_target;
  DELETE FROM akatsuki_invites WHERE player_id = p_target;
  PERFORM make_renegade(p_target, 'akatsuki');
  INSERT INTO akatsuki_members (slot, player_id, invited_by) VALUES (1, p_target, NULL);
  PERFORM admin_log(p_admin, 'akatsuki', p_target, jsonb_build_object('action', 'lider'), true, NULL);
END $$;

CREATE OR REPLACE FUNCTION game.admin_akatsuki_remove(p_admin uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  DELETE FROM akatsuki_members WHERE player_id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não é membro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_akatsuki_target';
  END IF;
  PERFORM admin_log(p_admin, 'akatsuki', p_target, jsonb_build_object('action', 'remover'), true, NULL);
END $$;

-- /admin temporada fechar: fecha agora (as contas de admin nunca recebem recompensa).
CREATE OR REPLACE FUNCTION game.admin_close_season(p_admin uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_season integer;
BEGIN
  PERFORM assert_admin(p_admin);
  v_season := close_pvp_season(now(), true);
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'Sem temporada aberta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_season';
  END IF;
  PERFORM admin_log(p_admin, 'temporada', NULL, jsonb_build_object('season', v_season), true, NULL);
  RETURN v_season;
END $$;

-- ---------------------------------------------------------------- 11. o líder da vila se chama Kage

UPDATE game.ranks SET name = 'Kage' WHERE code = 'HOKAGE' AND name = 'Hokage';

COMMIT;

-- Conferência (opcional): deve dar 5 (as vilas) e 4 (os módulos, todos em auto).
-- SELECT (SELECT count(*) FROM game.villages), (SELECT count(*) FROM game.endgame_modules WHERE mode = 'auto');
