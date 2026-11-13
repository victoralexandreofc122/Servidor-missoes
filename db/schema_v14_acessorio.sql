-- =====================================================================
-- Vontade do Fogo: migração v14 (acessório: o casaco com capuz vira item)
--
-- Rode DEPOIS da v13 (schema_v13_sem_pedra.sql), no SQL Editor do Neon (branch production), e ANTES de publicar o
-- código na main. Pode rodar de novo sem erro. O servidor novo NÃO sobe sem ela (o log do Render avisa e o Render
-- mantém a versão anterior no ar).
--
--  1. Itens do tipo 'accessory' (acessório), vendidos na Alfaiataria: os casacos com capuz. Ficam POR CIMA da roupa
--     equipada (camisa e calça ou o conjunto da vila). O desenho e a cor de cada um ficam no código
--     (src/realtime/items.ts e public/rigArt.js).
--  2. players.equipped_accessory: o acessório equipado (só um que o jogador tem; NULL = nenhum).
--  3. Quem tinha escolhido "Casaco com capuz" como roupa no Criador (v26) ganha o casaco da mesma cor, já equipado, e a
--     roupa volta para "Camisa e calça".
-- Nada aqui usa bloco anônimo de código (o SQL Editor do Neon corta o bloco).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. acessórios no catálogo

ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory', 'consumable'));   -- 'consumable': v32 (rodar de novo não quebra)
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('casaco_petroleo', 'Casaco com Capuz (petróleo)', 'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_preto',    'Casaco com Capuz (preto)',    'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_vinho',    'Casaco com Capuz (vinho)',    'accessory', NULL, NULL, 1200, 'clothes'),
  ('casaco_verde',    'Casaco com Capuz (verde)',    'accessory', NULL, NULL, 1200, 'clothes')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. acessório equipado

ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_accessory text REFERENCES game.items (code);
COMMENT ON COLUMN game.players.equipped_accessory IS 'Acessório equipado (por cima da roupa; só um que o jogador tem). NULL = nenhum.';

CREATE OR REPLACE FUNCTION game.players_equipped_accessory_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_accessory IS NOT NULL AND NEW.equipped_accessory IS DISTINCT FROM OLD.equipped_accessory THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_accessory AND i.kind = 'accessory' AND pi.quantity > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para equipar um acessório do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_accessory_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_accessory_owned ON game.players;
CREATE TRIGGER trg_players_equipped_accessory_owned BEFORE UPDATE OF equipped_accessory ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_accessory_owned();

-- ---------------------------------------------------------------- 3. quem usava o casaco como roupa (v26)

-- O casaco da cor que estava na roupa (petróleo, preto, vinho ou verde; outra cor vira o petróleo) entra no inventário.
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT p.id,
       CASE p.appearance->>'shirtColor' WHEN 'preto' THEN 'casaco_preto' WHEN 'vinho' THEN 'casaco_vinho'
                                        WHEN 'verde_escuro' THEN 'casaco_verde' ELSE 'casaco_petroleo' END,
       1
  FROM game.players p
 WHERE p.appearance->>'outfit' = 'casaco'
ON CONFLICT (player_id, item_code) DO NOTHING;

-- Equipa esse casaco (o gatilho do item 2 confere que ele está no inventário).
UPDATE game.players p
   SET equipped_accessory = CASE p.appearance->>'shirtColor' WHEN 'preto' THEN 'casaco_preto' WHEN 'vinho' THEN 'casaco_vinho'
                                                            WHEN 'verde_escuro' THEN 'casaco_verde' ELSE 'casaco_petroleo' END
 WHERE p.appearance->>'outfit' = 'casaco' AND p.equipped_accessory IS NULL;

-- A roupa volta para "Camisa e calça" (o casaco agora é acessório). Com a cor petróleo, a camisa fica azul-marinho.
UPDATE game.players p
   SET appearance = jsonb_set(
         jsonb_set(p.appearance::jsonb, '{outfit}', '"basica"'),
         '{shirtColor}', CASE WHEN p.appearance->>'shirtColor' IN ('petroleo', 'ameixa') THEN '"azul_marinho"'::jsonb
                              ELSE to_jsonb(p.appearance->>'shirtColor') END)
 WHERE p.appearance->>'outfit' = 'casaco';

COMMIT;
