-- v13: a Vila da Pedra (vila_2) sai do jogo. Ficam a Folha, a Névoa, a Nuvem e a Areia (Victor, 25/10/2026).
--
-- Quando foi decidido ninguém era da Pedra, mas a migração não confia nisso: quem estiver lá vai para a Folha e
-- ganha de volta a troca de vila (pode ir para a Névoa, a Nuvem ou a Areia). O Kage, a eleição, a diplomacia, as
-- denúncias e o histórico do Kage da Pedra são apagados, e por fim a própria vila.
--
-- Regras do SQL Editor do Neon (DEPLOY.md): sem bloco DO, tudo dentro de BEGIN/COMMIT. Pode rodar de novo: na
-- segunda vez nada casa com 'vila_2' e nada muda.
--
-- Banco sem a v11 (erro column "village" does not exist): rode a v11 no lugar desta. Ela já cria só as quatro vilas.

BEGIN;

-- 1. Os ninjas: a vila, a vila de onde o renegado saiu e a bandana do visual.
UPDATE game.players SET village = 'vila_1', village_switches = 0 WHERE village = 'vila_2';
UPDATE game.players SET renegade_from = 'vila_1' WHERE renegade_from = 'vila_2';
UPDATE game.players SET appearance = jsonb_set(appearance, '{village}', '"vila_1"') WHERE appearance ->> 'village' = 'vila_2';

-- 2. Kage e eleição (os votos saem junto com a eleição: ON DELETE CASCADE).
DELETE FROM game.village_kages WHERE village = 'vila_2';
DELETE FROM game.kage_elections WHERE village = 'vila_2';

-- 3. Diplomacia, eventos, denúncias e o registro do que o Kage da Pedra fez.
DELETE FROM game.village_relations WHERE 'vila_2' IN (village_a, village_b, declared_by);
DELETE FROM game.village_pair_changes WHERE 'vila_2' IN (village_a, village_b);
DELETE FROM game.diplomacy_proposals WHERE 'vila_2' IN (from_village, to_village);
DELETE FROM game.world_events WHERE village_a = 'vila_2' OR village_b = 'vila_2';
DELETE FROM game.kage_actions WHERE village = 'vila_2' OR target_village = 'vila_2';
DELETE FROM game.village_reports WHERE village = 'vila_2';

-- 4. A vila.
DELETE FROM game.villages WHERE code = 'vila_2';
COMMENT ON TABLE game.villages IS 'As quatro vilas: Folha, Névoa, Nuvem e Areia (os nomes mudam aqui e em src/realtime/villages.ts). A Pedra (vila_2) saiu na v13.';

COMMIT;
