import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { MANUAL_REWARD } from '../src/realtime/manual.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { createTestDatabase } from './support/testDb.js';
import { FakeConn, placeIn, seededRandom } from './support/world.js';

/*
 * v38 (migração v26): Pergaminho do Mestre (capítulos e prêmio uma vez só) e Feedback (jogador grava; admin lista e resolve).
 */
const noDatabase = !process.env.TEST_DATABASE_URL;
const config = (): RealtimeConfig => ({ ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0 } } });

describe('v38 no banco: Pergaminho do Mestre e Feedback', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  let current: GameWorld | undefined;
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 20));
      if (![...((current as any)?.sessions.values() ?? [])].some((s: any) => s.profileBusy || s.profileQueue.length > 0)) return;
    }
    throw new Error('a fila de gravação não esvaziou');
  };
  let now = 9_000_000;
  function world() {
    const w = new GameWorld(config(), () => now, undefined, {
      random: seededRandom(), store: makeNinjaStore(t.db), progression: makeProgression(t.db), admin: makeAdminStore(t.db),
    });
    current = w;
    return w;
  }
  async function enter(w: GameWorld, id: string) {
    const conn = new FakeConn();
    const handle = w.join((await makeFindPlayer(t.db)(id))!, conn);
    return { conn, send: (m: unknown) => handle.receive(JSON.stringify(m)), s: (w as any).sessions.get(id) };
  }

  it('boas-vindas abre para todos; fechar pela 1ª vez paga 50 ryō e 100 XP, uma vez só (mesmo saindo e voltando)', async () => {
    const id = await t.createPlayer('leitor');
    let w = world();
    let p = await enter(w, id);
    assert.deepEqual(p.conn.last('welcome').ninja.manual, { unlocked: ['boas_vindas'], read: [] });
    await settle();
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.player_tutorial WHERE player_id = $1 AND chapter = 'boas_vindas'`, [id])).n, 1);
    const before = await one('SELECT ryo, total_xp FROM game.players WHERE id = $1', [id]);
    p.send({ type: 'manual_read', chapter: 'boas_vindas' });
    p.send({ type: 'manual_read', chapter: 'boas_vindas' });          // duas vezes rápido: paga uma
    p.send({ type: 'manual_read', chapter: 'secundaria' });           // fechado: nada
    await settle();
    const after1 = await one('SELECT ryo, total_xp FROM game.players WHERE id = $1', [id]);
    assert.equal(Number(after1.ryo) - Number(before.ryo), MANUAL_REWARD.ryo);
    assert.equal(Number(after1.total_xp) - Number(before.total_xp), MANUAL_REWARD.xp);
    assert.match(p.conn.of('notice').map((n: any) => n.text).join(' | '), /Capítulo lido! \+50 ryō e \+100 XP/);
    w.close();
    w = world();
    p = await enter(w, id);
    assert.deepEqual(p.conn.last('welcome').ninja.manual, { unlocked: ['boas_vindas'], read: ['boas_vindas'] });
    p.send({ type: 'manual_read', chapter: 'boas_vindas' });
    await settle();
    assert.equal(Number((await one('SELECT ryo FROM game.players WHERE id = $1', [id])).ryo), Number(after1.ryo), 'nunca paga de novo');
    w.close();
  });

  it('capítulos por nível (10, 11, 40) e o do PvP ao entrar na Zona de Conflito', async () => {
    const id = await t.createPlayer('subindo');
    await makeProgression(t.db).grantXp(id, levelStart(11));
    const w = world();
    const p = await enter(w, id);
    assert.deepEqual(p.conn.last('welcome').ninja.manual.unlocked, ['boas_vindas', 'classe', 'rito']);
    placeIn(w, id, 'zona_conflito', 60, 60);
    assert.deepEqual(p.conn.last('manual').fresh, ['pvp']);
    await settle();
    const rows = (await t.pool.query(`SELECT chapter FROM game.player_tutorial WHERE player_id = $1 ORDER BY chapter`, [id])).rows.map((r) => r.chapter);
    assert.deepEqual(rows, ['boas_vindas', 'classe', 'pvp', 'rito']);
    w.close();
  });

  it('Feedback: grava o relato com nome, nível, classe, linhagem, mapa e a tela; texto curto e pressa são recusados', async () => {
    const id = await t.createPlayer('relator');
    await makeProgression(t.db).grantXp(id, levelStart(7));
    await t.pool.query(`UPDATE game.players SET clan_mark = 'umbra' WHERE id = $1`, [id]);
    const w = world();
    const p = await enter(w, id);
    p.send({ type: 'feedback', category: 'bug', content: 'oi' });
    assert.match(p.conn.last('notice').text, /Escreva um pouco mais/);
    p.send({ type: 'feedback', category: 'bug', content: 'O Lodo atravessou a parede perto do rio.', screen: { panels: 'jogo', device: 'celular', w: 844, h: 390 } });
    await settle();
    assert.ok(p.conn.last('feedback_sent').id > 0);
    p.send({ type: 'feedback', category: 'sugestao', content: 'Mais um relato logo em seguida.' });
    assert.match(p.conn.last('notice').text, /espere alguns segundos/);
    const row = await one('SELECT category, status, content, context FROM game.feedback WHERE player_id = $1', [id]);
    assert.equal(row.category, 'bug');
    assert.equal(row.status, 'novo');
    assert.equal(row.context.username, 'relator');
    assert.equal(row.context.level, 7);
    assert.equal(row.context.lineageMark, 'umbra');
    assert.equal(row.context.mapName.length > 0, true);
    assert.deepEqual(row.context.screen, { panels: 'jogo', device: 'celular', w: 844, h: 390 });
    w.close();
  });

  it('aba Feedback do admin: lista (novos primeiro) e marca como resolvido; quem não é admin não vê nada', async () => {
    const adm = await t.createPlayer('chefe');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    const comum = await t.createPlayer('curioso');
    const w = world();
    const a = await enter(w, adm);
    const c = await enter(w, comum);
    c.send({ type: 'admin_feedback', action: 'list' });
    await settle();
    assert.equal(c.conn.of('admin_feedback').length, 0);
    a.send({ type: 'admin_feedback', action: 'list' });
    for (let i = 0; i < 50 && !a.conn.last('admin_feedback'); i++) await new Promise((r) => setTimeout(r, 20));
    const items = a.conn.last('admin_feedback').items;
    const mine = items.find((f: any) => f.username === 'relator');
    assert.ok(mine && mine.status === 'novo' && mine.context.level === 7);
    a.conn.clear();
    a.send({ type: 'admin_feedback', action: 'resolve', id: mine.id });
    for (let i = 0; i < 50 && !a.conn.last('admin_feedback'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(a.conn.last('admin_feedback').items.find((f: any) => f.id === mine.id).status, 'resolvido');
    assert.equal((await one('SELECT resolved_by FROM game.feedback WHERE id = $1', [mine.id])).resolved_by, adm);
    w.close();
  });
});
