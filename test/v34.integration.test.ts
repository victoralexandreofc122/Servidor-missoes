import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v34 (db/schema_v34_posicao.sql): o último lugar do ninja no banco. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
type Db = Awaited<ReturnType<typeof createTestDatabase>>;

describe('v34 no banco: último lugar', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('grava, atualiza, apaga; o login lê o lugar', async () => {
    const store = makeNinjaStore(t.db);
    const id = await t.createPlayer('andarilho');
    assert.equal((await makeFindPlayer(t.db)(id))?.lastPosition, undefined, 'conta nova: sem lugar (praça)');
    assert.equal(await store.savePositions!([{ id, pos: { map: 'map_2', x: 60.5, y: 70.25 } }]), true);
    assert.deepEqual((await makeFindPlayer(t.db)(id))?.lastPosition, { map: 'map_2', x: 60.5, y: 70.25 });
    await store.savePositions!([{ id, pos: { map: 'caverna_lodo', x: 12, y: 8 } }]);
    assert.deepEqual((await makeFindPlayer(t.db)(id))?.lastPosition, { map: 'caverna_lodo', x: 12, y: 8 });
    await store.savePositions!([{ id, pos: null }]);
    assert.equal((await makeFindPlayer(t.db)(id))?.lastPosition, undefined, 'apagou: volta para a praça');
    await assert.rejects(t.pool.query(`INSERT INTO game.player_positions (player_id, map_id, x, y) VALUES ($1, 'map_2', -1, 5)`, [id]), 'fora do mapa: o banco recusa');
  });

  it('banco sem a v34: o login funciona e gravar devolve false (o jogo segue)', async () => {
    const old = await createTestDatabase(MIGRATIONS.filter((m) => m !== 'schema_v34_posicao.sql'));
    try {
      const id = await old.createPlayer('antigo');
      assert.equal((await makeFindPlayer(old.db)(id))?.lastPosition, undefined);
      assert.equal(await makeNinjaStore(old.db).savePositions!([{ id, pos: { map: 'map_2', x: 1, y: 1 } }]), false);
    } finally { await old.drop(); }
  });
});
