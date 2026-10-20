-- =====================================================================
-- Nin Online Mobile: migração v7 (progressão profunda)
--
-- Rode DEPOIS da v6 (schema_v6_aparencia.sql), no SQL Editor do Neon.
-- Pode rodar de novo sem erro: cada passo confere se já foi feito.
--
-- O que entra (o BANCO garante as regras, não só o servidor):
--  1. NÍVEIS ATÉ 60, com mais XP por nível: do nível N para o N+1 são 100·N + 25·N·(N-1).
--     Nível 11 = 13.750 XP; nível 40 = 572.000; nível 60 = 1.888.000.
--     Quem já jogava é recalculado pela curva nova. Se tinha mais pontos gastos do que o
--     nível novo dá, os atributos voltam a zero e os pontos ficam livres para redistribuir.
--  2. CLASSES (9) e JUTSUS (36 de classe + 2 da Academia), em catálogo.
--     game.player_classes: classe Primária (nível 11, virando Genin) e Secundária (nível 40, Chunin).
--     game.player_jutsus: jutsus aprendidos + usage_count (só o servidor conta); o nível do
--     jutsu é uma coluna GERADA do uso (100 = Nv 2, 500 = Nv 3, 2000 = Nv 4) e o uso só sobe.
--  3. INVENTÁRIO e RYŌ: game.items (armas e pergaminhos), game.player_items, players.ryo,
--     players.equipped_weapon (só arma que o jogador tem) e o atributo attr_weapons.
--  4. TUTORIAL DA ACADEMIA: players.tutorial_step (0 a 4). Conta nova começa em 0 (Sala 1);
--     quem já jogava antes desta migração fica com 4 (concluído).
--  5. RANKS POR NÍVEL E MISSÃO: Genin só pela Missão de Genin (nível 11, escolhe a classe);
--     Chunin só pelo Exame Chunin (nível 40, avaliado por um Chunin+); candidatura a Hokage
--     só no nível 60. O XP sozinho não promove mais ninguém.
--  6. EXTRAÇÃO (gacha) no banco: gasta 1/2/4/8 pergaminhos da classe, 80/60/40/20% de chance
--     de aprender um jutsu do tier 1/2/3/4. O sorteio vem do servidor; o banco confere custo,
--     classe, pergaminhos e qual jutsu ensina.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. catálogos

CREATE TABLE IF NOT EXISTS game.classes (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z]+$'),
  name       text     NOT NULL UNIQUE,
  icon       text     NOT NULL,
  sort_order smallint NOT NULL UNIQUE
);
COMMENT ON TABLE game.classes IS 'As 9 classes ninja. A Primária vem no nível 11 (Genin); a Secundária no 40 (Chunin).';

INSERT INTO game.classes (code, name, icon, sort_order) VALUES
  ('heal', 'Cura', '✚', 1),
  ('shadow', 'Sombra', '🌑', 2),
  ('illusion', 'Ilusão', '🌀', 3),
  ('stone', 'Pedra', '⛰', 4),
  ('fire', 'Fogo', '🔥', 5),
  ('water', 'Água', '💧', 6),
  ('taijutsu', 'Taijutsu', '👊', 7),
  ('weapons', 'Armas', '🗡️', 8),
  ('lightning', 'Relâmpago', '⚡', 9)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS game.jutsus (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name       text     NOT NULL,
  class_code text     REFERENCES game.classes (code),
  tier       smallint NOT NULL CHECK (tier BETWEEN 0 AND 4),
  CONSTRAINT ck_jutsus_academy CHECK ((class_code IS NULL) = (tier = 0))
);
COMMENT ON TABLE game.jutsus IS 'Jutsus. tier 0 = Academia (todos aprendem); 1 a 4 = tier da classe (nível de Extração).';

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
  ('teleport', 'Teleporte Curto', NULL, 0),
  ('substitution', 'Substituição', NULL, 0),
  ('heal', 'Cura', 'heal', 1),
  ('heal_2', 'Bálsamo Verde', 'heal', 2),
  ('heal_3', 'Fonte Serena', 'heal', 3),
  ('heal_4', 'Toque da Vida', 'heal', 4),
  ('shadow', 'Sombra', 'shadow', 1),
  ('shadow_2', 'Teia das Sombras', 'shadow', 2),
  ('shadow_3', 'Mãos da Noite', 'shadow', 3),
  ('shadow_4', 'Eclipse', 'shadow', 4),
  ('illusion', 'Ilusão', 'illusion', 1),
  ('illusion_2', 'Névoa Hipnótica', 'illusion', 2),
  ('illusion_3', 'Labirinto Mental', 'illusion', 3),
  ('illusion_4', 'Cárcere dos Sonhos', 'illusion', 4),
  ('stone', 'Pedra', 'stone', 1),
  ('stone_2', 'Pele de Granito', 'stone', 2),
  ('stone_3', 'Muralha de Rocha', 'stone', 3),
  ('stone_4', 'Coração de Montanha', 'stone', 4),
  ('fire', 'Fogo', 'fire', 1),
  ('fire_2', 'Muralha de Chamas', 'fire', 2),
  ('fire_3', 'Fênix Ardente', 'fire', 3),
  ('fire_4', 'Inferno Escarlate', 'fire', 4),
  ('water', 'Água', 'water', 1),
  ('water_2', 'Onda Gêmea', 'water', 2),
  ('water_3', 'Fúria do Oceano', 'water', 3),
  ('water_4', 'Maré Sem Fim', 'water', 4),
  ('taijutsu', 'Taijutsu', 'taijutsu', 1),
  ('taijutsu_2', 'Chute Ciclone', 'taijutsu', 2),
  ('taijutsu_3', 'Cem Golpes', 'taijutsu', 3),
  ('taijutsu_4', 'Punho do Céu', 'taijutsu', 4),
  ('weapons', 'Chuva de Kunais', 'weapons', 1),
  ('weapons_2', 'Leque de Shurikens', 'weapons', 2),
  ('weapons_3', 'Tempestade de Lâminas', 'weapons', 3),
  ('weapons_4', 'Arsenal Celeste', 'weapons', 4),
  ('lightning', 'Faísca Rasante', 'lightning', 1),
  ('lightning_2', 'Lança Trovão', 'lightning', 2),
  ('lightning_3', 'Corrente Elétrica', 'lightning', 3),
  ('lightning_4', 'Julgamento do Raio', 'lightning', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, tier = EXCLUDED.tier;

CREATE TABLE IF NOT EXISTS game.items (
  code       text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name       text     NOT NULL UNIQUE,
  kind       text     NOT NULL CHECK (kind IN ('weapon', 'scroll')),
  class_code text     REFERENCES game.classes (code),
  damage     smallint CHECK (damage > 0),
  price_ryo  integer  CHECK (price_ryo > 0),
  shop       text     CHECK (shop IN ('weapons', 'clothes', 'scrolls')),
  CONSTRAINT ck_items_weapon CHECK ((kind = 'weapon') = (damage IS NOT NULL)),
  CONSTRAINT ck_items_scroll CHECK ((kind = 'scroll') = (class_code IS NOT NULL)),
  CONSTRAINT ck_items_shop   CHECK ((shop IS NULL) = (price_ryo IS NULL))
);
COMMENT ON TABLE game.items IS 'Itens: armas (somam dano ao Ataque Básico) e pergaminhos de classe (gastos na Extração).';

INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('kunai_training', 'Kunai de Treino', 'weapon', NULL, 10, NULL, NULL),
  ('kunai', 'Kunai', 'weapon', NULL, 14, 300, 'weapons'),
  ('fuma_shuriken', 'Shuriken Gigante', 'weapon', NULL, 22, 1200, 'weapons'),
  ('scroll_heal', 'Pergaminho de Cura', 'scroll', 'heal', NULL, 150, 'scrolls'),
  ('scroll_shadow', 'Pergaminho de Sombra', 'scroll', 'shadow', NULL, 150, 'scrolls'),
  ('scroll_illusion', 'Pergaminho de Ilusão', 'scroll', 'illusion', NULL, 150, 'scrolls'),
  ('scroll_stone', 'Pergaminho de Pedra', 'scroll', 'stone', NULL, 150, 'scrolls'),
  ('scroll_fire', 'Pergaminho de Fogo', 'scroll', 'fire', NULL, 150, 'scrolls'),
  ('scroll_water', 'Pergaminho de Água', 'scroll', 'water', NULL, 150, 'scrolls'),
  ('scroll_taijutsu', 'Pergaminho de Taijutsu', 'scroll', 'taijutsu', NULL, 150, 'scrolls'),
  ('scroll_weapons', 'Pergaminho de Armas', 'scroll', 'weapons', NULL, 150, 'scrolls'),
  ('scroll_lightning', 'Pergaminho de Relâmpago', 'scroll', 'lightning', NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, class_code = EXCLUDED.class_code,
  damage = EXCLUDED.damage, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

-- ---------------------------------------------------------------- 2. tabelas do jogador

CREATE TABLE IF NOT EXISTS game.player_jutsus (
  player_id   uuid        NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  jutsu_code  text        NOT NULL REFERENCES game.jutsus (code),
  usage_count integer     NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  -- Nível pelo USO, calculado pelo banco: ninguém escreve o nível direto.
  level       smallint    GENERATED ALWAYS AS (
                CASE WHEN usage_count >= 2000 THEN 4 WHEN usage_count >= 500 THEN 3 WHEN usage_count >= 100 THEN 2 ELSE 1 END
              ) STORED,
  learned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, jutsu_code)
);
COMMENT ON TABLE game.player_jutsus IS 'Jutsus aprendidos. usage_count só sobe (o servidor conta cada uso); level vem dele.';

CREATE TABLE IF NOT EXISTS game.player_classes (
  player_id       uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  primary_class   text        NOT NULL REFERENCES game.classes (code),
  secondary_class text        REFERENCES game.classes (code),
  primary_at      timestamptz NOT NULL DEFAULT now(),
  secondary_at    timestamptz,
  CONSTRAINT ck_player_classes_distinct  CHECK (secondary_class IS NULL OR secondary_class <> primary_class),
  CONSTRAINT ck_player_classes_secondary CHECK ((secondary_class IS NULL) = (secondary_at IS NULL))
);
COMMENT ON TABLE game.player_classes IS 'Classe Primária (Missão de Genin, nível 11) e Secundária (Chunin, nível 40).';

CREATE TABLE IF NOT EXISTS game.player_items (
  player_id uuid    NOT NULL REFERENCES game.players (id) ON DELETE CASCADE,
  item_code text    NOT NULL REFERENCES game.items (code),
  quantity  integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (player_id, item_code)
);
COMMENT ON TABLE game.player_items IS 'Inventário: quantidade de cada item (linha some quando chega a zero).';

CREATE TABLE IF NOT EXISTS game.hokage_candidates (
  player_id  uuid        PRIMARY KEY REFERENCES game.players (id) ON DELETE CASCADE,
  applied_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE game.hokage_candidates IS 'Candidatos a Hokage (só nível 60). A eleição vem numa versão futura.';

-- Colunas novas em players. tutorial_step: quem JÁ EXISTE agora fica com 4 (concluído) e
-- ganha os 7 jutsus de antes; contas criadas depois começam em 0. Feito uma vez só: se a
-- coluna já existe, este bloco não faz nada (rodar de novo não mexe em quem está no tutorial).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'game' AND table_name = 'players' AND column_name = 'tutorial_step') THEN
    ALTER TABLE game.players ADD COLUMN tutorial_step smallint NOT NULL DEFAULT 4;
    ALTER TABLE game.players ALTER COLUMN tutorial_step SET DEFAULT 0;
    INSERT INTO game.player_jutsus (player_id, jutsu_code)
    SELECT p.id, j.code FROM game.players p
      CROSS JOIN unnest(ARRAY['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal', 'teleport', 'substitution']) AS j(code)
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS attr_weapons    smallint NOT NULL DEFAULT 0,   -- +5% de dano de armas por ponto
  ADD COLUMN IF NOT EXISTS ryo             bigint   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipped_weapon text     REFERENCES game.items (code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_ryo') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_ryo CHECK (ryo >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_tutorial') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_tutorial CHECK (tutorial_step BETWEEN 0 AND 4);
  END IF;
END
$$;

-- Conta nova: começa com os 2 jutsus da Academia (e o kit só com eles).
CREATE OR REPLACE FUNCTION game.players_after_insert_v7() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (NEW.id, 'teleport'), (NEW.id, 'substitution')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_players_after_insert_v7 ON game.players;
CREATE TRIGGER trg_players_after_insert_v7 AFTER INSERT ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_after_insert_v7();

-- Uso de jutsu só sobe (contador do servidor; ninguém "zera" ou inventa nível).
CREATE OR REPLACE FUNCTION game.player_jutsus_usage_only_up() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_count < OLD.usage_count OR NEW.player_id <> OLD.player_id OR NEW.jutsu_code <> OLD.jutsu_code THEN
    RAISE EXCEPTION 'O uso de um jutsu só aumenta' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_usage_only_up';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_player_jutsus_usage_only_up ON game.player_jutsus;
CREATE TRIGGER trg_player_jutsus_usage_only_up BEFORE UPDATE ON game.player_jutsus
  FOR EACH ROW EXECUTE FUNCTION game.player_jutsus_usage_only_up();

-- Arma equipada: só uma arma que o jogador TEM.
CREATE OR REPLACE FUNCTION game.players_equipped_weapon_owned() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.equipped_weapon IS NOT NULL AND NEW.equipped_weapon IS DISTINCT FROM OLD.equipped_weapon THEN
    PERFORM 1 FROM player_items pi JOIN items i ON i.code = pi.item_code
     WHERE pi.player_id = NEW.id AND pi.item_code = NEW.equipped_weapon AND i.kind = 'weapon';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Só dá para equipar uma arma do seu inventário'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_equip_owned';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_players_equipped_weapon_owned ON game.players;
CREATE TRIGGER trg_players_equipped_weapon_owned BEFORE UPDATE OF equipped_weapon ON game.players
  FOR EACH ROW EXECUTE FUNCTION game.players_equipped_weapon_owned();

-- Candidato a Hokage: só nível 60.
CREATE OR REPLACE FUNCTION game.hokage_candidates_before_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  PERFORM 1 FROM players WHERE id = NEW.player_id AND level >= 60;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só um ninja de nível 60 pode se candidatar a Hokage'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_hokage_level';
  END IF;
  NEW.applied_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hokage_candidates_before_insert ON game.hokage_candidates;
CREATE TRIGGER trg_hokage_candidates_before_insert BEFORE INSERT ON game.hokage_candidates
  FOR EACH ROW EXECUTE FUNCTION game.hokage_candidates_before_insert();

-- ---------------------------------------------------------------- 3. kits com todos os jutsus

-- Kit válido: até 4 jutsus do catálogo, sem repetir. (Que o jogador SABE o jutsu, o servidor
-- confere ao salvar; aqui a lista fechada impede lixo na coluna.)
CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY['teleport', 'substitution', 'heal', 'heal_2', 'heal_3', 'heal_4', 'shadow', 'shadow_2', 'shadow_3', 'shadow_4', 'illusion', 'illusion_2', 'illusion_3', 'illusion_4', 'stone', 'stone_2', 'stone_3', 'stone_4', 'fire', 'fire_2', 'fire_3', 'fire_4', 'water', 'water_2', 'water_3', 'water_4', 'taijutsu', 'taijutsu_2', 'taijutsu_3', 'taijutsu_4', 'weapons', 'weapons_2', 'weapons_3', 'weapons_4', 'lightning', 'lightning_2', 'lightning_3', 'lightning_4']::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

ALTER TABLE game.players ALTER COLUMN kit_a SET DEFAULT ARRAY['teleport', 'substitution']::text[];
ALTER TABLE game.players ALTER COLUMN kit_b SET DEFAULT ARRAY[]::text[];

-- ---------------------------------------------------------------- 4. curva de níveis (até 60)

-- XP total para COMEÇAR o nível L: soma de 100·N + 25·N·(N-1) para N = 1..L-1
--   = 50·L·(L-1) + 25·(L-2)·(L-1)·L/3   (inteiro: o produto de 3 seguidos divide por 3).
-- MESMA conta de src/realtime/stats.ts (levelStart).
CREATE OR REPLACE FUNCTION game.level_start(l integer) RETURNS bigint
LANGUAGE sql IMMUTABLE
RETURN 50::bigint * l * (l - 1) + 25::bigint * (l - 2) * (l - 1) * l / 3;

CREATE OR REPLACE FUNCTION game.level_for_xp(xp bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  l integer := 1;
BEGIN
  WHILE l < 60 AND game.level_start(l + 1) <= xp LOOP l := l + 1; END LOOP;
  RETURN l;
END $$;

ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_level;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_attributes;
ALTER TABLE game.players DROP CONSTRAINT IF EXISTS ck_players_stat_points;

-- Recalcula todo mundo pela curva nova (o trigger de nível não deixa o nível mudar "por fora":
-- desligado só durante este UPDATE, dentro da transação).
ALTER TABLE game.players DISABLE TRIGGER trg_players_level_from_xp;
UPDATE game.players p
   SET level = n.level,
       stat_points = CASE WHEN n.spent > n.level - 1 THEN n.level - 1 ELSE n.level - 1 - n.spent END,
       attr_vitality     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_vitality END,
       attr_chakra_max   = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_chakra_max END,
       attr_chakra_regen = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_chakra_regen END,
       attr_agility      = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_agility END,
       attr_taijutsu     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_taijutsu END,
       attr_ninjutsu     = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_ninjutsu END,
       attr_weapons      = CASE WHEN n.spent > n.level - 1 THEN 0 ELSE p.attr_weapons END
  FROM (SELECT id, game.level_for_xp(total_xp) AS level,
               attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons AS spent
          FROM game.players) n
 WHERE p.id = n.id;
ALTER TABLE game.players ENABLE TRIGGER trg_players_level_from_xp;

ALTER TABLE game.players ADD CONSTRAINT ck_players_level CHECK (level BETWEEN 1 AND 60);
ALTER TABLE game.players ADD CONSTRAINT ck_players_attributes CHECK (
  stat_points >= 0
  AND attr_vitality     BETWEEN 0 AND 10
  AND attr_chakra_max   BETWEEN 0 AND 10
  AND attr_chakra_regen BETWEEN 0 AND 10
  AND attr_agility      BETWEEN 0 AND 10
  AND attr_taijutsu     BETWEEN 0 AND 10
  AND attr_ninjutsu     BETWEEN 0 AND 10
  AND attr_weapons      BETWEEN 0 AND 10
);
ALTER TABLE game.players ADD CONSTRAINT ck_players_stat_points CHECK (
  stat_points + attr_vitality + attr_chakra_max + attr_chakra_regen + attr_agility + attr_taijutsu + attr_ninjutsu + attr_weapons = level - 1
);

-- O trigger de nível agora conta o atributo Armas nos pontos gastos.
CREATE OR REPLACE FUNCTION game.players_level_from_xp() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.level := level_for_xp(NEW.total_xp);
    NEW.stat_points := NEW.level - 1
      - (NEW.attr_vitality + NEW.attr_chakra_max + NEW.attr_chakra_regen + NEW.attr_agility + NEW.attr_taijutsu + NEW.attr_ninjutsu + NEW.attr_weapons);
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

COMMENT ON COLUMN game.players.level IS 'Nível (1 a 60), calculado do total_xp pelo trigger trg_players_level_from_xp (curva v7).';

-- ---------------------------------------------------------------- 5. ranks por nível

ALTER TABLE game.ranks ADD COLUMN IF NOT EXISTS min_level smallint NOT NULL DEFAULT 1;

INSERT INTO game.ranks (code, name, tier, can_be_sensei)
SELECT 'HOKAGE', 'Hokage', max(tier) + 10, true FROM game.ranks
ON CONFLICT (code) DO NOTHING;

UPDATE game.ranks SET min_level = CASE code WHEN 'GENIN' THEN 11 WHEN 'CHUNIN' THEN 40 WHEN 'HOKAGE' THEN 60 ELSE min_level END
 WHERE code IN ('GENIN', 'CHUNIN', 'HOKAGE');

-- Missão de Genin (na Academia): nível 11, tutorial concluído, ainda Academia e sem classe.
-- Vira Genin, ganha a classe Primária e 1 pergaminho grátis dela.
CREATE OR REPLACE FUNCTION game.become_genin(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_player players%ROWTYPE;
  v_rank   text;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT code INTO v_rank FROM ranks WHERE id = v_player.current_rank_id;
  IF v_player.tutorial_step < 4 THEN
    RAISE EXCEPTION 'Conclua o tutorial da Academia primeiro' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_tutorial_first';
  END IF;
  IF v_player.level < (SELECT min_level FROM ranks WHERE code = 'GENIN') THEN
    RAISE EXCEPTION 'A Missão de Genin é a partir do nível 11' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_level';
  END IF;
  IF v_rank <> 'ACADEMY' THEN
    RAISE EXCEPTION 'Só aluno da Academia faz a Missão de Genin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_genin_rank';
  END IF;
  PERFORM 1 FROM classes WHERE code = p_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Classe inexistente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_unknown'; END IF;
  INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class);   -- PK: uma vez só
  UPDATE players SET current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN') WHERE id = p_player;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'scroll_' || p_class, 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
END $$;

-- Classe Secundária: Chunin (ou acima) e nível 40; diferente da Primária; uma vez só.
CREATE OR REPLACE FUNCTION game.choose_secondary_class(p_player uuid, p_class text) RETURNS void
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_level integer;
  v_tier  smallint;
BEGIN
  SELECT p.level, r.tier INTO v_level, v_tier FROM players p JOIN ranks r ON r.id = p.current_rank_id WHERE p.id = p_player FOR UPDATE OF p;
  IF v_level < (SELECT min_level FROM ranks WHERE code = 'CHUNIN') OR v_tier < (SELECT tier FROM ranks WHERE code = 'CHUNIN') THEN
    RAISE EXCEPTION 'A classe Secundária é para Chunin de nível 40' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_secondary_class';
  END IF;
  UPDATE player_classes SET secondary_class = p_class, secondary_at = now()
   WHERE player_id = p_player AND secondary_class IS NULL AND primary_class <> p_class
     AND EXISTS (SELECT 1 FROM classes WHERE code = p_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Classe Secundária já escolhida, igual à Primária ou inexistente'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_secondary_class';
  END IF;
END $$;

-- ---------------------------------------------------------------- 6. Extração (gacha)

-- p_roll e p_pick: sorteios do SERVIDOR, de 0 a 1 (o cliente não manda nada disso).
-- Ordem: classe do jogador? nível 1..4? sobra jutsu desse tier para aprender? tem pergaminhos?
-- Só então gasta os pergaminhos (sucesso OU falha) e, no sucesso, ensina o jutsu sorteado.
CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost   integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 8 END;
  v_chance double precision := CASE p_level WHEN 1 THEN 0.8 WHEN 2 THEN 0.6 WHEN 3 THEN 0.4 WHEN 4 THEN 0.2 END;
  v_have   integer;
  v_count  integer;
  v_code   text;
BEGIN
  IF v_cost IS NULL OR p_roll < 0 OR p_roll >= 1 OR p_pick < 0 OR p_pick >= 1 THEN
    RAISE EXCEPTION 'Extração inválida' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_extraction_input';
  END IF;
  PERFORM 1 FROM players WHERE id = p_player FOR UPDATE;    -- uma extração por vez por jogador
  PERFORM 1 FROM player_classes WHERE player_id = p_player AND p_class IN (primary_class, secondary_class);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você só aprende jutsus da sua classe' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_class_not_owned';
  END IF;
  SELECT count(*) INTO v_count FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code);
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_' || p_class;
  END IF;
  IF p_roll >= v_chance THEN
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

-- ---------------------------------------------------------------- 7. loja, equipar e tutorial

-- Compra: o preço vem do catálogo (nunca do cliente); ryō não fica negativo.
CREATE OR REPLACE FUNCTION game.buy_item(p_player uuid, p_item text, p_qty integer) RETURNS bigint
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_price integer;
  v_ryo   bigint;
BEGIN
  SELECT price_ryo INTO v_price FROM items WHERE code = p_item AND shop IS NOT NULL;
  IF v_price IS NULL OR p_qty NOT BETWEEN 1 AND 99 THEN
    RAISE EXCEPTION 'Item não está à venda' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_item_not_for_sale';
  END IF;
  UPDATE players SET ryo = ryo - v_price::bigint * p_qty WHERE id = p_player AND ryo >= v_price::bigint * p_qty RETURNING ryo INTO v_ryo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ryō insuficiente' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_not_enough_ryo';
  END IF;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, p_item, p_qty)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + p_qty;
  RETURN v_ryo;
END $$;

-- Tutorial: só avança um passo por vez (p_to = passo atual + 1). Recompensas no banco:
--   passo 3 (entrou na sala de equipamento): Kunai de Treino;  passo 4 (concluiu): +100 ryō e +50 XP.
CREATE OR REPLACE FUNCTION game.advance_tutorial(p_player uuid, p_to integer) RETURNS boolean
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  UPDATE players SET tutorial_step = p_to WHERE id = p_player AND tutorial_step = p_to - 1 AND p_to BETWEEN 1 AND 4;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_to = 3 THEN
    INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'kunai_training', 1)
    ON CONFLICT (player_id, item_code) DO NOTHING;
  ELSIF p_to = 4 THEN
    UPDATE players SET ryo = ryo + 100, total_xp = total_xp + 50 WHERE id = p_player;
  END IF;
  RETURN true;
END $$;

-- ---------------------------------------------------------------- 8. Exame Chunin

INSERT INTO game.titles (code, name, description) VALUES
  ('CHUNIN_EXAM', 'Aprovado no Exame Chunin', 'Passou no Exame Chunin, avaliado por um Chunin ou acima')
ON CONFLICT (code) DO NOTHING;

INSERT INTO game.mission_difficulties (code, name, tier, xp_reward, title_id) VALUES
  ('CHUNIN_EXAM', 'Exame Chunin', 50, 0, (SELECT id FROM game.titles WHERE code = 'CHUNIN_EXAM'))
ON CONFLICT (code) DO NOTHING;

-- Criar o exame: o aprendiz precisa ser Genin de nível 40.
CREATE OR REPLACE FUNCTION game.sensei_missions_chunin_exam() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.difficulty_id = (SELECT id FROM mission_difficulties WHERE code = 'CHUNIN_EXAM') THEN
    PERFORM 1 FROM players p JOIN ranks r ON r.id = p.current_rank_id
     WHERE p.id = NEW.trainee_id AND r.code = 'GENIN' AND p.level >= (SELECT min_level FROM ranks WHERE code = 'CHUNIN');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O Exame Chunin é para Genin de nível 40'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_chunin_exam';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sensei_missions_chunin_exam ON game.sensei_missions;
CREATE TRIGGER trg_sensei_missions_chunin_exam BEFORE INSERT ON game.sensei_missions
  FOR EACH ROW EXECUTE FUNCTION game.sensei_missions_chunin_exam();

-- Exame aprovado (por um Chunin+, regra das avaliações da v2): o aprendiz vira Chunin.
CREATE OR REPLACE FUNCTION game.mission_evaluations_chunin_exam() RETURNS trigger
LANGUAGE plpgsql SET search_path = game AS $$
BEGIN
  IF NEW.is_approved THEN
    UPDATE players p SET current_rank_id = (SELECT id FROM ranks WHERE code = 'CHUNIN')
      FROM sensei_missions m
     WHERE m.id = NEW.mission_id
       AND m.difficulty_id = (SELECT id FROM mission_difficulties WHERE code = 'CHUNIN_EXAM')
       AND p.id = m.trainee_id
       AND p.current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN')
       AND p.level >= (SELECT min_level FROM ranks WHERE code = 'CHUNIN');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_mission_evaluations_chunin_exam ON game.mission_evaluations;
CREATE TRIGGER trg_mission_evaluations_chunin_exam AFTER INSERT ON game.mission_evaluations
  FOR EACH ROW EXECUTE FUNCTION game.mission_evaluations_chunin_exam();

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                 -- 38
-- SELECT code, min_level FROM game.ranks ORDER BY tier;
-- SELECT username, level, tutorial_step, ryo FROM game.players ORDER BY total_xp DESC LIMIT 5;
