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
