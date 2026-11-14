import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld, RECONNECT_GRACE_MS } from '../src/realtime/gameWorld.js';
import { FakeConn, seededRandom } from './support/world.js';

/* v59: caiu a conexão (troca de app, outra aba): volta no mesmo lugar se reconectar em até 2 minutos. */

const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
const ID = '00000000-0000-4000-8000-000000000001';

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const world = new GameWorld(cfg, clock.now, undefined, { random: seededRandom() });
  const join = () => {
    const conn = new FakeConn();
    const h = world.join({ id: ID, username: 'ninja', appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    return { conn, h, s: (world as any).sessions.get(ID) };
  };
  return { world: world as any, clock, join };
}

/** Leva o ninja para longe da praça (Floresta), com a vida pela metade. */
function goFar(w: any, s: any) {
  w.transfer(s, 'map_2', 60, 70, 'gate');
  s.x = 60;
  s.y = 70;
  s.hp = Math.floor(s.stats.maxHp / 2);
}

describe('v59: reconexão no mesmo lugar', () => {
  it('saiu e voltou em menos de 2 minutos: mesmo mapa, mesma posição, mesma vida', () => {
    const { world, clock, join } = setup();
    const a = join();
    const home = { map: a.s.map, x: a.s.x, y: a.s.y };
    goFar(world, a.s);
    const hp = a.s.hp;
    a.h.leave();
    assert.equal(world.sessions.has(ID), false, 'saiu do mundo (os outros veem que saiu)');
    clock.advance(RECONNECT_GRACE_MS - 5_000);
    const b = join();
    assert.deepEqual([b.s.map, b.s.x, b.s.y], ['map_2', 60, 70]);
    assert.notDeepEqual([b.s.map, b.s.x, b.s.y], [home.map, home.x, home.y]);
    assert.equal(b.s.hp, hp, 'reconectar não cura');
    assert.ok(world.mapPlayers.get('map_2').has(b.s), 'está no mapa de verdade');
  });

  it('passou dos 2 minutos: volta para a praça da vila', () => {
    const { world, clock, join } = setup();
    const a = join();
    const home = { map: a.s.map, x: a.s.x, y: a.s.y };
    goFar(world, a.s);
    a.h.leave();
    clock.advance(RECONNECT_GRACE_MS + 1);
    const b = join();
    assert.deepEqual([b.s.map, b.s.x, b.s.y], [home.map, home.x, home.y]);
  });

  it('a guarda é usada uma vez só; e na arena/Vale não guarda', () => {
    const { world, clock, join } = setup();
    const a = join();
    goFar(world, a.s);
    a.h.leave();
    join().h.leave();             // voltou (mesmo lugar) e caiu de novo: guarda de novo, do lugar onde estava
    clock.advance(1_000);
    assert.equal(join().s.map, 'map_2');
    const c = world.sessions.get(ID);
    world.transfer(c, 'vale_estatuas', 30, 30, 'gate');
    world.leave(c);
    const d = join();
    assert.notEqual(d.s.map, 'vale_estatuas', 'saiu do Vale: volta para a praça');
  });
});
