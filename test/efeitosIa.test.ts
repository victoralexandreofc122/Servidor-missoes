import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import {
  addEffect, breakOnDamage, effectBlock, healFactor, speedFactor, stepEffects, WET_LIGHTNING_BONUS, type EffectBag,
} from '../src/realtime/effects.js';
import { closestInBox, distanceToBox, steer } from '../src/realtime/monsterAi.js';
import { blocked } from '../src/realtime/movement.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * v18: efeitos com tempo (effects.ts: molhado, queimadura, regeneração, silêncio, sono, ferida, lentidão; o combo Água +
 * Relâmpago) e a IA dos monstros (monsterAi.ts: parado, persegue, ataca, volta curando).
 */

const SK = REALTIME.combat.skills;
const AI = REALTIME.combat.monsters.ai!;
const FOREST = REALTIME.maps.map_2;

function config(monsterDamage = 0): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: monsterDamage },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);
const monster = (world: any, id: string) => world.monsters.get(id);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

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

function join(w: ReturnType<typeof setupWorld>, username: string, extra: Record<string, unknown> = {}) {
  const conn = new FakeConn();
  const id = randomUUID();
  const handle = w.world.join({ id, username, ...extra }, conn);
  return { id, conn, send: (msg: unknown) => handle.receive(JSON.stringify(msg)) };
}

describe('efeitos (effects.ts, funções puras)', () => {
  it('renovar fica com o tempo e a força maiores; queimadura de 3 s = 3 pulsos e acaba', () => {
    const bag: EffectBag = new Map();
    addEffect(bag, 'queimadura', 0, 3000, 4, 'a');
    addEffect(bag, 'queimadura', 500, 1000, 6, 'b');
    assert.deepEqual({ ...bag.get('queimadura')! }, { until: 3000, amount: 6, nextTickAt: 1000, sourceId: 'b' });
    const a = stepEffects(bag, 2000);
    assert.deepEqual(a.pulses.map((p) => [p.kind, p.amount]), [['damage', 6], ['damage', 6]]);
    const b = stepEffects(bag, 3000);
    assert.equal(b.pulses.length, 1, 'o pulso que cai no fim ainda vale');
    assert.deepEqual(b.expired, ['queimadura']);
    assert.equal(bag.size, 0);
  });

  it('silêncio bloqueia jutsu; sono bloqueia tudo e acorda ao apanhar; lentidão e ferida mudam velocidade e cura', () => {
    const bag: EffectBag = new Map();
    addEffect(bag, 'silencio', 0);
    assert.equal(effectBlock(bag, 100), 'jutsu');
    addEffect(bag, 'sono', 0);
    assert.equal(effectBlock(bag, 100), 'all');
    assert.deepEqual(breakOnDamage(bag, 100), ['sono']);
    assert.equal(effectBlock(bag, 100), 'jutsu');
    addEffect(bag, 'lentidao', 0);
    addEffect(bag, 'ferida', 0);
    assert.equal(speedFactor(bag, 100), 0.6);
    assert.equal(healFactor(bag, 100), 0.5);
    assert.equal(speedFactor(bag, 99_999), 1, 'acabou');
  });
});

describe('IA dos monstros (monsterAi.ts, funções puras)', () => {
  it('zona: o ponto mais perto e quanto falta; passo que desvia de parede (reto, ±45°, ±90°)', () => {
    const box = { x: 10, y: 10, w: 5, h: 5 };
    assert.deepEqual(closestInBox(box, { x: 12, y: 12 }), { x: 12, y: 12 });
    assert.equal(distanceToBox(box, { x: 12, y: 12 }), 0);
    assert.ok(Math.abs(distanceToBox(box, { x: 6, y: 12 }) - 4) < 1e-9);
    const free = (x: number, y: number) => !(x >= 0.5 && Math.abs(y) < 1e-9);   // parede bem na frente, na linha y = 0
    const step = steer({ x: 0, y: 0 }, 1, 0, 1, free)!;
    assert.ok(Math.abs(Math.hypot(step.x, step.y) - 1) < 1e-9 && step.y !== 0, 'desviou');
    assert.equal(steer({ x: 0, y: 0 }, 1, 0, 1, () => false), null, 'preso');
  });
});

describe('efeitos no jogo', () => {
  it('Água molha; Relâmpago no molhado: combo "eletrocutado", 30% a mais e seca', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(6);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    session(w.world, a.id).jutsus.set('lightning', 0);
    session(w.world, a.id).kits.A = ['water', 'lightning', 'fire', 'taijutsu'];
    const m = w.world.spawnMonster({ x: row.x + 2, y: row.y }, undefined, 'map_2', 'lodo_sombrio');
    a.send({ type: 'cast', skill: 'water' });
    assert.deepEqual(a.conn.of('effect').map((e: any) => [e.id, e.effect]), [[m.id, 'molhado']]);
    const hp = monster(w.world, m.id).hp;
    a.send({ type: 'cast', skill: 'lightning' });
    assert.deepEqual(a.conn.last('combo'), { type: 'combo', target: 'monster', id: m.id, combo: 'eletrocutado' });
    assert.equal(hp - monster(w.world, m.id).hp, Math.round(SK.lightning.damage! * WET_LIGHTNING_BONUS));
    assert.equal(a.conn.of('effect').filter((e: any) => e.effect === 'molhado').at(-1).ms, 0, 'secou');
    assert.deepEqual([...monster(w.world, m.id).effects.keys()], ['paralisia'], 'e ficou paralisado');
  });

  it('/admin efeito: silêncio (sem jutsu, golpe sai), sono (não anda nem bate; apanhar acorda), lentidão, ferida, regeneração', () => {
    const w = setupWorld(config());
    const admin = join(w, 'Victor', { isAdmin: true });
    const k = join(w, 'kaito');
    const say = (text: string) => { admin.send({ type: 'chat', message: text }); w.run(1100); };
    say('/admin efeito kaito silencio 5');
    assert.match(admin.conn.last('notice').text, /Silêncio/);
    k.send({ type: 'cast', skill: 'water' });
    assert.equal(k.conn.last('cast_failed').reason, 'SILENCED');
    say('/admin efeito kaito limpar');
    say('/admin efeito kaito sono 10');
    k.send({ type: 'attack' });
    assert.equal(k.conn.last('attack_failed').reason, 'ASLEEP');
    const before = { ...session(w.world, k.id) };
    k.send({ type: 'move', dx: 1, dy: 0 });
    w.run(300);
    assert.equal(session(w.world, k.id).x, before.x, 'dormindo não anda');
    (w.world as any).damagePlayer(session(w.world, k.id), 1, w.clock.now());
    assert.equal(k.conn.of('effect').filter((e: any) => e.effect === 'sono').at(-1).ms, 0, 'apanhou: acordou');
    say('/admin efeito kaito lentidao 10');
    assert.equal(k.conn.last('stats').speed, Math.round(REALTIME.speedTilesPerSecond * 0.6 * 100) / 100);
    say('/admin efeito kaito ferida 10');
    session(w.world, k.id).hp = 40;
    (w.world as any).healPlayer(session(w.world, k.id), 30, w.clock.now());
    assert.equal(session(w.world, k.id).hp, 55, 'ferida: metade da cura');
    say('/admin efeito kaito regeneracao 3');
    const hp = session(w.world, k.id).hp;
    w.run(3100);
    assert.ok(session(w.world, k.id).hp >= hp + 2 * 5 * 0.5, `regeneração (com a ferida): ${hp} -> ${session(w.world, k.id).hp}`);
  });

  it('quem chega no mapa vê os efeitos de quem já está lá', () => {
    const w = setupWorld(config());
    const admin = join(w, 'Victor', { isAdmin: true });
    join(w, 'kaito');
    admin.send({ type: 'chat', message: '/admin efeito kaito molhado 30' });
    const c = join(w, 'hana');
    const k = c.conn.last('welcome').players.find((p: any) => p.username === 'kaito');
    assert.ok(k.fx.molhado > 29_000);
  });
});

describe('IA dos monstros no jogo', () => {
  it('nota quem chega no raio de aggro, persegue (todos veem "monster_aggro") e bate quando encosta', () => {
    const w = setupWorld(config(10));
    const a = w.connect('kaito');
    const row = openRow(8);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    const m = w.world.spawnMonster({ x: row.x + AI.aggroRange - 0.5, y: row.y }, undefined, 'map_2');
    w.run(1500);
    assert.deepEqual(a.conn.of('monster_aggro')[0], { type: 'monster_aggro', id: m.id, targetId: a.id });
    assert.ok(dist(monster(w.world, m.id), session(w.world, a.id)) <= REALTIME.combat.monsters.attackRange, 'chegou colado');
    w.run(2500);
    assert.ok(a.conn.of('hit').some((h: any) => h.id === a.id), 'bateu');
  });

  it('longe do raio fica à toa; apanhou de longe (Fogo), vem atrás de quem bateu', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(9);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    const m = w.world.spawnMonster({ x: row.x + 8, y: row.y }, undefined, 'map_2');
    w.run(1500);
    assert.equal(a.conn.of('monster_aggro').length, 0, 'não notou');
    a.send({ type: 'cast', skill: 'fire' });
    w.run(1500);
    assert.equal(a.conn.last('monster_aggro')?.targetId, a.id, 'apanhou: persegue');
    assert.ok(dist(monster(w.world, m.id), session(w.world, a.id)) < 7.5, 'vem chegando');
  });

  it('corda: fugiu longe demais da zona, desiste, volta e chega em casa com a vida toda', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(16);
    placeIn(w.world, a.id, 'map_2', row.x + 11.5, row.y);          // longe do raio, mas perto o bastante da ameaça
    const m = w.world.spawnMonster({ x: row.x + 1, y: row.y }, undefined, 'map_2');
    const mm = monster(w.world, m.id);
    mm.zone = { x: row.x, y: row.y - 1, w: 2, h: 2 };                 // zona pequena: a corda (8 casas) chega rápido
    mm.hp -= 20;
    mm.damageBy.set(a.id, 20);                                        // apanhou dele: ele é a ameaça
    mm.nextThinkAt = 0;
    w.run(8000);
    const aggro = a.conn.of('monster_aggro').map((x: any) => x.targetId);
    assert.deepEqual([aggro[0], aggro.at(-1)], [a.id, null], 'perseguiu e desistiu');
    assert.equal(mm.mind, 'idle', 'voltou para casa');
    assert.equal(distanceToBox(mm.zone, mm), 0);
    assert.equal(mm.hp, mm.maxHp, 'vida toda de volta');
    assert.equal(mm.damageBy.size, 0, 'ninguém mais conta como participante');
    assert.ok(a.conn.of('hit').some((h: any) => h.target === 'monster' && h.kind === 'heal' && h.id === m.id));
  });

  it('atordoado não persegue', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const row = openRow(8);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    const m = w.world.spawnMonster({ x: row.x + 3, y: row.y }, undefined, 'map_2');
    monster(w.world, m.id).stunnedUntil = w.clock.now() + 5000;
    w.run(1500);
    assert.deepEqual([monster(w.world, m.id).x, monster(w.world, m.id).y], [row.x + 3, row.y]);
  });
});
