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

describe('v33 no banco: a virada da Era', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('não fecha antes do dia 60; no prazo fecha e abre a próxima com 60 dias; Fase Final em andamento segura', async () => {
    const era = await one(t, 'SELECT id, ends_at FROM game.seasons WHERE closed_at IS NULL');
    assert.equal((await one(t, 'SELECT game.close_era(now()) AS id')).id, null);
    await t.pool.query(`UPDATE game.seasons SET jounin_stage = 'grupos' WHERE id = $1`, [era.id]);
    assert.equal((await one(t, 'SELECT game.close_era($1) AS id', [new Date(era.ends_at.getTime() + 1000)])).id, null, 'grupos em andamento');
    await t.pool.query(`UPDATE game.seasons SET jounin_stage = 'encerrado' WHERE id = $1`, [era.id]);
    const at = new Date(era.ends_at.getTime() + 1000);
    assert.equal((await one(t, 'SELECT game.close_era($1) AS id', [at])).id, era.id);
    const next = await one(t, 'SELECT id, starts_at, ends_at FROM game.seasons WHERE closed_at IS NULL');
    assert.equal(next.id, era.id + 1);
    assert.equal(next.ends_at.getTime() - next.starts_at.getTime(), 60 * 86_400_000);
    assert.equal((await one(t, 'SELECT game.close_era($1) AS id', [at])).id, null, 'rodar de novo não fecha a nova');
  });
});
