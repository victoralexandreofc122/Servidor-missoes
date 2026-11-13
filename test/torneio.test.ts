import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseAdminCommand } from '../src/realtime/admin.js';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL, takeVillageMatch, type VillageEntry } from '../src/realtime/duel.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import type { SeasonStore } from '../src/realtime/seasonStore.js';
import { FakeConn, seededRandom } from './support/world.js';

/* v41 (Fase 2, passo 2): a fila do Torneio da Temporada no servidor. */
const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
const e = (id: string, village: string, joinedAt: number, extra: Partial<VillageEntry> = {}): VillageEntry => ({ id, village, level: 40, joinedAt, skips: 0, ...extra });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

describe('v41: fila do Torneio por vila (takeVillageMatch)', () => {
  it('só une ninjas da mesma vila; sem dupla da mesma vila, ninguém luta', () => {
    assert.equal(takeVillageMatch([e('a', 'vila_1', 1), e('b', 'vila_3', 2), e('c', 'vila_4', 3)]), null);
    const pick = takeVillageMatch([e('a', 'vila_1', 1), e('b', 'vila_3', 2), e('c', 'vila_1', 3)])!;
    assert.deepEqual([pick.a, pick.b, pick.village], ['a', 'c', 'vila_1']);
    assert.deepEqual(pick.rest.map((x) => x.id), ['b']);
  });

  it('entre duas vilas com dupla, luta primeiro a de quem espera há mais tempo; evita repetir a dupla em seguida', () => {
    const q = [e('x', 'vila_3', 5), e('a', 'vila_1', 1), e('y', 'vila_3', 6), e('b', 'vila_1', 9)];
    assert.deepEqual([takeVillageMatch(q)!.a, takeVillageMatch(q)!.b], ['a', 'b']);
    const again = takeVillageMatch([e('a', 'vila_1', 1, { last: 'b' }), e('b', 'vila_1', 2, { last: 'a' }), e('c', 'vila_1', 3)])!;
    assert.deepEqual([again.a, again.b], ['a', 'c']);
  });
});

describe('v41: /admin torneio', () => {
  it('abrir [dias], fechar e status; o resto é recusado', () => {
    assert.deepEqual(parseAdminCommand('/admin torneio abrir', []), { ok: true, command: { cmd: 'torneio', action: 'abrir', days: 10 } });
    assert.deepEqual(parseAdminCommand('/admin torneio abrir 3', []), { ok: true, command: { cmd: 'torneio', action: 'abrir', days: 3 } });
    assert.deepEqual(parseAdminCommand('/admin torneio fechar', []), { ok: true, command: { cmd: 'torneio', action: 'fechar', days: 10 } });
    assert.deepEqual(parseAdminCommand('/admin torneio', []), { ok: true, command: { cmd: 'torneio', action: 'status', days: 10 } });
    for (const bad of ['torneio abrir 0', 'torneio abrir 99', 'torneio fechar 3', 'torneio apagar']) assert.equal(parseAdminCommand(`/admin ${bad}`, []).ok, false, bad);
  });
});

/** Banco de mentira com as mesmas regras de pontos (o de verdade é testado em v27.integration.test.ts). */
function fakeSeason() {
  const calls: { winner: string; loser: string; reason: string }[] = [];
  const state = { rows: [] as Awaited<ReturnType<SeasonStore['standings']>>, window: null as { startsAt: Date; endsAt: Date } | null, banned: new Set<string>(), points: new Map<string, number>() };
  const store: SeasonStore = {
    async available() { return true; },
    async current() { return { id: 1, startsAt: new Date(0), endsAt: new Date(9e12), jounin: state.window, stage: 'pontos' as const, finalReady: false }; },
    async openJounin(startsAt, endsAt) { state.window = { startsAt, endsAt }; return 1; },
    async closeJounin(now) { if (!state.window || state.window.endsAt <= now) return null; state.window = { ...state.window, endsAt: now }; return 1; },
    async eligible(id) { return !state.banned.has(id); },
    async mine(_s, id) { return { points: state.points.get(id) ?? 0, wins: 0, losses: 0 }; },
    async result(winner, loser, reason) {
      calls.push({ winner, loser, reason });
      const wp = (state.points.get(winner) ?? 0) + 30, before = state.points.get(loser) ?? 0, lp = Math.max(0, before - 10);
      state.points.set(winner, wp); state.points.set(loser, lp);
      return { ok: true, result: { counted: true, winnerDelta: 30, loserDelta: lp - before, winnerPoints: wp, loserPoints: lp, winnerRyo: 100, loserRyo: 30, seasonId: 1 } };
    },
    async slots() { return { vila_1: { active: 120, slots: 10 } }; },
    async standings() { return state.rows; },
    async startGroups() { return 1; }, async groupTable() { return []; }, async closeGroups() { return 1; }, async bracket() { return []; },
    async saveBracket() {}, async finalState() { return { pending: [], finalists: new Map() }; }, async finalResult() { return false; },
    async finish() { return { jounin: 0, consoled: 0 }; }, async era() { return []; }, async fresh() { return []; },
  };
  return { store, calls, state };
}

function setup() {
  const season = fakeSeason();
  let t = 1_000_000;
  const w = new GameWorld(cfg, () => t, undefined, { random: seededRandom(), season: season.store });
  const join = (username: string, opts: { village?: 'vila_1' | 'vila_3'; level?: number; rank?: string; admin?: boolean } = {}) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.join({ id, username, level: opts.level ?? 40, isAdmin: !!opts.admin, tutorialStep: 4,
      rank: { code: opts.rank ?? 'CHUNIN', name: opts.rank ?? 'Chunin' }, appearance: { ...DEFAULT_APPEARANCE, village: opts.village ?? 'vila_1' } }, conn);
    const send = (msg: unknown) => h.receive(JSON.stringify(msg));
    send({ type: 'ranked', action: 'enter' });
    return { id, conn, send, leave: () => h.leave() };
  };
  const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { t += cfg.tickMs; w.tick(); } };
  const s = (id: string) => (w as any).sessions.get(id);
  const open = async (admin: ReturnType<typeof join>, cmd = '/admin torneio abrir 10') => { admin.send({ type: 'chat', message: cmd }); await flush(); await flush(); };
  /** `winner` vence a partida em andamento por 2 a 0. */
  const win = async (winner: string, loser: string) => {
    for (let r = 0; r < 2; r++) {
      s(loser).hp = 0.5;
      (w as any).damagePlayer(s(loser), 5, t, undefined, s(winner), 'attack');
      run(DUEL.intervalMs + cfg.tickMs);
    }
    await flush();
  };
  return { w, join, run, s, open, win, season, now: () => t };
}

describe('v41: Torneio da Temporada no servidor (fila, partida e pontos)', () => {
  it('fechado: ninguém entra na fila; o admin abre e todos são avisados; só admin abre', async () => {
    const { join, open, season } = setup();
    const adm = join('chefe', { admin: true }), a = join('kaito');
    a.send({ type: 'ranked', action: 'jounin_queue' });
    assert.match(a.conn.last('notice').text, /não está na fase de pontos/);
    await open(a);
    assert.equal(season.state.window, null, 'quem não é admin não abre');
    await open(adm);
    assert.ok(season.state.window);
    assert.match(a.conn.last('announce').message, /Torneio da Temporada começou/);
    assert.match(adm.conn.last('notice').text, /ABERTO até .* 10 vagas \(120 ativos\)/);
    assert.equal(a.conn.last('jounin_state').open, true);
  });

  it('quem pode entrar: nível 40+, não Jounin/ANBU/Kage e quem o banco não barra (já foi Jounin em outra era)', async () => {
    const { join, open, season, w } = setup();
    const adm = join('chefe', { admin: true });
    await open(adm);
    const low = join('novato', { level: 39 }), jonin = join('veterano', { rank: 'JONIN' }), ex = join('antigo'), ok = join('kaito');
    season.state.banned.add(ex.id);
    for (const p of [low, jonin, ex, ok]) p.send({ type: 'ranked', action: 'jounin_queue' });
    await flush();
    assert.match(low.conn.last('notice').text, /nível 40 ou mais/);
    assert.match(jonin.conn.last('notice').text, /já é Jounin/);
    assert.match(ex.conn.last('notice').text, /quem já foi Jounin não disputa de novo/);
    assert.deepEqual((w as any).jouninQueue.map((x: VillageEntry) => x.id), [ok.id]);
    assert.deepEqual(ok.conn.last('duel_queue').jounin, { position: 1, size: 1 });
  });

  it('só luta contra a mesma vila: vilas diferentes ficam esperando; chegou alguém da vila, a partida começa no modo Torneio', async () => {
    const { join, open, run, w } = setup();
    const adm = join('chefe', { admin: true });
    await open(adm);
    const a = join('kaito', { village: 'vila_1' }), x = join('mei', { village: 'vila_3' });
    for (const p of [a, x]) p.send({ type: 'ranked', action: 'jounin_queue' });
    await flush();
    run(cfg.tickMs * 3);
    assert.equal((w as any).duels.size, 0, 'vilas diferentes não se enfrentam');
    assert.deepEqual(x.conn.last('duel_queue').jounin, { position: 1, size: 1 }, 'cada um vê só a fila da própria vila');
    const b = join('rin', { village: 'vila_1' });
    b.send({ type: 'ranked', action: 'jounin_queue' });
    await flush();
    run(cfg.tickMs);
    const st = a.conn.last('duel_state');
    assert.deepEqual([st.phase, st.mode, st.a.name, st.b.name], ['prep', 'jounin', 'kaito', 'rin']);
    assert.deepEqual((w as any).jouninQueue.map((q: VillageEntry) => q.id), [x.id]);
  });

  it('vitória e derrota vão para o banco: +30 e -10 com piso 0, ryō +100 e +30; o rankeado comum não é tocado', async () => {
    const { join, open, run, win, season, s } = setup();
    const adm = join('chefe', { admin: true });
    await open(adm);
    const a = join('kaito'), b = join('rin');
    const play = async (winner: typeof a, loser: typeof a) => {
      for (const p of [a, b]) p.send({ type: 'ranked', action: 'jounin_queue' });
      await flush();
      run(cfg.tickMs + DUEL.prepMs);
      await win(winner.id, loser.id);
      run(DUEL.endMs + cfg.tickMs);
    };
    await play(a, b);
    assert.deepEqual(season.calls, [{ winner: a.id, loser: b.id, reason: 'rounds' }]);
    assert.deepEqual(a.conn.last('duel_rating'), { type: 'duel_rating', mode: 'jounin', counted: true, delta: 30, mmr: 30, won: true, ryo: 100 });
    assert.deepEqual(b.conn.last('duel_rating'), { type: 'duel_rating', mode: 'jounin', counted: true, delta: 0, mmr: 0, won: false, ryo: 30 });
    assert.deepEqual([s(a.id).ryo, s(b.id).ryo], [100, 30]);
    await play(b, a);
    assert.deepEqual([a.conn.last('duel_rating').delta, a.conn.last('duel_rating').mmr], [-10, 20]);
    assert.equal(a.conn.last('jounin_state').points, 20);
  });

  it('v42, placar: top 10 da vila, linha de corte (2x as vagas) e a linha de quem pediu; fechado: sem placar', async () => {
    const { join, open, season } = setup();
    const adm = join('chefe', { admin: true }), a = join('kaito');
    a.send({ type: 'ranked', action: 'jounin_board' });
    assert.deepEqual([a.conn.last('jounin_board').available, a.conn.last('jounin_board').open], [false, false]);
    await open(adm);
    season.state.rows = Array.from({ length: 25 }, (_, i) => ({ position: i + 1, playerId: i === 21 ? a.id : `p${i}`, username: i === 21 ? 'kaito' : `n${i}`,
      points: 500 - i * 10, wins: 20, losses: 5, qualified: true, finalist: i < 20 }));
    a.send({ type: 'ranked', action: 'jounin_board' });
    await flush();
    const b = a.conn.last('jounin_board');
    assert.deepEqual([b.open, b.village, b.slots, b.cut, b.cutPoints, b.qualified, b.top.length, b.eligible], [true, 'vila_1', 10, 20, 310, 25, 10, true]);
    assert.deepEqual(b.me, { position: 22, username: 'kaito', points: 290, wins: 20, losses: 5, finalist: false });
    assert.equal(b.top[0].playerId, undefined, 'o id dos outros não vai para o cliente');
    const low = join('novato', { level: 30 });
    low.send({ type: 'ranked', action: 'jounin_board' });
    await flush();
    assert.deepEqual([low.conn.last('jounin_board').eligible, /nível 40/.test(low.conn.last('jounin_board').reason)], [false, true]);
  });

  it('uma fila por vez; o admin fecha e a fila do Torneio esvazia', async () => {
    const { join, open, run, w } = setup();
    const adm = join('chefe', { admin: true });
    await open(adm);
    const a = join('kaito');
    a.send({ type: 'ranked', action: 'queue' });
    a.send({ type: 'ranked', action: 'jounin_queue' });
    await flush();
    assert.deepEqual([(w as any).rankedQueue.length, (w as any).jouninQueue.length], [0, 1]);
    a.send({ type: 'ranked', action: 'queue' });
    assert.deepEqual([(w as any).rankedQueue.length, (w as any).jouninQueue.length], [1, 0]);
    a.send({ type: 'ranked', action: 'jounin_queue' });
    await flush();
    await open(adm, '/admin torneio fechar');
    run(cfg.tickMs);
    assert.equal((w as any).jouninQueue.length, 0);
    assert.equal(a.conn.last('jounin_state').open, false);
    a.send({ type: 'ranked', action: 'jounin_queue' });
    assert.match(a.conn.last('notice').text, /não está na fase de pontos/);
  });
});
