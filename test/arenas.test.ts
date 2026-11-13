import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL, newMatch } from '../src/realtime/duel.js';
import { FakeConn, setupWorld } from './support/world.js';

/* v55: arenas simultâneas e o espectador fantasma (painel "Assistir"). */

const cfg: RealtimeConfig = {
  ...REALTIME,
  combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } },
};
const session = (w: any, id: string) => w.sessions.get(id);

function world() {
  const w = setupWorld(cfg);
  const join = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)), leave: () => h.leave() };
  };
  return { ...w, join };
}

/** 2 lutas em paralelo (kaito x mei na principal, rin x sora na Arena 2) e um espectador (yuki) no Vale. */
function twoFights() {
  const w = world();
  const [a, b, c, d, e] = ['kaito', 'mei', 'rin', 'sora', 'yuki'].map((n) => w.join(n));
  for (const p of [a!, b!, c!, d!]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
  e!.send({ type: 'ranked', action: 'enter' });
  w.run(REALTIME.tickMs);
  return { ...w, a: a!, b: b!, c: c!, d: d!, e: e! };
}

describe('v55: arenas simultâneas', () => {
  it('até 4 lutas ao mesmo tempo (a principal e as Arenas 2, 3 e 4); a quinta dupla espera', () => {
    const w = world();
    const ps = Array.from({ length: 10 }, (_, i) => w.join(`ninja${i}`));
    for (const p of ps) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    w.run(REALTIME.tickMs);
    const list = ps[0]!.conn.last('arenas').list;
    assert.deepEqual(list.map((x: any) => x.arena), ['vale_estatuas', 'arena_2', 'arena_3', 'arena_4']);
    assert.ok(list.every((x: any) => x.label === 'Rankeado 1v1' && x.a.length === 1 && x.b.length === 1));
    assert.equal(ps[8]!.conn.last('duel_queue').position, 1, 'a quinta dupla espera uma arena ficar livre');
  });

  it('a luta de uma arena não vaza para outra (dano e placar ficam em cada uma)', () => {
    const { world: w, a, b, c, d, run } = twoFights();
    run(DUEL.prepMs);
    const sa = session(w, a.id), sb = session(w, b.id), sc = session(w, c.id);
    sb.hp = 5;   // um golpe só fecha a rodada (a rede de segurança corta golpe acima de 50% da vida)
    assert.equal(sb.map, 'vale_estatuas');
    assert.equal(sc.map, 'arena_2');
    assert.equal((w as any).canHurt(sa, sb), true, 'luta dele: pode bater');
    assert.equal((w as any).canHurt(sc, session(w, d.id)), true);
    (w as any).damagePlayer(sb, sb.stats.maxHp + 50, (w as any).now(), sa, sa);
    assert.equal(a.conn.last('duel_state').wins.a, 1, 'a rodada da principal acabou');
    assert.equal(c.conn.last('duel_state').wins.a, 0, 'a da Arena 2 continua');
    assert.equal(c.conn.last('duel_state').phase, 'round');
  });
});

describe('v55: espectador fantasma (painel "Assistir")', () => {
  it('assiste a Arena 2: recebe a luta, mas os lutadores não o veem; ninguém bate nele e ele não bate', () => {
    const { world: w, c, d, e, run } = twoFights();
    run(DUEL.prepMs);
    e.conn.clear();
    c.conn.clear();
    e.send({ type: 'watch', arena: 'arena_2' });
    const moved = e.conn.last('map_changed');
    assert.deepEqual([moved.map, moved.spectator], ['arena_2', true]);
    assert.deepEqual(moved.players.map((p: any) => p.username).sort(), ['rin', 'sora'], 'vê os dois lutadores');
    assert.equal(e.conn.last('duel_state').arena, 'arena_2');
    assert.equal(e.conn.last('arenas').watching, 'arena_2');
    assert.ok(!c.conn.of('player_joined').some((m: any) => m.player.username === 'yuki'), 'os lutadores não veem o fantasma');
    const ghost = session(w, e.id), sc = session(w, c.id), sd = session(w, d.id);
    assert.equal((w as any).mapPlayers.get('arena_2').has(ghost), false, 'fora da lista do mapa');
    assert.equal((w as any).canHurt(sc, ghost), false);
    e.send({ type: 'attack' });
    e.send({ type: 'cast', skill: 'fire' });
    assert.equal(e.conn.of('attack').length, 0, 'o fantasma não ataca');
    (w as any).damagePlayer(sd, 30, (w as any).now(), sc, sc);
    assert.ok(e.conn.of('hit').some((m: any) => m.id === d.id), 'mas vê os golpes da luta');
  });

  it('troca de luta quando quiser; "parar" volta para a praça da Arena das Quatro Heranças', () => {
    const { world: w, e, run } = twoFights();
    run(DUEL.prepMs);
    e.send({ type: 'watch', arena: 'arena_2' });
    e.send({ type: 'watch', arena: 'vale_estatuas' });
    assert.equal(session(w, e.id).map, 'vale_estatuas');
    assert.equal(session(w, e.id).watching, undefined);
    assert.ok((w as any).mapPlayers.get('vale_estatuas').has(session(w, e.id)), 'voltou a ser visto na praça');
    e.send({ type: 'watch', arena: 'arena_3' });
    assert.match(e.conn.last('notice').text, /vazia/);
  });

  it('assistindo, continua na fila: quando a luta dele sai, ele vai lutar', () => {
    const { world: w, e, join, run } = twoFights();
    const f = join('hana');
    f.send({ type: 'ranked', action: 'enter' });
    e.send({ type: 'ranked', action: 'queue' });
    e.send({ type: 'watch', arena: 'arena_2' });
    f.send({ type: 'ranked', action: 'queue' });
    run(REALTIME.tickMs);
    assert.equal(session(w, e.id).watching, undefined);
    assert.equal(session(w, e.id).map, 'arena_3', 'saiu do modo fantasma e foi lutar');
  });
});

describe('v55: semifinal e final, uma por vez', () => {
  it('a final espera as outras arenas acabarem, luta sozinha na principal e avisa o servidor inteiro', () => {
    const { world: w, a, b, c, d, e, run, join } = twoFights();
    const ww: any = w;
    // finge uma Fase Final com a final pronta entre yuki e um ninja novo
    const f = join('hana');
    f.send({ type: 'ranked', action: 'enter' });
    ww.jounin = { seasonId: 1, startsAt: 0, endsAt: 0, stage: 'chaves', finalReady: true };
    ww.finalPending = [{ a: e.id, b: f.id, big: true, label: 'Grande Final' }];
    ww.finalQueue = [e.id, f.id];
    run(REALTIME.tickMs);
    assert.equal(ww.duels.size, 2, 'as duas lutas comuns continuam; a final espera');
    // as lutas comuns acabam
    for (const m of [...ww.duels.values()]) { ww.duels.delete(m.arena); }
    void [a, b, c, d];
    e.conn.clear();
    run(REALTIME.tickMs);
    const fin = ww.duels.get('vale_estatuas');
    assert.ok(fin?.big, 'a final começou na principal');
    assert.match(e.conn.last('announce').message, /Grande Final do Torneio da Temporada vai começar/);
    // enquanto a final acontece, ninguém mais começa
    const g = join('ren'), h = join('tomo');
    for (const p of [g, h]) { p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    run(REALTIME.tickMs);
    assert.equal(ww.duels.size, 1, 'só a final');
    void newMatch;
  });
});
