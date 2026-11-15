import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v35 (db/schema_v35_vinculo.sql): Vínculo Ancestral e Estado Primal no banco. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
type Db = Awaited<ReturnType<typeof createTestDatabase>>;

describe('v35 no banco: Vínculo Ancestral', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('equipar troca a marca (uma por ninja); XP sobe a afinidade; o login lê tudo', async () => {
    const store = makeNinjaStore(t.db);
    const id = await t.createPlayer('domador');
    assert.deepEqual((await makeFindPlayer(t.db)(id))?.vinculo, { equipped: null, creatures: {}, primalUntil: 0, primalCooldownUntil: 0 });
    assert.equal(await store.vinculoEquip!(id, 'lobo'), true);
    await store.vinculoEquip!(id, 'sapo');
    assert.deepEqual(await store.vinculoAddXp!(id, 'sapo', 350), { level: 3, xp: 350 });
    assert.deepEqual(await store.vinculoAddXp!(id, 'sapo', 700), { level: 5, xp: 1050 });
    const until = new Date(Date.now() + 60_000), cd = new Date(Date.now() + 360_000);
    assert.equal(await store.vinculoPrimal!(id, until, cd), true);
    const v = (await makeFindPlayer(t.db)(id))!.vinculo!;
    assert.equal(v.equipped, 'sapo');
    assert.deepEqual(v.creatures, { lobo: { level: 1, xp: 0 }, sapo: { level: 5, xp: 1050 } });
    assert.equal(v.primalCooldownUntil, cd.getTime());
    await assert.rejects(t.pool.query(`INSERT INTO game.player_vinculo (player_id, creature_type) VALUES ($1, 'dragao')`, [id]), 'criatura que não existe');
    await assert.rejects(t.pool.query(`UPDATE game.player_vinculo SET equipped = true WHERE player_id = $1`, [id]), 'duas equipadas: o banco recusa');
  });

  it('banco sem a v35: o login funciona sem o Vínculo e gravar devolve false', async () => {
    const old = await createTestDatabase(MIGRATIONS.filter((m) => m !== 'schema_v35_vinculo.sql'));
    try {
      const id = await old.createPlayer('antigo');
      assert.equal((await makeFindPlayer(old.db)(id))?.vinculo, undefined);
      assert.equal(await makeNinjaStore(old.db).vinculoEquip!(id, 'sapo'), false);
      assert.equal(await makeNinjaStore(old.db).vinculoAddXp!(id, 'sapo', 10), undefined);
    } finally { await old.drop(); }
  });
});
