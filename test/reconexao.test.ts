import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld, RECONNECT_GRACE_MS, type JoiningPlayer } from '../src/realtime/gameWorld.js';
import { blocked } from '../src/realtime/movement.js';
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

/** Um ponto livre (fora das árvores) da Floresta, longe da praça. */
const FAR = (() => {
  const m = REALTIME.maps.map_2;
  for (let y = 60; y < m.height - 1; y++) for (let x = 50; x < m.width - 1; x++) if (!blocked(x + 0.5, y + 0.5, m.walls)) return { x: x + 0.5, y: y + 0.5 };
  throw new Error('sem ponto livre');
})();

/** Leva o ninja para longe da praça (Floresta), com a vida pela metade. */
function goFar(w: any, s: any) {
  w.transfer(s, 'map_2', FAR.x, FAR.y, 'gate');
  s.x = FAR.x;
  s.y = FAR.y;
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
    assert.deepEqual([b.s.map, b.s.x, b.s.y], ['map_2', FAR.x, FAR.y]);
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

describe('v59 (migração v34): volta sempre ao último lugar (gravado no banco)', () => {
  /** Mundo com um banco falso só para as posições (o resto do jogo sem banco). */
  function withStore(tableExists = true) {
    let t = 1_000_000;
    const db = new Map<string, { map: string; x: number; y: number }>();
    const calls: number[] = [];
    const store = {
      async savePositions(rows: readonly { id: string; pos: { map: string; x: number; y: number } | null }[]) {
        calls.push(rows.length);
        if (!tableExists) return false;
        for (const r of rows) if (r.pos) db.set(r.id, r.pos); else db.delete(r.id);
        return true;
      },
    };
    const world: any = new GameWorld(cfg, () => t, undefined, { random: seededRandom() });
    world.store = store;
    const join = (extra: Partial<JoiningPlayer> = {}) => {
      const h = world.join({ id: ID, username: 'ninja', appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' }, ...extra }, new FakeConn());
      return { h, s: world.sessions.get(ID) };
    };
    return { world, db, calls, join, advance: (ms: number) => (t += ms) };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('ao sair grava o lugar; horas depois (sessão já esquecida) entra no mesmo lugar', async () => {
    const { world, db, join, advance } = withStore();
    const a = join();
    goFar(world, a.s);
    a.h.leave();
    await flush();
    assert.deepEqual(db.get(ID), { map: 'map_2', ...FAR });
    advance(5 * 60 * 60 * 1000);       // 5 horas: a guarda de 2 minutos já passou (ou o servidor reiniciou)
    const b = join({ lastPosition: db.get(ID)! });
    assert.deepEqual([b.s.map, b.s.x, b.s.y], ['map_2', FAR.x, FAR.y]);
  });

  it('grava de tempos em tempos só quem andou; morto, na arena ou no tutorial apaga (nasce na praça)', async () => {
    const { world, db, calls, join } = withStore();
    const a = join();
    await world.persistPositions();
    assert.equal(calls.length, 0, 'parado no lugar de entrada: nada a gravar');
    goFar(world, a.s);
    await world.persistPositions();
    await world.persistPositions();
    assert.deepEqual(calls, [1], 'andou: grava uma vez; sem mudar, não grava de novo');
    a.s.dead = true;
    await world.persistPositions();
    assert.equal(db.has(ID), false, 'morreu: apaga (renasce na praça)');
  });

  it('lugar que não serve mais é ignorado: mapa que não existe, dentro da parede, arena, fora do mapa', () => {
    const { join } = withStore();
    const home = join().s;
    const at = { map: home.map, x: home.x, y: home.y };
    for (const bad of [{ map: 'mapa_que_sumiu', x: 10, y: 10 }, { map: 'vale_estatuas', x: 30, y: 30 }, { map: 'map_2', x: -5, y: 2000 }, { map: 'academy_interior', x: 5, y: 5 }]) {
      const fresh = withStore().join({ lastPosition: bad }).s;
      assert.deepEqual([fresh.map, fresh.x, fresh.y], [at.map, at.x, at.y], JSON.stringify(bad));
    }
  });

  it('sem a migração v34 (tabela não existe): para de tentar e o jogo segue', async () => {
    const { world, calls, join } = withStore(false);
    goFar(world, join().s);
    await world.persistPositions();
    goFar(world, world.sessions.get(ID));
    world.sessions.get(ID).x = 61;
    await world.persistPositions();
    assert.deepEqual(calls, [1], 'tentou uma vez e desligou');
  });
});
