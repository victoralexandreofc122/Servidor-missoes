import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/*
 * Migração v12 no PostgreSQL de verdade: sapatos (equipamento dos pés) e o /admin ryo. Quem já jogava ganha a Sandália
 * Ninja calçada; conta nova também; só calça sapato que tem; o admin dá ryō com auditoria.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V11 = readFileSync(new URL('../db/schema_v11_endgame.sql', import.meta.url), 'utf8');
const V12 = readFileSync(new URL('../db/schema_v12_sapatos.sql', import.meta.url), 'utf8');
const rule = (name: string) => (e: { constraint?: string }) => e.constraint === name;

describe('v12 no banco: sapatos e /admin ryo (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];

  it('conta nova começa de Sandália Ninja calçada (e no inventário); rodar a v12 e a v11 de novo não quebra', async () => {
    const id = await t.createPlayer('novato12');
    const found = await makeFindPlayer(t.db)(id);
    assert.equal(found!.equippedShoes, 'sandalia_ninja');
    assert.deepEqual(found!.items, { sandalia_ninja: 1 });
    await t.pool.query(V12);
    await t.pool.query(V11);
    await t.pool.query(V12);
    assert.deepEqual((await makeFindPlayer(t.db)(id))!.items, { sandalia_ninja: 1 }, 'rodar de novo não dá outra sandália');
    const shoes = (await t.pool.query(`SELECT code, price_ryo, shop FROM game.items WHERE kind = 'shoes' ORDER BY price_ryo`)).rows;
    assert.deepEqual(shoes.map((r) => r.code), ['sandalia_ninja', 'sandalia_couro', 'botas_viagem', 'botas_ninja']);
    assert.ok(shoes.every((r) => r.shop === 'clothes'));
  });

  it('calçar só sapato que tem; descalçar vale; arma não vai nos pés', async () => {
    const id = await t.createPlayer('calcado');
    const store = makeNinjaStore(t.db);
    assert.deepEqual(await store.equip(id, 'botas_viagem', 'feet'), { ok: false, text: 'Só dá para calçar um sapato do seu inventário.' });
    await store.addItem(id, 'botas_viagem', 1);
    assert.deepEqual(await store.equip(id, 'botas_viagem', 'feet'), { ok: true, equipped: 'botas_viagem' });
    assert.equal((await makeFindPlayer(t.db)(id))!.equippedShoes, 'botas_viagem');
    assert.deepEqual(await store.equip(id, null, 'feet'), { ok: true, equipped: null });
    await store.addItem(id, 'kunai', 1);
    await assert.rejects(t.pool.query(`UPDATE game.players SET equipped_shoes = 'kunai' WHERE id = $1`, [id]), rule('rule_equip_shoes_owned'));
  });

  it('/admin ryo: só admin; de 1 a 1.000.000; soma no saldo e fica na auditoria', async () => {
    const admin = await t.createPlayer('chefe12');
    const alvo = await t.createPlayer('alvo12');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [admin]);
    const store = makeAdminStore(t.db);
    assert.deepEqual(await store.giveRyo(admin, alvo, 2500), { ok: true, ryo: 2500 });
    assert.deepEqual(await store.giveRyo(admin, alvo, 500), { ok: true, ryo: 3000 });
    assert.equal(Number((await one('SELECT ryo FROM game.players WHERE id = $1', [alvo])).ryo), 3000);
    assert.deepEqual(await store.giveRyo(admin, alvo, 1_000_001), { ok: false, text: 'O ryō vai de 1 a 1.000.000.' });
    assert.deepEqual(await store.giveRyo(alvo, admin, 10), { ok: false, text: 'Comando restrito ao administrador.' });
    const audit = (await t.pool.query(`SELECT command, ok, args FROM game.admin_audit_log WHERE command = 'giveryo' ORDER BY id`)).rows;
    assert.deepEqual(audit.map((a) => [a.ok, a.args.amount ?? null]), [[true, 2500], [true, 500], [false, 1_000_001], [false, 10]]);
  });
});

describe('v12 no banco: migração sobre quem já jogava', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v12_sapatos.sql')); });
  after(async () => { await t?.drop(); });

  it('quem já existia ganha a Sandália Ninja no inventário e calçada', async () => {
    const id = await t.createPlayer('veterano12');
    await t.pool.query(V12);
    const found = await makeFindPlayer(t.db)(id);
    assert.equal(found!.equippedShoes, 'sandalia_ninja');
    assert.equal(found!.items!.sandalia_ninja, 1);
  });
});
