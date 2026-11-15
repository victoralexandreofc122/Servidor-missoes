-- =====================================================================================================================
-- v38: os 4 clãs novos (Fase 3, Etapa 4; v63 do jogo) e os nomes das relíquias. Rode no SQL Editor do Neon, no branch
-- `production`, DEPOIS da v37. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. As linhagens aceitam os 4 clãs novos: bastiao, aspide, garra e zefiro (game.players.clan e clan_mark, e
--     game.jutsus.clan_code). Escolhidos no Criador de Personagem, despertam no Rito do Despertar como os outros.
--  2. game.jutsus ganha os 16 jutsus dos clãs novos (4 por clã, um por tier; nomes escolhidos pelo Victor em 15/11/2026).
--  3. game.valid_kit (a regra dos kits) passa a aceitar os 202 códigos (a lista só cresce).
--  4. As 11 relíquias ganham os nomes da opção A.
-- =====================================================================================================================
BEGIN;

ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_clan;
ALTER TABLE game.players ADD CONSTRAINT ck_players_clan CHECK (clan IS NULL OR clan IN ('rubro', 'umbra', 'andarilho', 'bastiao', 'aspide', 'garra', 'zefiro'));
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_clan_mark;
ALTER TABLE game.players ADD CONSTRAINT ck_players_clan_mark CHECK (clan_mark IS NULL OR clan_mark IN ('rubro', 'umbra', 'andarilho', 'bastiao', 'aspide', 'garra', 'zefiro'));
ALTER TABLE game.jutsus DROP CONSTRAINT IF EXISTS ck_jutsus_clan;
ALTER TABLE game.jutsus ADD CONSTRAINT ck_jutsus_clan CHECK (clan_code IS NULL OR clan_code IN ('rubro', 'umbra', 'bastiao', 'aspide', 'garra', 'zefiro'));

INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES
  ('bastiao_muralha', 'Muralha Interior', NULL, 'bastiao', 1),
  ('bastiao_guarda', 'Guarda Compartilhada', NULL, 'bastiao', 2),
  ('bastiao_resposta', 'Muro que Responde', NULL, 'bastiao', 3),
  ('bastiao_juramento', 'Juramento do Escudo', NULL, 'bastiao', 4),
  ('aspide_cuspe', 'Cuspe da Áspide', NULL, 'aspide', 1),
  ('aspide_nevoa', 'Névoa Tóxica', NULL, 'aspide', 2),
  ('aspide_constricao', 'Constrição', NULL, 'aspide', 3),
  ('aspide_ninho', 'Ninho de Áspides', NULL, 'aspide', 4),
  ('garra_matilha', 'Chamado da Matilha', NULL, 'garra', 1),
  ('garra_uivo', 'Uivo de Comando', NULL, 'garra', 2),
  ('garra_troca', 'Troca Instintiva', NULL, 'garra', 3),
  ('garra_rei', 'Rei da Matilha', NULL, 'garra', 4),
  ('zefiro_passo', 'Passo do Vento', NULL, 'zefiro', 1),
  ('zefiro_veu', 'Véu de Ar', NULL, 'zefiro', 2),
  ('zefiro_eco', 'Eco do Vento', NULL, 'zefiro', 3),
  ('zefiro_mil', 'Mil Passos', NULL, 'zefiro', 4)
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
    'lightning_volta', 'illusion_voz', 'bastiao_muralha', 'bastiao_guarda', 'bastiao_resposta', 'bastiao_juramento', 'aspide_cuspe', 'aspide_nevoa',
    'aspide_constricao', 'aspide_ninho', 'garra_matilha', 'garra_uivo', 'garra_troca', 'garra_rei', 'zefiro_passo', 'zefiro_veu',
    'zefiro_eco', 'zefiro_mil'
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

-- As relíquias (opção A, escolhida pelo Victor em 15/11/2026)
UPDATE game.items AS i SET name = v.name
  FROM (VALUES
    ('reliquia_c_vida', 'Amuleto do Fôlego'),
    ('reliquia_c_chakra', 'Amuleto da Corrente'),
    ('reliquia_c_golpe', 'Amuleto do Punho'),
    ('reliquia_r_firmeza', 'Selo da Firmeza'),
    ('reliquia_r_couraca', 'Selo da Couraça'),
    ('reliquia_r_vigor', 'Selo do Vigor'),
    ('reliquia_e_sangue', 'Presa Rubra'),
    ('reliquia_e_ultimo', 'Último Fôlego'),
    ('reliquia_e_fluxo', 'Fluxo Sereno'),
    ('reliquia_l_renascer', 'Coração da Fênix Cinza'),
    ('reliquia_l_brasa', 'Punho da Chama Antiga')
  ) AS v(code, name)
 WHERE i.code = v.code AND i.name IS DISTINCT FROM v.name;

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                         -- 202
-- SELECT clan_code, count(*) FROM game.jutsus WHERE clan_code IS NOT NULL GROUP BY 1 ORDER BY 1;   -- 4 em cada clã
-- SELECT code, name FROM game.items WHERE kind = 'relic' ORDER BY code;    -- 11 com os nomes novos
