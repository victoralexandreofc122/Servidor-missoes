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
