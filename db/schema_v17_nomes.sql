-- =====================================================================================================================
-- v17: Fase 1 do roadmap (nomes). O jogo passa a se chamar Herança do Fogo e as quatro vilas viram as quatro aldeias.
-- Rode no SQL Editor do Neon, no branch `production`. Pode rodar de novo sem erro. Só troca NOMES: os códigos das vilas
-- (vila_1, vila_3, vila_4, vila_5) não mudam, então ninguém muda de vila, de Kage, de diplomacia nem de nada.
--
--   vila_1  Folha  -> Chama Eterna
--   vila_3  Névoa  -> Maré Oculta
--   vila_4  Nuvem  -> Vento Cortante   (corrigido na v22: a v17 original trocava Nuvem e Areia)
--   vila_5  Areia  -> Rocha Antiga
--
-- Banco sem a v11 (o fim de jogo, que é opcional): a tabela game.villages não existe e esta migração não faz nada (os
-- nomes que o jogador vê vêm do código). Por isso ela usa uma função temporária, criada, chamada e apagada aqui.
-- =====================================================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION game._migrar_v17() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('game.villages') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'UPDATE game.villages SET name = ''Chama Eterna'' WHERE code = ''vila_1''';
  EXECUTE 'UPDATE game.villages SET name = ''Maré Oculta'' WHERE code = ''vila_3''';
  EXECUTE 'UPDATE game.villages SET name = ''Vento Cortante'' WHERE code = ''vila_4''';
  EXECUTE 'UPDATE game.villages SET name = ''Rocha Antiga'' WHERE code = ''vila_5''';
END $$;

SELECT game._migrar_v17();
DROP FUNCTION game._migrar_v17();

COMMIT;

-- Conferência (opcional; só existe com a v11):
-- SELECT code, name FROM game.villages ORDER BY sort_order;   -- Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga
