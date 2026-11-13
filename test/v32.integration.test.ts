import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProfile } from '../src/realtime/profile.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v32 (db/schema_v32_alpha_ajustes.sql): Agilidade vira Taijutsu e o item Shuriken (consumível). */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V32 = readFileSync(new URL('../db/schema_v32_alpha_ajustes.sql', import.meta.url), 'utf8');
type Db = Awaited<ReturnType<typeof createTestDatabase>>;
const one = async (t: Db, sql: string, params: unknown[] = []) => (await t.pool.query(sql, params)).rows[0];

describe('v32 sobre um banco de antes: os pontos de Agilidade viram Taijutsu', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v32_alpha_ajustes.sql')); });
  after(async () => { await t?.drop(); });

  it('soma na Taijutsu, zera a Agilidade, os pontos totais não mudam; rodar de novo não muda nada', async () => {
    const id = await t.createPlayer('veloz');
    await makeProgression(t.db).grantXp(id, levelStart(8));                     // 7 pontos
    await t.pool.query('UPDATE game.players SET stat_points = 1, attr_agility = 4, attr_taijutsu = 2 WHERE id = $1', [id]);
    await t.pool.query(V32);
    await t.pool.query(V32);
    const r = await one(t, 'SELECT stat_points, attr_agility, attr_taijutsu FROM game.players WHERE id = $1', [id]);
    assert.deepEqual(r, { stat_points: 1, attr_agility: 0, attr_taijutsu: 6 });
  });
});

describe('v32 no banco: a Shuriken', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('compra de 10 em 10 na loja de armas, gasta 1 por vez e a linha some na última', async () => {
    const id = await t.createPlayer('arremesso');
    await t.pool.query('UPDATE game.players SET ryo = 100 WHERE id = $1', [id]);
    const store = makeNinjaStore(t.db);
    const bought = await store.buy(id, 'shuriken', 10);
    assert.ok(bought.ok && bought.ryo === 0 && bought.items.shuriken === 10);
    for (let i = 0; i < 10; i++) assert.equal(await store.useItem!(id, 'shuriken'), true);
    assert.equal(await store.useItem!(id, 'shuriken'), false, 'sem nenhuma: não gasta');
    assert.equal((await one(t, `SELECT count(*)::int AS n FROM game.player_items WHERE player_id = $1 AND item_code = 'shuriken'`, [id])).n, 0);
  });

  it('a Agilidade não tem mais ponto para gastar pelo servidor; o redefinir devolve tudo', async () => {
    const id = await t.createPlayer('reset');
    await makeProgression(t.db).grantXp(id, levelStart(3), 600);
    const profile = makeProfile(t.db);
    await profile.spendPoint(id, 'taijutsu');
    const r = await profile.resetAttributes(id, 500);
    assert.ok(r.ok && r.statPoints === 2 && r.attributes.taijutsu === 0);
  });
});
