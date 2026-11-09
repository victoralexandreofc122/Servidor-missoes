-- =====================================================================================================================
-- v22: correção das aldeias Nuvem e Areia (Fase 1). Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v21.
-- Pode rodar de novo sem erro. Só troca NOMES: os códigos das vilas (vila_4, vila_5) não mudam, então ninguém muda de
-- vila, de Kage, de diplomacia nem de nada.
--
-- A v17 trocou Nuvem e Areia. O documento canônico (docs/endgame-visao.md) diz:
--
--   vila_4  Nuvem  -> Aldeia do Vento Cortante   (vento)
--   vila_5  Areia  -> Aldeia da Rocha Antiga     (terra)
--
-- Banco sem a v11 (o fim de jogo, opcional): a tabela game.villages não existe e esta migração não faz nada (os nomes que
-- o jogador vê vêm do código). Por isso ela usa uma função temporária, criada, chamada e apagada aqui.
-- =====================================================================================================================
BEGIN;

CREATE OR REPLACE FUNCTION game._migrar_v22() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('game.villages') IS NULL THEN
    RETURN;
  END IF;
  -- o nome da vila é único: trocar os dois de uma vez dá conflito, então passa por nomes temporários (só se ainda faltar corrigir)
  IF (SELECT count(*) FROM game.villages WHERE (code = 'vila_4' AND name = 'Vento Cortante') OR (code = 'vila_5' AND name = 'Rocha Antiga')) < 2 THEN
    EXECUTE 'UPDATE game.villages SET name = ''v22_tmp_4'' WHERE code = ''vila_4''';
    EXECUTE 'UPDATE game.villages SET name = ''v22_tmp_5'' WHERE code = ''vila_5''';
    EXECUTE 'UPDATE game.villages SET name = ''Vento Cortante'' WHERE code = ''vila_4''';
    EXECUTE 'UPDATE game.villages SET name = ''Rocha Antiga'' WHERE code = ''vila_5''';
  END IF;
END $$;

SELECT game._migrar_v22();
DROP FUNCTION game._migrar_v22();

COMMIT;

-- Conferência (opcional; só existe com a v11):
-- SELECT code, name FROM game.villages ORDER BY sort_order;   -- Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga
