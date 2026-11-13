-- =====================================================================================================================
-- v32: ajustes do Teste Alpha. Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v31 e ANTES do código novo.
-- Pode rodar de novo sem erro (a segunda vez não muda nada). Nada é apagado.
--
--  1. A Agilidade saiu do jogo: os pontos dela viram Taijutsu (a velocidade e o ritmo do Ataque Básico agora vêm do
--     Taijutsu). A soma dos pontos não muda (pontos livres + gastos = nível - 1 continua valendo). A coluna attr_agility
--     fica, zerada, para não quebrar nada; o servidor não deixa mais gastar ponto nela.
--  2. O item novo "Shuriken" (consumível): qualquer classe lança uma no lugar do Ataque Básico e ela é gasta. Vende na
--     loja de armas por 10 ryō e cai dos monstros. game.items passa a aceitar o tipo 'consumable'.
-- =====================================================================================================================
BEGIN;

-- 1. Agilidade -> Taijutsu
UPDATE game.players
   SET attr_taijutsu = attr_taijutsu + attr_agility,
       attr_agility  = 0
 WHERE attr_agility > 0;

-- 2. a Shuriken
ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory', 'consumable'));

INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('shuriken', 'Shuriken', 'consumable', NULL, NULL, 10, 'weapons')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, class_code = EXCLUDED.class_code,
  damage = EXCLUDED.damage, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.players WHERE attr_agility > 0;            -- 0
-- SELECT code, name, kind, price_ryo, shop FROM game.items WHERE code = 'shuriken';
