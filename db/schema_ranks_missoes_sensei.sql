-- =====================================================================
--  SISTEMA DE RANKS + CICLO DE MISSÕES DE SENSEI
--  PostgreSQL 14+ (testado no 16) · jogo server-authoritative
-- =====================================================================
--
--  FLUXO COBERTO
--    1. Sensei (Chunin+) cria a missão para um aprendiz ...... sensei_missions
--    2. Aprendiz cumpre o objetivo e volta ao sensei ......... status 'submitted'
--    3. Sensei avalia (aprova ou reprova) .................... mission_evaluations
--    4. Aprovou: o Pergaminho de Conclusão é emitido ......... completion_scrolls
--    5. Aprendiz entrega o pergaminho na Sala de Missões ..... scroll_redemptions
--       -> XP em players.total_xp + título em player_titles
--
--  ESTADOS DA MISSÃO (sensei_missions.status)
--    active --entrega--> submitted --aprovada--> approved --resgate--> completed
--      ^                     |
--      +----reprovada--------+   (progresso volta a zero e o aprendiz refaz)
--    active | submitted --> cancelled          active --prazo vencido--> expired
--
--  RELACIONAMENTOS
--    ranks                1 : N  players               (rank atual)
--    players              1 : N  player_rank_changes   (histórico de ranks)
--    players              1 : N  sensei_missions       (2x: como sensei e como aprendiz)
--    mission_types        1 : N  sensei_missions
--    mission_difficulties 1 : N  sensei_missions
--    titles               1 : N  mission_difficulties  (título que a dificuldade concede)
--    sensei_missions      1 : N  mission_evaluations   (1 por entrega, no máx. 1 aprovada)
--    players              1 : N  mission_evaluations   (evaluated_by: sensei ou substituto Chunin+)
--    mission_evaluations  1 : 0..1 completion_scrolls  (só a aprovada gera pergaminho)
--    completion_scrolls   1 : 0..1 scroll_redemptions  (resgate único)
--    players              N : N  titles  via player_titles
--
--  ERROS
--    Toda regra violada sai com SQLSTATE 23514 (check_violation) ou 23505
--    (unique_violation) e o nome da regra no campo "constraint" do erro.
--    O servidor traduz esse nome para a mensagem que aparece no jogo.
-- =====================================================================

BEGIN;

-- Schema próprio, fora do "public": ferramentas como Supabase/PostgREST
-- expõem o "public" como API. Aqui só o servidor do jogo escreve.
-- Todo nome vem qualificado com "game.", então o script funciona igual em psql,
-- no SQL Editor do Neon ou em qualquer ferramenta que rode um comando por vez
-- (não depende de search_path). Os corpos plpgsql usam SET search_path = game.
CREATE SCHEMA IF NOT EXISTS game;

-- ---------------------------------------------------------------------
-- Chave primária: UUIDv7 (ordenado por tempo).
-- O UUIDv4 é aleatório e espalha cada INSERT pelo índice inteiro; o v7
-- começa pelo timestamp, então os INSERTs entram no fim do índice.
-- No PostgreSQL 18+ dá para trocar por uuidv7(), que é nativo.
-- ---------------------------------------------------------------------
CREATE FUNCTION game.gen_uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE
RETURN encode(
  set_bit(set_bit(
    overlay(uuid_send(gen_random_uuid())
            PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
            FROM 1 FOR 6),
    52, 1), 53, 1),
  'hex')::uuid;


-- =====================================================================
-- 1. CATÁLOGOS: conteúdo de game design. Evoluem com INSERT, não ALTER.
-- =====================================================================

CREATE TABLE game.ranks (
  id            uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  code          text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),  -- chave usada no código do servidor
  name          text        NOT NULL UNIQUE,                                     -- nome exibido no jogo
  tier          smallint    NOT NULL UNIQUE CHECK (tier > 0),                    -- ordem; saltos de 10 deixam espaço para ranks novos
  can_be_sensei boolean     NOT NULL DEFAULT false,                              -- permissão de criar missões de sensei
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.ranks IS 'Hierarquia de ranks. A ordem vem de tier; a permissão de sensei vem de can_be_sensei.';

CREATE TABLE game.titles (
  id          uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  code        text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name        text        NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.titles IS 'Títulos que podem ser conquistados.';

CREATE TABLE game.mission_types (
  id          uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  code        text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name        text        NOT NULL UNIQUE,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,       -- desativa sem apagar o histórico
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.mission_types IS 'Tipos de objetivo (derrotar chefe, coletar recurso...). Tipo novo = INSERT.';

CREATE TABLE game.mission_difficulties (
  id         uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  code       text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name       text        NOT NULL UNIQUE,
  tier       smallint    NOT NULL UNIQUE CHECK (tier > 0),
  xp_reward  integer     NOT NULL CHECK (xp_reward >= 0),
  title_id   uuid        REFERENCES game.titles (id),        -- título que esta dificuldade concede (opcional)
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.mission_difficulties IS 'Dificuldade escolhida pelo sensei. Define o XP e o título da recompensa.';


-- =====================================================================
-- 2. JOGADOR E RANK
-- =====================================================================

-- Jogador novo entra no rank de menor tier (Academia) sem o servidor precisar informar.
CREATE FUNCTION game.initial_rank_id() RETURNS uuid
LANGUAGE sql STABLE
RETURN (SELECT id FROM game.ranks ORDER BY tier LIMIT 1);

CREATE TABLE game.players (
  id              uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  username        text        NOT NULL,
  current_rank_id uuid        NOT NULL DEFAULT game.initial_rank_id() REFERENCES game.ranks (id),
  total_xp        bigint      NOT NULL DEFAULT 0,       -- desnormalização intencional (ver Decisões)
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_players_username CHECK (char_length(username) BETWEEN 3 AND 24 AND username = btrim(username)),
  CONSTRAINT ck_players_total_xp CHECK (total_xp >= 0)
);
COMMENT ON TABLE game.players IS 'Personagem. O rank ativo é uma coluna só, então é impossível ter dois ranks ao mesmo tempo.';

CREATE TABLE game.player_rank_changes (
  id         uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  player_id  uuid        NOT NULL REFERENCES game.players (id) ON DELETE RESTRICT,  -- histórico se mantém; LGPD = anonimizar username
  rank_id    uuid        NOT NULL REFERENCES game.ranks (id),   -- rank assumido nesta mudança
  changed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.player_rank_changes IS 'Histórico de ranks. Só o banco escreve aqui, via trigger, quando players.current_rank_id muda.';


-- =====================================================================
-- 3. CICLO DA MISSÃO DE SENSEI
-- =====================================================================

CREATE TABLE game.sensei_missions (
  id                uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  sensei_id         uuid        NOT NULL REFERENCES game.players (id) ON DELETE RESTRICT,
  trainee_id        uuid        NOT NULL REFERENCES game.players (id) ON DELETE RESTRICT,
  mission_type_id   uuid        NOT NULL REFERENCES game.mission_types (id),
  difficulty_id     uuid        NOT NULL REFERENCES game.mission_difficulties (id),
  target_code       text        NOT NULL,                  -- chave do conteúdo no jogo: 'boss_x', 'recurso_y'
  target_quantity   integer     NOT NULL DEFAULT 1,
  progress_quantity integer     NOT NULL DEFAULT 0,        -- o servidor atualiza conforme o aprendiz joga
  xp_reward         integer     NOT NULL,                  -- copiado da dificuldade na criação
  reward_title_id   uuid        REFERENCES game.titles (id),    -- copiado da dificuldade na criação
  status            text        NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,                           -- prazo para voltar ao sensei (opcional)
  submitted_at      timestamptz,                           -- última entrega ao sensei
  closed_at         timestamptz,                           -- quando chegou a um estado final
  CONSTRAINT ck_sensei_missions_not_self  CHECK (sensei_id <> trainee_id),
  CONSTRAINT ck_sensei_missions_target    CHECK (target_code <> '' AND target_quantity > 0),
  CONSTRAINT ck_sensei_missions_progress  CHECK (progress_quantity BETWEEN 0 AND target_quantity),
  CONSTRAINT ck_sensei_missions_xp        CHECK (xp_reward >= 0),
  CONSTRAINT ck_sensei_missions_status    CHECK (status IN ('active', 'submitted', 'approved', 'completed', 'cancelled', 'expired')),
  CONSTRAINT ck_sensei_missions_deadline  CHECK (expires_at > created_at),
  CONSTRAINT ck_sensei_missions_submitted CHECK (status <> 'submitted' OR submitted_at IS NOT NULL),
  CONSTRAINT ck_sensei_missions_closed    CHECK ((closed_at IS NOT NULL) = (status IN ('completed', 'cancelled', 'expired')))
) WITH (fillfactor = 90);  -- folga na página: atualizar o progresso vira HOT update e não reescreve índices
COMMENT ON TABLE game.sensei_missions IS 'Missão de treinamento de um sensei para um aprendiz. Os termos (alvo, dificuldade, recompensa) não mudam depois de criada.';

CREATE TABLE game.mission_evaluations (
  id           uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  mission_id   uuid        NOT NULL REFERENCES game.sensei_missions (id),
  evaluated_by uuid        NOT NULL REFERENCES game.players (id) ON DELETE RESTRICT,  -- quem avaliou (pode não ser o sensei original)
  is_approved  boolean     NOT NULL,
  score        smallint    NOT NULL,                       -- nota do desempenho, de 1 a 5
  feedback     text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),         -- definido pelo banco, o cliente não controla
  CONSTRAINT ck_mission_evaluations_score    CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT ck_mission_evaluations_feedback CHECK (char_length(feedback) <= 500)
);
COMMENT ON TABLE game.mission_evaluations IS 'Avaliação, uma por entrega. Quem avalia é o sensei da missão; se ele perdeu o rank de sensei, outro jogador Chunin+.';

CREATE TABLE game.completion_scrolls (
  id            uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  evaluation_id uuid        NOT NULL REFERENCES game.mission_evaluations (id),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_completion_scrolls_evaluation UNIQUE (evaluation_id)
);
COMMENT ON TABLE game.completion_scrolls IS 'Pergaminho de Conclusão. O banco emite sozinho quando a avaliação é aprovada.';

CREATE TABLE game.scroll_redemptions (
  id          uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  scroll_id   uuid        NOT NULL REFERENCES game.completion_scrolls (id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_scroll_redemptions_scroll UNIQUE (scroll_id)
);
COMMENT ON TABLE game.scroll_redemptions IS 'Registro de conclusão na Sala de Missões. A recompensa vai sempre para o aprendiz da missão.';

CREATE TABLE game.player_titles (
  id            uuid        PRIMARY KEY DEFAULT game.gen_uuid_v7(),
  player_id     uuid        NOT NULL REFERENCES game.players (id) ON DELETE RESTRICT,
  title_id      uuid        NOT NULL REFERENCES game.titles (id),
  redemption_id uuid        REFERENCES game.scroll_redemptions (id),   -- origem; NULL = outra fonte (evento, admin)
  granted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_player_titles_player_title UNIQUE (player_id, title_id),
  CONSTRAINT ux_player_titles_redemption   UNIQUE (redemption_id)
);
COMMENT ON TABLE game.player_titles IS 'Títulos conquistados (N:N jogador x título). Cada título uma vez por jogador.';


-- =====================================================================
-- 4. REGRAS DE NEGÓCIO (triggers)
-- =====================================================================

-- 4.1 Histórico de rank: escrito pelo banco, nunca diverge do rank atual.
CREATE FUNCTION game.log_rank_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  INSERT INTO player_rank_changes (player_id, rank_id) VALUES (NEW.id, NEW.current_rank_id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_players_rank_log_insert
  AFTER INSERT ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.log_rank_change();

CREATE TRIGGER trg_players_rank_log_update
  AFTER UPDATE OF current_rank_id ON game.players
  FOR EACH ROW WHEN (OLD.current_rank_id IS DISTINCT FROM NEW.current_rank_id)
  EXECUTE FUNCTION game.log_rank_change();


-- 4.2 Criação da missão: sensei com rank habilitado no momento da criação,
--     aprendiz abaixo dele, catálogo ativo, recompensa vinda do catálogo
--     e estado inicial definido pelo banco.
CREATE FUNCTION game.sensei_missions_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_sensei  ranks%ROWTYPE;
  v_trainee ranks%ROWTYPE;
  v_diff    mission_difficulties%ROWTYPE;
BEGIN
  IF NEW.sensei_id = NEW.trainee_id THEN
    RAISE EXCEPTION 'O sensei não pode criar missão para si mesmo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_sensei_missions_not_self';
  END IF;

  -- Trava os dois jogadores até o fim da transação. Uma promoção ou um
  -- rebaixamento simultâneo espera, então o rank lido é o "do momento".
  PERFORM 1 FROM players WHERE id IN (NEW.sensei_id, NEW.trainee_id) ORDER BY id FOR SHARE;

  SELECT r.* INTO v_sensei  FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = NEW.sensei_id;
  SELECT r.* INTO v_trainee FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = NEW.trainee_id;
  IF v_sensei.id IS NULL OR v_trainee.id IS NULL THEN
    RAISE EXCEPTION 'Sensei ou aprendiz inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT v_sensei.can_be_sensei THEN
    RAISE EXCEPTION 'O rank % não pode criar missões de sensei', v_sensei.name
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_sensei_rank';
  END IF;

  IF v_trainee.tier >= v_sensei.tier THEN
    RAISE EXCEPTION 'O aprendiz (%) precisa ter rank abaixo do sensei (%)', v_trainee.name, v_sensei.name
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_trainee_rank';
  END IF;

  PERFORM 1 FROM mission_types WHERE id = NEW.mission_type_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de missão inexistente ou desativado'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_catalog_active';
  END IF;

  SELECT * INTO v_diff FROM mission_difficulties WHERE id = NEW.difficulty_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dificuldade inexistente ou desativada'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_catalog_active';
  END IF;

  -- A recompensa vem do catálogo, nunca do cliente, e fica congelada na missão.
  NEW.xp_reward       := v_diff.xp_reward;
  NEW.reward_title_id := v_diff.title_id;

  -- Toda missão nasce em andamento.
  NEW.status            := 'active';
  NEW.progress_quantity := 0;
  NEW.created_at        := now();
  NEW.submitted_at      := NULL;
  NEW.closed_at         := NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sensei_missions_before_insert
  BEFORE INSERT ON game.sensei_missions
  FOR EACH ROW EXECUTE FUNCTION game.sensei_missions_before_insert();


-- 4.3 Máquina de estados + termos imutáveis.
CREATE FUNCTION game.sensei_missions_before_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF (NEW.sensei_id, NEW.trainee_id, NEW.mission_type_id, NEW.difficulty_id, NEW.target_code,
      NEW.target_quantity, NEW.xp_reward, NEW.reward_title_id, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM
     (OLD.sensei_id, OLD.trainee_id, OLD.mission_type_id, OLD.difficulty_id, OLD.target_code,
      OLD.target_quantity, OLD.xp_reward, OLD.reward_title_id, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'Os termos da missão não mudam depois de criada'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_terms_immutable';
  END IF;

  -- Progresso só anda com a missão em andamento (ou zera quando ela volta para lá).
  IF NEW.progress_quantity <> OLD.progress_quantity AND 'active' NOT IN (OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'O progresso só muda com a missão em andamento'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_progress';
  END IF;

  -- Datas de controle são do banco.
  NEW.submitted_at := OLD.submitted_at;
  NEW.closed_at    := OLD.closed_at;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) NOT IN (
       ('active',    'submitted'), ('active',    'cancelled'), ('active',    'expired'),
       ('submitted', 'active'),    ('submitted', 'approved'),  ('submitted', 'cancelled'),
       ('approved',  'completed')) THEN
    RAISE EXCEPTION 'Transição de estado inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_transition';
  END IF;

  CASE NEW.status
    WHEN 'submitted' THEN
      IF NEW.progress_quantity < NEW.target_quantity THEN
        RAISE EXCEPTION 'Objetivo incompleto: % de %', NEW.progress_quantity, NEW.target_quantity
          USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_incomplete';
      END IF;
      IF NEW.expires_at < now() THEN
        RAISE EXCEPTION 'O prazo da missão venceu'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_deadline';
      END IF;
      NEW.submitted_at := now();

    WHEN 'approved' THEN    -- só por uma avaliação aprovada
      PERFORM 1 FROM mission_evaluations WHERE mission_id = NEW.id AND is_approved;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A missão só é aprovada por uma avaliação aprovada'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_transition';
      END IF;

    WHEN 'completed' THEN   -- só pelo resgate do pergaminho
      PERFORM 1
        FROM mission_evaluations e
        JOIN completion_scrolls  s ON s.evaluation_id = e.id
        JOIN scroll_redemptions  r ON r.scroll_id = s.id
       WHERE e.mission_id = NEW.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A missão só é concluída com o pergaminho entregue na Sala de Missões'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_transition';
      END IF;

    WHEN 'expired' THEN
      IF NEW.expires_at IS NULL OR NEW.expires_at > now() THEN
        RAISE EXCEPTION 'A missão ainda está no prazo'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_mission_deadline';
      END IF;

    ELSE NULL;              -- 'active' (devolvida) e 'cancelled'
  END CASE;

  IF NEW.status IN ('completed', 'cancelled', 'expired') THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sensei_missions_before_update
  BEFORE UPDATE ON game.sensei_missions
  FOR EACH ROW EXECUTE FUNCTION game.sensei_missions_before_update();


-- 4.4 Quem pode avaliar. Tudo sob trava, sem janela entre ler o rank e gravar:
--     - sensei original ainda com rank de sensei -> só ele avalia;
--     - sensei original rebaixado -> outro jogador com rank de sensei avalia;
--     - o aprendiz nunca avalia a própria missão.
--     Ordem das travas: missão (FOR UPDATE), depois jogadores por id (FOR SHARE).
CREATE FUNCTION game.mission_evaluations_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_mission   sensei_missions%ROWTYPE;
  v_sensei    ranks%ROWTYPE;
  v_evaluator ranks%ROWTYPE;
BEGIN
  IF NEW.evaluated_by IS NULL THEN
    RETURN NEW;                       -- o NOT NULL da coluna barra logo em seguida
  END IF;

  SELECT * INTO v_mission FROM sensei_missions WHERE id = NEW.mission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Promoção ou rebaixamento simultâneo do sensei ou do avaliador espera esta transação
  -- (e esta espera a deles): o rank lido abaixo é o rank do momento da avaliação.
  PERFORM 1 FROM players WHERE id IN (v_mission.sensei_id, NEW.evaluated_by) ORDER BY id FOR SHARE;

  IF v_mission.status <> 'submitted' THEN
    RAISE EXCEPTION 'Só dá para avaliar missão entregue ao sensei (status atual: %)', v_mission.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_evaluation_requires_submission';
  END IF;

  IF NEW.evaluated_by = v_mission.trainee_id THEN
    RAISE EXCEPTION 'O aprendiz não avalia a própria missão'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_evaluator_not_trainee';
  END IF;

  SELECT r.* INTO v_sensei    FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = v_mission.sensei_id;
  SELECT r.* INTO v_evaluator FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = NEW.evaluated_by;
  IF v_evaluator.id IS NULL THEN
    RAISE EXCEPTION 'Avaliador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_sensei.can_be_sensei AND NEW.evaluated_by <> v_mission.sensei_id THEN
    RAISE EXCEPTION 'O sensei da missão ainda tem rank de sensei: só ele pode avaliar'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_only_sensei_evaluates';
  END IF;

  IF NOT v_evaluator.can_be_sensei THEN
    RAISE EXCEPTION 'O rank % não pode avaliar missões de sensei', v_evaluator.name
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_evaluator_rank';
  END IF;

  NEW.evaluated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_mission_evaluations_before_insert
  BEFORE INSERT ON game.mission_evaluations
  FOR EACH ROW EXECUTE FUNCTION game.mission_evaluations_before_insert();


-- 4.5 Efeito da avaliação: aprovação emite o pergaminho; reprovação devolve
--     a missão com o progresso zerado. A checagem de status repete a do 4.4
--     de propósito (defesa em profundidade, caso o trigger 4.4 seja desligado).
CREATE FUNCTION game.mission_evaluations_after_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM sensei_missions WHERE id = NEW.mission_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'Só dá para avaliar missão entregue ao sensei (status atual: %)', v_status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_evaluation_requires_submission';
  END IF;

  IF NEW.is_approved THEN
    UPDATE sensei_missions SET status = 'approved' WHERE id = NEW.mission_id;
    INSERT INTO completion_scrolls (evaluation_id) VALUES (NEW.id);
  ELSE
    UPDATE sensei_missions SET status = 'active', progress_quantity = 0 WHERE id = NEW.mission_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_mission_evaluations_after_insert
  AFTER INSERT ON game.mission_evaluations
  FOR EACH ROW EXECUTE FUNCTION game.mission_evaluations_after_insert();


-- 4.6 Pergaminho só existe para avaliação aprovada (barra INSERT manual errado).
CREATE FUNCTION game.completion_scrolls_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM 1 FROM mission_evaluations WHERE id = NEW.evaluation_id AND is_approved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pergaminho só é emitido para avaliação aprovada'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_scroll_requires_approval';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_completion_scrolls_before_insert
  BEFORE INSERT ON game.completion_scrolls
  FOR EACH ROW EXECUTE FUNCTION game.completion_scrolls_before_insert();


-- 4.7 Resgate na Sala de Missões: credita XP e título ao aprendiz e conclui a missão.
CREATE FUNCTION game.scroll_redemptions_after_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  m sensei_missions%ROWTYPE;
BEGIN
  SELECT sm.* INTO m
    FROM completion_scrolls  s
    JOIN mission_evaluations e  ON e.id  = s.evaluation_id
    JOIN sensei_missions     sm ON sm.id = e.mission_id
   WHERE s.id = NEW.scroll_id
     FOR UPDATE OF sm;

  IF m.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Este pergaminho não pode ser resgatado (missão: %)', m.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_redemption_requires_approval';
  END IF;

  UPDATE players SET total_xp = total_xp + m.xp_reward WHERE id = m.trainee_id;

  IF m.reward_title_id IS NOT NULL THEN
    INSERT INTO player_titles (player_id, title_id, redemption_id)
    VALUES (m.trainee_id, m.reward_title_id, NEW.id)
    ON CONFLICT (player_id, title_id) DO NOTHING;      -- já tinha o título: fica só o XP
  END IF;

  UPDATE sensei_missions SET status = 'completed' WHERE id = m.id;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_scroll_redemptions_after_insert
  AFTER INSERT ON game.scroll_redemptions
  FOR EACH ROW EXECUTE FUNCTION game.scroll_redemptions_after_insert();


-- 4.8 O que aconteceu não se reescreve: fatos do ciclo são só de inserção.
--     (Missão não se apaga, se cancela. TRUNCATE continua liberado para ambiente de teste.)
CREATE FUNCTION game.forbid_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % são históricos e não podem ser %',
    TG_TABLE_NAME, CASE TG_OP WHEN 'UPDATE' THEN 'alterados' ELSE 'apagados' END
    USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_append_only';
END $$;

CREATE TRIGGER trg_mission_evaluations_append_only BEFORE UPDATE OR DELETE ON game.mission_evaluations
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();
CREATE TRIGGER trg_completion_scrolls_append_only  BEFORE UPDATE OR DELETE ON game.completion_scrolls
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();
CREATE TRIGGER trg_scroll_redemptions_append_only  BEFORE UPDATE OR DELETE ON game.scroll_redemptions
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();
CREATE TRIGGER trg_player_rank_changes_append_only BEFORE UPDATE ON game.player_rank_changes
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();
CREATE TRIGGER trg_sensei_missions_no_delete       BEFORE DELETE ON game.sensei_missions
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();


-- =====================================================================
-- 5. ÍNDICES
--    Toda FK tem um índice que começa por ela. PK e UNIQUE já criam o seu.
-- =====================================================================

-- players
-- Nome único sem diferenciar maiúsculas ("Kaito" = "kaito"); login e busca por nome.
CREATE UNIQUE INDEX ux_players_username ON game.players (lower(username));
-- FK. Também lista "todos os Chunin+" (senseis disponíveis, futura eleição de líder).
CREATE INDEX ix_players_current_rank ON game.players (current_rank_id);

-- player_rank_changes
-- FK. Histórico do jogador em ordem e "qual era o rank dele na data X".
CREATE INDEX ix_player_rank_changes_player ON game.player_rank_changes (player_id, changed_at DESC);
-- FK. Protege DELETE/UPDATE em ranks.
CREATE INDEX ix_player_rank_changes_rank ON game.player_rank_changes (rank_id);

-- mission_difficulties
-- FK. Parcial: a maioria das dificuldades não concede título.
CREATE INDEX ix_mission_difficulties_title ON game.mission_difficulties (title_id) WHERE title_id IS NOT NULL;

-- sensei_missions: consultas quentes
-- FK. "Missões ativas do sensei" e "aprendizes esperando avaliação" (status = 'submitted').
CREATE INDEX ix_sensei_missions_sensei ON game.sensei_missions (sensei_id, status);
-- FK. "Pergaminhos pendentes de entrega" (status = 'approved') e histórico do aprendiz.
CREATE INDEX ix_sensei_missions_trainee ON game.sensei_missions (trainee_id, status);
-- REGRA: no máximo 1 missão em aberto por aprendiz. De quebra, acha a missão atual dele.
CREATE UNIQUE INDEX ux_sensei_missions_trainee_open ON game.sensei_missions (trainee_id) WHERE status IN ('active', 'submitted');
-- Job de expiração. Parcial: só contém missões em andamento, fica minúsculo.
CREATE INDEX ix_sensei_missions_expiring ON game.sensei_missions (expires_at) WHERE status = 'active';

-- sensei_missions: FKs para catálogo
-- Servem a checagem de FK (alterar/apagar item de catálogo) e relatórios de balanceamento.
-- Catálogo quase nunca é apagado: se o custo de escrita pesar, são os primeiros a sair.
CREATE INDEX ix_sensei_missions_type ON game.sensei_missions (mission_type_id);
CREATE INDEX ix_sensei_missions_difficulty ON game.sensei_missions (difficulty_id);
CREATE INDEX ix_sensei_missions_reward_title ON game.sensei_missions (reward_title_id) WHERE reward_title_id IS NOT NULL;

-- mission_evaluations
-- FK. Tentativas de uma missão em ordem.
CREATE INDEX ix_mission_evaluations_mission ON game.mission_evaluations (mission_id, evaluated_at);
-- REGRA: no máximo 1 aprovação por missão (logo, no máximo 1 pergaminho por missão).
CREATE UNIQUE INDEX ux_mission_evaluations_one_approval ON game.mission_evaluations (mission_id) WHERE is_approved;
-- FK. Auditoria: "o que este jogador avaliou", inclusive como substituto.
CREATE INDEX ix_mission_evaluations_evaluated_by ON game.mission_evaluations (evaluated_by, evaluated_at DESC);

-- player_titles
-- FK. "Quem tem o título X". (player_id já está coberto por ux_player_titles_player_title.)
CREATE INDEX ix_player_titles_title ON game.player_titles (title_id);

-- Já cobertas por UNIQUE: completion_scrolls.evaluation_id, scroll_redemptions.scroll_id,
-- player_titles.redemption_id.

-- Consultas que esses índices atendem:
--   Rank atual do jogador:
--     SELECT r.code, r.name, r.can_be_sensei FROM game.players p
--       JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1;
--   Missões ativas do sensei:
--     SELECT * FROM game.sensei_missions WHERE sensei_id = $1 AND status IN ('active', 'submitted');
--   Pergaminhos pendentes de entrega do aprendiz:
--     SELECT s.id AS scroll_id, m.target_code, m.xp_reward, s.issued_at
--       FROM game.sensei_missions m
--       JOIN game.mission_evaluations e ON e.mission_id = m.id AND e.is_approved
--       JOIN game.completion_scrolls  s ON s.evaluation_id = e.id
--      WHERE m.trainee_id = $1 AND m.status = 'approved';


-- =====================================================================
-- 6. DADOS INICIAIS (exemplo: troque pelos nomes do seu jogo)
-- =====================================================================
INSERT INTO game.ranks (code, name, tier, can_be_sensei) VALUES
  ('ACADEMY', 'Academia', 10, false),
  ('GENIN',   'Genin',    20, false),
  ('CHUNIN',  'Chunin',   30, true),
  ('JONIN',   'Jonin',    40, true);

-- Rank novo é só um INSERT: sem ALTER TABLE e sem mudar código.
INSERT INTO game.ranks (code, name, tier, can_be_sensei) VALUES
  ('S_JONIN', 'Specialized Jonin', 50, true);

INSERT INTO game.titles (code, name, description) VALUES
  ('DEDICATED_PUPIL', 'Aprendiz Dedicado', 'Concluiu uma missão de sensei avançada'),
  ('RISING_SHADOW',   'Sombra Ascendente', 'Concluiu uma missão de sensei de nível mestre');

INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('BASIC',    'Básica',        10,  100, NULL),
  ('STANDARD', 'Intermediária', 20,  250, NULL),
  ('ADVANCED', 'Avançada',      30,  500, (SELECT id FROM game.titles WHERE code = 'DEDICATED_PUPIL')),
  ('MASTER',   'Mestre',        40, 1000, (SELECT id FROM game.titles WHERE code = 'RISING_SHADOW'));

INSERT INTO game.mission_types (code, name, description) VALUES
  ('DEFEAT_BOSS',      'Derrotar chefe',   'Derrotar o chefe target_code (target_quantity vezes)'),
  ('COLLECT_RESOURCE', 'Coletar recursos', 'Coletar target_quantity unidades do recurso target_code');

COMMIT;


-- =====================================================================
-- COMO O SERVIDOR RODA O CICLO (cada passo é um comando)
-- =====================================================================
-- 1. Sensei cria a missão:
--    INSERT INTO game.sensei_missions
--      (sensei_id, trainee_id, mission_type_id, difficulty_id, target_code, target_quantity, expires_at)
--    VALUES ($sensei, $aprendiz, $tipo, $dificuldade, 'recurso_y', 20, now() + interval '3 days')
--    RETURNING id, xp_reward, reward_title_id;
--
-- 2. Progresso (o servidor conta abates e coletas):
--    UPDATE game.sensei_missions SET progress_quantity = $n WHERE id = $missao;
--
-- 3. Aprendiz volta ao sensei:
--    UPDATE game.sensei_missions SET status = 'submitted' WHERE id = $missao;
--
-- 4. Sensei avalia (aprovar já emite o pergaminho). Se o sensei perdeu o rank,
--    $avaliador é outro jogador Chunin+; senão, tem que ser o próprio sensei:
--    INSERT INTO game.mission_evaluations (mission_id, evaluated_by, is_approved, score, feedback)
--    VALUES ($missao, $avaliador, true, 5, 'Execução impecável');
--
-- 5. Aprendiz entrega o pergaminho na Sala de Missões (XP e título saem aqui):
--    INSERT INTO game.scroll_redemptions (scroll_id) VALUES ($pergaminho);
--
-- Cancelar:
--    UPDATE game.sensei_missions SET status = 'cancelled' WHERE id = $missao;
--
-- Expirar (job a cada minuto, em lotes; SKIP LOCKED não espera missão que está em uso):
--    UPDATE game.sensei_missions SET status = 'expired'
--     WHERE id IN (SELECT id FROM game.sensei_missions
--                   WHERE status = 'active' AND expires_at < now()
--                   ORDER BY expires_at LIMIT 500
--                   FOR UPDATE SKIP LOCKED);
