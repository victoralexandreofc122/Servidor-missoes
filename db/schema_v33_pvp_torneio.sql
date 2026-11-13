-- =====================================================================================================================
-- v33: calendário automático da Era, Torneio dos Heróis e dos Vilões e rankeado 3v3. Rode no SQL Editor do Neon, no
-- branch `production`, DEPOIS da v32 e ANTES do código novo. Pode rodar de novo sem erro. Nada é apagado.
--
--  1. game.close_era: fecha a Era (60 dias) que venceu e abre a próxima. O servidor chama a cada minuto; a abertura e o
--     fechamento do Torneio da Temporada usam as funções que já existem (v27 e v28).
--  2. Torneio dos Heróis (Jounin, menos o Kage; um por vila, título "Herói da Vila X") e Torneio dos Vilões (renegados,
--     título "Vilão Mais Forte da Era"): inscrições, chave (melhor de 3) e o campeão de cada Era.
--  3. Rankeado 3v3: pontos (MMR) próprios, começando em 1000, e cada partida gravada (Elo K = 24 com a média do time).
-- =====================================================================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. a virada da Era

-- Fecha a Era aberta que já venceu (ends_at <= p_now) e abre a próxima com 60 dias. Torneio da Temporada em andamento
-- (grupos ou chaves) segura a virada: o servidor termina a Fase Final primeiro. Devolve a Era fechada (ou NULL).
CREATE OR REPLACE FUNCTION game.close_era(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SET search_path = game AS $$
DECLARE
  s record;   -- record (e não seasons%ROWTYPE): a função cria mesmo num banco ainda sem a v27
BEGIN
  SELECT * INTO s FROM seasons WHERE closed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR s.ends_at > p_now THEN RETURN NULL; END IF;
  IF COALESCE(to_jsonb(s) ->> 'jounin_stage', 'pontos') IN ('grupos', 'chaves') THEN RETURN NULL; END IF;
  UPDATE seasons SET closed_at = p_now WHERE id = s.id;
  INSERT INTO seasons (id, starts_at, ends_at) VALUES (s.id + 1, p_now, p_now + interval '60 days');
  RETURN s.id;
END $$;

COMMIT;
