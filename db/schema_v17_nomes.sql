-- =====================================================================================================================
-- v17: Fase 1 do roadmap (nomes). O jogo passa a se chamar Herança do Fogo e as quatro vilas viram as quatro aldeias.
-- Rode no SQL Editor do Neon, no branch `production`. Pode rodar de novo sem erro. Só troca NOMES: os códigos das vilas
-- (vila_1, vila_3, vila_4, vila_5) não mudam, então ninguém muda de vila, de Kage, de diplomacia nem de nada.
--
--   vila_1  Folha  -> Chama Eterna
--   vila_3  Névoa  -> Maré Oculta
--   vila_4  Nuvem  -> Rocha Antiga
--   vila_5  Areia  -> Vento Cortante
-- =====================================================================================================================
BEGIN;

UPDATE game.villages SET name = 'Chama Eterna'   WHERE code = 'vila_1';
UPDATE game.villages SET name = 'Maré Oculta'    WHERE code = 'vila_3';
UPDATE game.villages SET name = 'Rocha Antiga'   WHERE code = 'vila_4';
UPDATE game.villages SET name = 'Vento Cortante' WHERE code = 'vila_5';

COMMENT ON TABLE game.villages IS 'As quatro aldeias: Chama Eterna, Maré Oculta, Rocha Antiga e Vento Cortante (antes Folha, Névoa, Nuvem e Areia; os nomes mudam aqui, na v17 e em src/realtime/villages.ts). A Pedra (vila_2) saiu na v13.';

COMMIT;

-- Conferência (opcional):
-- SELECT code, name FROM game.villages ORDER BY sort_order;   -- Chama Eterna, Maré Oculta, Rocha Antiga, Vento Cortante
