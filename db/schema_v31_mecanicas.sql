-- =====================================================================================================================
-- v31: os 12 jutsus de mecânica inédita (o 5º jutsu do tier): recursos, reação e posição. 186 jutsus no total.
-- Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v30. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.jutsus ganha os 12 (nomes da opção B, escolhidos pelo Victor). Passam a sair na Extração da classe e do tier.
--  2. game.valid_kit (a regra dos kits) passa a aceitar os 186 códigos (a lista só cresce).
-- =====================================================================================================================
BEGIN;

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('shadow_beijo', 'Beijo do Breu', 'shadow', NULL, 2),
  ('weapons_peconha', 'Fio Peçonhento', 'weapons', NULL, 1),
  ('taijutsu_furia', 'Fúria do Encurralado', 'taijutsu', NULL, 4),
  ('heal_meridianos', 'Selo dos Meridianos', 'heal', NULL, 3),
  ('stone_resposta', 'Resposta da Montanha', 'stone', NULL, 3),
  ('wind_espelho', 'Espelho de Ar', 'wind', NULL, 2),
  ('fire_marca', 'Marca Incandescente', 'fire', NULL, 2),
  ('illusion_emprestimo', 'Empréstimo Forçado', 'illusion', NULL, 3),
  ('shadow_troca', 'Passo Trocado', 'shadow', NULL, 3),
  ('water_laco', 'Laço da Correnteza', 'water', NULL, 2),
  ('lightning_volta', 'Ida e Volta', 'lightning', NULL, 2),
  ('illusion_voz', 'Segunda Voz', 'illusion', NULL, 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, clan_code = EXCLUDED.clan_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
    'teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2',
    'shadow_3', 'shadow_4', 'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2',
    'stone_3', 'stone_4', 'fire', 'fire_2', 'fire_3', 'fire_4', 'water', 'water_2',
    'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3', 'taijutsu_4', 'weapons', 'weapons_2',
    'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3', 'lightning_4', 'wind', 'wind_2',
    'wind_3', 'wind_4', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka', 'fire_haiseki', 'fire_lamina',
    'fire_hotan', 'water_dragao', 'water_xarope', 'lightning_corrente', 'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo',
    'stone_pilares', 'stone_rocha', 'stone_toupeira', 'stone_punho', 'heal_desintox', 'heal_bisturi', 'heal_aura', 'weapons_multi',
    'weapons_kunai', 'weapons_dragoes', 'illusion_kai', 'illusion_estaca', 'illusion_templo', 'taijutsu_rasteira', 'taijutsu_ascendente', 'taijutsu_lotus',
    'taijutsu_portoes', 'shadow_recuo', 'shadow_estrangular', 'shadow_agarre', 'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha',
    'heal_palma', 'weapons_gigante', 'water_muro', 'stone_muralha', 'water_clone', 'stone_golem', 'wind_shuriken', 'wind_veu',
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao', 'rubro_lua', 'rubro_completo',
    'umbra_deslize', 'umbra_faminta', 'umbra_noite', 'umbra_forma', 'fire_chao', 'fire_cometa', 'fire_rugido', 'fire_coroa',
    'fire_coluna', 'heal_agulha', 'heal_casca', 'heal_septica', 'heal_banho', 'heal_onda', 'heal_milagre', 'heal_santuario',
    'heal_colosso', 'illusion_olho', 'illusion_passo', 'illusion_veu', 'illusion_espelho', 'illusion_coro', 'illusion_colapso', 'illusion_ninar',
    'illusion_reflexo', 'lightning_rede', 'lightning_rugido', 'lightning_maos', 'lightning_correntes', 'lightning_ceu', 'lightning_armadura', 'lightning_risco',
    'shadow_espinho', 'shadow_veu', 'shadow_mergulho', 'shadow_ciranda', 'shadow_mancha', 'shadow_saltadora', 'shadow_punho', 'shadow_sentinela',
    'stone_pisao', 'stone_cascalho', 'stone_lancas', 'stone_carga', 'stone_couraca', 'stone_avalanche', 'stone_sumidouro', 'taijutsu_esquiva',
    'taijutsu_folego', 'taijutsu_bloqueio', 'taijutsu_pressao', 'taijutsu_chave', 'taijutsu_impacto', 'taijutsu_flecha', 'taijutsu_queda', 'water_lamina',
    'water_gotas', 'water_coluna', 'water_casulo', 'water_tromba', 'water_onda', 'water_corpo', 'weapons_corte', 'weapons_pregos',
    'weapons_serrilhada', 'weapons_polida', 'weapons_laco', 'weapons_arco', 'weapons_ceu', 'weapons_arsenal', 'wind_pulso', 'wind_leve',
    'wind_asa', 'wind_vortice', 'wind_cadeia', 'wind_milcortes', 'wind_fenda', 'wind_olho', 'shadow_beijo', 'weapons_peconha',
    'taijutsu_furia', 'heal_meridianos', 'stone_resposta', 'wind_espelho', 'fire_marca', 'illusion_emprestimo', 'shadow_troca', 'water_laco',
    'lightning_volta', 'illusion_voz'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;   -- 186
