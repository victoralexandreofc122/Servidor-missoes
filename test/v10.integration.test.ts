import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { EXTRACTION, extractionChance } from '../src/realtime/jutsus.js';
import { NINJA_SQL, makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V10 = readFileSync(new URL('../db/schema_v10_design.sql', import.meta.url), 'utf8');

/** Genin de Água com `scrolls` pergaminhos dela. */
async function genin(t: Awaited<ReturnType<typeof createTestDatabase>>, name: string, scrolls: number) {
  const id = await t.createPlayer(name);
  for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
  await makeProgression(t.db).grantXp(id, levelStart(11));
  const store = makeNinjaStore(t.db);
  await store.becomeGenin(id, 'water');
  await store.addItem(id, 'scroll_water', scrolls);
  return { id, store };
}

describe('v10 no banco: proteção contra azar na Extração (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('cada falha soma +10 pontos na próxima do mesmo tier e da mesma classe; acertou, zera', async () => {
    const { id, store } = await genin(t, 'azarado', 8 * 4 + 1);
    // tier 4 (20%): 0,25 falha com 20%, mas passa com 30% (uma falha antes)
    const first = await store.extract(id, 'water', 4, 0.25, 0);
    assert.ok(first.ok && first.outcome === 'failed');
    assert.deepEqual(await store.extractionFailures(id), { water: { 4: 1 } });
    assert.equal(extractionChance(4, 1), 0.2 + 0.1);
    const second = await store.extract(id, 'water', 4, 0.25, 0);
    assert.ok(second.ok && second.outcome === 'success', 'com a sorte acumulada, 0,25 < 30%');
    assert.deepEqual(await store.extractionFailures(id), {}, 'acertou: zerou');
    // o tier 1 tem a conta dele: falhar no 4 não ajuda no 1
    const t1 = await store.extract(id, 'water', 1, 0.85, 0);
    assert.ok(t1.ok && t1.outcome === 'failed', '0,85 >= 80%: o tier 1 não herdou nada');
    assert.deepEqual(await store.extractionFailures(id), { water: { 1: 1 } });
  });

  it('no tier 4, no máximo 9 tentativas: a 9ª tem 100% (até com o pior sorteio)', async () => {
    const { id, store } = await genin(t, 'teimoso', 8 * 9);
    const outcomes: string[] = [];
    for (let i = 0; i < 9; i++) {
      const r = await store.extract(id, 'water', 4, 0.999999, 0);
      assert.ok(r.ok);
      outcomes.push(r.outcome);
      if (r.outcome === 'success') break;
    }
    assert.deepEqual(outcomes, [...Array(8).fill('failed'), 'success']);
    assert.equal(extractionChance(4, 8), 1);
    assert.equal(EXTRACTION.find((e) => e.level === 4)!.chance, 0.2);
  });

  it('pode rodar de novo (idempotente) e o boot reconhece a v10; sem ela, as falhas vêm vazias', async () => {
    await t.pool.query(V10);
    assert.equal((await t.pool.query(NINJA_SQL.bootCheckV10)).rows[0].ok, true);
    const old = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v10_design.sql'));
    try {
      assert.equal((await old.pool.query(NINJA_SQL.bootCheckV10)).rows[0].ok, false);
      const id = await old.createPlayer('antigo');
      assert.deepEqual(await makeNinjaStore(old.db).extractionFailures(id), {});
    } finally {
      await old.drop();
    }
  });

  it('a migração segue as regras do SQL Editor do Neon (sem DO $$, numa transação só)', () => {
    assert.doesNotMatch(V10, /\bDO\s+\$\$/);
    assert.match(V10, /^BEGIN;$/m);
    assert.match(V10, /^COMMIT;$/m);
  });
});
