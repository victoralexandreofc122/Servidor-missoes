-- =====================================================================================================================
-- v30 (Fase 2.5): os 74 jutsus novos que fecham 4 jutsus por classe por tier (160 de classe; 174 no total).
-- Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v29. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.jutsus ganha os 74 (nomes da opção B, escolhidos pelo Victor). Eles passam a sair na Extração da classe e do
--     tier deles (game.extract_jutsu já lê o catálogo: não muda).
--  2. game.valid_kit (a regra dos kits) passa a aceitar os 174 códigos (a lista só cresce).
-- =====================================================================================================================
BEGIN;

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('fire_chao', 'Chão Incandescente', 'fire', NULL, 3),
  ('fire_cometa', 'Cometa Rasteiro', 'fire', NULL, 3),
  ('fire_rugido', 'Rugido da Fornalha', 'fire', NULL, 4),
  ('fire_coroa', 'Coroa de Chamas', 'fire', NULL, 4),
  ('fire_coluna', 'Coluna Infernal', 'fire', NULL, 4),
  ('heal_agulha', 'Agulha Calmante', 'heal', NULL, 2),
  ('heal_casca', 'Casca de Chakra', 'heal', NULL, 2),
  ('heal_septica', 'Lâmina Séptica', 'heal', NULL, 3),
  ('heal_banho', 'Banho de Chakra', 'heal', NULL, 3),
  ('heal_onda', 'Onda Anestésica', 'heal', NULL, 3),
  ('heal_milagre', 'Milagre Verde', 'heal', NULL, 4),
  ('heal_santuario', 'Santuário Vital', 'heal', NULL, 4),
  ('heal_colosso', 'Punho do Colosso', 'heal', NULL, 4),
  ('illusion_olho', 'Olho Errante', 'illusion', NULL, 1),
  ('illusion_passo', 'Passo Falso', 'illusion', NULL, 1),
  ('illusion_veu', 'Véu da Meia-Noite', 'illusion', NULL, 2),
  ('illusion_espelho', 'Espelho Quebrado', 'illusion', NULL, 2),
  ('illusion_coro', 'Coro do Silêncio', 'illusion', NULL, 3),
  ('illusion_colapso', 'Colapso Onírico', 'illusion', NULL, 3),
  ('illusion_ninar', 'Canção de Ninar', 'illusion', NULL, 4),
  ('illusion_reflexo', 'Reflexo Vazio', 'illusion', NULL, 4),
  ('lightning_rede', 'Rede de Faíscas', 'lightning', NULL, 2),
  ('lightning_rugido', 'Rugido do Trovão', 'lightning', NULL, 3),
  ('lightning_maos', 'Mãos de Trovão', 'lightning', NULL, 3),
  ('lightning_correntes', 'Correntes de Raio', 'lightning', NULL, 3),
  ('lightning_ceu', 'Céu em Fúria', 'lightning', NULL, 4),
  ('lightning_armadura', 'Armadura Relampejante', 'lightning', NULL, 4),
  ('lightning_risco', 'Risco de Luz', 'lightning', NULL, 4),
  ('shadow_espinho', 'Espinho Sombrio', 'shadow', NULL, 1),
  ('shadow_veu', 'Véu Sombrio', 'shadow', NULL, 1),
  ('shadow_mergulho', 'Mergulho na Sombra', 'shadow', NULL, 2),
  ('shadow_ciranda', 'Ciranda Sombria', 'shadow', NULL, 2),
  ('shadow_mancha', 'Mancha Negra', 'shadow', NULL, 3),
  ('shadow_saltadora', 'Sombra Saltadora', 'shadow', NULL, 3),
  ('shadow_punho', 'Punho do Abismo', 'shadow', NULL, 4),
  ('shadow_sentinela', 'Sentinela de Sombra', 'shadow', NULL, 4),
  ('stone_pisao', 'Pisão da Montanha', 'stone', NULL, 2),
  ('stone_cascalho', 'Chuva de Cascalho', 'stone', NULL, 2),
  ('stone_lancas', 'Lanças da Terra', 'stone', NULL, 3),
  ('stone_carga', 'Carga do Rochedo', 'stone', NULL, 3),
  ('stone_couraca', 'Couraça Mineral', 'stone', NULL, 3),
  ('stone_avalanche', 'Avalanche', 'stone', NULL, 4),
  ('stone_sumidouro', 'Sumidouro', 'stone', NULL, 4),
  ('taijutsu_esquiva', 'Esquiva Rápida', 'taijutsu', NULL, 1),
  ('taijutsu_folego', 'Fôlego de Luta', 'taijutsu', NULL, 1),
  ('taijutsu_bloqueio', 'Bloqueio Firme', 'taijutsu', NULL, 2),
  ('taijutsu_pressao', 'Soco de Pressão', 'taijutsu', NULL, 2),
  ('taijutsu_chave', 'Chave de Braço', 'taijutsu', NULL, 3),
  ('taijutsu_impacto', 'Impacto Circular', 'taijutsu', NULL, 3),
  ('taijutsu_flecha', 'Flecha Humana', 'taijutsu', NULL, 4),
  ('taijutsu_queda', 'Queda do Meteoro', 'taijutsu', NULL, 4),
  ('water_lamina', 'Lâmina d’Água', 'water', NULL, 2),
  ('water_gotas', 'Rajada de Gotas', 'water', NULL, 3),
  ('water_coluna', 'Coluna d’Água', 'water', NULL, 3),
  ('water_casulo', 'Casulo de Água', 'water', NULL, 3),
  ('water_tromba', 'Tromba d’Água', 'water', NULL, 4),
  ('water_onda', 'Grande Onda', 'water', NULL, 4),
  ('water_corpo', 'Corpo de Água', 'water', NULL, 4),
  ('weapons_corte', 'Corte Rápido', 'weapons', NULL, 1),
  ('weapons_pregos', 'Tapete de Pregos', 'weapons', NULL, 1),
  ('weapons_serrilhada', 'Lâmina Serrilhada', 'weapons', NULL, 2),
  ('weapons_polida', 'Lâmina Polida', 'weapons', NULL, 2),
  ('weapons_laco', 'Laço de Ferro', 'weapons', NULL, 3),
  ('weapons_arco', 'Arco de Aço', 'weapons', NULL, 3),
  ('weapons_ceu', 'Céu de Lâminas', 'weapons', NULL, 4),
  ('weapons_arsenal', 'Arsenal Vivo', 'weapons', NULL, 4),
  ('wind_pulso', 'Pulso de Vento', 'wind', NULL, 2),
  ('wind_leve', 'Passo Leve', 'wind', NULL, 2),
  ('wind_asa', 'Asa Cortante', 'wind', NULL, 3),
  ('wind_vortice', 'Vórtice de Ar', 'wind', NULL, 3),
  ('wind_cadeia', 'Corte em Cadeia', 'wind', NULL, 3),
  ('wind_milcortes', 'Mil Cortes do Céu', 'wind', NULL, 4),
  ('wind_fenda', 'Fenda do Vento', 'wind', NULL, 4),
  ('wind_olho', 'Olho da Tempestade', 'wind', NULL, 4)
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
    'wind_asa', 'wind_vortice', 'wind_cadeia', 'wind_milcortes', 'wind_fenda', 'wind_olho',
    -- v31 (mecânicas inéditas)
    'shadow_beijo', 'weapons_peconha', 'taijutsu_furia', 'heal_meridianos', 'stone_resposta', 'wind_espelho', 'fire_marca', 'illusion_emprestimo'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                                              -- 174
-- SELECT class_code, tier, count(*) FROM game.jutsus WHERE class_code IS NOT NULL GROUP BY 1, 2 HAVING count(*) < 4;   -- nenhuma linha
