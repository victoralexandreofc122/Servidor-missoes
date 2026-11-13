import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL, TEAM3, splitTeams, takeTeamMatch, type TeamEntry } from '../src/realtime/duel.js';
import { FakeConn, setupWorld } from './support/world.js';

/* v55: rankeado 3v3: fila (sozinho ou em trio), times com poder parecido, melhor de 3. */

const solo = (id: string, level: number, joinedAt = 0): TeamEntry => ({ ids: [id], levels: [level], joinedAt });
const trio = (ids: string[], levels: number[], joinedAt = 0): TeamEntry => ({ ids, levels, joinedAt });
const power = (ids: string[], q: TeamEntry[]) => ids.reduce((s, id) => s + q.flatMap((e) => e.ids.map((x, i) => [x, e.levels[i]!] as const)).find(([x]) => x === id)![1], 0);

describe('v55: 3v3, montagem dos times (pura)', () => {
  it('6 solos: divide com a menor diferença de poder (soma dos níveis)', () => {
    const q = [solo('a', 60), solo('b', 10), solo('c', 50), solo('d', 20), solo('e', 40), solo('f', 30)];
    const m = takeTeamMatch(q, 0)!;
    assert.equal(m.a.length, 3);
    assert.equal(m.b.length, 3);
    assert.ok(m.a.includes('a'), 'o primeiro da fila sempre entra');
    assert.equal(m.gap, Math.abs(power(m.a, q) - power(m.b, q)));
    assert.ok(m.gap <= 10, `equilibrado (${m.gap})`);
  });

  it('trio fica junto; 2 trios = um contra o outro', () => {
    const q = [trio(['a', 'b', 'c'], [40, 40, 40]), trio(['d', 'e', 'f'], [41, 40, 40])];
    const m = takeTeamMatch(q, 0)!;
    assert.deepEqual([m.a, m.b], [['a', 'b', 'c'], ['d', 'e', 'f']]);
  });

  it('trio + 3 solos: o trio contra os solos', () => {
    const q = [solo('x', 40), trio(['a', 'b', 'c'], [40, 40, 40]), solo('y', 41), solo('z', 39)];
    const m = takeTeamMatch(q, 0)!;
    assert.deepEqual(new Set(m.b.length === 3 && m.b.includes('a') ? m.b : m.a), new Set(['a', 'b', 'c']));
    assert.equal(m.rest.length, 0);
  });

  it('teto de poder: diferença grande espera; depois de 90 s o primeiro aceita o melhor possível', () => {
    const q = [trio(['a', 'b', 'c'], [60, 60, 60]), trio(['d', 'e', 'f'], [10, 10, 10])];
    assert.equal(takeTeamMatch(q, 1000), null, 'diferença de 150 > teto');
    assert.ok(takeTeamMatch(q, TEAM3.relaxAfterMs), 'esperou demais: luta assim mesmo');
  });

  it('menos de 6 ninjas: nada; splitTeams não separa trio', () => {
    assert.equal(takeTeamMatch([solo('a', 1), solo('b', 1), solo('c', 1), solo('d', 1), solo('e', 1)], 0), null);
    assert.equal(splitTeams([trio(['a', 'b', 'c'], [1, 1, 1]), trio(['d', 'e'], [1, 1]), solo('f', 1)])!.a.length, 1);
  });
});

const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
const session = (w: any, id: string) => w.sessions.get(id);
function world() {
  const w = setupWorld(cfg);
  const join = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    const send = (msg: unknown) => h.receive(JSON.stringify(msg));
    send({ type: 'ranked', action: 'enter' });
    return { id, conn, send };
  };
  return { ...w, join };
}

describe('v55: 3v3 no servidor', () => {
  it('6 solos na fila do 3v3: partida 3 contra 3 numa arena, cada um no seu lado; sem fogo amigo', () => {
    const { world: w, join, run } = world();
    const ps = ['ana', 'bia', 'caio', 'davi', 'eva', 'fabi'].map((n) => join(n));
    for (const p of ps.slice(0, 5)) p.send({ type: 'ranked', action: 'team3_queue' });
    assert.deepEqual(ps[0]!.conn.last('duel_queue').team3, { queued: true, players: 5 });
    ps[5]!.send({ type: 'ranked', action: 'team3_queue' });
    run(REALTIME.tickMs);
    const st = ps[0]!.conn.last('duel_state');
    assert.equal(st.label, 'Rankeado 3v3');
    assert.equal(st.teamA.length, 3);
    assert.equal(st.teamB.length, 3);
    const d = (w as any).duels.get('vale_estatuas');
    run(DUEL.prepMs);
    const [a1, a2] = d.teams.a.map((id: string) => session(w, id));
    const b1 = session(w, d.teams.b[0]);
    assert.equal((w as any).canHurt(a1, a2), false, 'mesmo time: não bate');
    assert.equal((w as any).canHurt(a1, b1), true, 'time adversário: bate');
    assert.notEqual(a1.y, a2.y, 'os três em fila no lado deles');
  });

  it('a rodada só acaba quando os 3 de um time caem; quem cai fica fora até a próxima rodada', () => {
    const { world: w, join, run } = world();
    const ps = ['ana', 'bia', 'caio', 'davi', 'eva', 'fabi'].map((n) => join(n));
    for (const p of ps) p.send({ type: 'ranked', action: 'team3_queue' });
    run(REALTIME.tickMs + DUEL.prepMs);
    const d = (w as any).duels.get('vale_estatuas');
    const atk = session(w, d.teams.a[0]);
    const ko = (id: string) => { const x = session(w, id); x.hp = 1; (w as any).damagePlayer(x, 10, (w as any).now(), atk, atk); };
    ko(d.teams.b[0]);
    assert.equal(d.phase, 'round', 'um caiu: a rodada segue');
    assert.ok(session(w, d.teams.b[0]).dead);
    assert.equal((w as any).canHurt(session(w, d.teams.b[0]), atk), false, 'caído não luta');
    ko(d.teams.b[1]);
    ko(d.teams.b[2]);
    assert.equal(d.wins.a, 1, 'os 3 caíram: rodada do time a');
    run(DUEL.intervalMs + REALTIME.tickMs);
    assert.equal(session(w, d.teams.b[0]).dead, false, 'voltou na rodada seguinte');
  });

  it('trio: convida pelo nome, aceita; o líder põe os 3 na fila e eles ficam no mesmo time', () => {
    const { world: w, join, run } = world();
    const [l, m1, m2, x, y, z] = ['lider', 'mano1', 'mano2', 'solo1', 'solo2', 'solo3'].map((n) => join(n));
    l!.send({ type: 'trio', action: 'invite', name: 'mano1' });
    l!.send({ type: 'trio', action: 'invite', name: 'mano2' });
    assert.equal(m1!.conn.last('trio_state').invites[0].name, 'lider');
    m1!.send({ type: 'trio', action: 'accept', leaderId: l!.id });
    m2!.send({ type: 'trio', action: 'accept', leaderId: l!.id });
    assert.equal(l!.conn.last('trio_state').members.length, 3);
    m1!.send({ type: 'ranked', action: 'team3_queue' });
    assert.match(m1!.conn.last('notice').text, /líder/);
    l!.send({ type: 'ranked', action: 'team3_queue' });
    for (const p of [x!, y!, z!]) p.send({ type: 'ranked', action: 'team3_queue' });
    run(REALTIME.tickMs);
    const d = (w as any).duels.get('vale_estatuas');
    const team = d.teams.a.includes(l!.id) ? d.teams.a : d.teams.b;
    assert.deepEqual(new Set(team), new Set([l!.id, m1!.id, m2!.id]));
  });
});
