import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { ITEMS } from '../src/realtime/items.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v24 (db/schema_v24_pergaminho_unico.sql): o pergaminho único e o reset de classes do admin. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V24 = readFileSync(new URL('../db/schema_v24_pergaminho_unico.sql', import.meta.url), 'utf8');
type Db = Awaited<ReturnType<typeof createTestDatabase>>;
const one = async (t: Db, sql: string, params: unknown[] = []) => (await t.pool.query(sql, params)).rows[0];

async function genin(t: Db, name: string, cls: 'fire' | 'water', admin = false) {
  const id = await t.createPlayer(name);
  if (admin) await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [id]);
  for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
  await makeProgression(t.db).grantXp(id, levelStart(40));
  assert.ok((await makeNinjaStore(t.db).becomeGenin(id, cls)).ok);
  return id;
}

describe('v24 sobre um banco de antes: os pergaminhos de classe viram o pergaminho único', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v24_pergaminho_unico.sql')); });
  after(async () => { await t?.drop(); });

  it('soma tudo (nada se perde), o das costas vira o novo, os antigos saem da loja; rodar de novo não muda nada', async () => {
    const id = await t.createPlayer('colecionador');
    await t.pool.query(`INSERT INTO game.player_items (player_id, item_code, quantity) VALUES ($1, 'scroll_fire', 3), ($1, 'scroll_water', 2), ($1, 'kunai', 1)`, [id]);
    await t.pool.query(`UPDATE game.players SET equipped_scroll = 'scroll_fire' WHERE id = $1`, [id]);
    await t.pool.query(V24);
    await t.pool.query(V24);
    const items = (await t.pool.query('SELECT item_code, quantity FROM game.player_items WHERE player_id = $1 ORDER BY item_code', [id])).rows;
    assert.deepEqual(items.filter((r) => r.item_code !== 'sandalia_ninja'), [{ item_code: 'kunai', quantity: 1 }, { item_code: 'scroll_liso', quantity: 5 }]);
    assert.equal((await one(t, 'SELECT equipped_scroll FROM game.players WHERE id = $1', [id])).equipped_scroll, 'scroll_liso');
    const shop = (await t.pool.query(`SELECT code FROM game.items WHERE shop = 'scrolls' ORDER BY code`)).rows.map((r) => r.code);
    assert.deepEqual(shop, ['scroll_liso'], 'a loja vende só o pergaminho único');
    // o catálogo do banco é o do servidor (nome, tipo, preço)
    const db = (await t.pool.query(`SELECT code, name, price_ryo FROM game.items WHERE kind = 'scroll' ORDER BY code`)).rows;
    const server = ITEMS.filter((i) => i.kind === 'scroll').map((i) => ({ code: i.code, name: i.name, price_ryo: i.price })).sort((a, b) => (a.code < b.code ? -1 : 1));
    assert.deepEqual(db, server);
  });
});

describe('v24 no banco: Extração com o pergaminho único e o reset de classes do admin', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('o mesmo pergaminho serve para a Primária e a Secundária; outra classe continua recusada', async () => {
    const id = await genin(t, 'dupla', 'fire');
    const store = makeNinjaStore(t.db);
    await t.pool.query(`UPDATE game.players SET current_rank_id = (SELECT id FROM game.ranks WHERE code = 'CHUNIN') WHERE id = $1`, [id]);
    assert.ok((await store.chooseSecondary(id, 'water')).ok);
    await store.addItem(id, 'scroll_liso', 3);                          // 1 da Missão de Genin + 3
    const fire = await store.extract(id, 'fire', 1, 0, 0);
    const water = await store.extract(id, 'water', 1, 0, 0);
    assert.ok(fire.ok && fire.outcome === 'success' && water.ok && water.outcome === 'success');
    assert.equal(water.ok && water.scrollsLeft, 2);
    assert.deepEqual(await store.extract(id, 'lightning', 1, 0, 0), { ok: false, text: 'Você só aprende jutsus da sua classe.' });
  });

  it('reset de classes: só em conta de admin; volta à Academia sem classe, linhagem nem jutsus de classe e de clã; refaz do zero', async () => {
    const admin = makeAdminStore(t.db);
    const store = makeNinjaStore(t.db);
    const adm = await genin(t, 'adm_reset', 'fire', true);
    await store.addItem(adm, 'scroll_liso', 2);
    await store.extract(adm, 'fire', 1, 0, 0);
    await store.chooseClan!(adm, 'rubro');
    await store.learnJutsus!(adm, ['rubro_olho']);
    await t.pool.query(`UPDATE game.players SET kit_a = ARRAY['teleport', 'fire'], kit_b = ARRAY['rubro_olho', 'substitution'] WHERE id = $1`, [adm]);
    const comum = await genin(t, 'comum_reset', 'water');
    assert.deepEqual(await admin.resetClasses(adm, comum), { ok: false, text: 'O reset de classes é só para conta de admin (para testar builds).' });
    assert.equal((await one(t, 'SELECT primary_class FROM game.player_classes WHERE player_id = $1', [comum])).primary_class, 'water', 'conta comum intacta');
    const r = await admin.resetClasses(adm, adm);
    assert.ok(r.ok && r.removed >= 2);
    const p = await one(t, `SELECT p.clan, p.kit_a, p.kit_b, r.code AS rank, p.level FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1`, [adm]);
    assert.deepEqual([p.clan, p.kit_a, p.kit_b, p.rank, p.level], [null, ['teleport'], ['substitution'], 'ACADEMY', 40]);
    assert.equal((await one(t, 'SELECT count(*)::int AS n FROM game.player_classes WHERE player_id = $1', [adm])).n, 0);
    const left = (await t.pool.query('SELECT jutsu_code FROM game.player_jutsus WHERE player_id = $1 ORDER BY jutsu_code', [adm])).rows.map((x) => x.jutsu_code);
    assert.deepEqual(left, ['substitution', 'teleport']);
    // do zero: Missão de Genin com outra classe e a linhagem de novo
    const again = await store.becomeGenin(adm, 'water');
    assert.ok(again.ok && again.classes.primary === 'water' && again.classes.secondary === null);
    await store.chooseClan!(adm, 'umbra');
    assert.equal((await one(t, 'SELECT clan FROM game.players WHERE id = $1', [adm])).clan, 'umbra');
    const audit = (await t.pool.query(`SELECT ok FROM game.admin_audit_log WHERE admin_id = $1 AND command = 'resetclasses' ORDER BY id`, [adm])).rows.map((x) => x.ok);
    assert.deepEqual(audit, [false, true]);
  });
});
