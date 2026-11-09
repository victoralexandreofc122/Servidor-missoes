-- =====================================================================================================================
-- v24: pergaminho único e reset de classes do admin. Rode no SQL Editor do Neon, no branch `production`, DEPOIS da v23.
-- Pode rodar de novo sem erro. Nenhum pergaminho se perde.
--
--  1. Um pergaminho só (game.items 'scroll_liso', "Pergaminho"): serve para a Extração de QUALQUER classe sua. A loja vende só ele.
--     Os pergaminhos por classe de antes (scroll_fire, scroll_water...) somam no novo: quem tinha 3 de Fogo e 2 de Água fica com 5.
--     Quem levava um pergaminho de classe nas costas passa a levar o novo. Os itens antigos ficam no catálogo (sem venda), sem dono.
--  2. A Extração (game.extract_jutsu), a Missão de Genin (game.become_genin) e o prêmio do PvP (game.pvp_kill) usam o pergaminho novo.
--     A Extração continua só da sua classe Primária ou Secundária (o banco confere, como antes).
--  3. game.admin_reset_classes(admin, alvo): SÓ em conta de admin. Volta para a Academia sem classe, sem linhagem e sem os jutsus
--     de classe e de clã (os da Academia ficam), para testar a escolha de classes do zero. Nível, itens e ryō ficam. Auditado.
-- =====================================================================================================================
BEGIN;

-- 1. o pergaminho único (a regra "pergaminho tem classe" passa a valer só para os antigos)
ALTER TABLE game.items DROP CONSTRAINT IF EXISTS ck_items_scroll;
ALTER TABLE game.items ADD CONSTRAINT ck_items_scroll CHECK (class_code IS NULL OR kind = 'scroll');
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('scroll_liso', 'Pergaminho', 'scroll', NULL, NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = NULL, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;
UPDATE game.items SET shop = NULL, price_ryo = NULL, name = name || ' (antigo)'
 WHERE kind = 'scroll' AND code <> 'scroll_liso' AND shop IS NOT NULL;

-- os pergaminhos de classe viram o pergaminho único (soma; nada se perde)
INSERT INTO game.player_items (player_id, item_code, quantity)
SELECT pi.player_id, 'scroll_liso', sum(pi.quantity)::int
  FROM game.player_items pi JOIN game.items i ON i.code = pi.item_code
 WHERE i.kind = 'scroll' AND pi.item_code <> 'scroll_liso' AND pi.quantity > 0
 GROUP BY pi.player_id
ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = game.player_items.quantity + EXCLUDED.quantity;
UPDATE game.players p SET equipped_scroll = 'scroll_liso'
  FROM game.items i WHERE i.code = p.equipped_scroll AND i.kind = 'scroll' AND p.equipped_scroll <> 'scroll_liso';
DELETE FROM game.player_items pi USING game.items i
 WHERE i.code = pi.item_code AND i.kind = 'scroll' AND pi.item_code <> 'scroll_liso';

-- 2. Extração, Missão de Genin e prêmio do PvP com o pergaminho único (as mesmas funções de antes; só o item muda)
CREATE OR REPLACE FUNCTION game.extract_jutsu(p_player uuid, p_class text, p_level integer, p_roll double precision, p_pick double precision)
RETURNS TABLE (outcome text, jutsu_code text, consumed integer, scrolls_left integer)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_cost     integer := CASE p_level WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 END;
  v_base     double precision := CASE p_level WHEN 1 THEN 0.9 WHEN 2 THEN 0.8 WHEN 3 THEN 0.6 WHEN 4 THEN 0.4 END;
  v_failures integer;
  v_chance   double precision;
  v_have     integer;
  v_count    integer;
  v_learned  integer;
  v_code     text;
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
  SELECT COALESCE((SELECT quantity FROM player_items WHERE player_id = p_player AND item_code = 'scroll_liso'), 0) INTO v_have;
  IF v_count = 0 THEN
    RETURN QUERY SELECT 'all_learned'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have < v_cost THEN
    RETURN QUERY SELECT 'no_scrolls'::text, NULL::text, 0, v_have;
    RETURN;
  END IF;
  IF v_have = v_cost THEN
    DELETE FROM player_items WHERE player_id = p_player AND item_code = 'scroll_liso';
  ELSE
    UPDATE player_items SET quantity = quantity - v_cost WHERE player_id = p_player AND item_code = 'scroll_liso';
  END IF;
  SELECT COALESCE((SELECT failures FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level), 0)
    INTO v_failures;
  SELECT count(*) INTO v_learned FROM player_jutsus pj JOIN jutsus j ON j.code = pj.jutsu_code
   WHERE pj.player_id = p_player AND j.class_code = p_class AND j.tier = p_level;
  IF p_level = 1 AND v_learned < 2 THEN
    v_chance := 1.0;                                         -- as 2 primeiras do tier 1 são garantidas
  ELSE
    v_chance := least(1.0, v_base + 0.1 * v_failures);
  END IF;
  IF p_roll >= v_chance THEN
    INSERT INTO player_extraction_pity (player_id, class_code, tier, failures) VALUES (p_player, p_class, p_level, 1)
    ON CONFLICT (player_id, class_code, tier) DO UPDATE SET failures = player_extraction_pity.failures + 1;
    RETURN QUERY SELECT 'failed'::text, NULL::text, v_cost, v_have - v_cost;
    RETURN;
  END IF;
  DELETE FROM player_extraction_pity WHERE player_id = p_player AND class_code = p_class AND tier = p_level;
  SELECT j.code INTO v_code FROM jutsus j
   WHERE j.class_code = p_class AND j.tier = p_level
     AND NOT EXISTS (SELECT 1 FROM player_jutsus pj WHERE pj.player_id = p_player AND pj.jutsu_code = j.code)
   ORDER BY j.code OFFSET floor(p_pick * v_count) LIMIT 1;
  INSERT INTO player_jutsus (player_id, jutsu_code) VALUES (p_player, v_code);
  RETURN QUERY SELECT 'success'::text, v_code, v_cost, v_have - v_cost;
END $$;

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
  IF v_player.is_admin THEN
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class)
    ON CONFLICT (player_id) DO UPDATE SET primary_class = EXCLUDED.primary_class, primary_at = now(), secondary_class = NULL, secondary_at = NULL;
  ELSE
    INSERT INTO player_classes (player_id, primary_class) VALUES (p_player, p_class);   -- PK: uma vez só
  END IF;
  UPDATE players SET current_rank_id = (SELECT id FROM ranks WHERE code = 'GENIN') WHERE id = p_player;
  INSERT INTO player_items (player_id, item_code, quantity) VALUES (p_player, 'scroll_liso', 1)
  ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
END $$;

CREATE OR REPLACE FUNCTION game.pvp_kill(p_winner uuid, p_loser uuid)
RETURNS TABLE (counted boolean, winner_delta integer, loser_delta integer, winner_mmr integer, loser_mmr integer,
               loot_ryo integer, became_renegade boolean, bounty_paid bigint, winner_bounty bigint, loser_bounty bigint,
               kage_hunted text, ryo_winner bigint)
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  w        players%ROWTYPE;
  l        players%ROWTYPE;
  v_admin  boolean;
  v_season integer;
  v_wm     integer;
  v_lm     integer;
  v_delta  integer := 0;
  v_pair   integer;
  v_kills  integer;
  v_kage   text;
  v_pay    bigint := 0;
  v_add    bigint;
BEGIN
  -- trava as duas linhas sempre na mesma ordem (sem deadlock entre duas mortes cruzadas)
  PERFORM 1 FROM players WHERE id IN (p_winner, p_loser) ORDER BY id FOR UPDATE;
  SELECT * INTO w FROM players WHERE id = p_winner;
  SELECT * INTO l FROM players WHERE id = p_loser;
  IF w.id IS NULL OR l.id IS NULL OR p_winner = p_loser THEN
    RAISE EXCEPTION 'Jogador inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  v_admin := w.is_admin OR l.is_admin;
  counted := false; winner_delta := 0; loser_delta := 0; loot_ryo := 0; became_renegade := false; bounty_paid := 0; kage_hunted := NULL;

  -- 1. ranking (Elo): nada de admin, no máximo 3 vezes a mesma dupla por dia, diferença de nível até 10
  IF endgame_active('pvp') AND NOT v_admin AND abs(w.level - l.level) <= 10 THEN
    SELECT count(*) INTO v_pair FROM pvp_matches m
     WHERE m.winner_id = p_winner AND m.loser_id = p_loser AND m.counted AND m.at > now() - interval '24 hours';
    IF v_pair < 3 THEN
      counted := true;
      INSERT INTO pvp_ratings (player_id) VALUES (p_winner), (p_loser) ON CONFLICT (player_id) DO NOTHING;
      SELECT r.mmr INTO v_wm FROM pvp_ratings r WHERE r.player_id = p_winner;
      SELECT r.mmr INTO v_lm FROM pvp_ratings r WHERE r.player_id = p_loser;
      v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_lm - v_wm) / 400.0))))::int);
      UPDATE pvp_ratings SET mmr = mmr + v_delta, wins = wins + 1, updated_at = now() WHERE player_id = p_winner;
      UPDATE pvp_ratings SET mmr = greatest(0, mmr - v_delta), losses = losses + 1, updated_at = now() WHERE player_id = p_loser;
      SELECT s.id INTO v_season FROM pvp_seasons s WHERE s.closed_at IS NULL;
      IF v_season IS NOT NULL THEN
        INSERT INTO pvp_season_ratings (season_id, player_id) VALUES (v_season, p_winner), (v_season, p_loser) ON CONFLICT DO NOTHING;
        SELECT r.mmr INTO v_wm FROM pvp_season_ratings r WHERE r.season_id = v_season AND r.player_id = p_winner;
        SELECT r.mmr INTO v_lm FROM pvp_season_ratings r WHERE r.season_id = v_season AND r.player_id = p_loser;
        v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_lm - v_wm) / 400.0))))::int);
        UPDATE pvp_season_ratings SET mmr = mmr + v_delta, wins = wins + 1 WHERE season_id = v_season AND player_id = p_winner;
        UPDATE pvp_season_ratings SET mmr = greatest(0, mmr - v_delta), losses = losses + 1 WHERE season_id = v_season AND player_id = p_loser;
      END IF;
      winner_delta := v_delta;
      loser_delta := -v_delta;
    END IF;
  END IF;
  INSERT INTO pvp_matches (season_id, winner_id, loser_id, counted, winner_delta, loser_delta)
  VALUES ((SELECT s.id FROM pvp_seasons s WHERE s.closed_at IS NULL), p_winner, p_loser, counted, winner_delta, loser_delta);

  -- 2. karma: derrotar ninja da PRÓPRIA vila. No 20º, vira renegado (sem aviso antes).
  IF endgame_active('renegados') AND NOT v_admin AND w.village IS NOT NULL AND w.village = l.village THEN
    UPDATE players SET own_village_kills = own_village_kills + 1 WHERE id = p_winner RETURNING own_village_kills INTO v_kills;
    IF v_kills >= 20 THEN
      became_renegade := make_renegade(p_winner, 'karma: 20 ninjas da própria vila');
    END IF;
  END IF;

  -- 3. espólio de guerra: inimigo de uma vila em guerra com a sua
  IF NOT v_admin AND w.village IS NOT NULL AND l.village IS NOT NULL AND village_relation(w.village, l.village) = 'guerra' THEN
    loot_ryo := 25 + 2 * l.level;
    UPDATE players SET ryo = ryo + loot_ryo WHERE id = p_winner;
  END IF;

  -- 4. recompensa pela cabeça (uma vez por dia por dupla, em cada sentido)
  IF endgame_active('renegados') AND NOT v_admin THEN
    IF w.renegade_at IS NOT NULL AND l.village IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM bounty_events b WHERE b.renegade_id = p_winner AND b.other_id = p_loser AND b.kind = 'aumento' AND b.at > now() - interval '24 hours') THEN
      v_add := 50 + 5 * l.level;
      UPDATE players SET bounty_ryo = bounty_ryo + v_add WHERE id = p_winner;
      INSERT INTO bounty_events (renegade_id, other_id, kind, amount) VALUES (p_winner, p_loser, 'aumento', v_add);
    END IF;
    IF l.renegade_at IS NOT NULL AND w.village IS NOT NULL AND l.bounty_ryo > 0 AND NOT EXISTS (
         SELECT 1 FROM bounty_events b WHERE b.renegade_id = p_loser AND b.other_id = p_winner AND b.kind = 'cobranca' AND b.at > now() - interval '24 hours') THEN
      v_pay := l.bounty_ryo / 2;
      IF v_pay > 0 THEN
        UPDATE players SET bounty_ryo = bounty_ryo - v_pay WHERE id = p_loser;
        UPDATE players SET ryo = ryo + v_pay WHERE id = p_winner;
        INSERT INTO bounty_events (renegade_id, other_id, kind, amount) VALUES (p_loser, p_winner, 'cobranca', v_pay);
        IF v_pay >= 1000 THEN
          INSERT INTO player_items (player_id, item_code, quantity)
          SELECT p_winner, 'scroll_liso', 1 FROM player_classes c WHERE c.player_id = p_winner
          ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = player_items.quantity + 1;
        END IF;
      END IF;
      bounty_paid := v_pay;
    END IF;
  END IF;

  -- 5. Akatsuki caça Kages (e ninjas de nível 50+)
  IF endgame_active('akatsuki') AND NOT v_admin AND akatsuki_slot_of(p_winner) IS NOT NULL THEN
    v_kage := kage_village_of(p_loser);
    IF v_kage IS NOT NULL THEN
      kage_hunted := v_kage;
      UPDATE players SET ryo = ryo + 3000 WHERE id = p_winner;
      INSERT INTO titles (code, name, description) VALUES ('KAGE_HUNTER', 'Caçador de Kages', 'Membro da Akatsuki que derrotou um Kage')
      ON CONFLICT (code) DO NOTHING;
      INSERT INTO player_titles (player_id, title_id) SELECT p_winner, t.id FROM titles t WHERE t.code = 'KAGE_HUNTER'
      ON CONFLICT (player_id, title_id) DO NOTHING;
    ELSIF l.level >= 50 THEN
      UPDATE players SET ryo = ryo + 200 WHERE id = p_winner;
    END IF;
  END IF;

  SELECT r.mmr INTO winner_mmr FROM pvp_ratings r WHERE r.player_id = p_winner;
  SELECT r.mmr INTO loser_mmr FROM pvp_ratings r WHERE r.player_id = p_loser;
  SELECT p.bounty_ryo, p.ryo INTO winner_bounty, ryo_winner FROM players p WHERE p.id = p_winner;
  SELECT p.bounty_ryo INTO loser_bounty FROM players p WHERE p.id = p_loser;
  RETURN NEXT;
END $$;

-- 3. reset de classes, só em conta de admin (para testar builds do zero)
CREATE OR REPLACE FUNCTION game.admin_reset_classes(p_admin uuid, p_target uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  v_removed integer;
BEGIN
  PERFORM assert_admin(p_admin);
  PERFORM 1 FROM players WHERE id = p_target AND is_admin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O reset de classes é só para conta de admin' USING ERRCODE = 'check_violation', CONSTRAINT = 'rule_admin_reset_target';
  END IF;
  DELETE FROM player_classes WHERE player_id = p_target;
  DELETE FROM player_jutsus pj USING jutsus j
   WHERE j.code = pj.jutsu_code AND pj.player_id = p_target AND (j.class_code IS NOT NULL OR j.clan_code IS NOT NULL);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  DELETE FROM player_extraction_pity WHERE player_id = p_target;
  UPDATE players
     SET clan = NULL,
         current_rank_id = (SELECT id FROM ranks WHERE code = 'ACADEMY'),
         kit_a = ARRAY(SELECT k FROM unnest(kit_a) AS k WHERE k IN ('teleport', 'substitution')),
         kit_b = ARRAY(SELECT k FROM unnest(kit_b) AS k WHERE k IN ('teleport', 'substitution'))
   WHERE id = p_target;
  PERFORM admin_log(p_admin, 'resetclasses', p_target, jsonb_build_object('removed', v_removed), true, NULL);
  RETURN v_removed;
END $$;

COMMIT;

-- Conferência (opcional):
-- SELECT code, name, shop FROM game.items WHERE kind = 'scroll' ORDER BY code;         -- scroll_liso na loja; os antigos sem loja
-- SELECT count(*) FROM game.player_items WHERE item_code LIKE 'scroll_%' AND item_code <> 'scroll_liso';   -- 0
