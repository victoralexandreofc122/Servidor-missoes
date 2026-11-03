import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL } from '../src/realtime/duel.js';
import { VALE } from '../src/realtime/maps.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import type { RankedMatchInput, RankedStore } from '../src/realtime/rankedStore.js';
import { FakeConn, seededRandom, setupWorld } from './support/world.js';

const cfg: RealtimeConfig = {
  ...REALTIME,
  combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } },
};
const session = (w: any, id: string) => w.sessions.get(id);

function world() {
  const w = setupWorld(cfg);
  const join = (username: string, village: 'vila_1' | 'vila_3' = 'vila_1') => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village } }, conn);
    return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)), leave: () => h.leave() };
  };
  return { ...w, join };
}

describe('modo rankeado (v29): Vale das Estátuas, fila e partida', () => {
  it('Rankeado leva ao Vale (de qualquer vila); Sair volta para onde estava', () => {
    const { world: w, join } = world();
    const a = join('kaito', 'vila_3');
    const from = { map: session(w, a.id).map, x: session(w, a.id).x };
    a.send({ type: 'ranked', action: 'enter' });
    assert.equal(session(w, a.id).map, 'vale_estatuas');
    assert.equal(a.conn.last('duel_state').phase, 'idle');
    a.send({ type: 'ranked', action: 'leave' });
    assert.equal(session(w, a.id).map, from.map);
    assert.equal(session(w, a.id).x, from.x);
  });

  it('dois na fila: a partida começa na preparação, com os nomes revelados e os dois dentro da arena', () => {
    const { world: w, join, run } = world();
    const a = join('kaito', 'vila_1');
    const b = join('mei', 'vila_3');
    const watcher = join('rin');
    for (const p of [a, b, watcher]) p.send({ type: 'ranked', action: 'enter' });
    a.send({ type: 'ranked', action: 'queue' });
    assert.deepEqual(a.conn.last('duel_queue'), { type: 'duel_queue', queued: true, position: 1, size: 1 });
    b.send({ type: 'ranked', action: 'queue' });
    run(REALTIME.tickMs);
    const st = watcher.conn.last('duel_state');
    assert.equal(st.phase, 'prep');
    assert.deepEqual([st.a.name, st.b.name], ['kaito', 'mei']);
    assert.deepEqual([session(w, a.id).x, session(w, b.id).x], [VALE.start.a.x, VALE.start.b.x]);
  });

  it('na preparação ninguém apanha; na rodada só os dois da partida; zerar a vida fecha a rodada sem morrer', () => {
    const { world: w, join, run } = world();
    const a = join('kaito');
    const b = join('mei', 'vila_3');
    for (const p of [a, b]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(REALTIME.tickMs);
    const sa = session(w, a.id), sb = session(w, b.id);
    sa.x = sb.x - 1; sa.y = sb.y; Object.assign(sa, { fx: 1, fy: 0 });
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(sb.hp, sb.stats.maxHp, 'apanhou na preparação');
    run(DUEL.prepMs);
    assert.equal(a.conn.last('duel_state').phase, 'round');
    sa.x = sb.x - 1; sa.y = sb.y; sa.cooldowns = {};
    sb.hp = 1;
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(sb.dead, false, 'no rankeado ninguém morre');
    const st = a.conn.last('duel_state');
    assert.equal(st.phase, 'interval');
    assert.deepEqual(st.wins, { a: 1, b: 0 });
  });

  it('quem sai no meio da partida perde; a arena fica livre e a próxima dupla da fila entra', () => {
    const { world: w, join, run } = world();
    const [a, b, c, d] = ['kaito', 'mei', 'rin', 'sora'].map((n) => join(n));
    for (const p of [a!, b!, c!, d!]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(REALTIME.tickMs);
    assert.deepEqual(c!.conn.last('duel_queue'), { type: 'duel_queue', queued: true, position: 1, size: 2 });
    run(DUEL.prepMs);
    b!.send({ type: 'ranked', action: 'leave' });
    assert.match(b!.conn.last('notice').text, /vá até o fim/, 'Voltar não sai da luta (decisão do Victor)');
    b!.leave();                                                   // só cair da conexão encerra: W.O. depois de 15 s
    assert.equal(c!.conn.last('duel_state').away.side, 'b', 'todos veem a contagem para ele voltar');
    run(DUEL.reconnectMs + REALTIME.tickMs);
    const st = c!.conn.last('duel_state');
    assert.equal(st.phase, 'done');
    assert.equal(st.winner, 'a');
    assert.equal(st.reason, 'forfeit');
    run(DUEL.endMs + REALTIME.tickMs * 2);
    const next = c!.conn.last('duel_state');
    assert.equal(next.phase, 'prep');
    assert.deepEqual([next.a.name, next.b.name], ['rin', 'sora']);
    assert.ok(session(w, a!.id).y > VALE.fence.y + VALE.fence.h, 'o vencedor voltou à praça');
  });

  it('a rodada que chega ao tempo vai para quem tem mais vida', () => {
    const { world: w, join, run } = world();
    const a = join('kaito');
    const b = join('mei');
    for (const p of [a, b]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(REALTIME.tickMs + DUEL.prepMs);
    session(w, a.id).hp = 10;
    run(DUEL.roundMs + REALTIME.tickMs);
    assert.deepEqual(a.conn.last('duel_state').wins, { a: 0, b: 1 });
  });

  it('v15: a partida vai para o banco (placar, motivo, rodadas) e os dois recebem os pontos', async () => {
    const calls: RankedMatchInput[] = [];
    const fake: RankedStore = {
      async available() { return true; },
      async result(m) { calls.push(m); return { counted: true, winnerDelta: 18, loserDelta: -8, winnerMmr: 1018, loserMmr: 992, winnerRyo: 30, loserRyo: 10 }; },
      async board() { return { season: { id: 1, endsAt: 0 }, top: [], me: null, overall: null }; },
      async closeSeason() { return null; },
    };
    let t = 1_000_000;
    const w = new GameWorld(cfg, () => t, undefined, { random: seededRandom(), ranked: fake });
    await w.rankedMaintenance();
    const join = (username: string) => {
      const conn = new FakeConn();
      const id = randomUUID();
      const h = w.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
      return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)) };
    };
    const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { t += cfg.tickMs; w.tick(); } };
    const a = join('kaito');
    const b = join('mei');
    for (const p of [a, b]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(cfg.tickMs + DUEL.prepMs);
    for (let r = 0; r < 2; r++) {
      (w as any).sessions.get(b.id).hp = 0.5;
      (w as any).damagePlayer((w as any).sessions.get(b.id), 5, t, undefined, (w as any).sessions.get(a.id), 'attack');
      run(DUEL.intervalMs + cfg.tickMs);
    }
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.winnerId, a.id);
    assert.deepEqual([calls[0]!.winnerRounds, calls[0]!.loserRounds, calls[0]!.reason, calls[0]!.rounds.length], [2, 0, 'rounds', 2]);
    assert.deepEqual(a.conn.last('duel_rating'), { type: 'duel_rating', counted: true, delta: 18, mmr: 1018, won: true, ryo: 30 });
    assert.deepEqual(b.conn.last('duel_rating'), { type: 'duel_rating', counted: true, delta: -8, mmr: 992, won: false, ryo: 10 });
    a.send({ type: 'ranked', action: 'board' });
    await new Promise((r) => setImmediate(r));
    assert.equal(a.conn.last('ranked_board').available, true);
  });

  it('anti-abuso: sair na preparação cancela sem pontos; quem sai fica fora da fila por um tempo', () => {
    const { world: w, join, run } = world();
    const a = join('kaito');
    const b = join('mei');
    for (const p of [a, b]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(REALTIME.tickMs);
    b.leave();                                                    // caiu na preparação
    assert.equal(a.conn.last('duel_state').phase, 'idle', 'cancelada');
    assert.deepEqual(a.conn.last('duel_queue'), { type: 'duel_queue', queued: true, position: 1, size: 1 }, 'o outro volta para a frente da fila');
    const b2 = join('mei');                                       // voltou (mesma conta? não: o castigo é por id)
    void b2;
    assert.ok((w as any).rankedLeaves.get(b.id).until > 0, 'quem caiu ficou com castigo na fila');
    void w;
  });

  it('a fila evita repetir a mesma dupla em seguida quando há outra pessoa', async () => {
    const { takeMatch } = await import('../src/realtime/duel.js');
    const m = takeMatch([
      { id: 'a', level: 10, joinedAt: 0, skips: 0, last: 'b' },
      { id: 'b', level: 10, joinedAt: 1, skips: 0, last: 'a' },
      { id: 'c', level: 30, joinedAt: 2, skips: 0 },
    ])!;
    assert.equal(m.b, 'c');
    assert.equal(takeMatch([{ id: 'a', level: 10, joinedAt: 0, skips: 0, last: 'b' }, { id: 'b', level: 10, joinedAt: 1, skips: 0 }])!.b, 'b', 'sem mais ninguém, a dupla repete');
  });

  it('sentar: só em cima da arquibancada; andar levanta; todos no mapa veem', () => {
    const { world: w, join } = world();
    const a = join('kaito');
    const b = join('mei');
    for (const p of [a, b]) p.send({ type: 'ranked', action: 'enter' });
    a.send({ type: 'ranked', action: 'sit' });
    assert.equal(session(w, a.id).sitting, false, 'na praça não senta');
    const st = VALE.stands[0]!;
    Object.assign(session(w, a.id), { x: st.x + st.w / 2, y: st.y + st.h / 2 });
    a.send({ type: 'ranked', action: 'sit' });
    assert.equal(session(w, a.id).sitting, true);
    assert.deepEqual(b.conn.last('sit'), { type: 'sit', playerId: a.id, active: true });
    a.send({ type: 'move', dx: 1, dy: 0 });
    assert.equal(session(w, a.id).sitting, false, 'andou: levantou');
    assert.deepEqual(b.conn.last('sit'), { type: 'sit', playerId: a.id, active: false });
  });

  it('caiu no meio da luta e voltou em menos de 15 s: volta para o seu lado e a luta segue', () => {
    const w = world();
    const a = w.join('kaito');
    const b = w.join('mei');
    for (const p of [a, b]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    w.run(REALTIME.tickMs + DUEL.prepMs);
    b.leave();
    w.run(5000);
    const conn = new FakeConn();
    w.world.join({ id: b.id, username: 'mei', appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    const st = a.conn.last('duel_state');
    assert.equal(st.phase, 'round', 'a luta continua');
    assert.equal(st.away, undefined);
    assert.equal(session(w.world, b.id).x, VALE.start.b.x);
    w.run(DUEL.reconnectMs);
    assert.equal(a.conn.last('duel_state').phase, 'round', 'não virou W.O.');
  });

  it('a chegada no Vale espalha os ninjas pela praça', () => {
    const { world: w, join } = world();
    const ps = ['a1', 'a2', 'a3', 'a4'].map((n) => join(n));
    for (const p of ps) p.send({ type: 'ranked', action: 'enter' });
    const pos = ps.map((p) => session(w, p.id));
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      assert.ok(Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) > 1, 'dois ninjas no mesmo lugar');
    }
  });
});
