import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLASSES, JUTSUS } from '../src/realtime/jutsus.js';
import { createTestDatabase } from './support/testDb.js';

/* v45: auditoria do catálogo no BANCO (todas as migrações rodadas em ordem): os 100 jutsus do servidor estão em game.jutsus. */
const noDatabase = !process.env.TEST_DATABASE_URL;

describe('v45 no banco: os 100 jutsus do catálogo', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('game.jutsus tem os mesmos 100 códigos, com o mesmo nome, classe e tier do servidor', async () => {
    const { rows } = await t.pool.query(`SELECT code, name, tier, class_code AS class FROM game.jutsus ORDER BY code`);
    const db = new Map(rows.map((r) => [r.code, r]));
    assert.deepEqual([...db.keys()].sort(), JUTSUS.map((j) => j.code).sort());
    for (const j of JUTSUS) {
      const r = db.get(j.code)!;
      assert.equal(r.name, j.name, j.code);
      assert.equal(Number(r.tier), j.tier, j.code);
      assert.equal(r.class ?? null, j.class, j.code);
    }
  });

  it('nenhuma classe com buraco: as 10 classes têm jutsu nos tiers 1 a 4 no banco', async () => {
    const { rows } = await t.pool.query(`SELECT class_code AS code, array_agg(DISTINCT tier ORDER BY tier) AS tiers, count(*)::int AS n FROM game.jutsus WHERE class_code IS NOT NULL GROUP BY class_code`);
    assert.deepEqual(rows.map((r) => r.code).sort(), [...CLASSES].sort());
    for (const r of rows) {
      assert.deepEqual(r.tiers.map(Number), [1, 2, 3, 4], r.code);
      assert.ok(r.n >= 8, `${r.code}: ${r.n} jutsus`);
    }
  });
});
