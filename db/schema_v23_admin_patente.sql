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

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, tier FROM game.ranks ORDER BY tier;   -- ACADEMY, GENIN, CHUNIN, JONIN, S_JONIN, ANBU, HOKAGE (Kage)
