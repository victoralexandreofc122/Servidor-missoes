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
