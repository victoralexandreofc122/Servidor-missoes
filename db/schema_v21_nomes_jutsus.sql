-- =====================================================================================================================
-- v21: Fase 1 (nomes). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v20. Pode rodar de novo sem erro.
-- Só troca NOMES EXIBIDOS: os códigos (fire_2, rubro_chamas, manto_akatsuki...) não mudam, então ninguém perde jutsu,
-- uso, nível, kit nem item. Os nomes saem do documento docs/fase1-renomeacao.md (opções recomendadas, aprovadas pelo Victor).
--
--  1. 38 jutsus de tradução direta de golpes da série ganham nome original (game.jutsus.name).
--  2. O Manto da Akatsuki vira Manto Cinza (game.items.name). A organização passa a se chamar "Os Cinzas" na tela;
--     o nome interno (akatsuki) continua nas tabelas e funções.
--
-- Atenção: rodar a v16, a v18, a v19 ou a v20 de novo devolve o nome antigo de alguns jutsus; se rodar, rode a v21 outra vez.
-- =====================================================================================================================
BEGIN;

UPDATE game.jutsus AS j SET name = v.name
  FROM (VALUES
  ('rubro_chamas', 'Brasa Sem Luz'),
  ('rubro_lua', 'Mundo Espelhado'),
  ('rubro_guardiao', 'Sentinela Espectral'),
  ('rubro_completo', 'Colosso Espectral'),
  ('rubro_olho', 'Olhar Rubro'),
  ('heal_palma', 'Palma Curadora'),
  ('heal_bisturi', 'Corte Cirúrgico'),
  ('heal_disturbio', 'Descontrole Muscular'),
  ('heal_4', 'Renovação Celular'),
  ('shadow_2', 'Agulhas de Sombra'),
  ('shadow_3', 'Lâmina Umbral'),
  ('shadow_estrangular', 'Garrote de Sombra'),
  ('shadow_agarre', 'Rede de Sombra'),
  ('illusion_templo', 'Santuário das Penas'),
  ('illusion_3', 'Raízes do Pesadelo'),
  ('illusion_4', 'Ciclo Sem Fim'),
  ('stone_2', 'Lamaçal Profundo'),
  ('stone_toupeira', 'Escavação Furtiva'),
  ('fire_2', 'Revoada de Brasas'),
  ('fire_3', 'Varredura Flamejante'),
  ('fire_hotan', 'Projétil Dracônico'),
  ('fire_haiseki', 'Cinzas Detonantes'),
  ('fire_ryuka', 'Lança de Fogo'),
  ('water_dragao', 'Serpente d’Água'),
  ('water_clone', 'Duplo de Água'),
  ('water_3', 'Cárcere Líquido'),
  ('water_nevoa', 'Véu de Bruma'),
  ('water_2', 'Estouro de Maré'),
  ('water_xarope', 'Poça Viscosa'),
  ('weapons_dragoes', 'Ascensão Dupla'),
  ('weapons_gigante', 'Shuriken Colossal'),
  ('weapons_multi', 'Shuriken Espelhada'),
  ('lightning_2', 'Farpas de Trovão'),
  ('lightning_fluxo', 'Descarga Envolvente'),
  ('lightning_4', 'Julgamento do Trovão'),
  ('wind_2', 'Balas de Vento'),
  ('wind', 'Rajada Aberta'),
  ('wind_4', 'Disco do Furacão')
  ) AS v(code, name)
 WHERE j.code = v.code AND j.name IS DISTINCT FROM v.name;

UPDATE game.items SET name = 'Manto Cinza' WHERE code = 'manto_akatsuki' AND name IS DISTINCT FROM 'Manto Cinza';

COMMIT;

-- Conferência (opcional): deve dar 38 (os jutsus com o nome novo) e Manto Cinza.
-- SELECT count(*) FROM game.jutsus WHERE name IN ('Brasa Sem Luz', 'Mundo Espelhado', 'Colosso Espectral', 'Duplo de Água', 'Disco do Furacão');   -- 5
-- SELECT name FROM game.items WHERE code = 'manto_akatsuki';
