-- =====================================================================
-- Vontade do Fogo: migração v12 (sapatos: equipamento dos pés)
--
-- Rode DEPOIS da v11 (schema_v11_endgame.sql), no SQL Editor do Neon (branch production), e ANTES de publicar o
-- código na main. Pode rodar de novo sem erro. O servidor novo NÃO sobe sem ela (o log do Render avisa e o Render
-- mantém a versão anterior no ar).
--
--  1. Itens do tipo 'shoes' (sapatos), vendidos na Alfaiataria. O desenho e as cores de cada um ficam no código
--     (src/realtime/items.ts e public/sprites.js).
--  2. players.equipped_shoes: o sapato calçado (só um que o jogador tem; NULL = descalço).
--  3. Todo ninja tem a Sandália Ninja calçada: os que já existem ganham aqui; os novos, no cadastro (trigger).
--  4. /admin ryo <nome> <quantidade>: o admin dá ryō a um jogador (1 a 1.000.000), com auditoria.
-- Nada aqui usa bloco anônimo de código (o SQL Editor do Neon corta o bloco).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. sapatos no catálogo

ALTER TABLE game.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE game.items ADD CONSTRAINT items_kind_check CHECK (kind IN ('weapon', 'scroll', 'cape', 'shoes', 'accessory', 'consumable'));   -- 'accessory': v14, 'consumable': v32 (rodar a v12 de novo não quebra)
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('sandalia_ninja', 'Sandália Ninja',    'shoes', NULL, NULL, 80,  'clothes'),
  ('sandalia_couro', 'Sandália de Couro', 'shoes', NULL, NULL, 250, 'clothes'),
  ('botas_viagem',   'Botas de Viagem',   'shoes', NULL, NULL, 500, 'clothes'),
  ('botas_ninja',    'Botas Ninja',       'shoes', NULL, NULL, 900, 'clothes')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. sapato calçado

-- O padrão vale para quem já existe (todos ficam com a Sandália Ninja calçada) e para as contas novas.
ALTER TABLE game.players ADD COLUMN IF NOT EXISTS equipped_shoes text DEFAULT 'sandalia_ninja' REFERENCES game.items (code);
COMMENT ON COLUMN game.players.equipped_shoes IS 'Sapato calçado (equipamento dos pés; só um que o jogador tem). NULL = descalço.';

CREATE OR REPLACE FUNCTION game.players_equipped_shoes_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_shoes IS NOT NULL AND NEW.equipped_shoes IS DISTINCT FROM OLD.equipped_shoes THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_shoes AND i.kind = 'shoes' AND pi.quantity > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para calçar um sapato do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_shoes_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_shoes_owned ON game.players;
CREATE TRIGGER trg_players_equipped_shoes_owned BEFORE UPDATE OF equipped_shoes ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_shoes_owned();

-- ---------------------------------------------------------------- 3. a Sandália Ninja no inventário de todos

-- Quem já existe: a sandália que o padrão da coluna calçou entra no inventário.
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT p.id, 'sandalia_ninja', 1 FROM game.players p
ON CONFLICT (player_id, item_code) DO NOTHING;

-- Conta nova: a sandália calçada pelo padrão da coluna entra no inventário.
CREATE OR REPLACE FUNCTION game.players_after_insert_v12() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_shoes IS NOT NULL THEN
    INSERT INTO player_items (player_id, item_code, quantity) VALUES (NEW.id, NEW.equipped_shoes, 1)
    ON CONFLICT (player_id, item_code) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_players_after_insert_v12 ON game.players;
CREATE TRIGGER trg_players_after_insert_v12 AFTER INSERT ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_after_insert_v12();

-- ---------------------------------------------------------------- 4. /admin ryo <nome> <quantidade>

-- Confere is_admin de novo e grava a auditoria na mesma transação (como as outras game.admin_*, migração v8).
CREATE OR REPLACE FUNCTION game.admin_give_ryo(p_admin uuid, p_target uuid, p_amount bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_ryo bigint;
BEGIN
  PERFORM assert_admin(p_admin);
  IF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'Ryō de 1 a 1.000.000' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_ryo';
  END IF;
  UPDATE players SET ryo = ryo + p_amount WHERE id = p_target RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  PERFORM admin_log(p_admin, 'giveryo', p_target, jsonb_build_object('amount', p_amount), true, NULL);
  RETURN v_ryo;
END $$;

COMMIT;
