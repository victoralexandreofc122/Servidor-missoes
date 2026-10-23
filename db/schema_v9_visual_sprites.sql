-- =====================================================================
-- Nin Online Mobile: migração v9 (visual em sprites: gênero, cabelo, olhos, roupa e vila)
--
-- Rode DEPOIS da v8 (schema_v8_admin_chat.sql), no SQL Editor do Neon (branch `production`).
-- Pode rodar de novo sem erro. Não apaga nem muda nenhum visual que já está gravado.
--
-- O que muda: a checagem do `appearance` (game.valid_appearance) passa a aceitar o visual NOVO,
-- feito de nomes de paleta (sem cor livre):
--   {"v":2,"gender":"f","skin":"canela","hairStyle":"longo_lateral","hairColor":"preto",
--    "eyeStyle":"cilios","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho",
--    "pantsColor":"cinza","bandana":true,"village":"vila_1"}
-- O visual ANTIGO (5 cores "#rrggbb", da v6) continua valendo: o servidor converte para a cor mais
-- parecida quando o jogador entra, e grava o novo na próxima vez que ele salvar no Criador.
-- Os nomes válidos de cada campo ficam no servidor (src/realtime/appearance.ts); o banco confere o
-- formato (chaves, tipos, gênero e nomes em minúsculas), e recusa qualquer outra coisa.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION game.valid_appearance(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN a IS NULL OR (
  jsonb_typeof(a) = 'object'
  AND (
    -- v6: as 5 cores do boneco antigo
    (
      (SELECT count(*) FROM jsonb_object_keys(a)) = 5
      AND a ?& ARRAY['skin', 'hair', 'shirt', 'pants', 'cape']
      AND (SELECT bool_and(jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^#[0-9a-f]{6}$') FROM jsonb_each(a) AS e(k, v))
    )
    OR
    -- v9: sprites (nomes de paleta)
    (
      (SELECT count(*) FROM jsonb_object_keys(a)) = 12
      AND a ?& ARRAY['v', 'gender', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'eyeColor', 'outfit',
                     'shirtColor', 'pantsColor', 'bandana', 'village']
      AND a -> 'v' = '2'::jsonb
      AND jsonb_typeof(a -> 'gender') = 'string' AND a ->> 'gender' IN ('m', 'f')
      AND jsonb_typeof(a -> 'bandana') = 'boolean'
      AND (SELECT bool_and(jsonb_typeof(a -> k) = 'string' AND (a ->> k) ~ '^[a-z][a-z0-9_]{0,23}$')
             FROM unnest(ARRAY['skin', 'hairStyle', 'hairColor', 'eyeStyle', 'eyeColor', 'outfit',
                               'shirtColor', 'pantsColor', 'village']) AS f(k))
    )
  )
);

COMMENT ON COLUMN game.players.appearance IS
  'Visual do personagem. v9: {"v":2, gender, skin, hairStyle, hairColor, eyeStyle, eyeColor, outfit, shirtColor, pantsColor, bandana, village} (nomes de paleta). Ainda aceita o formato da v6 (5 cores). NULL = personagem ainda não criado.';

COMMIT;

-- Conferência (opcional): as duas linhas devem dar "true".
-- SELECT game.valid_appearance('{"v":2,"gender":"f","skin":"canela","hairStyle":"longo_lateral","hairColor":"preto","eyeStyle":"cilios","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho","pantsColor":"cinza","bandana":true,"village":"vila_1"}'::jsonb);
-- SELECT game.valid_appearance('{"skin":"#f1c9a0","hair":"#2b2118","shirt":"#2f5d8a","pants":"#2a2a33","cape":"#8a2b2b"}'::jsonb);
