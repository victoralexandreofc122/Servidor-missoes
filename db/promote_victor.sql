-- =====================================================================
-- Herança do Fogo: SCRIPT DE TESTE (não é migração do jogo)
--
-- Deixa a conta "Victor" no rank máximo (Kage) para testar o lado social:
-- criar missões de sensei para outros jogadores, avaliar, etc.
--
-- Rode no SQL Editor do Neon quando quiser. Pode rodar de novo sem erro.
-- Depois: saia do jogo e entre de novo (o rank é lido ao conectar).
--
-- O que faz:
--  1. Cria o rank HOKAGE (se não existir), um degrau acima do mais alto que houver,
--     com permissão de sensei. Rank novo é só um INSERT (sem ALTER, sem código).
--  2. Promove o jogador "Victor" (sem diferenciar maiúsculas). A troca de rank fica
--     registrada no histórico (player_rank_changes) pelo trigger do schema.
--  3. Com a migração v8 aplicada, liga o Modo Administrador (is_admin) da mesma conta.
--
-- Efeito colateral esperado: o NPC Mestre fica ABAIXO do Kage, então ele não passa
-- treino para essa conta ("Seu rank já passou dos meus treinos"). Para as outras, nada muda.
-- =====================================================================

BEGIN;

INSERT INTO game.ranks (code, name, tier, can_be_sensei)
SELECT 'HOKAGE', 'Kage', max(tier) + 10, true FROM game.ranks
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  n integer;
BEGIN
  UPDATE game.players
     SET current_rank_id = (SELECT id FROM game.ranks WHERE code = 'HOKAGE')
   WHERE lower(username) = 'victor';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE NOTICE 'Nenhuma conta com o nome "Victor". Crie a conta no jogo e rode este script de novo.';
  ELSE
    RAISE NOTICE 'Conta Victor agora é Kage. Saia e entre de novo no jogo.';
  END IF;
END
$$;

-- 3. Modo Administrador (migração v8): comandos /admin no chat, todos auditados.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'game' AND table_name = 'players' AND column_name = 'is_admin') THEN
    UPDATE game.players SET is_admin = true WHERE lower(username) = 'victor';
  END IF;
END
$$;

COMMIT;

-- Conferência:
-- SELECT p.username, r.code, r.name, r.tier FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id
--  WHERE lower(p.username) = 'victor';
