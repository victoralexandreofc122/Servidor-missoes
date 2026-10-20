-- =====================================================================
-- Nin Online Mobile: migração v5 (nível, pontos de atributo e kits de habilidades)
--
-- Rode DEPOIS da v4 (schema_v4_npc_missions.sql), uma vez, no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada passo confere se já foi feito.
-- Não apaga nada. Jogadores que já têm XP recebem o nível e os pontos correspondentes.
--
-- Regras (o BANCO garante, não só o servidor):
--  * Nível vem do XP total, com meta crescente: do nível N para o N+1 são N x 100 XP
--    (nível 2 = 100 XP, nível 3 = 300, nível 4 = 600, nível 5 = 1000...). O "XP zera" a
--    cada nível na tela; aqui o total continua somando (missões e ranks dependem dele).
--  * Subiu de nível: +1 ponto por nível, dado pelo trigger quando total_xp muda.
--    Vale para XP de monstro, de missão (resgate do pergaminho) ou de qualquer outro lugar.
--  * Pontos nunca são inventados: pontos livres + pontos gastos = nível - 1 (ck_players_stat_points).
--  * Cada atributo vai de 0 a 10 pontos.
--  * Kits: até 4 habilidades conhecidas cada, sem repetir dentro do kit.
-- =====================================================================

BEGIN;

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS level             smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stat_points       smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attr_vitality     smallint NOT NULL DEFAULT 0,   -- +10 de vida por ponto
  ADD COLUMN IF NOT EXISTS attr_chakra_max   smallint NOT NULL DEFAULT 0,   -- +10 de chakra máximo
  ADD COLUMN IF NOT EXISTS attr_chakra_regen smallint NOT NULL DEFAULT 0,   -- +1/s de chakra meditando
  ADD COLUMN IF NOT EXISTS attr_agility      smallint NOT NULL DEFAULT 0,   -- +0,5 de velocidade
  ADD COLUMN IF NOT EXISTS attr_taijutsu     smallint NOT NULL DEFAULT 0,   -- +5% de dano do Ataque Básico (físico)
  ADD COLUMN IF NOT EXISTS attr_ninjutsu     smallint NOT NULL DEFAULT 0,   -- +5% de dano dos jutsus (habilidades)
  ADD COLUMN IF NOT EXISTS kit_a text[] NOT NULL DEFAULT ARRAY['fire', 'water', 'taijutsu', 'heal'],
  ADD COLUMN IF NOT EXISTS kit_b text[] NOT NULL DEFAULT ARRAY['illusion', 'shadow', 'stone', 'heal'];

-- Nível de um XP total. Meta do nível N para o N+1 = N x 100, então o nível L começa em
-- 50 x L x (L - 1) de XP total. Conta pela fórmula e corrige o arredondamento. Máximo 99.
CREATE OR REPLACE FUNCTION game.level_for_xp(xp bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  l integer := greatest(1, floor((1 + sqrt(1 + greatest(xp, 0)::numeric * 8 / 100)) / 2)::integer);
BEGIN
  WHILE 50::bigint * (l + 1) * l <= xp LOOP l := l + 1; END LOOP;
  WHILE l > 1 AND 50::bigint * l * (l - 1) > xp LOOP l := l - 1; END LOOP;
  RETURN least(l, 99);
END $$;

-- Kit válido: até 4 habilidades conhecidas, sem repetir.
CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal']::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

-- Quem já tinha XP antes da v5 recebe o nível e os pontos (antes das regras abaixo).
UPDATE game.players
   SET level = game.level_for_xp(total_xp),
       stat_points = game.level_for_xp(total_xp) - 1
 WHERE level = 1 AND stat_points = 0 AND total_xp >= 100
   AND attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_level') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_level CHECK (level BETWEEN 1 AND 99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_attributes') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_attributes CHECK (
      stat_points >= 0
      AND attr_vitality     BETWEEN 0 AND 10
      AND attr_chakra_max   BETWEEN 0 AND 10
      AND attr_chakra_regen BETWEEN 0 AND 10
      AND attr_agility      BETWEEN 0 AND 10
      AND attr_taijutsu     BETWEEN 0 AND 10
      AND attr_ninjutsu     BETWEEN 0 AND 10
    );
  END IF;
  -- Ninguém tem mais pontos do que os níveis deram.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_stat_points') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_stat_points CHECK (
      stat_points + attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu = level - 1
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_kits') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_kits CHECK (game.valid_kit(kit_a) AND game.valid_kit(kit_b));
  END IF;
END
$$;

-- Nível e pontos andam sozinhos com o XP. O nível nunca muda por fora (nem desce).
CREATE OR REPLACE FUNCTION game.players_level_from_xp() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.level := level_for_xp(NEW.total_xp);
    NEW.stat_points := NEW.level - 1
      - (NEW.attr_vitality + NEW.attr_chakra_max + NEW.attr_chakra_regen + NEW.attr_agility + NEW.attr_taijutsu + NEW.attr_ninjutsu);
    RETURN NEW;
  END IF;

  IF NEW.level IS DISTINCT FROM OLD.level THEN
    RAISE EXCEPTION 'O nível vem do XP e não muda por fora'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_level_from_xp';
  END IF;

  IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
    v_level := level_for_xp(NEW.total_xp);
    IF v_level > OLD.level THEN
      NEW.stat_points := NEW.stat_points + (v_level - OLD.level);
      NEW.level := v_level;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_players_level_from_xp ON game.players;
CREATE TRIGGER trg_players_level_from_xp
  BEFORE INSERT OR UPDATE ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_level_from_xp();

COMMENT ON COLUMN game.players.level IS 'Nível (1 a 99), calculado do total_xp pelo trigger trg_players_level_from_xp.';
COMMENT ON COLUMN game.players.stat_points IS 'Pontos de atributo livres. Livres + gastos = level - 1.';

COMMIT;

-- Conferência (opcional): deve mostrar level, stat_points e os kits de cada jogador.
-- SELECT username, total_xp, level, stat_points, kit_a, kit_b FROM game.players ORDER BY total_xp DESC LIMIT 5;
