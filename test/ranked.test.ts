import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL } from '../src/realtime/duel.js';
import { VALE } from '../src/realtime/maps.js';
import { FakeConn, setupWorld } from './support/world.js';

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
    return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)) };
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
    b!.send({ type: 'ranked', action: 'leave' });
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
});
