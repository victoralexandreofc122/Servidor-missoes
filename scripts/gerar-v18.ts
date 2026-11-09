/*
 * Gera db/schema_v18_jutsus_classes.sql a partir do catálogo do servidor (src/realtime/jutsus.ts), e atualiza a lista
 * de game.valid_kit da v16 e da v20 (as três têm a lista completa: rodar uma de novo não encolhe a regra dos kits).
 * Uso: npx tsx scripts/gerar-v18.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CLASSES, CLASS_INFO, JUTSUS } from '../src/realtime/jutsus.js';
const rows = JUTSUS.filter((j) => j.class && j.class !== 'fire' && j.tier >= 1 && (j.numbers || j.class === 'wind' || j.code.includes('_') && !/_[234]$/.test(j.code)))
  .map((j) => `  ('${j.code}', '${j.name.replace(/'/g, "''")}', '${j.class}', ${j.tier})`);
const codes = JUTSUS.map((j) => `'${j.code}'`);
const lines: string[] = []; let line = '    ';
for (const c of codes) { if (line.length + c.length + 2 > 118) { lines.push(line.trimEnd()); line = '    '; } line += c + ', '; }
lines.push(line.trimEnd().replace(/,$/, ''));
const sql = (`-- =====================================================================================================================
-- v18: Jutsus v2, entrega 5 (as outras classes, a classe Vento e os jutsus de sistema próprio). Rode no SQL Editor do Neon, no branch \`production\`, depois da v16.
-- Pode rodar de novo sem erro. Mexe no catálogo game.jutsus e na regra dos kits (game.valid_kit):
--
--  1. ${rows.length} jutsus em game.jutsus: os ${rows.length - 23} novos (códigos novos) e os nomes novos dos tiers 2 a 4 de Água, Relâmpago,
--     Terra, Médico, Armas, Ilusão, Taijutsu e Sombra (os códigos ficam: quem já tem continua com eles, com o uso e o
--     nível). A Extração (game.extract_jutsu, v10) passa a sortear entre eles.
--  2. game.valid_kit aceita os ${codes.length} códigos do jogo. A lista só cresce: todo kit de hoje continua valendo.
--
-- Nenhum código é renomeado nem apagado.
-- =====================================================================================================================
BEGIN;

-- a classe Vento (a 10ª) e o pergaminho dela, antes dos jutsus (chave estrangeira)
INSERT INTO game.classes (code, name, icon, sort_order) VALUES
  ('wind', '${CLASS_INFO.wind.name}', '${CLASS_INFO.wind.icon}', ${CLASSES.indexOf('wind') + 1})
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
INSERT INTO game.items (code, name, kind, class_code, damage, price_ryo, shop) VALUES
  ('scroll_wind', 'Pergaminho de ${CLASS_INFO.wind.name}', 'scroll', 'wind', NULL, 150, 'scrolls')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, price_ryo = EXCLUDED.price_ryo, shop = EXCLUDED.shop;

INSERT INTO game.jutsus (code, name, class_code, tier) VALUES
${rows.join(',\n')}
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, class_code = EXCLUDED.class_code, tier = EXCLUDED.tier;

CREATE OR REPLACE FUNCTION game.valid_kit(kit text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
RETURN kit IS NOT NULL
   AND cardinality(kit) <= 4
   AND kit <@ ARRAY[
${lines.join('\n')}
   ]::text[]
   AND cardinality(kit) = (SELECT count(DISTINCT s) FROM unnest(kit) AS s);

COMMIT;

-- Conferência (opcional):
-- SELECT count(*) FROM game.jutsus;                                                               -- ${JUTSUS.filter((j) => !j.clan).length}
-- SELECT class_code, count(*) FROM game.jutsus GROUP BY class_code ORDER BY class_code;
-- SELECT game.valid_kit(ARRAY['water_dragao', 'stone_pilares', 'heal_aura', 'shadow_4']);         -- true`);
writeFileSync(new URL('../db/schema_v18_jutsus_classes.sql', import.meta.url), sql + '\n');
for (const file of ['schema_v16_jutsus_fogo.sql', 'schema_v20_extracao.sql', 'schema_v25_linhagem.sql']) {
  const url = new URL(`../db/${file}`, import.meta.url);
  const text = readFileSync(url, 'utf8').replace(/AND kit <@ ARRAY\[\n[\s\S]*?\n   \]::text\[\]/, `AND kit <@ ARRAY[\n${lines.join('\n')}\n   ]::text[]`);
  writeFileSync(url, text);
}
console.log(`v18: ${rows.length} jutsus; valid_kit: ${codes.length} códigos (v16, v18 e v20)`);
