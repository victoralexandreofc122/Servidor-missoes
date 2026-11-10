-- =====================================================================================================================
-- Herança do Fogo: banco completo (base até a v28), na ordem. Gerado por scripts/gerar-init.sh.
-- SÓ PARA UM BANCO NOVO E VAZIO. Num banco que já roda, NÃO rode isto: a base (schema_ranks_missoes_sensei) e a v8 dão erro
-- se repetidas ("already exists"); rode só as migrações que faltam (DEPLOY.md). As de v9 em diante podem ser repetidas.
-- Cada arquivo tem o seu BEGIN/COMMIT.
-- =====================================================================================================================


-- ################################################################################################
-- ## schema_ranks_missoes_sensei.sql
-- ################################################################################################
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


-- ################################################################################################
-- ## schema_v3_auth.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v3 (login)
-- Adiciona e-mail e hash de senha em game.players.
--
-- Rode DEPOIS do db/schema_ranks_missoes_sensei.sql (v2), uma vez, no SQL
-- Editor do Neon. Pode rodar de novo sem erro: cada passo confere se já foi feito.
-- Não apaga nem altera nenhum dado existente.
--
-- Decisões:
--  * As duas colunas aceitam NULL. Jogadores criados antes da v3 (ou
--    anonimizados pela LGPD) ficam sem login. A regra ck_players_credentials
--    garante que e-mail e senha andam juntos: os dois preenchidos ou os dois NULL.
--  * O e-mail é gravado já normalizado (minúsculo, sem espaço nas pontas), e o
--    banco recusa outra forma. Por isso o índice único é na coluna pura.
--  * password_hash só aceita o formato do scrypt ("$scrypt$..."). Uma senha em
--    texto puro gravada por engano é recusada pelo próprio banco.
-- =====================================================================

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS password_hash text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_email') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_email CHECK (
      email IS NULL OR (
        char_length(email) BETWEEN 3 AND 254
        AND email = lower(btrim(email))
        AND email LIKE '_%@_%'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_password_hash') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_password_hash CHECK (
      password_hash IS NULL OR password_hash LIKE '$scrypt$%'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_credentials') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_credentials CHECK (
      (email IS NULL) = (password_hash IS NULL)
    );
  END IF;
END
$$;

-- Um e-mail por conta. Também é o índice da busca do login por e-mail.
-- (O login por username usa o ux_players_username da v2, em lower(username).)
CREATE UNIQUE INDEX IF NOT EXISTS ux_players_email ON game.players (email);

COMMENT ON COLUMN game.players.email IS 'E-mail de login, minúsculo. NULL = conta sem login (antiga ou anonimizada).';
COMMENT ON COLUMN game.players.password_hash IS 'Hash scrypt no formato $scrypt$ln=..,r=..,p=..$sal$hash. Nunca a senha.';

-- Conferência (opcional): deve listar email e password_hash.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'game' AND table_name = 'players' AND column_name IN ('email', 'password_hash');


-- ################################################################################################
-- ## schema_v4_npc_missions.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v4 (NPC Mestre e missões de abate)
--
-- Rode DEPOIS da v3 (schema_v3_auth.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada INSERT ignora o que já existe.
-- Não cria tabela nem altera coluna: usa o ciclo de sensei_missions da v2.
--
-- O que entra (tudo é catálogo, "evolui com INSERT, não ALTER"):
--  * Tipo de missão DEFEAT_MONSTER: derrotar target_quantity monstros do tipo
--    target_code (ex.: 'slime'). O servidor do jogo conta os abates.
--  * Título MASTER_DISCIPLE ("Discípulo do Mestre") e a dificuldade NPC_TRAINING
--    ("Treino do Mestre", 50 XP + esse título). XP e título da missão continuam
--    vindo do catálogo pelo trigger, nunca do cliente.
--  * O NPC Mestre como um jogador de verdade em game.players, com o rank mais alto.
--    Assim ele é o sensei_id das missões que cria e o evaluated_by das avaliações:
--    as mesmas FKs e os mesmos triggers das missões entre jogadores valem para ele.
--
-- Por que o NPC não vira uma conta que alguém usa:
--  * id fixo, sem e-mail e sem senha: o login sempre recusa (como conta antiga).
--  * Nome "Sensei Mestre", com espaço: o cadastro só aceita [A-Za-z0-9_], então
--    nenhum jogador consegue esse nome, e um jogador já chamado "Mestre" não
--    trava esta migração.
-- =====================================================================

BEGIN;

INSERT INTO game.mission_types (code, name, description) VALUES
  ('DEFEAT_MONSTER', 'Derrotar monstros', 'Derrotar target_quantity monstros do tipo target_code (contado pelo servidor do jogo)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.titles (code, name, description) VALUES
  ('MASTER_DISCIPLE', 'Discípulo do Mestre', 'Concluiu um treino do Mestre na Sala de Missões')
ON CONFLICT (code) DO NOTHING;

-- tier 5: abaixo da Básica (10). Os tiers são únicos; 5 estava livre.
INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('NPC_TRAINING', 'Treino do Mestre', 5, 50, (SELECT id FROM game.titles WHERE code = 'MASTER_DISCIPLE'))
ON CONFLICT (code) DO NOTHING;

-- Mesmo id no código do servidor (src/realtime/missions.ts, NPC_SENSEI_ID).
-- Rank mais alto que existir: todo aprendiz fica abaixo dele (regra rule_trainee_rank).
INSERT INTO game.players (id, username, current_rank_id)
VALUES ('00000000-0000-7000-8000-00000000a001', 'Sensei Mestre', (SELECT id FROM game.ranks ORDER BY tier DESC LIMIT 1))
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Conferência (opcional): deve devolver 1 linha com as 4 colunas preenchidas.
-- SELECT p.username, r.code AS rank, d.code AS dificuldade, t.code AS tipo
--   FROM game.players p
--   JOIN game.ranks r ON r.id = p.current_rank_id
--   CROSS JOIN (SELECT code FROM game.mission_difficulties WHERE code = 'NPC_TRAINING') d
--   CROSS JOIN (SELECT code FROM game.mission_types WHERE code = 'DEFEAT_MONSTER') t
--  WHERE p.id = '00000000-0000-7000-8000-00000000a001';


-- ################################################################################################
-- ## schema_v5_atributos.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v5 (nível, pontos de atributo e kits de habilidades)
--
-- Rode DEPOIS da v4 (schema_v4_npc_missions.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada passo confere se já foi feito.
-- Não apaga nada. Jogadores que já têm XP recebem o nível e os pontos correspondentes.
--
-- Regras (o BANCO garante, não só o servidor):
--  * Nível vem do XP total, com meta crescente: do nível N para o N+1 são N x 100 XP
--    (nível 2 = 100 XP, nível 3 = 300, nível 4 = 600, nível 5 = 1000...). O "XP zera" a
--    cada nível na tela; aqui o total continua somando (missões e ranks dependem dele).
--  * Subiu de nível: +1 ponto por nível, dado pelo trigger quando total_xp muda.
--    Vale para XP de monstro, de missão (resgate do pergaminho) ou de qualquer outro lugar.
--  * Pontos nunca são inventados: pontos livres + pontos gastos = nível - 1 (ck_players_stat_points).
--  * Cada atributo vai de 0 a 10 pontos.
--  * Kits: até 4 habilidades conhecidas cada, sem repetir dentro do kit.
-- =====================================================================

BEGIN;

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS level             smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stat_points       smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attr_vitality     smallint NOT NULL DEFAULT 0,   -- +10 de vida por ponto
  ADD COLUMN IF NOT EXISTS attr_chakra_max   smallint NOT NULL DEFAULT 0,   -- +10 de chakra máximo
  ADD COLUMN IF NOT EXISTS attr_chakra_regen smallint NOT NULL DEFAULT 0,   -- +1/s de chakra meditando
  ADD COLUMN IF NOT EXISTS attr_agility      smallint NOT NULL DEFAULT 0,   -- +0,5 de velocidade
  ADD COLUMN IF NOT EXISTS attr_taijutsu     smallint NOT NULL DEFAULT 0,   -- +5% de dano do Ataque Básico (físico)
  ADD COLUMN IF NOT EXISTS attr_ninjutsu     smallint NOT NULL DEFAULT 0,   -- +5% de dano dos jutsus (habilidades)
  ADD COLUMN IF NOT EXISTS kit_a text[] NOT NULL DEFAULT ARRAY['fire', 'water', 'taijutsu', 'heal'],
  ADD COLUMN IF NOT EXISTS kit_b text[] NOT NULL DEFAULT ARRAY['illusion', 'shadow', 'stone', 'heal'];

-- Nível de um XP total. Meta do nível N para o N+1 = N x 100, então o nível L começa em
-- 50 x L x (L - 1) de XP total. Conta pela fórmula e corrige o arredondamento. Máximo 99.
CREATE OR REPLACE FUNCTION game.level_for_xp(xp bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  l integer := greatest(1, floor((1 + sqrt(1 + greatest(xp, 0)::numeric * 8 / 100)) / 2)::integer);
BEGIN
  WHILE 50::bigint * (l + 1) * l <= xp LOOP l := l + 1; END LOOP;
  WHILE l > 1 AND 50::bigint * l * (l - 1) > xp LOOP l := l - 1; END LOOP;
  RETURN least(l, 99);
END $$;

-- Kit válido: até 4 habilidades conhecidas, sem repetir.
CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal']::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

-- Quem já tinha XP antes da v5 recebe o nível e os pontos (antes das regras abaixo).
UPDATE game.players
   SET level = game.level_for_xp(total_xp),
       stat_points = game.level_for_xp(total_xp) - 1
 WHERE level = 1 AND stat_points = 0 AND total_xp >= 100
   AND attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_level') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_level CHECK (level BETWEEN 1 AND 99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_attributes') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_attributes CHECK (
      stat_points >= 0
      AND attr_vitality     BETWEEN 0 AND 10
      AND attr_chakra_max   BETWEEN 0 AND 10
      AND attr_chakra_regen BETWEEN 0 AND 10
      AND attr_agility      BETWEEN 0 AND 10
      AND attr_taijutsu     BETWEEN 0 AND 10
      AND attr_ninjutsu     BETWEEN 0 AND 10
    );
  END IF;
  -- Ninguém tem mais pontos do que os níveis deram.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_stat_points') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_stat_points CHECK (
      stat_points + attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu = level - 1
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_kits') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_kits CHECK (game.valid_kit(kit_a) AND game.valid_kit(kit_b));
  END IF;
END
$$;

-- Nível e pontos andam sozinhos com o XP. O nível nunca muda por fora (nem desce).
CREATE OR REPLACE FUNCTION game.players_level_from_xp() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.level := level_for_xp(NEW.total_xp);
    NEW.stat_points := NEW.level - 1
      - (NEW.attr_vitality + NEW.attr_chakra_max + NEW.attr_chakra_regen + NEW.attr_agility + NEW.attr_taijutsu + NEW.attr_ninjutsu);
    RETURN NEW;
  END IF;

  IF NEW.level IS DISTINCT FROM OLD.level THEN
    RAISE EXCEPTION 'O nível vem do XP e não muda por fora'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_level_from_xp';
  END IF;

  IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
    v_level := level_for_xp(NEW.total_xp);
    IF v_level > OLD.level THEN
      NEW.stat_points := NEW.stat_points + (v_level - OLD.level);
      NEW.level := v_level;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_players_level_from_xp ON game.players;
CREATE TRIGGER trg_players_level_from_xp
  BEFORE INSERT OR UPDATE ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_level_from_xp();

COMMENT ON COLUMN game.players.level IS 'Nível (1 a 99), calculado do total_xp pelo trigger trg_players_level_from_xp.';
COMMENT ON COLUMN game.players.stat_points IS 'Pontos de atributo livres. Livres + gastos = level - 1.';

COMMIT;

-- Conferência (opcional): deve mostrar level, stat_points e os kits de cada jogador.
-- SELECT username, total_xp, level, stat_points, kit_a, kit_b FROM game.players ORDER BY total_xp DESC LIMIT 5;


-- ################################################################################################
-- ## schema_v6_aparencia.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v6 (visual do personagem / paperdoll)
--
-- Rode DEPOIS da v5 (schema_v5_atributos.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro. Não apaga nem muda nada que já existe.
--
-- appearance = as cores das 5 partes do boneco, no formato que o <input type="color">
-- devolve ("#rrggbb", minúsculo):
--   {"skin":"#f1c9a0","hair":"#2b2118","shirt":"#2f5d8a","pants":"#2a2a33","cape":"#8a2b2b"}
-- NULL = o jogador ainda não passou pelo Criador de Personagem (o jogo abre a tela de
-- criação). Os outros jogadores veem o visual padrão enquanto isso.
-- O banco recusa qualquer outra coisa (chave a mais, cor inválida, texto solto).
-- =====================================================================

BEGIN;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS appearance jsonb;

CREATE OR REPLACE FUNCTION game.valid_appearance(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN a IS NULL OR (
  jsonb_typeof(a) = 'object'
  AND (SELECT count(*) FROM jsonb_object_keys(a)) = 5
  AND a ?& ARRAY['skin', 'hair', 'shirt', 'pants', 'cape']
  AND (SELECT bool_and(v ~ '^#[0-9a-f]{6}$') FROM jsonb_each_text(a) AS e(k, v))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_appearance') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_appearance CHECK (game.valid_appearance(appearance));
  END IF;
END
$$;

COMMENT ON COLUMN game.players.appearance IS 'Cores do paperdoll: skin, hair, shirt, pants, cape ("#rrggbb"). NULL = personagem ainda não criado.';

COMMIT;

-- Conferência (opcional):
-- SELECT username, appearance FROM game.players ORDER BY created_at DESC LIMIT 5;


-- ################################################################################################
-- ## schema_v7_progressao.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v7 (progressão profunda)
--
-- Rode DEPOIS da v6 (schema_v6_aparencia.sql), no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada passo confere se já foi feito.
--
-- O que entra (o BANCO garante as regras, não só o servidor):
--  1. NÍVEIS ATÉ 60, com mais XP por nível: do nível N para o N+1 são 100·N + 25·N·(N-1).
--     Nível 11 = 13.750 XP; nível 40 = 572.000; nível 60 = 1.888.000.
--     Quem já jogava é recalculado pela curva nova. Se tinha mais pontos gastos do que o
--     nível novo dá, os atributos voltam a zero e os pontos ficam livres para redistribuir.
--  2. CLASSES (9) e JUTSUS (36 de classe + 2 da Academia), em catálogo.
--     game.player_classes: classe Primária (nível 11, virando Genin) e Secundária (nível 40, Chunin).
--     game.player_jutsus: jutsus aprendidos + usage_count (só o servidor conta); o nível do
--     jutsu é uma coluna GERADA do uso (100 = Nv 2, 500 = Nv 3, 2000 = Nv 4) e o uso só sobe.
--  3. INVENTÁRIO e RYŌ: game.items (armas e pergaminhos), game.player_items, players.ryo,
--     players.equipped_weapon (só arma que o jogador tem) e o atributo attr_weapons.
--  4. TUTORIAL DA ACADEMIA: players.tutorial_step (0 a 4). Conta nova começa em 0 (Sala 1);
--     quem já jogava antes desta migração fica com 4 (concluído).
--  5. RANKS POR NÍVEL E MISSÃO: Genin só pela Missão de Genin (nível 11, escolhe a classe);
--     Chunin só pelo Exame Chunin (nível 40, avaliado por um Chunin+); candidatura a Hokage
--     só no nível 60. O XP sozinho não promove mais ninguém.
--  6. EXTRAÇÃO (gacha) no banco: gasta 1/2/4/8 pergaminhos da classe, 80/60/40/20% de chance
--     de aprender um jutsu do tier 1/2/3/4. O sorteio vem do servidor; o banco confere custo,
--     classe, pergaminhos e qual jutsu ensina.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. catálogos

CREATE TABLE IF NOT EXISTS game.classes (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z]+$'),
  name       text     NOT NULL UNIQUE,
  icon       text     NOT NULL,
  sort_order smallint NOT NULL UNIQUE
);
COMMENT ON TABLE game.classes IS 'As 9 classes ninja. A Primária vem no nível 11 (Genin); a Secundária no 40 (Chunin).';

INSERT INTO game.classes (code, name, icon, sort_order) VALUES
  ('heal', 'Cura', '✚', 1),
  ('shadow', 'Sombra', '🌑', 2),
  ('illusion', 'Ilusão', '🌀', 3),
  ('stone', 'Pedra', '⛰', 4),
  ('fire', 'Fogo', '🔥', 5),
  ('water', 'Água', '💧', 6),
  ('taijutsu', 'Taijutsu', '👊', 7),
  ('weapons', 'Armas', '🗡️', 8),
  ('lightning', 'Relâmpago', '⚡', 9)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS game.jutsus (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name       text     NOT NULL,
  class_code text     REFERENCES game.classes (code),
  tier       smallint NOT NULL CHECK (tier BETWEEN 0 AND 4),
  CONSTRAINT ck_jutsus_academy CHECK ((class_code IS NULL) = (tier = 0))
);
COMMENT ON TABLE game.jutsus IS 'Jutsus. tier 0 = Academia (todos aprendem); 1 a 4 = tier da classe (nível de Extração).';

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
  ('teleport', 'Teleporte Curto', NULL, 0),
  ('substitution', 'Substituição', NULL, 0),
  ('heal', 'Cura', 'heal', 1),
  ('heal_2', 'Bálsamo Verde', 'heal', 2),
  ('heal_3', 'Fonte Serena', 'heal', 3),
  ('heal_4', 'Toque da Vida', 'heal', 4),
  ('shadow', 'Sombra', 'shadow', 1),
  ('shadow_2', 'Teia das Sombras', 'shadow', 2),
  ('shadow_3', 'Mãos da Noite', 'shadow', 3),
  ('shadow_4', 'Eclipse', 'shadow', 4),
  ('illusion', 'Ilusão', 'illusion', 1),
  ('illusion_2', 'Névoa Hipnótica', 'illusion', 2),
  ('illusion_3', 'Labirinto Mental', 'illusion', 3),
  ('illusion_4', 'Cárcere dos Sonhos', 'illusion', 4),
  ('stone', 'Pedra', 'stone', 1),
  ('stone_2', 'Pele de Granito', 'stone', 2),
  ('stone_3', 'Muralha de Rocha', 'stone', 3),
  ('stone_4', 'Coração de Montanha', 'stone', 4),
  ('fire', 'Fogo', 'fire', 1),
  ('fire_2', 'Muralha de Chamas', 'fire', 2),
  ('fire_3', 'Fênix Ardente', 'fire', 3),
  ('fire_4', 'Inferno Escarlate', 'fire', 4),
  ('water', 'Água', 'water', 1),
  ('water_2', 'Onda Gêmea', 'water', 2),
  ('water_3', 'Fúria do Oceano', 'water', 3),
  ('water_4', 'Maré Sem Fim', 'water', 4),
  ('taijutsu', 'Taijutsu', 'taijutsu', 1),
  ('taijutsu_2', 'Chute Ciclone', 'taijutsu', 2),
  ('taijutsu_3', 'Cem Golpes', 'taijutsu', 3),
  ('taijutsu_4', 'Punho do Céu', 'taijutsu', 4),
  ('weapons', 'Chuva de Kunais', 'weapons', 1),
  ('weapons_2', 'Leque de Shurikens', 'weapons', 2),
  ('weapons_3', 'Tempestade de Lâminas', 'weapons', 3),
  ('weapons_4', 'Arsenal Celeste', 'weapons', 4),
  ('lightning', 'Faísca Rasante', 'lightning', 1),
  ('lightning_2', 'Lança Trovão', 'lightning', 2),
  ('lightning_3', 'Corrente Elétrica', 'lightning', 3),
  ('lightning_4', 'Julgamento do Raio', 'lightning', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, tier = EXCLUDED.tier;

CREATE TABLE IF NOT EXISTS game.items (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name       text     NOT NULL UNIQUE,
  kind       text     NOT NULL CHECK (kind IN ('weapon', 'scroll')),
  class_code text     REFERENCES game.classes (code),
  damage     smallint CHECK (damage > 0),
  price_ryo  integer  CHECK (price_ryo > 0),
  shop       text     CHECK (shop IN ('weapons', 'clothes', 'scrolls')),
  CONSTRAINT ck_items_weapon CHECK ((kind = 'weapon') = (damage IS NOT NULL)),
  CONSTRAINT ck_items_scroll CHECK ((kind = 'scroll') = (class_code IS NOT NULL)),
  CONSTRAINT ck_items_shop   CHECK ((shop IS NULL) = (price_ryo IS NULL))
);
COMMENT ON TABLE game.items IS 'Itens: armas (somam dano ao Ataque Básico) e pergaminhos de classe (gastos na Extração).';

INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('kunai_training', 'Kunai de Treino', 'weapon', NULL, 10, NULL, NULL),
  ('kunai', 'Kunai', 'weapon', NULL, 14, 300, 'weapons'),
  ('fuma_shuriken', 'Shuriken Gigante', 'weapon', NULL, 22, 1200, 'weapons'),
  ('scroll_heal', 'Pergaminho de Cura', 'scroll', 'heal', NULL, 150, 'scrolls'),
  ('scroll_shadow', 'Pergaminho de Sombra', 'scroll', 'shadow', NULL, 150, 'scrolls'),
  ('scroll_illusion', 'Pergaminho de Ilusão', 'scroll', 'illusion', NULL, 150, 'scrolls'),
  ('scroll_stone', 'Pergaminho de Pedra', 'scroll', 'stone', NULL, 150, 'scrolls'),
  ('scroll_fire', 'Pergaminho de Fogo', 'scroll', 'fire', NULL, 150, 'scrolls'),
  ('scroll_water', 'Pergaminho de Água', 'scroll', 'water', NULL, 150, 'scrolls'),
  ('scroll_taijutsu', 'Pergaminho de Taijutsu', 'scroll', 'taijutsu', NULL, 150, 'scrolls'),
  ('scroll_weapons', 'Pergaminho de Armas', 'scroll', 'weapons', NULL, 150, 'scrolls'),
  ('scroll_lightning', 'Pergaminho de Relâmpago', 'scroll', 'lightning', NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, class_code = EXCLUDED.class_code,
  damage = EXCLUDED.damage, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. tabelas do jogador

CREATE TABLE IF NOT EXISTS game.player_jutsus (
  player_id   uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  jutsu_code  text        NOT NULL REFERENCES game.jutsus (code),
  usage_count integer     NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  -- Nível pelo USO, calculado pelo banco: ninguém escreve o nível direto.
  level       smallint    GENERATED ALWAYS AS (
                CASE WHEN usage_count >= 2000 THEN 4 WHEN usage_count >= 500 THEN 3 WHEN usage_count >= 100 THEN 2 ELSE 1 END
              ) STORED,
  learned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, jutsu_code)
);
COMMENT ON TABLE game.player_jutsus IS 'Jutsus aprendidos. usage_count só sobe (o servidor conta cada uso); level vem dele.';

CREATE TABLE IF NOT EXISTS game.player_classes (
  player_id       uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  primary_class   text        NOT NULL REFERENCES game.classes (code),
  secondary_class text        REFERENCES game.classes (code),
  primary_at      timestamptz NOT NULL DEFAULT now(),
  secondary_at    timestamptz,
  CONSTRAINT ck_player_classes_distinct  CHECK (secondary_class IS NULL OR secondary_class <> primary_class),
  CONSTRAINT ck_player_classes_secondary CHECK ((secondary_class IS NULL) = (secondary_at IS NULL))
);
COMMENT ON TABLE game.player_classes IS 'Classe Primária (Missão de Genin, nível 11) e Secundária (Chunin, nível 40).';

CREATE TABLE IF NOT EXISTS game.player_items (
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  item_code text    NOT NULL REFERENCES game.items (code),
  quantity  integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (player_id, item_code)
);
COMMENT ON TABLE game.player_items IS 'Inventário: quantidade de cada item (linha some quando chega a zero).';

CREATE TABLE IF NOT EXISTS game.hokage_candidates (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  applied_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.hokage_candidates IS 'Candidatos a Hokage (só nível 60). A eleição vem numa versão futura.';

-- Colunas novas em players. tutorial_step: quem JÁ EXISTE agora fica com 4 (concluído) e
-- ganha os 7 jutsus de antes; contas criadas depois começam em 0. Feito uma vez só: se a
-- coluna já existe, este bloco não faz nada (rodar de novo não mexe em quem está no tutorial).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'game' AND table_name = 'players' AND column_name = 'tutorial_step') THEN
    ALTER TABLE game.players ADD COLUMN tutorial_step smallint NOT NULL DEFAULT 4;
    ALTER TABLE game.players ALTER COLUMN tutorial_step SET DEFAULT 0;
    INSERT INTO game.player_jutsus (player_id, jutsu_code)
    SELECT p.id, j.code FROM game.players p
      CROSS JOIN unnest(ARRAY['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal', 'teleport', 'substitution']) AS j(code)
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS attr_weapons    smallint NOT NULL DEFAULT 0,   -- +5% de dano de armas por ponto
  ADD COLUMN IF NOT EXISTS ryo             bigint   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipped_weapon text     REFERENCES game.items (code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_ryo') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_ryo CHECK (ryo >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_tutorial') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_tutorial CHECK (tutorial_step BETWEEN 0 AND 4);
  END IF;
END
$$;

-- Conta nova: começa com os 2 jutsus da Academia (e o kit só com eles).
CREATE OR REPLACE FUNCTION game.players_after_insert_v7() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (NEW.id, 'teleport'), (NEW.id, 'substitution')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_players_after_insert_v7 ON game.players;
CREATE TRIGGER trg_players_after_insert_v7 AFTER INSERT ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_after_insert_v7();

-- Uso de jutsu só sobe (contador do servidor; ninguém "zera" ou inventa nível).
CREATE OR REPLACE FUNCTION game.player_jutsus_usage_only_up() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_count < OLD.usage_count OR NEW.player_id <> OLD.player_id OR NEW.jutsu_code <> OLD.jutsu_code THEN
    RAISE EXCEPTION 'O uso de um jutsu só aumenta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_usage_only_up';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_player_jutsus_usage_only_up ON game.player_jutsus;
CREATE TRIGGER trg_player_jutsus_usage_only_up BEFORE UPDATE ON game.player_jutsus
  FOR EACH ROW EXECUTE FUNCTION game.player_jutsus_usage_only_up();

-- Arma equipada: só uma arma que o jogador TEM.
CREATE OR REPLACE FUNCTION game.players_equipped_weapon_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_weapon IS NOT NULL AND NEW.equipped_weapon IS DISTINCT FROM OLD.equipped_weapon THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_weapon AND i.kind = 'weapon';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para equipar uma arma do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_weapon_owned ON game.players;
CREATE TRIGGER trg_players_equipped_weapon_owned BEFORE UPDATE OF equipped_weapon ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_weapon_owned();

-- Candidato a Hokage: só nível 60.
CREATE OR REPLACE FUNCTION game.hokage_candidates_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM 1 FROM players WHERE id = NEW.player_id AND level >= 60;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só um ninja de nível 60 pode se candidatar a Hokage'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_hokage_level';
  END IF;
  NEW.applied_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hokage_candidates_before_insert ON game.hokage_candidates;
CREATE TRIGGER trg_hokage_candidates_before_insert BEFORE INSERT ON game.hokage_candidates
  FOR EACH ROW EXECUTE FUNCTION game.hokage_candidates_before_insert();

-- ---------------------------------------------------------------- 3. kits com todos os jutsus

-- Kit válido: até 4 jutsus do catálogo, sem repetir. (Que o jogador SABE o jutsu, o servidor
-- confere ao salvar; aqui a lista fechada impede lixo na coluna.)
CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY['teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4', 'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2', 'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3', 'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3', 'lightning_4']::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

ALTER TABLE game.players ALTER COLUMN kit_a SET DEFAULT ARRAY['teleport', 'substitution']::text[];
ALTER TABLE game.players ALTER COLUMN kit_b SET DEFAULT ARRAY[]::text[];

-- ---------------------------------------------------------------- 4. curva de níveis (até 60)

-- XP total para COMEÇAR o nível L: soma de 100·N + 25·N·(N-1) para N = 1..L-1
--   = 50·L·(L-1) + 25·(L-2)·(L-1)·L/3   (inteiro: o produto de 3 seguidos divide por 3).
-- MESMA conta de src/realtime/stats.ts (levelStart).
CREATE OR REPLACE FUNCTION game.level_start(l integer) RETURNS bigint
LANGUAGE sql IMMUTABLE
RETURN 50::bigint * l * (l - 1) + 25::bigint * (l - 2) * (l - 1) * l / 3;

CREATE OR REPLACE FUNCTION game.level_for_xp(xp bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  l integer := 1;
BEGIN
  WHILE l < 60 AND game.level_start(l + 1) <= xp LOOP l := l + 1; END LOOP;
  RETURN l;
END $$;

ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_level;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_attributes;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_stat_points;

-- Recalcula todo mundo pela curva nova (o trigger de nível não deixa o nível mudar "por fora":
-- desligado só durante este UPDATE, dentro da transação).
ALTER TABLE game.players DISABLE TRIGGER trg_players_level_from_xp;
UPDATE game.players p
   SET level = n.level,
       stat_points = CASE WHEN n.spent > n.level - 1 THEN n.level - 1 ELSE n.level - 1 - n.spent END,
       attr_vitality     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_vitality END,
       attr_chakra_max   = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_chakra_max END,
       attr_chakra_regen = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_chakra_regen END,
       attr_agility      = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_agility END,
       attr_taijutsu     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_taijutsu END,
       attr_ninjutsu     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_ninjutsu END,
       attr_weapons      = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_weapons END
  FROM (SELECT id, game.level_for_xp(total_xp) AS level,
               attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons AS spent
          FROM game.players) n
 WHERE p.id = n.id;
ALTER TABLE game.players ENABLE TRIGGER trg_players_level_from_xp;

ALTER TABLE game.players ADD CONSTRAINT ck_players_level CHECK (level BETWEEN 1 AND 60);
ALTER TABLE game.players ADD CONSTRAINT ck_players_attributes CHECK (
  stat_points >= 0
  AND attr_vitality     BETWEEN 0 AND 10
  AND attr_chakra_max   BETWEEN 0 AND 10
  AND attr_chakra_regen BETWEEN 0 AND 10
  AND attr_agility      BETWEEN 0 AND 10
  AND attr_taijutsu     BETWEEN 0 AND 10
  AND attr_ninjutsu     BETWEEN 0 AND 10
  AND attr_weapons      BETWEEN 0 AND 10
);
ALTER TABLE game.players ADD CONSTRAINT ck_players_stat_points CHECK (
  stat_points + attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons = level - 1
);

-- O trigger de nível agora conta o atributo Armas nos pontos gastos.
CREATE OR REPLACE FUNCTION game.players_level_from_xp() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.level := level_for_xp(NEW.total_xp);
    NEW.stat_points := NEW.level - 1
      - (NEW.attr_vitality + NEW.attr_chakra_max + NEW.attr_chakra_regen + NEW.attr_agility + NEW.attr_taijutsu + NEW.attr_ninjutsu + NEW.attr_weapons);
    RETURN NEW;
  END IF;

  IF NEW.level IS DISTINCT FROM OLD.level THEN
    RAISE EXCEPTION 'O nível vem do XP e não muda por fora'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_level_from_xp';
  END IF;

  IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
    v_level := level_for_xp(NEW.total_xp);
    IF v_level > OLD.level THEN
      NEW.stat_points := NEW.stat_points + (v_level - OLD.level);
      NEW.level := v_level;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN game.players.level IS 'Nível (1 a 60), calculado do total_xp pelo trigger trg_players_level_from_xp (curva v7).';

-- ---------------------------------------------------------------- 5. ranks por nível

ALTER TABLE game.ranks ADD COLUMN IF NOT EXISTS min_level smallint NOT NULL DEFAULT 1;

INSERT INTO game.ranks (code, name, tier, can_be_sensei)
SELECT 'HOKAGE', 'Hokage', max(tier) + 10, true FROM game.ranks
ON CONFLICT (code) DO NOTHING;

UPDATE game.ranks SET min_level = CASE code WHEN 'GENIN' THEN 11 WHEN 'CHUNIN' THEN 40 WHEN 'HOKAGE' THEN 60 ELSE min_level END
 WHERE code IN ('GENIN', 'CHUNIN', 'HOKAGE');

-- Missão de Genin (na Academia): nível 11, tutorial concluído, ainda Academia e sem classe.
-- Vira Genin, ganha a classe Primária e 1 pergaminho grátis dela.
CREATE OR REPLACE FUNCTION game.become_genin(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_player players%ROWTYPE;
  v_rank   text;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT code INTO v_rank FROM ranks WHERE id = v_player.current_rank_id;
  IF v_player.tutorial_step < 4 THEN
    RAISE EXCEPTION 'Conclua o tutorial da Academia primeiro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tutorial_first';
  END IF;
  IF v_player.level < (SELECT min_level FROM ranks WHERE code = 'GENIN') THEN
    RAISE EXCEPTION 'A Missão de Genin é a partir do nível 11' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_level';
  END IF;
  IF v_rank <> 'ACADEMY' THEN
    RAISE EXCEPTION 'Só aluno da Academia faz a Missão de Genin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_rank';
  END IF;
  PERFORM 1 FROM classes WHERE code = p_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Classe inexistente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_unknown'; END IF;
  INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class);   -- PK: uma vez só
  UPDATE players SET current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN') WHERE id = p_player;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'scroll_' || p_class, 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
END $$;

-- Classe Secundária: Chunin (ou acima) e nível 40; diferente da Primária; uma vez só.
CREATE OR REPLACE FUNCTION game.choose_secondary_class(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
  v_tier  smallint;
BEGIN
  SELECT p.level, r.tier INTO v_level, v_tier FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = p_player FOR UPDATE OF p;
  IF v_level < (SELECT min_level FROM ranks WHERE code = 'CHUNIN') OR v_tier < (SELECT tier FROM ranks WHERE code = 'CHUNIN') THEN
    RAISE EXCEPTION 'A classe Secundária é para Chunin de nível 40' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_secondary_class';
  END IF;
  UPDATE player_classes SET secondary_class = p_class, secondary_at = now()
   WHERE player_id = p_player AND secondary_class IS NULL AND primary_class <> p_class
     AND EXISTS (SELECT 1 FROM classes WHERE code = p_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Classe Secundária já escolhida, igual à Primária ou inexistente'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_secondary_class';
  END IF;
END $$;

-- ---------------------------------------------------------------- 6. Extração (gacha)

-- p_roll e p_pick: sorteios do SERVIDOR, de 0 a 1 (o cliente não manda nada disso).
-- Ordem: classe do jogador? nível 1..4? sobra jutsu desse tier para aprender? tem pergaminhos?
-- Só então gasta os pergaminhos (sucesso OU falha) e, no sucesso, ensina o jutsu sorteado.
CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost   integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 8 END;
  v_chance double precision := CASE p_level WHEN 1 THEN 0.8 WHEN 2 THEN 0.6 WHEN 3 THEN 0.4 WHEN 4 THEN 0.2 END;
  v_have   integer;
  v_count  integer;
  v_code   text;
BEGIN
  IF v_cost IS NULL OR p_roll < 0 OR p_roll >= 1 OR p_pick < 0 OR p_pick >= 1 THEN
    RAISE EXCEPTION 'Extração inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_extraction_input';
  END IF;
  PERFORM 1 FROM players WHERE id = p_player FOR UPDATE;    -- uma extração por vez por jogador
  PERFORM 1 FROM player_classes WHERE player_id = p_player AND p_class IN (primary_class, secondary_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você só aprende jutsus da sua classe' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_not_owned';
  END IF;
  SELECT count(*) INTO v_count FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code);
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  END IF;
  IF p_roll >= v_chance THEN
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

-- ---------------------------------------------------------------- 7. loja, equipar e tutorial

-- Compra: o preço vem do catálogo (nunca do cliente); ryō não fica negativo.
CREATE OR REPLACE FUNCTION game.buy_item(p_player uuid, p_item text, p_qty integer) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_price integer;
  v_ryo   bigint;
BEGIN
  SELECT price_ryo INTO v_price FROM items WHERE code = p_item AND shop IS NOT NULL;
  IF v_price IS NULL OR p_qty NOT BETWEEN 1 AND 99 THEN
    RAISE EXCEPTION 'Item não está à venda' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_item_not_for_sale';
  END IF;
  UPDATE players SET ryo = ryo - v_price::bigint * p_qty WHERE id = p_player AND ryo >= v_price::bigint * p_qty RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ryō insuficiente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_enough_ryo';
  END IF;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, p_item, p_qty)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + p_qty;
  RETURN v_ryo;
END $$;

-- Tutorial: só avança um passo por vez (p_to = passo atual + 1). Recompensas no banco:
--   passo 3 (entrou na sala de equipamento): Kunai de Treino;  passo 4 (concluiu): +100 ryō e +50 XP.
CREATE OR REPLACE FUNCTION game.advance_tutorial(p_player uuid, p_to integer) RETURNS boolean
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  UPDATE players SET tutorial_step = p_to WHERE id = p_player AND tutorial_step = p_to - 1 AND p_to BETWEEN 1 AND 4;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_to = 3 THEN
    INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'kunai_training', 1)
    ON CONFLICT (player_id, item_code) DO NOTHING;
  ELSIF p_to = 4 THEN
    UPDATE players SET ryo = ryo + 100, total_xp = total_xp + 50 WHERE id = p_player;
  END IF;
  RETURN true;
END $$;

-- ---------------------------------------------------------------- 8. Exame Chunin

INSERT INTO game.titles (code, name, description) VALUES
  ('CHUNIN_EXAM', 'Aprovado no Exame Chunin', 'Passou no Exame Chunin, avaliado por um Chunin ou acima')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('CHUNIN_EXAM', 'Exame Chunin', 50, 0, (SELECT id FROM game.titles WHERE code = 'CHUNIN_EXAM'))
ON CONFLICT (code) DO NOTHING;

-- Criar o exame: o aprendiz precisa ser Genin de nível 40.
CREATE OR REPLACE FUNCTION game.sensei_missions_chunin_exam() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.difficulty_id = (SELECT id FROM mission_difficulties WHERE code = 'CHUNIN_EXAM') THEN
    PERFORM 1 FROM players p JOIN ranks r ON r.id = p.current_rank_id
     WHERE p.id = NEW.trainee_id AND r.code = 'GENIN' AND p.level >= (SELECT min_level FROM ranks WHERE code = 'CHUNIN');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O Exame Chunin é para Genin de nível 40'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_chunin_exam';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sensei_missions_chunin_exam ON game.sensei_missions;
CREATE TRIGGER trg_sensei_missions_chunin_exam BEFORE INSERT ON game.sensei_missions
  FOR EACH ROW EXECUTE FUNCTION game.sensei_missions_chunin_exam();

-- Exame aprovado (por um Chunin+, regra das avaliações da v2): o aprendiz vira Chunin.
CREATE OR REPLACE FUNCTION game.mission_evaluations_chunin_exam() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.is_approved THEN
    UPDATE players p SET current_rank_id = (SELECT id FROM ranks WHERE code = 'CHUNIN')
      FROM sensei_missions m
     WHERE m.id = NEW.mission_id
       AND m.difficulty_id = (SELECT id FROM mission_difficulties WHERE code = 'CHUNIN_EXAM')
       AND p.id = m.trainee_id
       AND p.current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN')
       AND p.level >= (SELECT min_level FROM ranks WHERE code = 'CHUNIN');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_mission_evaluations_chunin_exam ON game.mission_evaluations;
CREATE TRIGGER trg_mission_evaluations_chunin_exam AFTER INSERT ON game.mission_evaluations
  FOR EACH ROW EXECUTE FUNCTION game.mission_evaluations_chunin_exam();

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                 -- 38
-- SELECT code, min_level FROM game.ranks ORDER BY tier;
-- SELECT username, level, tutorial_step, ryo FROM game.players ORDER BY total_xp DESC LIMIT 5;


-- ################################################################################################
-- ## schema_v8_admin_chat.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v8 (polimento, administração e Academia nova)
--
-- Rode DEPOIS da v7 (schema_v7_progressao.sql), no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada passo confere se já foi feito.
-- Depois dela, NÃO rode a v5 nem a v7 de novo (elas citam as colunas antigas de chakra).
--
-- O que entra (o BANCO garante as regras, não só o servidor):
--  1. MODO ADMINISTRADOR: players.is_admin (falso para todo mundo) e a auditoria
--     game.admin_audit_log (só INSERT: ninguém edita nem apaga). Cada comando de admin é uma
--     função game.admin_* que confere is_admin de quem pede e grava a auditoria na MESMA
--     transação. Ações de admin ligam a flag local `game.admin_action` (só dentro da
--     transação): o trigger de nível aceita o nível definido pelo admin e nada de conquista,
--     título, rank ou anúncio é disparado (o servidor também não anuncia).
--  2. ATRIBUTO "CHAKRA": attr_chakra_max + attr_chakra_regen viram UMA coluna attr_chakra
--     (os pontos de quem já jogava são somados, nada se perde). Sem o teto de 10 pontos: o
--     rendimento decrescente (soft cap) é calculado pelo SERVIDOR (src/realtime/stats.ts).
--  3. REDEFINIR ATRIBUTOS: game.reset_attributes(jogador, custo) devolve todos os pontos e
--     cobra o custo em ryō (o servidor manda 500; o admin, 0) numa linha travada.
--  4. CHAT: game.chat_logs guarda as mensagens (local, global e sussurro) por 24 h.
--     game.purge_chat_logs() apaga o que passou de 24 h (o servidor chama de tempos em tempos).
--  5. SALA DE MISSÕES: duas dificuldades novas do Mestre (Treino Leve e Treino Pesado), além do
--     Treino do Mestre (v4). XP e título continuam vindo do catálogo pelo trigger.
--  6. EQUIPAMENTO VISÍVEL: Espada Curta (na mão) e Espada Longa (nas costas) na Armaria, e
--     players.equipped_scroll: um pergaminho de jutsu levado nas costas (só um que o jogador tem).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. administrador

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN game.players.is_admin IS 'Modo Administrador (comandos /admin). Só por SQL: nenhum endpoint muda esta coluna.';

CREATE TABLE IF NOT EXISTS game.admin_audit_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   uuid        NOT NULL REFERENCES game.players (id),
  command    text        NOT NULL CHECK (command ~ '^[a-z]{2,24}$'),
  target_id  uuid        REFERENCES game.players (id),
  args       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ok         boolean     NOT NULL,
  detail     text        CHECK (detail IS NULL OR char_length(detail) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.admin_audit_log IS 'Auditoria do Modo Administrador: cada comando (aceito ou recusado). Só INSERT.';
CREATE INDEX IF NOT EXISTS ix_admin_audit_log_admin ON game.admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_log_target ON game.admin_audit_log (target_id, created_at DESC) WHERE target_id IS NOT NULL;

-- Ninguém edita nem apaga a auditoria (mesma regra das tabelas append-only da v2).
DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON game.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_append_only BEFORE UPDATE OR DELETE ON game.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION game.forbid_change();

-- Quem pede é admin? (trava a linha do admin: comandos dele andam um por vez)
CREATE OR REPLACE FUNCTION game.assert_admin(p_admin uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM 1 FROM players WHERE id = p_admin AND is_admin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comando restrito ao administrador' USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'rule_admin_only';
  END IF;
END $$;

-- Registro de auditoria (também usado pelo servidor para comandos só de memória, como spawn).
CREATE OR REPLACE FUNCTION game.admin_log(p_admin uuid, p_command text, p_target uuid, p_args jsonb, p_ok boolean, p_detail text)
RETURNS void LANGUAGE sql SET search_path = game AS $$
  INSERT INTO admin_audit_log (admin_id, command, target_id, args, ok, detail)
  VALUES (p_admin, p_command, p_target, COALESCE(p_args, '{}'::jsonb), p_ok, left(p_detail, 300));
$$;

-- ---------------------------------------------------------------- 2. atributo Chakra (sem teto)

ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_attributes;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_stat_points;

-- Uma vez só: soma os pontos de Regen Chakra no Chakra Máximo e renomeia para attr_chakra.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'game' AND table_name = 'players' AND column_name = 'attr_chakra_regen') THEN
    UPDATE game.players SET attr_chakra_max = attr_chakra_max + attr_chakra_regen WHERE attr_chakra_regen <> 0;
    ALTER TABLE game.players RENAME COLUMN attr_chakra_max TO attr_chakra;
    ALTER TABLE game.players DROP COLUMN attr_chakra_regen;
  END IF;
END
$$;
COMMENT ON COLUMN game.players.attr_chakra IS 'Pontos em Chakra (chakra máximo e regeneração meditando). Sem teto: o soft cap é do servidor.';

-- Sem teto por atributo (só não negativo). Pontos nunca são inventados: livres + gastos = nível - 1.
ALTER TABLE game.players ADD CONSTRAINT ck_players_attributes CHECK (
  stat_points >= 0 AND attr_vitality >= 0 AND attr_chakra >= 0 AND attr_agility >= 0
  AND attr_taijutsu >= 0 AND attr_ninjutsu >= 0 AND attr_weapons >= 0
);
ALTER TABLE game.players ADD CONSTRAINT ck_players_stat_points CHECK (
  stat_points + attr_vitality + attr_chakra + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons = level - 1
);

-- Nível pelo XP (v7) com o atributo novo. Ação de ADMIN (flag local da transação): o nível
-- definido pelo admin vale como está, sem pontos extras do XP.
CREATE OR REPLACE FUNCTION game.players_level_from_xp() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.level := level_for_xp(NEW.total_xp);
    NEW.stat_points := NEW.level - 1
      - (NEW.attr_vitality + NEW.attr_chakra + NEW.attr_agility + NEW.attr_taijutsu + NEW.attr_ninjutsu + NEW.attr_weapons);
    RETURN NEW;
  END IF;

  IF current_setting('game.admin_action', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.level IS DISTINCT FROM OLD.level THEN
    RAISE EXCEPTION 'O nível vem do XP e não muda por fora'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_level_from_xp';
  END IF;

  IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
    v_level := level_for_xp(NEW.total_xp);
    IF v_level > OLD.level THEN
      NEW.stat_points := NEW.stat_points + (v_level - OLD.level);
      NEW.level := v_level;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- 3. redefinir atributos

-- Devolve TODOS os pontos investidos e cobra p_cost ryō (o servidor decide o custo; nunca o cliente).
CREATE OR REPLACE FUNCTION game.reset_attributes(p_player uuid, p_cost bigint) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_spent integer;
  v_ryo   bigint;
BEGIN
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'Custo inválido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_reset_cost';
  END IF;
  SELECT attr_vitality + attr_chakra + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons, ryo
    INTO v_spent, v_ryo FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF v_spent = 0 THEN
    RAISE EXCEPTION 'Nenhum ponto investido' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_nothing_to_reset';
  END IF;
  IF v_ryo < p_cost THEN
    RAISE EXCEPTION 'Ryō insuficiente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_enough_ryo';
  END IF;
  UPDATE players
     SET ryo = ryo - p_cost, stat_points = level - 1,
         attr_vitality = 0, attr_chakra = 0, attr_agility = 0, attr_taijutsu = 0, attr_ninjutsu = 0, attr_weapons = 0
   WHERE id = p_player;
END $$;

-- ---------------------------------------------------------------- 4. comandos do administrador

-- /admin level <nome> <nível>: XP vai para o começo do nível; se os pontos gastos passarem do
-- que o nível dá, os atributos voltam a zero (pontos livres para redistribuir).
CREATE OR REPLACE FUNCTION game.admin_set_level(p_admin uuid, p_target uuid, p_level integer) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_spent integer;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Nível de 1 a 60' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_level';
  END IF;
  SELECT attr_vitality + attr_chakra + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons
    INTO v_spent FROM players WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  PERFORM set_config('game.admin_action', 'on', true);
  IF v_spent > p_level - 1 THEN
    UPDATE players SET total_xp = level_start(p_level), level = p_level, stat_points = p_level - 1,
           attr_vitality = 0, attr_chakra = 0, attr_agility = 0, attr_taijutsu = 0, attr_ninjutsu = 0, attr_weapons = 0
     WHERE id = p_target;
  ELSE
    UPDATE players SET total_xp = level_start(p_level), level = p_level, stat_points = p_level - 1 - v_spent
     WHERE id = p_target;
  END IF;
  PERFORM set_config('game.admin_action', 'off', true);
  PERFORM admin_log(p_admin, 'level', p_target, jsonb_build_object('level', p_level), true, NULL);
END $$;

-- /admin givejutsu <nome> <jutsu> <nível>: ensina o jutsu ou sobe o uso até o nível pedido
-- (o uso nunca desce: o trigger da v7 continua valendo).
CREATE OR REPLACE FUNCTION game.admin_give_jutsu(p_admin uuid, p_target uuid, p_jutsu text, p_level integer) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_uses integer := CASE p_level WHEN 1 THEN 0 WHEN 2 THEN 100 WHEN 3 THEN 500 WHEN 4 THEN 2000 END;
  v_now  integer;
BEGIN
  PERFORM assert_admin(p_admin);
  IF v_uses IS NULL THEN
    RAISE EXCEPTION 'Nível do jutsu de 1 a 4' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_jutsu_level';
  END IF;
  PERFORM set_config('game.admin_action', 'on', true);
  INSERT INTO player_jutsus (player_id, jutsu_code, usage_count) VALUES (p_target, p_jutsu, v_uses)
  ON CONFLICT (player_id, jutsu_code) DO UPDATE SET usage_count = greatest(player_jutsus.usage_count, EXCLUDED.usage_count)
  RETURNING usage_count INTO v_now;
  PERFORM set_config('game.admin_action', 'off', true);
  PERFORM admin_log(p_admin, 'givejutsu', p_target, jsonb_build_object('jutsu', p_jutsu, 'level', p_level), true, NULL);
  RETURN v_now;
END $$;

-- /admin giveitem <nome> <item> <qtd>
CREATE OR REPLACE FUNCTION game.admin_give_item(p_admin uuid, p_target uuid, p_item text, p_qty integer) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_now integer;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'Quantidade de 1 a 999' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_quantity';
  END IF;
  PERFORM set_config('game.admin_action', 'on', true);
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_target, p_item, p_qty)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + EXCLUDED.quantity
  RETURNING quantity INTO v_now;
  PERFORM set_config('game.admin_action', 'off', true);
  PERFORM admin_log(p_admin, 'giveitem', p_target, jsonb_build_object('item', p_item, 'qty', p_qty), true, NULL);
  RETURN v_now;
END $$;

-- /admin resetstats <nome>: devolve os pontos sem cobrar ryō.
CREATE OR REPLACE FUNCTION game.admin_reset_stats(p_admin uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  PERFORM set_config('game.admin_action', 'on', true);
  PERFORM reset_attributes(p_target, 0);
  PERFORM set_config('game.admin_action', 'off', true);
  PERFORM admin_log(p_admin, 'resetstats', p_target, '{}'::jsonb, true, NULL);
END $$;

-- ---------------------------------------------------------------- 5. histórico do chat (24 h)

CREATE TABLE IF NOT EXISTS game.chat_logs (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel        text        NOT NULL CHECK (channel IN ('local', 'global', 'whisper')),
  sender_id      uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  sender_name    text        NOT NULL,
  recipient_id   uuid        REFERENCES game.players (id) ON DELETE CASCADE,
  recipient_name text,
  map            text,
  message        text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 200),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_chat_logs_whisper CHECK ((channel = 'whisper') = (recipient_id IS NOT NULL)),
  CONSTRAINT ck_chat_logs_local   CHECK ((channel = 'local') = (map IS NOT NULL))
);
COMMENT ON TABLE game.chat_logs IS 'Histórico do chat (local, global e sussurro). Retenção de 24 h: game.purge_chat_logs().';
CREATE INDEX IF NOT EXISTS ix_chat_logs_created      ON game.chat_logs (created_at);
CREATE INDEX IF NOT EXISTS ix_chat_logs_global       ON game.chat_logs (id DESC) WHERE channel = 'global';
CREATE INDEX IF NOT EXISTS ix_chat_logs_local        ON game.chat_logs (map, id DESC) WHERE channel = 'local';
CREATE INDEX IF NOT EXISTS ix_chat_logs_whisper_from ON game.chat_logs (sender_id, id DESC) WHERE channel = 'whisper';
CREATE INDEX IF NOT EXISTS ix_chat_logs_whisper_to   ON game.chat_logs (recipient_id, id DESC) WHERE channel = 'whisper';

CREATE OR REPLACE FUNCTION game.purge_chat_logs() RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM chat_logs WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------------- 6. Sala de Missões (cartões do Mestre)

-- Tiers únicos: 3 e 7 estavam livres (5 = Treino do Mestre, v4).
INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('NPC_EASY', 'Treino Leve', 3, 30, NULL),
  ('NPC_HARD', 'Treino Pesado', 7, 150, NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- 7. equipamento visível

INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('tanto', 'Espada Curta', 'weapon', NULL, 18, 600, 'weapons'),
  ('katana', 'Espada Longa', 'weapon', NULL, 28, 2000, 'weapons')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, class_code = EXCLUDED.class_code,
  damage = EXCLUDED.damage, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_scroll text REFERENCES game.items (code);
COMMENT ON COLUMN game.players.equipped_scroll IS 'Pergaminho de jutsu levado nas costas (só um que o jogador tem; visual).';

CREATE OR REPLACE FUNCTION game.players_equipped_scroll_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_scroll IS NOT NULL AND NEW.equipped_scroll IS DISTINCT FROM OLD.equipped_scroll THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_scroll AND i.kind = 'scroll';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para levar nas costas um pergaminho do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_scroll_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_scroll_owned ON game.players;
CREATE TRIGGER trg_players_equipped_scroll_owned BEFORE UPDATE OF equipped_scroll ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_scroll_owned();

COMMIT;

-- ---------------------------------------------------------------- conta de administrador
-- Deixa a conta "Victor" como administradora (sem diferenciar maiúsculas). Sem essa conta, não
-- faz nada. O mesmo comando está em db/promote_victor.sql.
UPDATE game.players SET is_admin = true WHERE lower(username) = 'victor';

-- Conferência (opcional):
-- SELECT username, is_admin FROM game.players WHERE is_admin;
-- SELECT * FROM game.admin_audit_log ORDER BY id DESC LIMIT 20;
-- SELECT channel, sender_name, message, created_at FROM game.chat_logs ORDER BY id DESC LIMIT 20;


-- ################################################################################################
-- ## schema_v9_visual_sprites.sql
-- ################################################################################################
-- =====================================================================
-- Nin Online Mobile: migração v9 (visual em sprites: gênero, cabelo, olhos, roupa e vila)
--
-- Rode DEPOIS da v8 (schema_v8_admin_chat.sql), no SQL Editor do Neon (branch `production`).
-- Pode rodar de novo sem erro. Não apaga nem muda nenhum visual que já está gravado.
--
-- O que muda: a checagem do `appearance` (game.valid_appearance) passa a aceitar o visual NOVO,
-- feito de nomes de paleta (sem cor livre):
--   {"v":2,"gender":"f","skin":"canela","hairStyle":"longo_lateral","hairColor":"preto",
--    "eyeStyle":"cilios","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho",
--    "pantsColor":"cinza","bandana":true,"village":"vila_1"}
-- O visual ANTIGO (5 cores "#rrggbb", da v6) continua valendo: o servidor converte para a cor mais
-- parecida quando o jogador entra, e grava o novo na próxima vez que ele salvar no Criador.
-- Os nomes válidos de cada campo ficam no servidor (src/realtime/appearance.ts); o banco confere o
-- formato (chaves, tipos, gênero e nomes em minúsculas), e recusa qualquer outra coisa.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION game.valid_appearance(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN a IS NULL OR (
  jsonb_typeof(a) = 'object'
  AND (
    -- v6: as 5 cores do boneco antigo
    (
      (SELECT count(*) FROM jsonb_object_keys(a)) = 5
      AND a ?& ARRAY['skin', 'hair', 'shirt', 'pants', 'cape']
      AND (SELECT bool_and(jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^#[0-9a-f]{6}$') FROM jsonb_each(a) AS e(k, v))
    )
    OR
    -- v9: sprites (nomes de paleta)
    (
      (SELECT count(*) FROM jsonb_object_keys(a)) = 12
      AND a ?& ARRAY['v', 'gender', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'eyeColor', 'outfit',
                     'shirtColor', 'pantsColor', 'bandana', 'village']
      AND a -> 'v' = '2'::jsonb
      AND jsonb_typeof(a -> 'gender') = 'string' AND a ->> 'gender' IN ('m', 'f')
      AND jsonb_typeof(a -> 'bandana') = 'boolean'
      AND (SELECT bool_and(jsonb_typeof(a -> k) = 'string' AND (a ->> k) ~ '^[a-z][a-z0-9_]{0,23}$')
             FROM unnest(ARRAY['skin', 'hairStyle', 'hairColor', 'eyeStyle', 'eyeColor', 'outfit',
                               'shirtColor', 'pantsColor', 'village']) AS f(k))
    )
  )
);

COMMENT ON COLUMN game.players.appearance IS
  'Visual do personagem. v9: {"v":2, gender, skin, hairStyle, hairColor, eyeStyle, eyeColor, outfit, shirtColor, pantsColor, bandana, village} (nomes de paleta). Ainda aceita o formato da v6 (5 cores). NULL = personagem ainda não criado.';

COMMIT;

-- Conferência (opcional): as duas linhas devem dar "true".
-- SELECT game.valid_appearance('{"v":2,"gender":"f","skin":"canela","hairStyle":"longo_lateral","hairColor":"preto","eyeStyle":"cilios","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho","pantsColor":"cinza","bandana":true,"village":"vila_1"}'::jsonb);
-- SELECT game.valid_appearance('{"skin":"#f1c9a0","hair":"#2b2118","shirt":"#2f5d8a","pants":"#2a2a33","cape":"#8a2b2b"}'::jsonb);


-- ################################################################################################
-- ## schema_v10_design.sql
-- ################################################################################################
-- =====================================================================
-- Vontade do Fogo: migração v10 (design geral do jogo, docs/design-do-jogo.md)
--
-- Rode DEPOIS da v9 (schema_v9_visual_sprites.sql), no SQL Editor do Neon (branch production).
-- Pode rodar de novo sem erro. O servidor SOBE sem ela: a Extração só fica sem a proteção contra azar
-- até ela rodar (o log do boot avisa).
--
-- O que entra:
--  1. PROTEÇÃO CONTRA AZAR NA EXTRAÇÃO (design 7.3): cada falha soma +10 pontos percentuais na próxima
--     tentativa da MESMA classe e do MESMO tier; acertou, zera. No tier 4 (20%), isso garante o jutsu em
--     no máximo 9 tentativas. A conta é do BANCO, na mesma transação que gasta os pergaminhos.
--     game.player_extraction_pity guarda as falhas seguidas; game.extraction_failures(jogador) devolve
--     as que existem (o servidor mostra a chance atual na Casa dos Pergaminhos).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. proteção contra azar

CREATE TABLE IF NOT EXISTS game.player_extraction_pity (
  player_id  uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  class_code text    NOT NULL REFERENCES game.classes (code),
  tier       integer NOT NULL,
  failures   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, class_code, tier),
  CONSTRAINT ck_extraction_pity_tier     CHECK (tier BETWEEN 1 AND 4),
  CONSTRAINT ck_extraction_pity_failures CHECK (failures >= 0)
);
COMMENT ON TABLE game.player_extraction_pity IS
  'Falhas seguidas na Extração, por classe e tier: cada uma soma +10 pontos na chance da próxima (zera ao acertar).';

-- A mesma função da v7 (mesmos parâmetros e o mesmo retorno), agora com a chance + 10 pontos por falha.
CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost     integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 8 END;
  v_base     double precision := CASE p_level WHEN 1 THEN 0.8 WHEN 2 THEN 0.6 WHEN 3 THEN 0.4 WHEN 4 THEN 0.2 END;
  v_failures integer;
  v_chance   double precision;
  v_have     integer;
  v_count    integer;
  v_code     text;
BEGIN
  IF v_cost IS NULL OR p_roll < 0 OR p_roll >= 1 OR p_pick < 0 OR p_pick >= 1 THEN
    RAISE EXCEPTION 'Extração inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_extraction_input';
  END IF;
  PERFORM 1 FROM players WHERE id = p_player FOR UPDATE;    -- uma extração por vez por jogador
  PERFORM 1 FROM player_classes WHERE player_id = p_player AND p_class IN (primary_class, secondary_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você só aprende jutsus da sua classe' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_not_owned';
  END IF;
  SELECT count(*) INTO v_count FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code);
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  END IF;
  SELECT COALESCE((SELECT failures FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level), 0)
    INTO v_failures;
  v_chance := least(1.0, v_base + 0.1 * v_failures);
  IF p_roll >= v_chance THEN
    INSERT INTO player_extraction_pity (player_id, class_code, tier, failures) VALUES (p_player, p_class, p_level, 1)
    ON CONFLICT (player_id, class_code, tier) DO UPDATE SET failures = player_extraction_pity.failures + 1;
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  DELETE FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

-- Falhas seguidas do jogador (só as que existem): o servidor soma +10 pontos por falha na chance mostrada.
CREATE OR REPLACE FUNCTION game.extraction_failures(p_player uuid)
RETURNS TABLE (class_code text, tier integer, failures integer)
LANGUAGE sql STABLE SET search_path = game AS $$
  SELECT class_code, tier, failures FROM player_extraction_pity WHERE player_id = p_player AND failures > 0
$$;

COMMIT;

-- Conferência (opcional): deve dar 2 (a tabela e a função nova).
-- SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game' AND table_name = 'player_extraction_pity')
--      + (SELECT count(*) FROM pg_proc WHERE proname = 'extraction_failures');


-- ################################################################################################
-- ## schema_v11_endgame.sql
-- ################################################################################################
-- =====================================================================
-- Herança do Fogo (antes Vontade do Fogo): migração v11 (fim de jogo: vilas, política, PvP, renegados, Akatsuki e capas)
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
COMMENT ON TABLE game.villages IS 'As quatro aldeias: Chama Eterna, Maré Oculta, Vento Cortante e Rocha Antiga (antes Folha, Névoa, Nuvem e Areia; os nomes mudam aqui, na v17 e em src/realtime/villages.ts). A Pedra (vila_2) saiu na v13.';
-- A Pedra (vila_2) estava aqui até a v13 tirá-la do jogo; fora da lista, rodar esta migração de novo não a traz de volta.
INSERT INTO game.villages (code, name, sort_order) VALUES
  ('vila_1', 'Chama Eterna', 1), ('vila_3', 'Maré Oculta', 3), ('vila_4', 'Vento Cortante', 4), ('vila_5', 'Rocha Antiga', 5)
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
   SET village = CASE WHEN appearance ->> 'village' IN ('vila_1', 'vila_3', 'vila_4', 'vila_5') THEN appearance ->> 'village' ELSE 'vila_1' END
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
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory'));   -- 'shoes': v12, 'accessory': v14 (rodar a v11 de novo não quebra)
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


-- ################################################################################################
-- ## schema_v12_sapatos.sql
-- ################################################################################################
-- =====================================================================
-- Vontade do Fogo: migração v12 (sapatos: equipamento dos pés)
--
-- Rode DEPOIS da v11 (schema_v11_endgame.sql), no SQL Editor do Neon (branch production), e ANTES de publicar o
-- código na main. Pode rodar de novo sem erro. O servidor novo NÃO sobe sem ela (o log do Render avisa e o Render
-- mantém a versão anterior no ar).
--
--  1. Itens do tipo 'shoes' (sapatos), vendidos na Alfaiataria. O desenho e as cores de cada um ficam no código
--     (src/realtime/items.ts e public/sprites.js).
--  2. players.equipped_shoes: o sapato calçado (só um que o jogador tem; NULL = descalço).
--  3. Todo ninja tem a Sandália Ninja calçada: os que já existem ganham aqui; os novos, no cadastro (trigger).
--  4. /admin ryo <nome> <quantidade>: o admin dá ryō a um jogador (1 a 1.000.000), com auditoria.
-- Nada aqui usa bloco anônimo de código (o SQL Editor do Neon corta o bloco).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. sapatos no catálogo

ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory'));   -- 'accessory': v14 (rodar a v12 de novo não quebra)
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('sandalia_ninja', 'Sandália Ninja',    'shoes', NULL, NULL, 80,  'clothes'),
  ('sandalia_couro', 'Sandália de Couro', 'shoes', NULL, NULL, 250, 'clothes'),
  ('botas_viagem',   'Botas de Viagem',   'shoes', NULL, NULL, 500, 'clothes'),
  ('botas_ninja',    'Botas Ninja',       'shoes', NULL, NULL, 900, 'clothes')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. sapato calçado

-- O padrão vale para quem já existe (todos ficam com a Sandália Ninja calçada) e para as contas novas.
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_shoes text DEFAULT 'sandalia_ninja' REFERENCES game.items (code);
COMMENT ON COLUMN game.players.equipped_shoes IS 'Sapato calçado (equipamento dos pés; só um que o jogador tem). NULL = descalço.';

CREATE OR REPLACE FUNCTION game.players_equipped_shoes_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_shoes IS NOT NULL AND NEW.equipped_shoes IS DISTINCT FROM OLD.equipped_shoes THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_shoes AND i.kind = 'shoes' AND pi.quantity > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para calçar um sapato do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_shoes_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_shoes_owned ON game.players;
CREATE TRIGGER trg_players_equipped_shoes_owned BEFORE UPDATE OF equipped_shoes ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_shoes_owned();

-- ---------------------------------------------------------------- 3. a Sandália Ninja no inventário de todos

-- Quem já existe: a sandália que o padrão da coluna calçou entra no inventário.
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT p.id, 'sandalia_ninja', 1 FROM game.players p
ON CONFLICT (player_id, item_code) DO NOTHING;

-- Conta nova: a sandália calçada pelo padrão da coluna entra no inventário.
CREATE OR REPLACE FUNCTION game.players_after_insert_v12() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_shoes IS NOT NULL THEN
    INSERT INTO player_items (player_id, item_code, quantity) VALUES (NEW.id, NEW.equipped_shoes, 1)
    ON CONFLICT (player_id, item_code) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_players_after_insert_v12 ON game.players;
CREATE TRIGGER trg_players_after_insert_v12 AFTER INSERT ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_after_insert_v12();

-- ---------------------------------------------------------------- 4. /admin ryo <nome> <quantidade>

-- Confere is_admin de novo e grava a auditoria na mesma transação (como as outras game.admin_*, migração v8).
CREATE OR REPLACE FUNCTION game.admin_give_ryo(p_admin uuid, p_target uuid, p_amount bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_ryo bigint;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'Ryō de 1 a 1.000.000' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_ryo';
  END IF;
  UPDATE players SET ryo = ryo + p_amount WHERE id = p_target RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  PERFORM admin_log(p_admin, 'giveryo', p_target, jsonb_build_object('amount', p_amount), true, NULL);
  RETURN v_ryo;
END $$;

COMMIT;


-- ################################################################################################
-- ## schema_v13_sem_pedra.sql
-- ################################################################################################
-- v13: a Vila da Pedra (vila_2) sai do jogo. Ficam a Folha, a Névoa, a Nuvem e a Areia (Victor, 25/10/2026).
--
-- Quando foi decidido ninguém era da Pedra, mas a migração não confia nisso: quem estiver lá vai para a Folha e
-- ganha de volta a troca de vila (pode ir para a Névoa, a Nuvem ou a Areia). O Kage, a eleição, a diplomacia, as
-- denúncias e o histórico do Kage da Pedra são apagados, e por fim a própria vila.
--
-- Regras do SQL Editor do Neon (DEPLOY.md): sem bloco DO, tudo dentro de BEGIN/COMMIT. Pode rodar de novo: na
-- segunda vez nada casa com 'vila_2' e nada muda.
--
-- Banco sem a v11 (erro column "village" does not exist): rode a v11 no lugar desta. Ela já cria só as quatro vilas.

BEGIN;

-- 1. Os ninjas: a vila, a vila de onde o renegado saiu e a bandana do visual.
UPDATE game.players SET village = 'vila_1', village_switches = 0 WHERE village = 'vila_2';
UPDATE game.players SET renegade_from = 'vila_1' WHERE renegade_from = 'vila_2';
UPDATE game.players SET appearance = jsonb_set(appearance, '{village}', '"vila_1"') WHERE appearance ->> 'village' = 'vila_2';

-- 2. Kage e eleição (os votos saem junto com a eleição: ON DELETE CASCADE).
DELETE FROM game.village_kages WHERE village = 'vila_2';
DELETE FROM game.kage_elections WHERE village = 'vila_2';

-- 3. Diplomacia, eventos, denúncias e o registro do que o Kage da Pedra fez.
DELETE FROM game.village_relations WHERE 'vila_2' IN (village_a, village_b, declared_by);
DELETE FROM game.village_pair_changes WHERE 'vila_2' IN (village_a, village_b);
DELETE FROM game.diplomacy_proposals WHERE 'vila_2' IN (from_village, to_village);
DELETE FROM game.world_events WHERE village_a = 'vila_2' OR village_b = 'vila_2';
DELETE FROM game.kage_actions WHERE village = 'vila_2' OR target_village = 'vila_2';
DELETE FROM game.village_reports WHERE village = 'vila_2';

-- 4. A vila.
DELETE FROM game.villages WHERE code = 'vila_2';
COMMENT ON TABLE game.villages IS 'As quatro vilas: Folha, Névoa, Nuvem e Areia (os nomes mudam aqui e em src/realtime/villages.ts). A Pedra (vila_2) saiu na v13.';

COMMIT;


-- ################################################################################################
-- ## schema_v14_acessorio.sql
-- ################################################################################################
-- =====================================================================
-- Vontade do Fogo: migração v14 (acessório: o casaco com capuz vira item)
--
-- Rode DEPOIS da v13 (schema_v13_sem_pedra.sql), no SQL Editor do Neon (branch production), e ANTES de publicar o
-- código na main. Pode rodar de novo sem erro. O servidor novo NÃO sobe sem ela (o log do Render avisa e o Render
-- mantém a versão anterior no ar).
--
--  1. Itens do tipo 'accessory' (acessório), vendidos na Alfaiataria: os casacos com capuz. Ficam POR CIMA da roupa
--     equipada (camisa e calça ou o conjunto da vila). O desenho e a cor de cada um ficam no código
--     (src/realtime/items.ts e public/rigArt.js).
--  2. players.equipped_accessory: o acessório equipado (só um que o jogador tem; NULL = nenhum).
--  3. Quem tinha escolhido "Casaco com capuz" como roupa no Criador (v26) ganha o casaco da mesma cor, já equipado, e a
--     roupa volta para "Camisa e calça".
-- Nada aqui usa bloco anônimo de código (o SQL Editor do Neon corta o bloco).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. acessórios no catálogo

ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory'));
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('casaco_petroleo', 'Casaco com Capuz (petróleo)', 'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_preto',    'Casaco com Capuz (preto)',    'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_vinho',    'Casaco com Capuz (vinho)',    'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_verde',    'Casaco com Capuz (verde)',    'accessory', NULL, NULL, 1200, 'clothes')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. acessório equipado

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_accessory text REFERENCES game.items (code);
COMMENT ON COLUMN game.players.equipped_accessory IS 'Acessório equipado (por cima da roupa; só um que o jogador tem). NULL = nenhum.';

CREATE OR REPLACE FUNCTION game.players_equipped_accessory_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_accessory IS NOT NULL AND NEW.equipped_accessory IS DISTINCT FROM OLD.equipped_accessory THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_accessory AND i.kind = 'accessory' AND pi.quantity > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para equipar um acessório do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_accessory_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_accessory_owned ON game.players;
CREATE TRIGGER trg_players_equipped_accessory_owned BEFORE UPDATE OF equipped_accessory ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_accessory_owned();

-- ---------------------------------------------------------------- 3. quem usava o casaco como roupa (v26)

-- O casaco da cor que estava na roupa (petróleo, preto, vinho ou verde; outra cor vira o petróleo) entra no inventário.
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT p.id,
       CASE p.appearance->>'shirtColor' WHEN 'preto' THEN 'casaco_preto' WHEN 'vinho' THEN 'casaco_vinho'
                                        WHEN 'verde_escuro' THEN 'casaco_verde' ELSE 'casaco_petroleo' END,
       1
  FROM game.players p
 WHERE p.appearance->>'outfit' = 'casaco'
ON CONFLICT (player_id, item_code) DO NOTHING;

-- Equipa esse casaco (o gatilho do item 2 confere que ele está no inventário).
UPDATE game.players p
   SET equipped_accessory = CASE p.appearance->>'shirtColor' WHEN 'preto' THEN 'casaco_preto' WHEN 'vinho' THEN 'casaco_vinho'
                                                            WHEN 'verde_escuro' THEN 'casaco_verde' ELSE 'casaco_petroleo' END
 WHERE p.appearance->>'outfit' = 'casaco' AND p.equipped_accessory IS NULL;

-- A roupa volta para "Camisa e calça" (o casaco agora é acessório). Com a cor petróleo, a camisa fica azul-marinho.
UPDATE game.players p
   SET appearance = jsonb_set(
         jsonb_set(p.appearance::jsonb, '{outfit}', '"basica"'),
         '{shirtColor}', CASE WHEN p.appearance->>'shirtColor' IN ('petroleo', 'ameixa') THEN '"azul_marinho"'::jsonb
                              ELSE to_jsonb(p.appearance->>'shirtColor') END)
 WHERE p.appearance->>'outfit' = 'casaco';

COMMIT;


-- ################################################################################################
-- ## schema_v15_rankeado.sql
-- ################################################################################################
-- =====================================================================================================================
-- v15: modo rankeado (Vale das Estátuas). Rode no SQL Editor do Neon, no branch `production`, ANTES de publicar o
-- código. Pode rodar de novo sem erro (avisos "already exists, skipping" são normais). Só cria coisas novas.
--
--  1. Temporadas do rankeado (60 dias), separadas das da Zona de Conflito.
--  2. Pontos (MMR) do rankeado: geral (para sempre) e por temporada. Começa em 1000.
--  3. Cada partida e cada rodada gravadas (quem venceu, placar, dano, duração, versão da tabela de equilíbrio).
--  4. game.ranked_result: grava a partida, mexe nos pontos e paga a recompensa da partida (30 ryō para quem vence e
--     10 para quem perde, só quando conta pontos) numa transação só. Elo com K = 24 e o fator do novato
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

DROP FUNCTION IF EXISTS game.ranked_result(uuid, uuid, integer, integer, text, integer, text, jsonb);
CREATE OR REPLACE FUNCTION game.ranked_result(
  p_winner uuid, p_loser uuid, p_winner_rounds integer, p_loser_rounds integer, p_reason text,
  p_duration_ms integer, p_version text, p_rounds jsonb)
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer, winner_mmr integer, loser_mmr integer, season_id integer,
               winner_ryo integer, loser_ryo integer)
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
  counted := false; winner_delta := 0; loser_delta := 0; winner_ryo := 0; loser_ryo := 0;
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
      -- recompensa da partida
      winner_ryo := 30; loser_ryo := 10;
      UPDATE players SET ryo = ryo + winner_ryo WHERE id = p_winner;
      UPDATE players SET ryo = ryo + loser_ryo WHERE id = p_loser;
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


-- ################################################################################################
-- ## schema_v16_jutsus_fogo.sql
-- ################################################################################################
-- =====================================================================================================================
-- v16: Jutsus v2, entrega 2 (o Fogo novo). Rode no SQL Editor do Neon, no branch `production`. Pode rodar de novo sem
-- erro. Mexe no catálogo game.jutsus e na regra dos kits (game.valid_kit):
--
--  1. 7 jutsus de Fogo novos (códigos novos). A Extração (game.extract_jutsu, v10) já sorteia entre todos os jutsus do
--     mesmo tier que o ninja ainda não tem: com estes, o tier 1 tem 4 jutsus, o tier 2 tem 4 e o tier 3 tem 2.
--  2. Os nomes novos de fire_2, fire_3 e fire_4 (os códigos ficam: quem já tem continua com eles, no kit e no uso).
--  3. game.valid_kit (a regra dos kits, v7) passa a aceitar os códigos novos. Sem isso, salvar um kit com um jutsu
--     novo dá erro (a lista da v7 é escrita à mão). A lista já tem os 72 códigos (também os da v18), para rodar a v16
--     de novo depois da v18 não encolher a regra. Ela só cresce: todo kit de hoje continua valendo.
--
-- Nenhum código é renomeado nem apagado; nada de quem já jogava muda (o uso e o nível de cada jutsu ficam).
-- =====================================================================================================================
BEGIN;

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
  ('fire',           'Fogo',                     'fire', 1),
  ('fire_endan',     'Sopro Incinerador',        'fire', 1),
  ('fire_kasumi',    'Névoa Inflamável',         'fire', 1),
  ('fire_hibashiri', 'Linha de Fogo Rasante',    'fire', 1),
  ('fire_2',         'Chamas da Fênix',          'fire', 2),
  ('fire_ryuka',     'Chamas do Dragão Guiado',  'fire', 2),
  ('fire_haiseki',   'Nuvem de Cinzas Ardentes', 'fire', 2),
  ('fire_lamina',    'Lâmina de Fogo',           'fire', 2),
  ('fire_3',         'Destruição Magnífica',     'fire', 3),
  ('fire_hotan',     'Míssil Dragão de Fogo',    'fire', 3),
  ('fire_4',         'Chuva de Meteoros',        'fire', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
    'teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4',
    'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2',
    'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3',
    'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3',
    'lightning_4', 'wind', 'wind_2', 'wind_3', 'wind_4', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka',
    'fire_haiseki', 'fire_lamina', 'fire_hotan', 'water_dragao', 'water_xarope', 'lightning_corrente',
    'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo', 'stone_pilares', 'stone_rocha',
    'stone_toupeira', 'stone_punho', 'heal_desintox', 'heal_bisturi', 'heal_aura', 'weapons_multi', 'weapons_kunai',
    'weapons_dragoes', 'illusion_kai', 'illusion_estaca', 'illusion_templo', 'taijutsu_rasteira',
    'taijutsu_ascendente', 'taijutsu_lotus', 'taijutsu_portoes', 'shadow_recuo', 'shadow_estrangular',
    'shadow_agarre', 'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha', 'heal_palma',
    'weapons_gigante', 'water_muro', 'stone_muralha', 'water_clone', 'stone_golem', 'wind_shuriken', 'wind_veu',
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao', 'rubro_lua',
    'rubro_completo', 'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT tier, count(*) FROM game.jutsus WHERE class_code = 'fire' GROUP BY tier ORDER BY tier;   -- 1:4  2:4  3:2  4:1
-- SELECT count(*) FROM game.jutsus;                                                                -- 45 (72 depois da v18)
-- SELECT game.valid_kit(ARRAY['fire_endan', 'fire_lamina', 'fire_3', 'fire_4']);                  -- true


-- ################################################################################################
-- ## schema_v17_nomes.sql
-- ################################################################################################
-- =====================================================================================================================
-- v17: Fase 1 do roadmap (nomes). O jogo passa a se chamar Herança do Fogo e as quatro vilas viram as quatro aldeias.
-- Rode no SQL Editor do Neon, no branch `production`. Pode rodar de novo sem erro. Só troca NOMES: os códigos das vilas
-- (vila_1, vila_3, vila_4, vila_5) não mudam, então ninguém muda de vila, de Kage, de diplomacia nem de nada.
--
--   vila_1  Folha  -> Chama Eterna
--   vila_3  Névoa  -> Maré Oculta
--   vila_4  Nuvem  -> Vento Cortante   (corrigido na v22: a v17 original trocava Nuvem e Areia)
--   vila_5  Areia  -> Rocha Antiga
--
-- Banco sem a v11 (o fim de jogo, que é opcional): a tabela game.villages não existe e esta migração não faz nada (os
-- nomes que o jogador vê vêm do código). Por isso ela usa uma função temporária, criada, chamada e apagada aqui.
-- =====================================================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION game._migrar_v17() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('game.villages') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'UPDATE game.villages SET name = ''Chama Eterna'' WHERE code = ''vila_1''';
  EXECUTE 'UPDATE game.villages SET name = ''Maré Oculta'' WHERE code = ''vila_3''';
  EXECUTE 'UPDATE game.villages SET name = ''Vento Cortante'' WHERE code = ''vila_4''';
  EXECUTE 'UPDATE game.villages SET name = ''Rocha Antiga'' WHERE code = ''vila_5''';
END $$;

SELECT game._migrar_v17();
DROP FUNCTION game._migrar_v17();

COMMIT;

-- Conferência (opcional; só existe com a v11):
-- SELECT code, name FROM game.villages ORDER BY sort_order;   -- Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga


-- ################################################################################################
-- ## schema_v18_jutsus_classes.sql
-- ################################################################################################
-- =====================================================================================================================
-- v18: Jutsus v2, entrega 5 (as outras classes, a classe Vento e os jutsus de sistema próprio). Rode no SQL Editor do Neon, no branch `production`, depois da v16.
-- Pode rodar de novo sem erro. Mexe no catálogo game.jutsus e na regra dos kits (game.valid_kit):
--
--  1. 68 jutsus em game.jutsus: os 45 novos (códigos novos) e os nomes novos dos tiers 2 a 4 de Água, Relâmpago,
--     Terra, Médico, Armas, Ilusão, Taijutsu e Sombra (os códigos ficam: quem já tem continua com eles, com o uso e o
--     nível). A Extração (game.extract_jutsu, v10) passa a sortear entre eles.
--  2. game.valid_kit aceita os 100 códigos do jogo. A lista só cresce: todo kit de hoje continua valendo.
--
-- Nenhum código é renomeado nem apagado.
-- =====================================================================================================================
BEGIN;

-- a classe Vento (a 10ª) e o pergaminho dela, antes dos jutsus (chave estrangeira)
INSERT INTO game.classes (code, name, icon, sort_order) VALUES
  ('wind', 'Vento', '🌪️', 10)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('scroll_wind', 'Pergaminho de Vento', 'scroll', 'wind', NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
  ('heal_2', 'Punho Sísmico', 'heal', 2),
  ('heal_3', 'Regeneração de Área', 'heal', 3),
  ('heal_4', 'Renovação Celular', 'heal', 4),
  ('shadow_2', 'Agulhas de Sombra', 'shadow', 2),
  ('shadow_3', 'Lâmina Umbral', 'shadow', 3),
  ('shadow_4', 'Domínio das Sombras', 'shadow', 4),
  ('illusion_2', 'Visão do Abismo', 'illusion', 2),
  ('illusion_3', 'Raízes do Pesadelo', 'illusion', 3),
  ('illusion_4', 'Ciclo Sem Fim', 'illusion', 4),
  ('stone_2', 'Lamaçal Profundo', 'stone', 2),
  ('stone_3', 'Esmagamento de Paredes', 'stone', 3),
  ('water_2', 'Estouro de Maré', 'water', 2),
  ('water_3', 'Cárcere Líquido', 'water', 3),
  ('water_4', 'Prisão do Vórtice', 'water', 4),
  ('taijutsu_2', 'Chute Ciclone', 'taijutsu', 2),
  ('taijutsu_3', 'Cem Golpes', 'taijutsu', 3),
  ('taijutsu_4', 'Punho do Céu', 'taijutsu', 4),
  ('weapons_2', 'Lâminas Flutuantes', 'weapons', 2),
  ('weapons_3', 'Corte Relâmpago', 'weapons', 3),
  ('weapons_4', 'Dança dos Mil Cortes', 'weapons', 4),
  ('lightning_2', 'Farpas de Trovão', 'lightning', 2),
  ('lightning_3', 'Investida Elétrica', 'lightning', 3),
  ('lightning_4', 'Julgamento do Trovão', 'lightning', 4),
  ('wind', 'Rajada Aberta', 'wind', 1),
  ('wind_2', 'Balas de Vento', 'wind', 2),
  ('wind_3', 'Tornado Cortante', 'wind', 3),
  ('wind_4', 'Disco do Furacão', 'wind', 4),
  ('water_dragao', 'Serpente d’Água', 'water', 1),
  ('water_xarope', 'Poça Viscosa', 'water', 2),
  ('lightning_corrente', 'Corrente Rasteira', 'lightning', 1),
  ('lightning_shuriken', 'Shuriken do Trovão', 'lightning', 1),
  ('lightning_impulso', 'Impulso Estático', 'lightning', 1),
  ('lightning_raio', 'Lança Saltadora', 'lightning', 2),
  ('lightning_fluxo', 'Descarga Envolvente', 'lightning', 2),
  ('stone_pilares', 'Prisão de Pilares', 'stone', 1),
  ('stone_rocha', 'Projétil de Rocha', 'stone', 1),
  ('stone_toupeira', 'Escavação Furtiva', 'stone', 1),
  ('stone_punho', 'Punho de Rocha', 'stone', 2),
  ('heal_desintox', 'Desintoxicação Celular', 'heal', 1),
  ('heal_bisturi', 'Corte Cirúrgico', 'heal', 1),
  ('heal_aura', 'Aura de Regeneração', 'heal', 1),
  ('weapons_multi', 'Shuriken Espelhada', 'weapons', 1),
  ('weapons_kunai', 'Kunai Explosiva', 'weapons', 3),
  ('weapons_dragoes', 'Ascensão Dupla', 'weapons', 4),
  ('illusion_kai', 'Dissipação', 'illusion', 1),
  ('illusion_estaca', 'Estaca da Ilusão', 'illusion', 2),
  ('illusion_templo', 'Santuário das Penas', 'illusion', 4),
  ('taijutsu_rasteira', 'Rasteira Baixa', 'taijutsu', 1),
  ('taijutsu_ascendente', 'Chute Ascendente', 'taijutsu', 2),
  ('taijutsu_lotus', 'Mergulho Esmagador', 'taijutsu', 3),
  ('taijutsu_portoes', 'Despertar do Corpo', 'taijutsu', 4),
  ('shadow_recuo', 'Reflexo Tático', 'shadow', 1),
  ('shadow_estrangular', 'Garrote de Sombra', 'shadow', 3),
  ('shadow_agarre', 'Rede de Sombra', 'shadow', 4),
  ('water_nevoa', 'Véu de Bruma', 'water', 1),
  ('illusion_noite', 'Noite Eterna', 'illusion', 3),
  ('heal_disturbio', 'Descontrole Muscular', 'heal', 2),
  ('shadow_armadilha', 'Sombra Oculta', 'shadow', 2),
  ('heal_palma', 'Palma Curadora', 'heal', 1),
  ('weapons_gigante', 'Shuriken Colossal', 'weapons', 2),
  ('water_muro', 'Muro de Água', 'water', 1),
  ('stone_muralha', 'Muralha de Terra', 'stone', 1),
  ('water_clone', 'Duplo de Água', 'water', 2),
  ('stone_golem', 'Golem de Terra Titânico', 'stone', 4),
  ('wind_shuriken', 'Shuriken do Vento', 'wind', 1),
  ('wind_veu', 'Véu de Vento', 'wind', 1),
  ('wind_salto', 'Passo Aéreo', 'wind', 1),
  ('wind_arco', 'Lâmina em Arco', 'wind', 2)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
    'teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4',
    'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2',
    'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3',
    'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3',
    'lightning_4', 'wind', 'wind_2', 'wind_3', 'wind_4', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka',
    'fire_haiseki', 'fire_lamina', 'fire_hotan', 'water_dragao', 'water_xarope', 'lightning_corrente',
    'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo', 'stone_pilares', 'stone_rocha',
    'stone_toupeira', 'stone_punho', 'heal_desintox', 'heal_bisturi', 'heal_aura', 'weapons_multi', 'weapons_kunai',
    'weapons_dragoes', 'illusion_kai', 'illusion_estaca', 'illusion_templo', 'taijutsu_rasteira',
    'taijutsu_ascendente', 'taijutsu_lotus', 'taijutsu_portoes', 'shadow_recuo', 'shadow_estrangular',
    'shadow_agarre', 'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha', 'heal_palma',
    'weapons_gigante', 'water_muro', 'stone_muralha', 'water_clone', 'stone_golem', 'wind_shuriken', 'wind_veu',
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao', 'rubro_lua',
    'rubro_completo', 'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                                               -- 90
-- SELECT class_code, count(*) FROM game.jutsus GROUP BY class_code ORDER BY class_code;
-- SELECT game.valid_kit(ARRAY['water_dragao', 'stone_pilares', 'heal_aura', 'shadow_4']);         -- true


-- ################################################################################################
-- ## schema_v19_clas.sql
-- ################################################################################################
-- =====================================================================================================================
-- v19: os clãs (linhagem). Rode no SQL Editor do Neon, no branch `production`, depois da v18. Pode rodar de novo sem erro.
--
--  1. game.players.clan: a linhagem do ninja (rubro, umbra ou andarilho; NULL = ainda não despertou). O despertar é a
--     partir de Genin, no nível 11, e é uma vez só.
--  2. game.jutsus.clan_code: jutsu de clã (não sai na Extração; chega pelo nível depois do despertar). A regra
--     "sem classe = Academia (tier 0)" passa a valer para "sem classe e sem clã".
--  3. Os 4 jutsus do Clã Rubro. O Clã Umbra usa a árvore das sombras que já existe.
-- =====================================================================================================================
BEGIN;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS clan text;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_clan;
ALTER TABLE game.players ADD CONSTRAINT ck_players_clan CHECK (clan IS NULL OR clan IN ('rubro', 'umbra', 'andarilho'));

ALTER TABLE game.jutsus ADD COLUMN IF NOT EXISTS clan_code text;
ALTER TABLE game.jutsus DROP CONSTRAINT IF EXISTS ck_jutsus_clan;
ALTER TABLE game.jutsus ADD CONSTRAINT ck_jutsus_clan CHECK (clan_code IS NULL OR clan_code IN ('rubro', 'umbra'));
ALTER TABLE game.jutsus DROP CONSTRAINT IF EXISTS ck_jutsus_academy;
ALTER TABLE game.jutsus ADD CONSTRAINT ck_jutsus_academy CHECK ((class_code IS NULL AND clan_code IS NULL) = (tier = 0));

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('rubro_olho',     'Olho da Percepção',  NULL, 'rubro', 1),
  ('rubro_transe',   'Transe Ocular',      NULL, 'rubro', 2),
  ('rubro_chamas',   'Chamas Negras',      NULL, 'rubro', 3),
  ('rubro_guardiao', 'Guardião Espectral', NULL, 'rubro', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, clan_code = EXCLUDED.clan_code, tier = EXCLUDED.tier;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, tier FROM game.jutsus WHERE clan_code = 'rubro' ORDER BY tier;   -- 4 linhas
-- SELECT count(*) FROM game.players WHERE clan IS NOT NULL;                           -- 0 logo depois de rodar


-- ################################################################################################
-- ## schema_v20_extracao.sql
-- ################################################################################################
-- =====================================================================================================================
-- v20: Extração do design final (Fase 0). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v19.
-- Pode rodar de novo sem erro. Só troca a função game.extract_jutsu (mesmos parâmetros e o mesmo retorno da v10).
--
--   Tier  Pergaminhos  Chance
--   1     1            as 2 primeiras de cada classe garantidas, depois 90%
--   2     2            80%
--   3     3            60%
--   4     4            40%
--
-- "As 2 primeiras garantidas": enquanto o jogador sabe menos de 2 jutsus de tier 1 daquela classe, a chance é 100%.
-- A proteção contra azar (v10) continua: +10 pontos por falha seguida na mesma classe e no mesmo tier, até 100%.
-- Ninguém perde nada: os jutsus aprendidos e as falhas guardadas (game.player_extraction_pity) ficam como estão.
--
-- Também entra o que faltou na v19: os 2 jutsus do Clã Rubro do nível 60 (Lua Ilusória e Guardião Espectral Completo)
-- no catálogo game.jutsus, e a regra dos kits (game.valid_kit) com todos os códigos do jogo (a lista só cresce).
-- =====================================================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost     integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 END;
  v_base     double precision := CASE p_level WHEN 1 THEN 0.9 WHEN 2 THEN 0.8 WHEN 3 THEN 0.6 WHEN 4 THEN 0.4 END;
  v_failures integer;
  v_chance   double precision;
  v_have     integer;
  v_count    integer;
  v_learned  integer;
  v_code     text;
BEGIN
  IF v_cost IS NULL OR p_roll < 0 OR p_roll >= 1 OR p_pick < 0 OR p_pick >= 1 THEN
    RAISE EXCEPTION 'Extração inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_extraction_input';
  END IF;
  PERFORM 1 FROM players WHERE id = p_player FOR UPDATE;    -- uma extração por vez por jogador
  PERFORM 1 FROM player_classes WHERE player_id = p_player AND p_class IN (primary_class, secondary_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você só aprende jutsus da sua classe' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_not_owned';
  END IF;
  SELECT count(*) INTO v_count FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code);
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  END IF;
  SELECT COALESCE((SELECT failures FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level), 0)
    INTO v_failures;
  SELECT count(*) INTO v_learned FROM player_jutsus pj JOIN jutsus j ON j.code = pj.jutsu_code
   WHERE pj.player_id = p_player AND j.class_code = p_class AND j.tier = p_level;
  IF p_level = 1 AND v_learned < 2 THEN
    v_chance := 1.0;                                         -- as 2 primeiras do tier 1 são garantidas
  ELSE
    v_chance := least(1.0, v_base + 0.1 * v_failures);
  END IF;
  IF p_roll >= v_chance THEN
    INSERT INTO player_extraction_pity (player_id, class_code, tier, failures) VALUES (p_player, p_class, p_level, 1)
    ON CONFLICT (player_id, class_code, tier) DO UPDATE SET failures = player_extraction_pity.failures + 1;
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  DELETE FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('rubro_lua',      'Lua Ilusória',                NULL, 'rubro', 4),
  ('rubro_completo', 'Guardião Espectral Completo', NULL, 'rubro', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, clan_code = EXCLUDED.clan_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
    'teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4',
    'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2',
    'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3',
    'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3',
    'lightning_4', 'wind', 'wind_2', 'wind_3', 'wind_4', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka',
    'fire_haiseki', 'fire_lamina', 'fire_hotan', 'water_dragao', 'water_xarope', 'lightning_corrente',
    'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo', 'stone_pilares', 'stone_rocha',
    'stone_toupeira', 'stone_punho', 'heal_desintox', 'heal_bisturi', 'heal_aura', 'weapons_multi', 'weapons_kunai',
    'weapons_dragoes', 'illusion_kai', 'illusion_estaca', 'illusion_templo', 'taijutsu_rasteira',
    'taijutsu_ascendente', 'taijutsu_lotus', 'taijutsu_portoes', 'shadow_recuo', 'shadow_estrangular',
    'shadow_agarre', 'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha', 'heal_palma',
    'weapons_gigante', 'water_muro', 'stone_muralha', 'water_clone', 'stone_golem', 'wind_shuriken', 'wind_veu',
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao', 'rubro_lua',
    'rubro_completo', 'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                         -- 96
-- Deve mostrar "WHEN 3 THEN 3" (o tier 3 custa 3 pergaminhos).
-- SELECT position('WHEN 3 THEN 3' IN prosrc) > 0 AS v20 FROM pg_proc WHERE proname = 'extract_jutsu';


-- ################################################################################################
-- ## schema_v21_nomes_jutsus.sql
-- ################################################################################################
-- =====================================================================================================================
-- v21: Fase 1 (nomes). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v20. Pode rodar de novo sem erro.
-- Só troca NOMES EXIBIDOS: os códigos (fire_2, rubro_chamas, manto_akatsuki...) não mudam, então ninguém perde jutsu,
-- uso, nível, kit nem item. Os nomes saem do documento docs/fase1-renomeacao.md (opções recomendadas, aprovadas pelo Victor).
--
--  1. 38 jutsus de tradução direta de golpes da série ganham nome original (game.jutsus.name).
--  2. O Manto da Akatsuki vira Manto Cinza (game.items.name). A organização passa a se chamar "Os Cinzas" na tela;
--     o nome interno (akatsuki) continua nas tabelas e funções.
--
-- Atenção: rodar a v16, a v18, a v19 ou a v20 de novo devolve o nome antigo de alguns jutsus; se rodar, rode a v21 outra vez.
-- =====================================================================================================================
BEGIN;

UPDATE game.jutsus AS j SET name = v.name
  FROM (VALUES
  ('rubro_chamas', 'Brasa Sem Luz'),
  ('rubro_lua', 'Mundo Espelhado'),
  ('rubro_guardiao', 'Sentinela Espectral'),
  ('rubro_completo', 'Colosso Espectral'),
  ('rubro_olho', 'Olhar Rubro'),
  ('heal_palma', 'Palma Curadora'),
  ('heal_bisturi', 'Corte Cirúrgico'),
  ('heal_disturbio', 'Descontrole Muscular'),
  ('heal_4', 'Renovação Celular'),
  ('shadow_2', 'Agulhas de Sombra'),
  ('shadow_3', 'Lâmina Umbral'),
  ('shadow_estrangular', 'Garrote de Sombra'),
  ('shadow_agarre', 'Rede de Sombra'),
  ('illusion_templo', 'Santuário das Penas'),
  ('illusion_3', 'Raízes do Pesadelo'),
  ('illusion_4', 'Ciclo Sem Fim'),
  ('stone_2', 'Lamaçal Profundo'),
  ('stone_toupeira', 'Escavação Furtiva'),
  ('fire_2', 'Revoada de Brasas'),
  ('fire_3', 'Varredura Flamejante'),
  ('fire_hotan', 'Projétil Dracônico'),
  ('fire_haiseki', 'Cinzas Detonantes'),
  ('fire_ryuka', 'Lança de Fogo'),
  ('water_dragao', 'Serpente d’Água'),
  ('water_clone', 'Duplo de Água'),
  ('water_3', 'Cárcere Líquido'),
  ('water_nevoa', 'Véu de Bruma'),
  ('water_2', 'Estouro de Maré'),
  ('water_xarope', 'Poça Viscosa'),
  ('weapons_dragoes', 'Ascensão Dupla'),
  ('weapons_gigante', 'Shuriken Colossal'),
  ('weapons_multi', 'Shuriken Espelhada'),
  ('lightning_2', 'Farpas de Trovão'),
  ('lightning_fluxo', 'Descarga Envolvente'),
  ('lightning_4', 'Julgamento do Trovão'),
  ('wind_2', 'Balas de Vento'),
  ('wind', 'Rajada Aberta'),
  ('wind_4', 'Disco do Furacão')
  ) AS v(code, name)
 WHERE j.code = v.code AND j.name IS DISTINCT FROM v.name;

UPDATE game.items SET name = 'Manto Cinza' WHERE code = 'manto_akatsuki' AND name IS DISTINCT FROM 'Manto Cinza';

COMMIT;

-- Conferência (opcional): deve dar 38 (os jutsus com o nome novo) e Manto Cinza.
-- SELECT count(*) FROM game.jutsus WHERE name IN ('Brasa Sem Luz', 'Mundo Espelhado', 'Colosso Espectral', 'Duplo de Água', 'Disco do Furacão');   -- 5
-- SELECT name FROM game.items WHERE code = 'manto_akatsuki';


-- ################################################################################################
-- ## schema_v22_aldeias.sql
-- ################################################################################################
-- =====================================================================================================================
-- v22: correção das aldeias Nuvem e Areia (Fase 1). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v21.
-- Pode rodar de novo sem erro. Só troca NOMES: os códigos das vilas (vila_4, vila_5) não mudam, então ninguém muda de
-- vila, de Kage, de diplomacia nem de nada.
--
-- A v17 trocou Nuvem e Areia. O documento canônico (docs/endgame-visao.md) diz:
--
--   vila_4  Nuvem  -> Aldeia do Vento Cortante   (vento)
--   vila_5  Areia  -> Aldeia da Rocha Antiga     (terra)
--
-- Banco sem a v11 (o fim de jogo, opcional): a tabela game.villages não existe e esta migração não faz nada (os nomes que
-- o jogador vê vêm do código). Por isso ela usa uma função temporária, criada, chamada e apagada aqui.
-- =====================================================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION game._migrar_v22() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('game.villages') IS NULL THEN
    RETURN;
  END IF;
  -- o nome da vila é único: trocar os dois de uma vez dá conflito, então passa por nomes temporários (só se ainda faltar corrigir)
  IF (SELECT count(*) FROM game.villages WHERE (code = 'vila_4' AND name = 'Vento Cortante') OR (code = 'vila_5' AND name = 'Rocha Antiga')) < 2 THEN
    EXECUTE 'UPDATE game.villages SET name = ''v22_tmp_4'' WHERE code = ''vila_4''';
    EXECUTE 'UPDATE game.villages SET name = ''v22_tmp_5'' WHERE code = ''vila_5''';
    EXECUTE 'UPDATE game.villages SET name = ''Vento Cortante'' WHERE code = ''vila_4''';
    EXECUTE 'UPDATE game.villages SET name = ''Rocha Antiga'' WHERE code = ''vila_5''';
  END IF;
END $$;

SELECT game._migrar_v22();
DROP FUNCTION game._migrar_v22();

COMMIT;

-- Conferência (opcional; só existe com a v11):
-- SELECT code, name FROM game.villages ORDER BY sort_order;   -- Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga


-- ################################################################################################
-- ## schema_v23_admin_patente.sql
-- ################################################################################################
-- =====================================================================================================================
-- v23: o admin muda a patente (rank) de qualquer jogador, ele mesmo incluso. Rode no SQL Editor do Neon, no branch
-- `production`, DEPOIS da v22. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. Entra a patente ANBU em game.ranks (tier 55: entre o Jonin e o Kage). Hoje é só uma patente (o nome no jogo); as regras do
--     ANBU (indicação do Kage, armas, máscaras) são da Fase 2.
--  2. game.admin_set_rank(admin, alvo, patente): confere is_admin, troca players.current_rank_id e grava a auditoria na mesma
--     transação. Aceita ACADEMY, GENIN, CHUNIN, JONIN, ANBU e HOKAGE (o nome na tela é "Kage"). O histórico de patentes
--     (game.player_rank_changes) é gravado pelo gatilho de sempre.
--
--  3. game.become_genin: a Missão de Genin (classe Primária) só se faz uma vez... EXCETO para admin. Admin que voltou para a Academia
--     (/admin patente) refaz a missão quantas vezes quiser, para testar: a classe Primária é trocada pela nova (a Secundária é
--     limpa, porque não pode ser igual à Primária) e ele ganha de novo 1 pergaminho da classe escolhida. Jutsus, itens e nível ficam.
--     Para quem NÃO é admin nada muda: a Missão de Genin continua valendo uma vez só.
--
-- A patente é só o título: não mexe em nível, classe, jutsus nem no cargo de Kage da aldeia (esse é o /admin kage).
-- =====================================================================================================================
BEGIN;

INSERT INTO game.ranks (code, name, tier, can_be_sensei) VALUES ('ANBU', 'ANBU', 55, true)
ON CONFLICT (code) DO NOTHING;

DROP FUNCTION IF EXISTS game.admin_set_rank(uuid, uuid, text);
CREATE FUNCTION game.admin_set_rank(p_admin uuid, p_target uuid, p_rank text)
RETURNS TABLE (code text, name text, can_be_sensei boolean)
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_rank IS NULL OR p_rank NOT IN ('ACADEMY', 'GENIN', 'CHUNIN', 'JONIN', 'ANBU', 'HOKAGE') THEN
    RAISE EXCEPTION 'Patente desconhecida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_rank';
  END IF;
  PERFORM 1 FROM players WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  UPDATE players SET current_rank_id = (SELECT r.id FROM ranks r WHERE r.code = p_rank) WHERE id = p_target;
  PERFORM admin_log(p_admin, 'rank', p_target, jsonb_build_object('rank', p_rank), true, NULL);
  RETURN QUERY SELECT r.code, r.name, r.can_be_sensei FROM ranks r WHERE r.code = p_rank;
END $$;

-- A mesma função da v7 (mesmos parâmetros, mesmo retorno); a única diferença é o ramo do admin ao gravar a classe.
CREATE OR REPLACE FUNCTION game.become_genin(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_player players%ROWTYPE;
  v_rank   text;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT code INTO v_rank FROM ranks WHERE id = v_player.current_rank_id;
  IF v_player.tutorial_step < 4 THEN
    RAISE EXCEPTION 'Conclua o tutorial da Academia primeiro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tutorial_first';
  END IF;
  IF v_player.level < (SELECT min_level FROM ranks WHERE code = 'GENIN') THEN
    RAISE EXCEPTION 'A Missão de Genin é a partir do nível 11' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_level';
  END IF;
  IF v_rank <> 'ACADEMY' THEN
    RAISE EXCEPTION 'Só aluno da Academia faz a Missão de Genin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_rank';
  END IF;
  PERFORM 1 FROM classes WHERE code = p_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Classe inexistente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_unknown'; END IF;
  IF v_player.is_admin THEN
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class)
    ON CONFLICT (player_id) DO UPDATE SET primary_class = EXCLUDED.primary_class, primary_at = now(), secondary_class = NULL, secondary_at = NULL;
  ELSE
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class);   -- PK: uma vez só
  END IF;
  UPDATE players SET current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN') WHERE id = p_player;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'scroll_' || p_class, 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, tier FROM game.ranks ORDER BY tier;   -- ACADEMY, GENIN, CHUNIN, JONIN, S_JONIN, ANBU, HOKAGE (Kage)


-- ################################################################################################
-- ## schema_v24_pergaminho_unico.sql
-- ################################################################################################
-- =====================================================================================================================
-- v24: pergaminho único e reset de classes do admin. Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v23.
-- Pode rodar de novo sem erro. Nenhum pergaminho se perde.
--
--  1. Um pergaminho só (game.items 'scroll_liso', "Pergaminho"): serve para a Extração de QUALQUER classe sua. A loja vende só ele.
--     Os pergaminhos por classe de antes (scroll_fire, scroll_water...) somam no novo: quem tinha 3 de Fogo e 2 de Água fica com 5.
--     Quem levava um pergaminho de classe nas costas passa a levar o novo. Os itens antigos ficam no catálogo (sem venda), sem dono.
--  2. A Extração (game.extract_jutsu), a Missão de Genin (game.become_genin) e o prêmio do PvP (game.pvp_kill) usam o pergaminho novo.
--     A Extração continua só da sua classe Primária ou Secundária (o banco confere, como antes).
--  3. game.admin_reset_classes(admin, alvo): SÓ em conta de admin. Volta para a Academia sem classe, sem linhagem e sem os jutsus
--     de classe e de clã (os da Academia ficam), para testar a escolha de classes do zero. Nível, itens e ryō ficam. Auditado.
-- =====================================================================================================================
BEGIN;

-- 1. o pergaminho único (a regra "pergaminho tem classe" passa a valer só para os antigos)
ALTER TABLE game.items DROP CONSTRAINT IF EXISTS ck_items_scroll;
ALTER TABLE game.items ADD CONSTRAINT ck_items_scroll CHECK (class_code IS NULL OR kind = 'scroll');
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('scroll_liso', 'Pergaminho', 'scroll', NULL, NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = NULL, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;
UPDATE game.items SET shop = NULL, price_ryo = NULL, name = name || ' (antigo)'
 WHERE kind = 'scroll' AND code <> 'scroll_liso' AND shop IS NOT NULL;

-- os pergaminhos de classe viram o pergaminho único (soma; nada se perde)
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT pi.player_id, 'scroll_liso', sum(pi.quantity)::int
  FROM game.player_items pi JOIN game.items i ON i.code = pi.item_code
 WHERE i.kind = 'scroll' AND pi.item_code <> 'scroll_liso' AND pi.quantity > 0
 GROUP BY pi.player_id
ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = game.player_items.quantity + EXCLUDED.quantity;
UPDATE game.players p SET equipped_scroll = 'scroll_liso'
  FROM game.items i WHERE i.code = p.equipped_scroll AND i.kind = 'scroll' AND p.equipped_scroll <> 'scroll_liso';
DELETE FROM game.player_items pi USING game.items i
 WHERE i.code = pi.item_code AND i.kind = 'scroll' AND pi.item_code <> 'scroll_liso';

-- 2. Extração, Missão de Genin e prêmio do PvP com o pergaminho único (as mesmas funções de antes; só o item muda)
CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost     integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 END;
  v_base     double precision := CASE p_level WHEN 1 THEN 0.9 WHEN 2 THEN 0.8 WHEN 3 THEN 0.6 WHEN 4 THEN 0.4 END;
  v_failures integer;
  v_chance   double precision;
  v_have     integer;
  v_count    integer;
  v_learned  integer;
  v_code     text;
BEGIN
  IF v_cost IS NULL OR p_roll < 0 OR p_roll >= 1 OR p_pick < 0 OR p_pick >= 1 THEN
    RAISE EXCEPTION 'Extração inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_extraction_input';
  END IF;
  PERFORM 1 FROM players WHERE id = p_player FOR UPDATE;    -- uma extração por vez por jogador
  PERFORM 1 FROM player_classes WHERE player_id = p_player AND p_class IN (primary_class, secondary_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você só aprende jutsus da sua classe' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_not_owned';
  END IF;
  SELECT count(*) INTO v_count FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code);
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_liso'), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_liso';
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_liso';
  END IF;
  SELECT COALESCE((SELECT failures FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level), 0)
    INTO v_failures;
  SELECT count(*) INTO v_learned FROM player_jutsus pj JOIN jutsus j ON j.code = pj.jutsu_code
   WHERE pj.player_id = p_player AND j.class_code = p_class AND j.tier = p_level;
  IF p_level = 1 AND v_learned < 2 THEN
    v_chance := 1.0;                                         -- as 2 primeiras do tier 1 são garantidas
  ELSE
    v_chance := least(1.0, v_base + 0.1 * v_failures);
  END IF;
  IF p_roll >= v_chance THEN
    INSERT INTO player_extraction_pity (player_id, class_code, tier, failures) VALUES (p_player, p_class, p_level, 1)
    ON CONFLICT (player_id, class_code, tier) DO UPDATE SET failures = player_extraction_pity.failures + 1;
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  DELETE FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

CREATE OR REPLACE FUNCTION game.become_genin(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_player players%ROWTYPE;
  v_rank   text;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT code INTO v_rank FROM ranks WHERE id = v_player.current_rank_id;
  IF v_player.tutorial_step < 4 THEN
    RAISE EXCEPTION 'Conclua o tutorial da Academia primeiro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tutorial_first';
  END IF;
  IF v_player.level < (SELECT min_level FROM ranks WHERE code = 'GENIN') THEN
    RAISE EXCEPTION 'A Missão de Genin é a partir do nível 11' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_level';
  END IF;
  IF v_rank <> 'ACADEMY' THEN
    RAISE EXCEPTION 'Só aluno da Academia faz a Missão de Genin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_rank';
  END IF;
  PERFORM 1 FROM classes WHERE code = p_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Classe inexistente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_unknown'; END IF;
  IF v_player.is_admin THEN
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class)
    ON CONFLICT (player_id) DO UPDATE SET primary_class = EXCLUDED.primary_class, primary_at = now(), secondary_class = NULL, secondary_at = NULL;
  ELSE
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class);   -- PK: uma vez só
  END IF;
  UPDATE players SET current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN') WHERE id = p_player;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'scroll_liso', 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
END $$;

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
          SELECT p_winner, 'scroll_liso', 1 FROM player_classes c WHERE c.player_id = p_winner
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

-- 3. reset de classes, só em conta de admin (para testar builds do zero)
CREATE OR REPLACE FUNCTION game.admin_reset_classes(p_admin uuid, p_target uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_removed integer;
BEGIN
  PERFORM assert_admin(p_admin);
  PERFORM 1 FROM players WHERE id = p_target AND is_admin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O reset de classes é só para conta de admin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_reset_target';
  END IF;
  DELETE FROM player_classes WHERE player_id = p_target;
  DELETE FROM player_jutsus pj USING jutsus j
   WHERE j.code = pj.jutsu_code AND pj.player_id = p_target AND (j.class_code IS NOT NULL OR j.clan_code IS NOT NULL);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  DELETE FROM player_extraction_pity WHERE player_id = p_target;
  UPDATE players
     SET clan = NULL,
         current_rank_id = (SELECT id FROM ranks WHERE code = 'ACADEMY'),
         kit_a = ARRAY(SELECT k FROM unnest(kit_a) AS k WHERE k IN ('teleport', 'substitution')),
         kit_b = ARRAY(SELECT k FROM unnest(kit_b) AS k WHERE k IN ('teleport', 'substitution'))
   WHERE id = p_target;
  PERFORM admin_log(p_admin, 'resetclasses', p_target, jsonb_build_object('removed', v_removed), true, NULL);
  RETURN v_removed;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, shop FROM game.items WHERE kind = 'scroll' ORDER BY code;         -- scroll_liso na loja; os antigos sem loja
-- SELECT count(*) FROM game.player_items WHERE item_code LIKE 'scroll_%' AND item_code <> 'scroll_liso';   -- 0


-- ################################################################################################
-- ## schema_v25_linhagem.sql
-- ################################################################################################
-- =====================================================================================================================
-- v25 (#11): a linhagem marcada no Criador, o Rito do Despertar e os 4 jutsus do Clã Umbra. Rode no SQL Editor do Neon, no
-- branch `production`, DEPOIS da v24. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.players.clan_mark: a linhagem que o jogador marcou no Criador de Personagem (rubro, umbra ou andarilho). Só marca:
--     a árvore abre no Rito. Quem já despertou fica com a marca igual à linhagem.
--  2. game.players.rite_progress: o Rito do Despertar (NULL = não começou; 0 a 10 = Lodos Escuros derrotados).
--  3. Os 4 jutsus do Clã Umbra (escolhidos pelo Victor): Deslize Noturno, Sombra Faminta, Noite Fechada e Forma Umbral. Sem
--     classe (são do clã), tiers 1 a 4, chegam pelo nível (11, 20, 40, 60) depois do Rito. A regra dos kits aceita os códigos.
--     O Clã Umbra deixa de usar os jutsus da classe Sombra (que continua uma das 10 classes).
--  4. O reset de classes do admin também zera o Rito (a marca fica).
-- =====================================================================================================================
BEGIN;

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS clan_mark text;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_clan_mark;
ALTER TABLE game.players ADD CONSTRAINT ck_players_clan_mark CHECK (clan_mark IS NULL OR clan_mark IN ('rubro', 'umbra', 'andarilho'));
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS rite_progress smallint;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_rite_progress;
ALTER TABLE game.players ADD CONSTRAINT ck_players_rite_progress CHECK (rite_progress IS NULL OR rite_progress BETWEEN 0 AND 100);
UPDATE game.players SET clan_mark = clan WHERE clan IS NOT NULL AND clan_mark IS DISTINCT FROM clan;

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('umbra_deslize', 'Deslize Noturno', NULL, 'umbra', 1),
  ('umbra_faminta', 'Sombra Faminta',  NULL, 'umbra', 2),
  ('umbra_noite',   'Noite Fechada',   NULL, 'umbra', 3),
  ('umbra_forma',   'Forma Umbral',    NULL, 'umbra', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, clan_code = EXCLUDED.clan_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
    'teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4',
    'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2',
    'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3',
    'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3',
    'lightning_4', 'wind', 'wind_2', 'wind_3', 'wind_4', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka',
    'fire_haiseki', 'fire_lamina', 'fire_hotan', 'water_dragao', 'water_xarope', 'lightning_corrente',
    'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo', 'stone_pilares', 'stone_rocha',
    'stone_toupeira', 'stone_punho', 'heal_desintox', 'heal_bisturi', 'heal_aura', 'weapons_multi', 'weapons_kunai',
    'weapons_dragoes', 'illusion_kai', 'illusion_estaca', 'illusion_templo', 'taijutsu_rasteira',
    'taijutsu_ascendente', 'taijutsu_lotus', 'taijutsu_portoes', 'shadow_recuo', 'shadow_estrangular',
    'shadow_agarre', 'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha', 'heal_palma',
    'weapons_gigante', 'water_muro', 'stone_muralha', 'water_clone', 'stone_golem', 'wind_shuriken', 'wind_veu',
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao', 'rubro_lua',
    'rubro_completo', 'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

CREATE OR REPLACE FUNCTION game.admin_reset_classes(p_admin uuid, p_target uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_removed integer;
BEGIN
  PERFORM assert_admin(p_admin);
  PERFORM 1 FROM players WHERE id = p_target AND is_admin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O reset de classes é só para conta de admin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_reset_target';
  END IF;
  DELETE FROM player_classes WHERE player_id = p_target;
  DELETE FROM player_jutsus pj USING jutsus j
   WHERE j.code = pj.jutsu_code AND pj.player_id = p_target AND (j.class_code IS NOT NULL OR j.clan_code IS NOT NULL);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  DELETE FROM player_extraction_pity WHERE player_id = p_target;
  UPDATE players
     SET clan = NULL, rite_progress = NULL,
         current_rank_id = (SELECT id FROM ranks WHERE code = 'ACADEMY'),
         kit_a = ARRAY(SELECT k FROM unnest(kit_a) AS k WHERE k IN ('teleport', 'substitution')),
         kit_b = ARRAY(SELECT k FROM unnest(kit_b) AS k WHERE k IN ('teleport', 'substitution'))
   WHERE id = p_target;
  PERFORM admin_log(p_admin, 'resetclasses', p_target, jsonb_build_object('removed', v_removed), true, NULL);
  RETURN v_removed;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, tier FROM game.jutsus WHERE clan_code = 'umbra' ORDER BY tier;   -- 4 linhas
-- SELECT count(*) FROM game.jutsus;                                                   -- 100


-- ################################################################################################
-- ## schema_v26_tutorial_feedback.sql
-- ################################################################################################
-- =====================================================================================================================
-- v26: Pergaminho do Mestre (tutorial paginado) e Feedback dentro do jogo. Rode no SQL Editor do Neon, no branch
-- `production`, DEPOIS da v25. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.player_tutorial: os capítulos do Pergaminho do Mestre que o jogador desbloqueou e os que já leu. O prêmio
--     (50 ryō e 100 XP) sai uma vez só por capítulo: o servidor só paga quando read_at passa de NULL para a data.
--  2. game.feedback: o relato do jogador (Menu > Feedback), com a categoria, o estado (novo ou resolvido) e o contexto
--     capturado na hora (nome, nível, classe, linhagem, mapa, posição, tela aberta, aparelho). O admin vê na aba Feedback.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.player_tutorial (
  player_id   uuid        NOT NULL REFERENCES game.players(id) ON DELETE CASCADE,
  chapter     text        NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  PRIMARY KEY (player_id, chapter)
);
ALTER TABLE game.player_tutorial DROP CONSTRAINT IF EXISTS ck_player_tutorial_chapter;
ALTER TABLE game.player_tutorial ADD CONSTRAINT ck_player_tutorial_chapter CHECK (chapter ~ '^[a-z_]{2,32}$');

CREATE TABLE IF NOT EXISTS game.feedback (
  id          bigserial   PRIMARY KEY,
  player_id   uuid        REFERENCES game.players(id) ON DELETE SET NULL,
  content     text        NOT NULL,
  category    text        NOT NULL DEFAULT 'outro',
  status      text        NOT NULL DEFAULT 'novo',
  context     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid        REFERENCES game.players(id) ON DELETE SET NULL
);
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_content;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_content CHECK (char_length(content) BETWEEN 3 AND 1500);
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_category;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_category CHECK (category IN ('bug', 'sugestao', 'balanceamento', 'outro'));
ALTER TABLE game.feedback DROP CONSTRAINT IF EXISTS ck_feedback_status;
ALTER TABLE game.feedback ADD CONSTRAINT ck_feedback_status CHECK (status IN ('novo', 'resolvido'));
CREATE INDEX IF NOT EXISTS ix_feedback_status_created ON game.feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_feedback_player ON game.feedback (player_id);

COMMIT;

-- Conferência (opcional):
-- SELECT to_regclass('game.player_tutorial') IS NOT NULL AS tutorial, to_regclass('game.feedback') IS NOT NULL AS feedback;   -- t, t


-- ################################################################################################
-- ## schema_v27_temporadas.sql
-- ################################################################################################
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


-- ################################################################################################
-- ## schema_v28_fase_final.sql
-- ################################################################################################
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

