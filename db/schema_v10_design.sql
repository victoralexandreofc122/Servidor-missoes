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
