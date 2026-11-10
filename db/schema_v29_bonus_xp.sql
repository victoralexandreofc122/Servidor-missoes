-- =====================================================================================================================
-- v29: bônus de XP ligado pelo admin (global, de um mapa, de um tipo de monstro ou de uma aldeia), com hora para acabar.
-- Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v28. Pode rodar de novo sem erro. Nada é apagado.
--
--  game.xp_bonuses: um bônus por alvo ativo (ligar de novo o mesmo alvo troca o valor e o prazo). Fica guardado no banco
--  para continuar valendo depois de um deploy ou reinício do servidor. Remover = marcar a data de fim.
-- =====================================================================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS game.xp_bonuses (
  id         bigserial   PRIMARY KEY,
  scope      text        NOT NULL,
  target     text        NOT NULL DEFAULT '',
  percent    integer     NOT NULL,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL,
  created_by uuid        REFERENCES game.players (id) ON DELETE SET NULL,
  removed_at timestamptz
);
ALTER TABLE game.xp_bonuses DROP CONSTRAINT IF EXISTS ck_xp_bonuses_scope;
ALTER TABLE game.xp_bonuses ADD CONSTRAINT ck_xp_bonuses_scope CHECK (scope IN ('global', 'mapa', 'monstro', 'vila') AND (scope = 'global') = (target = ''));
ALTER TABLE game.xp_bonuses DROP CONSTRAINT IF EXISTS ck_xp_bonuses_percent;
ALTER TABLE game.xp_bonuses ADD CONSTRAINT ck_xp_bonuses_percent CHECK (percent BETWEEN 1 AND 500);
ALTER TABLE game.xp_bonuses DROP CONSTRAINT IF EXISTS ck_xp_bonuses_time;
ALTER TABLE game.xp_bonuses ADD CONSTRAINT ck_xp_bonuses_time CHECK (ends_at > starts_at);
-- um bônus em aberto por alvo
CREATE UNIQUE INDEX IF NOT EXISTS ux_xp_bonuses_open ON game.xp_bonuses (scope, target) WHERE removed_at IS NULL;

-- Liga (ou troca) o bônus de um alvo. Só admin.
CREATE OR REPLACE FUNCTION game.admin_xp_bonus(p_admin uuid, p_scope text, p_target text, p_percent integer, p_minutes integer) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM assert_admin(p_admin);
  UPDATE xp_bonuses SET removed_at = now() WHERE scope = p_scope AND target = p_target AND removed_at IS NULL;
  INSERT INTO xp_bonuses (scope, target, percent, ends_at, created_by)
  VALUES (p_scope, p_target, p_percent, now() + make_interval(mins => p_minutes), p_admin) RETURNING id INTO v_id;
  PERFORM admin_log(p_admin, 'bonusxp', NULL, jsonb_build_object('scope', p_scope, 'target', p_target, 'percent', p_percent, 'minutes', p_minutes), true, NULL);
  RETURN v_id;
END $$;

-- Remove o bônus de um alvo, ou todos (p_scope = 'tudo'). Devolve quantos saíram. Só admin.
CREATE OR REPLACE FUNCTION game.admin_xp_bonus_remove(p_admin uuid, p_scope text, p_target text) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM assert_admin(p_admin);
  UPDATE xp_bonuses SET removed_at = now()
   WHERE removed_at IS NULL AND ends_at > now() AND (p_scope = 'tudo' OR (scope = p_scope AND target = p_target));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM admin_log(p_admin, 'bonusxp', NULL, jsonb_build_object('action', 'remover', 'scope', p_scope, 'target', p_target, 'removed', v_n), true, NULL);
  RETURN v_n;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT scope, target, percent, ends_at FROM game.xp_bonuses WHERE removed_at IS NULL AND ends_at > now();
