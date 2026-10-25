import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Combate v18: os golpes saem mesmo sem ninguém perto (no PvP, acertar é questão de tempo), o Fogo vai longe na direção
 * do inimigo, a Água empurra, o Ataque Básico anima na zona segura (sem dano) e o foco vale para aliados (Cura).
 */

const T = await import(new URL('../public/targeting.js', import.meta.url).href);
const SK = REALTIME.combat.skills;
const M = REALTIME.combat.monsters;
const F = { x: 10, y: 50 };                                       // clareira da Floresta (sem paredes em volta)

function config(pvp = false): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      pvp,
      monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);
const monster = (world: any, id: string) => world.monsters.get(id);

describe('combate livre: Água empurra, Fogo vai longe', () => {
  it('a Água empurra o monstro para longe de quem lançou (1,5 casa); o boneco de treino não sai do lugar', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const b = w.connect('mei');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    placeIn(w.world, b.id, 'map_2', F.x, F.y + 3);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    const m = w.world.spawnMonster({ x: F.x + 2, y: F.y }, undefined, 'map_2');
    a.send({ type: 'cast', skill: 'water' });
    assert.equal(monster(w.world, m.id).hp, M.maxHp - SK.water.damage!);
    assert.ok(Math.abs(monster(w.world, m.id).x - (F.x + 2 + SK.water.push!)) < 0.01, `empurrado: ${monster(w.world, m.id).x}`);
    assert.equal(monster(w.world, m.id).y, F.y);
    assert.deepEqual(b.conn.last('monsters_moved').m, [[m.id, monster(w.world, m.id).x, F.y]], 'todos veem');
    assert.equal(SK.water.push, 1.5);
    assert.equal(SK.water_2.push, 2, 'o tier 2 empurra mais');
    w.clock.advance(SK.water.cooldownMs);
    const dummy = w.world.spawnMonster({ x: F.x + 2, y: F.y }, undefined, 'map_2', 'dummy');
    a.send({ type: 'cast', skill: 'water' });
    assert.deepEqual([monster(w.world, dummy.id).x, monster(w.world, dummy.id).y], [F.x + 2, F.y], 'boneco de treino fica');
  });

  it('PvP: a Água empurra o outro ninja (todos recebem "pushed"); fora do PvP, aliado não é empurrado', () => {
    const w = setupWorld(config(true));
    const a = w.connect('kaito');
    const b = w.connect('mei');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    placeIn(w.world, b.id, 'map_2', F.x + 2, F.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    a.send({ type: 'cast', skill: 'water' });
    const push = b.conn.last('pushed');
    assert.deepEqual([push.playerId, push.fromX, push.fromY, push.y], [b.id, F.x + 2, F.y, F.y]);
    assert.ok(Math.abs(push.x - (F.x + 2 + SK.water.push!)) < 0.01);
    assert.equal(session(w.world, b.id).x, push.x, 'o servidor moveu');
    assert.deepEqual(a.conn.last('pushed'), push);

    const calm = setupWorld(config(false));
    const c = calm.connect('kaito');
    const d = calm.connect('mei');
    placeIn(calm.world, c.id, 'map_2', F.x, F.y);
    placeIn(calm.world, d.id, 'map_2', F.x + 2, F.y);
    Object.assign(session(calm.world, c.id), { fx: 1, fy: 0 });
    c.send({ type: 'cast', skill: 'water' });
    assert.equal(d.conn.last('pushed'), undefined);
    assert.equal(session(calm.world, d.id).x, F.x + 2);
  });

  it('o Fogo vai até 9 casas na direção do inimigo mais perto (antes eram 5)', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    const m = w.world.spawnMonster({ x: F.x + 8, y: F.y }, undefined, 'map_2');
    a.send({ type: 'cast', skill: 'fire' });
    assert.equal(a.conn.last('projectile').fx, 1, 'mirou no inimigo a 8 casas');
    w.run(800);
    assert.equal(monster(w.world, m.id).hp, M.maxHp - SK.fire.damage!);
  });
});

describe('combate livre: sem alvo, zona segura e foco em aliados', () => {
  it('Ataque Básico, Taijutsu, Ilusão, Relâmpago e Kunais saem sem ninguém perto (gastam e erram)', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    const s = session(w.world, a.id);
    for (const skill of ['lightning', 'weapons']) s.jutsus.set(skill, 0);
    s.kits.A = ['taijutsu', 'illusion', 'lightning', 'weapons'];
    a.send({ type: 'attack' });
    for (const skill of ['taijutsu', 'illusion', 'lightning', 'weapons']) a.send({ type: 'cast', skill });
    assert.equal(a.conn.of('attack').length, 1);
    assert.deepEqual(a.conn.of('cast').map((c: any) => c.skill), ['taijutsu', 'illusion', 'lightning', 'weapons']);
    assert.equal(a.conn.of('cast_failed').length + a.conn.of('attack_failed').length, 0);
    assert.equal(s.chakra, 100 - SK.taijutsu.cost - SK.illusion.cost - SK.lightning.cost - SK.weapons.cost);
  });

  it('Cura no aliado FOCADO (mesmo com você ferido); focado longe: OUT_OF_RANGE, sem gastar', () => {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    const b = w.connect('mei');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    placeIn(w.world, b.id, 'map_2', F.x + 2, F.y);
    const s = session(w.world, a.id);
    s.kits.B = ['heal', ...s.kits.B.filter((k: string) => k !== 'heal')].slice(0, 4);
    s.jutsus.set('heal', 0);
    a.send({ type: 'switch_kit', kit: 'B' });
    s.hp = 50;
    session(w.world, b.id).hp = 40;
    a.send({ type: 'cast', skill: 'heal', targetId: b.id });
    assert.equal(session(w.world, b.id).hp, 40 + SK.heal.heal!, 'curou o focado');
    assert.equal(s.hp, 50);
    w.clock.advance(SK.heal.cooldownMs);
    placeIn(w.world, b.id, 'map_2', F.x + 6, F.y);
    const chakra = s.chakra;
    a.send({ type: 'cast', skill: 'heal', targetId: b.id });
    assert.equal(a.conn.last('cast_failed').reason, 'OUT_OF_RANGE');
    assert.equal(s.chakra, chakra, 'nada cobrado');
  });

  it('🎯 (cliente): primeiro os inimigos, do mais perto ao mais longe; depois os aliados; e volta ao começo', () => {
    const me = { x: 0, y: 0 };
    const foes = [{ id: 'm1', x: 3, y: 0, hp: 10 }, { id: 'm2', x: 1, y: 0, hp: 10 }, { id: 'm3', x: 30, y: 0, hp: 10 }];
    const allies = [{ id: 'p1', x: 0.5, y: 0, hp: 50 }, { id: 'p2', x: 2, y: 0, hp: 0 }];
    const seq: (string | null)[] = [];
    let id: string | null = null;
    for (let i = 0; i < 4; i++) seq.push((id = T.nextFocus(me, foes, allies, id)));
    assert.deepEqual(seq, ['m2', 'm1', 'p1', 'm2'], 'aliado depois dos inimigos; longe (m3) e morto (p2) ficam de fora');
    assert.equal(T.nextFocus(me, [], allies, null), 'p1', 'sem inimigos: o aliado');
    assert.equal(T.nextFocus(me, [], [], null), null);
  });
});
