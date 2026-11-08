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
    'wind_salto', 'wind_arco'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT tier, count(*) FROM game.jutsus WHERE class_code = 'fire' GROUP BY tier ORDER BY tier;   -- 1:4  2:4  3:2  4:1
-- SELECT count(*) FROM game.jutsus;                                                                -- 45 (72 depois da v18)
-- SELECT game.valid_kit(ARRAY['fire_endan', 'fire_lamina', 'fire_3', 'fire_4']);                  -- true
