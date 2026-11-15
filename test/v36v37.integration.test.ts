import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeFase3Store } from '../src/realtime/fase3Store.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { ITEMS } from '../src/realtime/items.js';
import { RELICS } from '../src/realtime/loot.js';
import { TITANS, titleCode } from '../src/realtime/titans.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migrações v36 (Titãs e Portadores) e v37 (Progressão de Mundo e Loot) no banco. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
type Db = Awaited<ReturnType<typeof createTestDatabase>>;

describe('v36/v37 no banco', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('os 10 títulos de Portador e as 11 relíquias estão no catálogo (iguais ao código)', async () => {
    const titles = (await t.pool.query(`SELECT code, name FROM game.titles WHERE code LIKE 'TITA\\_%'`)).rows;
    assert.deepEqual(titles.map((r) => r.code).sort(), TITANS.map(titleCode).sort());
    for (const ti of TITANS) assert.equal(titles.find((r) => r.code === titleCode(ti))?.name, ti.title);
    const relics = (await t.pool.query(`SELECT code, name FROM game.items WHERE kind = 'relic'`)).rows;
    assert.deepEqual(relics.map((r) => r.code).sort(), RELICS.map((r) => r.code).sort());
    for (const r of RELICS) assert.equal(relics.find((x) => x.code === r.code)?.name, ITEMS.find((i) => i.code === r.code)?.name);
  });

  it('Titã: vida global, dano somado, MVP vira Portador (um por ninja na Era), título sai com a Era', async () => {
    const store = makeFase3Store(t.db);
    assert.deepEqual(await store.available(), { titans: true, world: true });
    const a = await t.createPlayer('mvp_a'), b = await t.createPlayer('mvp_b');
    const row = await store.awaken(1, 1, 40000, new Date(Date.now() + 86400000));
    assert.equal(row.hp, 40000);
    await store.saveTitan(1, 1, 12345);
    assert.equal((await store.titans(1))[0]!.hp, 12345, 'a vida fica gravada (reinício não enche de novo)');
    await store.addDamage(1, 1, [{ playerId: a, damage: 500 }, { playerId: b, damage: 300 }]);
    await store.addDamage(1, 1, [{ playerId: b, damage: 400 }]);
    assert.equal(await store.crown(1, 1, titleCode(TITANS[0]!)), b, 'b somou 700');
    assert.equal(await store.crown(1, 1, titleCode(TITANS[0]!)), null, 'o mesmo Titã não coroa duas vezes');
    await store.awaken(1, 2, 48000, new Date());
    await store.addDamage(1, 2, [{ playerId: b, damage: 999 }, { playerId: a, damage: 1 }]);
    assert.equal(await store.crown(1, 2, titleCode(TITANS[1]!)), a, 'b já porta: vai para o 2º');
    const bearers = await store.bearers(1);
    assert.deepEqual(bearers.map((x) => [x.titan, x.username]).sort(), [[1, 'mvp_b'], [2, 'mvp_a']]);
    await store.setActiveCooldown(1, b, new Date(Date.now() + 1_200_000));
    assert.ok((await store.bearers(1)).find((x) => x.playerId === b)!.activeCdUntil > Date.now());
    const titled = async () => (await t.pool.query(`SELECT count(*)::int AS n FROM game.player_titles pt JOIN game.titles ti ON ti.id = pt.title_id WHERE ti.code LIKE 'TITA\\_%'`)).rows[0].n;
    assert.equal(await titled(), 2);
    assert.equal(await store.expireTitles(1), 0, 'mesma Era: ficam');
    assert.equal(await store.expireTitles(2), 2, 'Era nova: saem');
  });

  it('mundo: começa forçado em 250 (tudo aberto); o admin solta para a população; o marco não volta atrás', async () => {
    const store = makeFase3Store(t.db);
    const admin = await t.createPlayer('adm_mundo');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [admin]);
    const w0 = await store.world(7);
    assert.equal(w0.override, 250);
    await store.setWorldOverride(admin, null);
    assert.equal((await store.world(7)).override, null);
    await t.pool.query(`UPDATE game.world_progression SET stage = 60`);
    assert.equal((await store.world(7)).stage, 60, 'população baixa não tranca o que já abriu');
  });

  it('loot: entra na mochila e no registro; o Renascer só uma vez por Era; o login lê', async () => {
    const store = makeFase3Store(t.db);
    const id = await t.createPlayer('sortudo');
    const inv = await store.grantLoot(id, 'reliquia_l_renascer', 'rei_lodo');
    assert.equal(inv.reliquia_l_renascer, 1);
    assert.equal((await t.pool.query(`SELECT count(*)::int AS n FROM game.loot_drops WHERE player_id = $1`, [id])).rows[0].n, 1);
    assert.equal(await store.useRevive(id, 3), true);
    assert.equal(await store.useRevive(id, 3), false);
    assert.deepEqual((await makeFindPlayer(t.db)(id))?.revives, [3]);
  });

  it('banco sem a v36/v37: a Fase 3 fica desligada e o login funciona', async () => {
    const old = await createTestDatabase(MIGRATIONS.filter((m) => m !== 'schema_v36_titas.sql' && m !== 'schema_v37_mundo_loot.sql'));
    try {
      assert.deepEqual(await makeFase3Store(old.db).available(), { titans: false, world: false });
      const id = await old.createPlayer('antigo3');
      assert.equal((await makeFindPlayer(old.db)(id))?.revives, undefined);
    } finally { await old.drop(); }
  });
});
