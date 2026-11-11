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
    'rubro_completo', 'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma',
    -- v30 (Fase 2.5): os 74 novos (a lista só cresce: rodar esta migração de novo não tira nada)
    'fire_chao', 'fire_cometa', 'fire_rugido', 'fire_coroa', 'fire_coluna', 'heal_agulha', 'heal_casca',
    'heal_septica', 'heal_banho', 'heal_onda', 'heal_milagre', 'heal_santuario', 'heal_colosso', 'illusion_olho',
    'illusion_passo', 'illusion_veu', 'illusion_espelho', 'illusion_coro', 'illusion_colapso', 'illusion_ninar', 'illusion_reflexo',
    'lightning_rede', 'lightning_rugido', 'lightning_maos', 'lightning_correntes', 'lightning_ceu', 'lightning_armadura', 'lightning_risco',
    'shadow_espinho', 'shadow_veu', 'shadow_mergulho', 'shadow_ciranda', 'shadow_mancha', 'shadow_saltadora', 'shadow_punho',
    'shadow_sentinela', 'stone_pisao', 'stone_cascalho', 'stone_lancas', 'stone_carga', 'stone_couraca', 'stone_avalanche',
    'stone_sumidouro', 'taijutsu_esquiva', 'taijutsu_folego', 'taijutsu_bloqueio', 'taijutsu_pressao', 'taijutsu_chave', 'taijutsu_impacto',
    'taijutsu_flecha', 'taijutsu_queda', 'water_lamina', 'water_gotas', 'water_coluna', 'water_casulo', 'water_tromba',
    'water_onda', 'water_corpo', 'weapons_corte', 'weapons_pregos', 'weapons_serrilhada', 'weapons_polida', 'weapons_laco',
    'weapons_arco', 'weapons_ceu', 'weapons_arsenal', 'wind_pulso', 'wind_leve', 'wind_asa', 'wind_vortice',
    'wind_cadeia', 'wind_milcortes', 'wind_fenda', 'wind_olho',
    -- v31 (mecânicas inéditas)
    'shadow_beijo', 'weapons_peconha', 'taijutsu_furia', 'heal_meridianos', 'stone_resposta', 'wind_espelho', 'fire_marca', 'illusion_emprestimo'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                         -- 96
-- Deve mostrar "WHEN 3 THEN 3" (o tier 3 custa 3 pergaminhos).
-- SELECT position('WHEN 3 THEN 3' IN prosrc) > 0 AS v20 FROM pg_proc WHERE proname = 'extract_jutsu';
