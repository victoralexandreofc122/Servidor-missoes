import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { makeXpBonusStore } from '../src/realtime/xpBonus.js';
import { createTestDatabase } from './support/testDb.js';
import { FakeConn, seededRandom } from './support/world.js';

/* v44 (migração v29): bônus de XP do admin gravado no banco (sobrevive a reinício do servidor). */
const noDatabase = !process.env.TEST_DATABASE_URL;
const config = (): RealtimeConfig => ({ ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0 } } });

describe('v29 no banco: bônus de XP', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let adm: string, comum: string;
  before(async () => {
    t = await createTestDatabase();
    adm = await t.createPlayer('chefe');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    comum = await t.createPlayer('curioso');
  });
  after(async () => { await t?.drop(); });
  const wait = async (ok: () => unknown) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); };

  it('a migração roda de novo sem erro e não usa DO $$', async () => {
    const sql = readFileSync(new URL('../db/schema_v29_bonus_xp.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\bDO\s+\$\$/);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    await t.pool.query(sql);
    await t.pool.query(sql);
  });

  it('só admin liga e remove; ligar de novo o mesmo alvo troca; limites valem no banco', async () => {
    const store = makeXpBonusStore(t.db);
    assert.equal(await store.available(), true);
    await assert.rejects(store.set(comum, 'global', '', 50, 60));
    await assert.rejects(store.remove(comum, 'tudo', ''));
    await assert.rejects(store.set(adm, 'global', '', 501, 60));
    await assert.rejects(store.set(adm, 'global', '', 50, 0));
    await assert.rejects(store.set(adm, 'lugar' as any, 'x', 50, 60));
    assert.deepEqual(await store.active(), []);
    const t0 = Date.now();
    await store.set(adm, 'global', '', 50, 60);
    await store.set(adm, 'global', '', 80, 30);
    await store.set(adm, 'mapa', 'map_2', 100, 10);
    await store.set(adm, 'vila', 'vila_3', 20, 10);
    const list = await store.active();
    assert.deepEqual(list.map((b) => [b.scope, b.target, b.percent]), [['global', '', 80], ['mapa', 'map_2', 100], ['vila', 'vila_3', 20]]);
    assert.ok(Math.abs(list[0]!.endsAt - (t0 + 30 * 60_000)) < 10_000);
    assert.equal(await store.remove(adm, 'mapa', 'map_2'), 1);
    assert.equal(await store.remove(adm, 'mapa', 'map_2'), 0);
    assert.equal(await store.remove(adm, 'tudo', ''), 2);
    assert.deepEqual(await store.active(), []);
    const n = (await t.pool.query(`SELECT count(*)::int AS n FROM game.xp_bonuses WHERE removed_at IS NOT NULL`)).rows[0].n;
    assert.equal(n, 4, 'o histórico fica guardado');
  });

  it('vencido some da lista sozinho', async () => {
    const store = makeXpBonusStore(t.db);
    await store.set(adm, 'monstro', 'slime', 30, 5);
    await t.pool.query(`UPDATE game.xp_bonuses SET starts_at = now() - interval '1 hour', ends_at = now() - interval '1 second' WHERE scope = 'monstro'`);
    assert.deepEqual(await store.active(), []);
    await store.set(adm, 'monstro', 'slime', 40, 5);
    assert.deepEqual((await store.active()).map((b) => b.percent), [40], 'dá para ligar de novo depois de vencer');
    await store.remove(adm, 'tudo', '');
  });

  it('no jogo: o comando grava no banco e o bônus volta depois de reiniciar o servidor', async () => {
    const world = () => new GameWorld(config(), () => Date.now(), undefined, {
      random: seededRandom(), store: makeNinjaStore(t.db), progression: makeProgression(t.db), admin: makeAdminStore(t.db), xpBonus: makeXpBonusStore(t.db),
    });
    let w = world();
    const conn = new FakeConn();
    const h = w.join((await makeFindPlayer(t.db)(adm))!, conn);
    await new Promise((r) => setTimeout(r, 1100));
    h.receive(JSON.stringify({ type: 'chat', message: '/admin bonusxp global 25 45' }));
    await wait(() => /bônus ligado/.test(conn.last('notice')?.text ?? ''));
    assert.match(conn.last('notice').text, /bônus ligado: \+25% de XP em todo o jogo por 45 min/);
    assert.deepEqual((await makeXpBonusStore(t.db).active()).map((b) => [b.scope, b.target, b.percent]), [['global', '', 25]]);
    w.close();
    w = world();
    await w.xpBonusMaintenance();   // o start() do servidor chama isto ao subir
    assert.deepEqual((w as any).xpBonuses.map((b: any) => [b.scope, b.target, b.percent]), [['global', '', 25]]);
    const c2 = new FakeConn();
    w.join((await makeFindPlayer(t.db)(comum))!, c2);
    assert.match(c2.of('notice').map((n: any) => n.text).join(' | '), /Bônus de XP ativo: \+25% de XP em todo o jogo/);
    w.close();
  });
});
