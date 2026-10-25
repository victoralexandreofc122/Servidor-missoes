import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * v18: o Fogo queima (todos os tiers; mais forte nos altos), o Relâmpago paralisa (anda a 70% e leva um choque por
 * segundo) e o golpe marcado do Lodo Escuro (círculo no chão; 1 s depois ele pula ali e acerta quem ficou dentro).
 */

const SK = REALTIME.combat.skills;
const SLAM = REALTIME.combat.monsterTypes.lodo_escuro!.slam!;
const FOREST = REALTIME.maps.map_2;

function config(pvp = false): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      pvp,
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);
const monster = (world: any, id: string) => world.monsters.get(id);

/** Um trecho reto e livre da Floresta (com folga de meia casa para cima e para baixo), dentro da zona de caça. */
function openRow(len: number): { x: number; y: number } {
  const free = (x: number, y: number) => !blocked(x, y, FOREST.walls) && !blocked(x, y - 0.5, FOREST.walls) && !blocked(x, y + 0.5, FOREST.walls);
  for (let y = 22; y < 90; y += 1) {
    for (let x = 8; x < 90 - len; x += 1) {
      let ok = true;
      for (let k = 0; k <= len && ok; k += 0.25) ok = free(x + k, y);
      if (ok) return { x, y };
    }
  }
  throw new Error('sem trecho livre');
}

describe('Fogo queima e Relâmpago paralisa', () => {
  it('queimadura em todos os tiers, mais forte nos altos; a explosão deixa o alvo queimando 3 s', () => {
    assert.deepEqual(['fire', 'fire_2', 'fire_3', 'fire_4'].map((k) => SK[k as 'fire']!.burn), [3, 4, 6, 8]);
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(6);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    const m = w.world.spawnMonster({ x: row.x + 3, y: row.y }, undefined, 'map_2', 'lodo_sombrio');
    monster(w.world, m.id).stunnedUntil = w.clock.now() + 60_000;   // parado, para o teste contar o dano
    a.send({ type: 'cast', skill: 'fire' });
    w.run(400);
    const burn = a.conn.of('effect').find((e: any) => e.effect === 'queimadura');
    assert.deepEqual([burn.id, burn.ms], [m.id, SK.fire.burnMs]);
    const afterBlast = monster(w.world, m.id).hp;
    w.run(3200);
    assert.equal(afterBlast - monster(w.world, m.id).hp, 3 * SK.fire.burn!, '3 pulsos de 3');
    assert.equal(a.conn.of('effect').filter((e: any) => e.effect === 'queimadura').at(-1).ms, 0, 'acabou');
  });

  it('PvP: o Relâmpago paralisa: anda a 70% (o dono recebe a velocidade nova) e leva um choque de 0,25 s por segundo', () => {
    const w = setupWorld(config(true));
    const a = w.connect('kaito');
    const b = w.connect('mei');
    const row = openRow(6);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    placeIn(w.world, b.id, 'map_2', row.x + 2, row.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    session(w.world, a.id).jutsus.set('lightning', 0);
    session(w.world, a.id).kits.A = ['lightning', 'water', 'fire', 'taijutsu'];
    a.send({ type: 'cast', skill: 'lightning', targetId: b.id });
    assert.deepEqual(b.conn.of('effect').map((e: any) => [e.effect, e.ms]), [['paralisia', SK.lightning.paralysisMs]]);
    assert.equal(b.conn.last('stats').speed, Math.round(REALTIME.speedTilesPerSecond * 0.7 * 100) / 100);
    w.run(2100);
    const shocks = b.conn.of('player_status').filter((s: any) => s.ms === 250);
    assert.equal(shocks.length, 2, 'um choque por segundo');
    assert.equal(b.conn.last('stats').speed, REALTIME.speedTilesPerSecond, 'passou: velocidade normal');
  });
});

describe('golpe marcado do Lodo Escuro', () => {
  function arena() {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(8);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    const m = w.world.spawnMonster({ x: row.x + 3, y: row.y }, undefined, 'map_2', 'lodo_escuro');
    Object.assign(monster(w.world, m.id), { nextSlamAt: 0, nextThinkAt: 0, nextAttackAt: Number.MAX_SAFE_INTEGER });
    w.run(100);
    return { w, a, m, row };
  }

  it('marca o chão onde o alvo está (todos veem) e, 1 s depois, pula ali: quem ficou apanha', () => {
    const { w, a, m, row } = arena();
    const tg = a.conn.last('telegraph');
    assert.deepEqual(tg, { type: 'telegraph', id: m.id, x: row.x, y: row.y, r: SLAM.radius, ms: SLAM.windupMs });
    const where = { x: monster(w.world, m.id).x, y: monster(w.world, m.id).y };
    w.run(SLAM.windupMs / 2);
    assert.deepEqual({ x: monster(w.world, m.id).x, y: monster(w.world, m.id).y }, where, 'parado no preparo');
    w.run(SLAM.windupMs / 2 + 100);
    assert.deepEqual(a.conn.last('monster_slam'), { type: 'monster_slam', id: m.id, x: row.x, y: row.y, r: SLAM.radius });
    assert.equal(session(w.world, a.id).hp, 100 - SLAM.damage);
    assert.deepEqual([monster(w.world, m.id).x, monster(w.world, m.id).y], [row.x, row.y], 'caiu no centro');
  });

  it('saiu do círculo a tempo: não apanha', () => {
    const { w, a, row } = arena();
    assert.ok(a.conn.last('telegraph'));
    placeIn(w.world, a.id, 'map_2', row.x - SLAM.radius - 1.5, row.y);
    w.run(SLAM.windupMs + 100);
    assert.ok(a.conn.last('monster_slam'), 'caiu');
    assert.equal(session(w.world, a.id).hp, 100);
  });

  it('atordoar o Lodo no preparo interrompe o golpe (o círculo some para todos)', () => {
    const { w, a, m } = arena();
    monster(w.world, m.id).stunnedUntil = w.clock.now() + 1500;
    w.run(SLAM.windupMs + 100);
    assert.equal(a.conn.last('telegraph').ms, 0, 'interrompido');
    assert.equal(a.conn.of('monster_slam').length, 0);
    assert.equal(session(w.world, a.id).hp, 100);
  });
});
