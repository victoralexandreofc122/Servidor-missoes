import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { JUTSUS } from '../src/realtime/jutsus.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/*
 * Migração v16 (db/schema_v16_jutsus_fogo.sql) no PostgreSQL de verdade: os 7 jutsus de Fogo novos entram no catálogo,
 * fire_2 a fire_4 ganham os nomes novos, ninguém perde nada e a Extração sorteia entre os do tier.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V21 = readFileSync(new URL('../db/schema_v21_nomes_jutsus.sql', import.meta.url), 'utf8');
const V16 = readFileSync(new URL('../db/schema_v16_jutsus_fogo.sql', import.meta.url), 'utf8');

/** Genin de Fogo com `scrolls` pergaminhos de Fogo. */
async function genin(t: Awaited<ReturnType<typeof createTestDatabase>>, name: string, scrolls: number) {
  const id = await t.createPlayer(name);
  for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
  await makeProgression(t.db).grantXp(id, levelStart(11));
  const store = makeNinjaStore(t.db);
  await store.becomeGenin(id, 'fire');
  await store.addItem(id, 'scroll_fire', scrolls);
  return { id, store };
}

describe('v16 no banco: o Fogo novo (Jutsus v2, entrega 2)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('o catálogo do banco é o do servidor (Fogo 4 + 4 + 2 + 1); rodar a v16 de novo (até depois da v18) não muda nada', async () => {
    const read = async () => (await t.pool.query('SELECT code, name, class_code, tier FROM game.jutsus ORDER BY code')).rows;
    const want = JUTSUS.map((j) => ({ code: j.code, name: j.name, class_code: j.class, tier: j.tier })).sort((a, b) => (a.code < b.code ? -1 : 1));
    assert.deepEqual(await read(), want);
    await t.pool.query(V16);
    await t.pool.query(V16);
    await t.pool.query(V21);                  // a v16 devolve os nomes antigos de fire_2 a fire_4; a v21 os põe de novo (DEPLOY.md avisa)
    await t.pool.query(V21);
    assert.deepEqual(await read(), want);
    const tiers = (await t.pool.query(`SELECT tier, count(*)::int AS n FROM game.jutsus WHERE class_code = 'fire' GROUP BY tier ORDER BY tier`)).rows;
    assert.deepEqual(tiers, [{ tier: 1, n: 4 }, { tier: 2, n: 4 }, { tier: 3, n: 2 }, { tier: 4, n: 1 }]);
  });

  it('valid_kit aceita todo código do catálogo (de 4 em 4) e um kit com os jutsus novos se salva', async () => {
    const codes = JUTSUS.map((j) => j.code);
    for (let i = 0; i < codes.length; i += 4) {
      const kit = codes.slice(i, i + 4);
      assert.equal((await t.pool.query('SELECT game.valid_kit($1::text[]) AS ok', [kit])).rows[0].ok, true, kit.join(','));
    }
    assert.equal((await t.pool.query(`SELECT game.valid_kit(ARRAY['fire_inventado']) AS ok`)).rows[0].ok, false);
    const id = await t.createPlayer('kitado');
    await t.pool.query(`UPDATE game.players SET kit_a = ARRAY['fire_endan', 'fire_lamina', 'fire_3', 'fire_4'] WHERE id = $1`, [id]);
  });

  it('a Extração do tier 3 do Fogo dá um dos 2 (Varredura Flamejante ou Míssil Dragão) e depois o outro', async () => {
    const { id, store } = await genin(t, 'pirofilo', 8);
    const got: string[] = [];
    for (const pick of [0.99, 0]) {
      const r = await store.extract(id, 'fire', 3, 0, pick);
      assert.ok(r.ok && r.outcome === 'success');
      got.push(r.jutsu!);
    }
    assert.deepEqual(got.sort(), ['fire_3', 'fire_hotan']);
  });
});

describe('v16 sobre um banco de antes: quem tinha o Fogo antigo continua com ele', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v16_jutsus_fogo.sql')); });
  after(async () => { await t?.drop(); });

  it('fire_4 aprendido, com uso, continua; só o nome muda; os novos aparecem', async () => {
    const id = await t.createPlayer('veterano');
    await t.pool.query(`INSERT INTO game.player_jutsus (player_id, jutsu_code, usage_count) VALUES ($1, 'fire_4', 600)`, [id]);
    assert.equal((await t.pool.query(`SELECT name FROM game.jutsus WHERE code = 'fire_4'`)).rows[0].name, 'Inferno Escarlate');
    await t.pool.query(V16);
    const row = (await t.pool.query(`SELECT usage_count, level FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'fire_4'`, [id])).rows[0];
    assert.deepEqual(row, { usage_count: 600, level: 3 });
    assert.equal((await t.pool.query(`SELECT name FROM game.jutsus WHERE code = 'fire_4'`)).rows[0].name, 'Chuva de Meteoros');
    assert.equal(Number((await t.pool.query('SELECT count(*) AS n FROM game.jutsus')).rows[0].n), JUTSUS.length);
  });
});
