-- =====================================================================
-- Nin Online Mobile: migração v3 (login)
-- Adiciona e-mail e hash de senha em game.players.
--
-- Rode DEPOIS do db/schema_ranks_missoes_sensei.sql (v2), uma vez, no SQL
-- Editor do Neon. Pode rodar de novo sem erro: cada passo confere se já foi feito.
-- Não apaga nem altera nenhum dado existente.
--
-- Decisões:
--  * As duas colunas aceitam NULL. Jogadores criados antes da v3 (ou
--    anonimizados pela LGPD) ficam sem login. A regra ck_players_credentials
--    garante que e-mail e senha andam juntos: os dois preenchidos ou os dois NULL.
--  * O e-mail é gravado já normalizado (minúsculo, sem espaço nas pontas), e o
--    banco recusa outra forma. Por isso o índice único é na coluna pura.
--  * password_hash só aceita o formato do scrypt ("$scrypt$..."). Uma senha em
--    texto puro gravada por engano é recusada pelo próprio banco.
-- =====================================================================

ALTER TABLE game.players
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS password_hash text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_email') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_email CHECK (
      email IS NULL OR (
        char_length(email) BETWEEN 3 AND 254
        AND email = lower(btrim(email))
        AND email LIKE '_%@_%'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_password_hash') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_password_hash CHECK (
      password_hash IS NULL OR password_hash LIKE '$scrypt$%'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'game.players'::regclass AND conname = 'ck_players_credentials') THEN
    ALTER TABLE game.players ADD CONSTRAINT ck_players_credentials CHECK (
      (email IS NULL) = (password_hash IS NULL)
    );
  END IF;
END
$$;

-- Um e-mail por conta. Também é o índice da busca do login por e-mail.
-- (O login por username usa o ux_players_username da v2, em lower(username).)
CREATE UNIQUE INDEX IF NOT EXISTS ux_players_email ON game.players (email);

COMMENT ON COLUMN game.players.email IS 'E-mail de login, minúsculo. NULL = conta sem login (antiga ou anonimizada).';
COMMENT ON COLUMN game.players.password_hash IS 'Hash scrypt no formato $scrypt$ln=..,r=..,p=..$sal$hash. Nunca a senha.';

-- Conferência (opcional): deve listar email e password_hash.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'game' AND table_name = 'players' AND column_name IN ('email', 'password_hash');
