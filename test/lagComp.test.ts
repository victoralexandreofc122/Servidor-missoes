import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pointAt } from '../src/realtime/combat.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Compensação de lag no PvP: o servidor mede o ping de cada um e, nos golpes instantâneos, confere o acerto onde o
 * outro ninja ESTAVA quando o atacante o viu na tela (ping + atraso de desenho), com teto de 300 ms.
 */

const LC = REALTIME.lagComp;
const BA = REALTIME.combat.basicAttack;
const F = { x: 51, y: 10 };                                       // clareira da Floresta

function pvp(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      pvp: true,
      monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);

/** a ataca b; b fugiu: agora está a 3 casas, e `ago` ms atrás estava a 1,2 (no alcance de 1,6). */
function chase(rttMs: number, ago = 300) {
  const w = setupWorld(pvp());
  const a = w.connect('kaito');
  const b = w.connect('mei');
  placeIn(w.world, a.id, 'map_2', F.x, F.y);
  placeIn(w.world, b.id, 'map_2', F.x + 3, F.y);
  const now = w.clock.now();
  Object.assign(session(w.world, a.id), { fx: 1, fy: 0, rttMs });
  session(w.world, b.id).trail = [{ t: now - ago, x: F.x + 1.2, y: F.y }, { t: now, x: F.x + 3, y: F.y }];
  a.send({ type: 'attack' });
  return { hp: session(w.world, b.id).hp as number };
}

describe('compensação de lag: o rastro (combat.ts)', () => {
  it('pointAt: na reta entre dois pontos; antes do rastro, o mais antigo; depois (ou sem rastro), a posição de agora', () => {
    const trail = [{ t: 100, x: 0, y: 0 }, { t: 200, x: 10, y: 0 }, { t: 300, x: 10, y: 10 }];
    const now = { x: 11, y: 11 };
    assert.deepEqual(pointAt(trail, 150, now), { x: 5, y: 0 });
    assert.deepEqual(pointAt(trail, 250, now), { x: 10, y: 5 });
    assert.deepEqual(pointAt(trail, 50, now), { x: 0, y: 0 });
    assert.deepEqual(pointAt(trail, 300, now), now);
    assert.deepEqual(pointAt([], 150, now), now);
  });
});

describe('compensação de lag no jogo', () => {
  it('o servidor mede o ping: "sync" a cada 2 s; a resposta certa vira o ping (média); id errado ou repetido não conta', () => {
    const w = setupWorld(pvp());
    const a = w.connect('kaito');
    const s = session(w.world, a.id);
    w.run(LC.syncEveryMs);
    const sync = a.conn.last('sync');
    assert.ok(sync, 'mandou');
    const rttNow = () => w.clock.now() - s.sync.at;             // quanto tempo desde que o servidor mandou
    w.clock.advance(80);
    a.send({ type: 'sync', id: sync.id + 7 });
    assert.equal(s.rttMs, 0, 'id errado');
    const first = rttNow();
    a.send({ type: 'sync', id: sync.id });
    assert.equal(s.rttMs, first);
    w.clock.advance(500);
    a.send({ type: 'sync', id: sync.id });
    assert.equal(s.rttMs, first, 'repetido não conta');
    w.run(LC.syncEveryMs);
    const next = a.conn.last('sync');
    assert.equal(next.rtt, first, 'o ping medido volta para o cliente mostrar');
    const second = rttNow();
    a.send({ type: 'sync', id: next.id });
    assert.equal(s.rttMs, first * 0.75 + second * 0.25, 'média que muda devagar');
  });

  it('o golpe acerta onde o outro estava na tela de quem bateu (ping 150 + 100 de desenho = 250 ms atrás)', () => {
    assert.equal(chase(150).hp, 100 - BA.damage);
  });

  it('sem ping medido, nada de voltar no tempo: o outro já fugiu, o golpe erra', () => {
    assert.equal(chase(0).hp, 100);
  });

  it('teto de 300 ms: ping alto não acerta onde o outro estava há mais tempo que isso', () => {
    assert.equal(chase(2000, 300).hp, 100 - BA.damage, '300 ms atrás: dentro do teto');
    assert.equal(chase(2000, 900).hp, 100, '900 ms atrás: fora do teto');
  });

  it('trocar de mapa apaga o rastro (ninguém do mapa novo viu ele no antigo)', () => {
    const w = setupWorld(pvp());
    const a = w.connect('kaito');
    w.run(300);
    assert.ok(session(w.world, a.id).trail.length > 1);
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    assert.equal(session(w.world, a.id).trail.length, 0);
  });
});
