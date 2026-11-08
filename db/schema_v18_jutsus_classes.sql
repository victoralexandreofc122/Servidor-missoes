-- =====================================================================================================================
-- v18: Jutsus v2, entrega 5 (as outras classes, a classe Vento e os jutsus de sistema próprio). Rode no SQL Editor do Neon, no branch `production`, depois da v16.
-- Pode rodar de novo sem erro. Mexe no catálogo game.jutsus e na regra dos kits (game.valid_kit):
--
--  1. 68 jutsus em game.jutsus: os 45 novos (códigos novos) e os nomes novos dos tiers 2 a 4 de Água, Relâmpago,
--     Terra, Médico, Armas, Ilusão, Taijutsu e Sombra (os códigos ficam: quem já tem continua com eles, com o uso e o
--     nível). A Extração (game.extract_jutsu, v10) passa a sortear entre eles.
--  2. game.valid_kit aceita os 94 códigos do jogo. A lista só cresce: todo kit de hoje continua valendo.
--
-- Nenhum código é renomeado nem apagado.
-- =====================================================================================================================
BEGIN;

-- a classe Vento (a 10ª) e o pergaminho dela, antes dos jutsus (chave estrangeira)
INSERT INTO game.classes (code, name, icon, sort_order) VALUES
  ('wind', 'Vento', '🌪️', 10)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('scroll_wind', 'Pergaminho de Vento', 'scroll', 'wind', NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
  ('heal_2', 'Punho Sísmico', 'heal', 2),
  ('heal_3', 'Regeneração de Área', 'heal', 3),
  ('heal_4', 'Regeneração Mitótica', 'heal', 4),
  ('shadow_2', 'Costura de Sombra', 'shadow', 2),
  ('shadow_3', 'Shuriken de Sombra', 'shadow', 3),
  ('shadow_4', 'Domínio das Sombras', 'shadow', 4),
  ('illusion_2', 'Visão do Abismo', 'illusion', 2),
  ('illusion_3', 'Árvore Prendedora', 'illusion', 3),
  ('illusion_4', 'Laço do Destino', 'illusion', 4),
  ('stone_2', 'Pântano do Submundo', 'stone', 2),
  ('stone_3', 'Esmagamento de Paredes', 'stone', 3),
  ('water_2', 'Onda de Choque Aquática', 'water', 2),
  ('water_3', 'Prisão de Água', 'water', 3),
  ('water_4', 'Prisão do Vórtice', 'water', 4),
  ('taijutsu_2', 'Chute Ciclone', 'taijutsu', 2),
  ('taijutsu_3', 'Cem Golpes', 'taijutsu', 3),
  ('taijutsu_4', 'Punho do Céu', 'taijutsu', 4),
  ('weapons_2', 'Lâminas Flutuantes', 'weapons', 2),
  ('weapons_3', 'Corte Relâmpago', 'weapons', 3),
  ('weapons_4', 'Dança dos Mil Cortes', 'weapons', 4),
  ('lightning_2', 'Agulhas de Trovão', 'lightning', 2),
  ('lightning_3', 'Investida Elétrica', 'lightning', 3),
  ('lightning_4', 'Dragão do Trovão', 'lightning', 4),
  ('wind', 'Palma do Vendaval', 'wind', 1),
  ('wind_2', 'Esferas de Vácuo', 'wind', 2),
  ('wind_3', 'Tornado Cortante', 'wind', 3),
  ('wind_4', 'Estrela Espiral', 'wind', 4),
  ('water_dragao', 'Dragão d’Água', 'water', 1),
  ('water_xarope', 'Xarope Pegajoso', 'water', 2),
  ('lightning_corrente', 'Corrente Rasteira', 'lightning', 1),
  ('lightning_shuriken', 'Shuriken do Trovão', 'lightning', 1),
  ('lightning_impulso', 'Impulso Estático', 'lightning', 1),
  ('lightning_raio', 'Lança Saltadora', 'lightning', 2),
  ('lightning_fluxo', 'Fluxo Elétrico', 'lightning', 2),
  ('stone_pilares', 'Prisão de Pilares', 'stone', 1),
  ('stone_rocha', 'Projétil de Rocha', 'stone', 1),
  ('stone_toupeira', 'Toupeira Oculta', 'stone', 1),
  ('stone_punho', 'Punho de Rocha', 'stone', 2),
  ('heal_desintox', 'Desintoxicação Celular', 'heal', 1),
  ('heal_bisturi', 'Bisturi de Chakra', 'heal', 1),
  ('heal_aura', 'Aura de Regeneração', 'heal', 1),
  ('weapons_multi', 'Shuriken Multiplicada', 'weapons', 1),
  ('weapons_kunai', 'Kunai Explosiva', 'weapons', 3),
  ('weapons_dragoes', 'Dragões Gêmeos', 'weapons', 4),
  ('illusion_kai', 'Dissipação', 'illusion', 1),
  ('illusion_estaca', 'Estaca da Ilusão', 'illusion', 2),
  ('illusion_templo', 'Templo do Nirvana', 'illusion', 4),
  ('taijutsu_rasteira', 'Rasteira Baixa', 'taijutsu', 1),
  ('taijutsu_ascendente', 'Chute Ascendente', 'taijutsu', 2),
  ('taijutsu_lotus', 'Mergulho Esmagador', 'taijutsu', 3),
  ('taijutsu_portoes', 'Despertar do Corpo', 'taijutsu', 4),
  ('shadow_recuo', 'Reflexo Tático', 'shadow', 1),
  ('shadow_estrangular', 'Estrangulamento da Sombra', 'shadow', 3),
  ('shadow_agarre', 'Agarre Múltiplo', 'shadow', 4),
  ('water_nevoa', 'Ocultação na Névoa', 'water', 1),
  ('illusion_noite', 'Noite Eterna', 'illusion', 3),
  ('heal_disturbio', 'Distúrbio Nervoso', 'heal', 2),
  ('shadow_armadilha', 'Sombra Oculta', 'shadow', 2),
  ('heal_palma', 'Palma Mística', 'heal', 1),
  ('weapons_gigante', 'Shuriken Gigante de Chakra', 'weapons', 2),
  ('water_muro', 'Muro de Água', 'water', 1),
  ('stone_muralha', 'Muralha de Terra', 'stone', 1),
  ('water_clone', 'Clone de Água', 'water', 2),
  ('stone_golem', 'Golem de Terra Titânico', 'stone', 4),
  ('wind_shuriken', 'Shuriken do Vento', 'wind', 1),
  ('wind_veu', 'Véu de Vento', 'wind', 1),
  ('wind_salto', 'Passo Aéreo', 'wind', 1),
  ('wind_arco', 'Lâmina em Arco', 'wind', 2)
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
    'wind_salto', 'wind_arco', 'rubro_olho', 'rubro_transe', 'rubro_chamas', 'rubro_guardiao'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                                               -- 94
-- SELECT class_code, count(*) FROM game.jutsus GROUP BY class_code ORDER BY class_code;
-- SELECT game.valid_kit(ARRAY['water_dragao', 'stone_pilares', 'heal_aura', 'shadow_4']);         -- true
