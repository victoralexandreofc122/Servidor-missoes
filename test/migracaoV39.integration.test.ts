import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { createTestDatabase } from './support/testDb.js';

/* Migração v39 (fragmentos da Crônica) no banco. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V39 = readFileSync(new URL('../db/schema_v39_fragmentos.sql', import.meta.url), 'utf8');

describe('migração v39 no banco: fragmentos da Crônica', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('grava o 1º achado (true) e não o 2º (false); a entrada traz a lista; código inválido não passa; roda de novo', async () => {
    const store = makeNinjaStore(t.db);
    const find = makeFindPlayer(t.db);
    const id = await t.createPlayer('exploradora');
    assert.deepEqual((await find(id))?.fragments, []);
    assert.equal(await store.findFragment!(id, 'FRG_06'), true);
    assert.equal(await store.findFragment!(id, 'FRG_06'), false);
    assert.equal(await store.findFragment!(id, 'FRG_01'), true);
    assert.deepEqual((await find(id))?.fragments, ['FRG_01', 'FRG_06']);
    await assert.rejects(t.pool.query(`INSERT INTO game.player_fragments (player_id, fragment_code) VALUES ($1, 'qualquer')`, [id]));
    await t.pool.query(V39);
    await t.pool.query(V39);
    assert.deepEqual((await find(id))?.fragments, ['FRG_01', 'FRG_06']);
  });

  it('sem a v39 (banco antigo): a entrada não traz a lista e o jogo segue', async () => {
    await t.pool.query('DROP TABLE game.player_fragments');
    const id = await t.createPlayer('antiga');
    assert.equal((await makeFindPlayer(t.db)(id))?.fragments, undefined);
    await t.pool.query(V39);
  });
});
