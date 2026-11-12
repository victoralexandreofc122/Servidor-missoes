import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/* Teste Alpha: a classe Cura serve o aliado em foco (Cura, Palma, Renovação, Desintoxicação, Banho e Casca). */

const FOREST = REALTIME.maps.map_2;
const config = (): RealtimeConfig => ({
  ...REALTIME,
  combat: { ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 }, pvp: false,
    monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 }, player: { ...REALTIME.combat.player, hpRegenPerSec: 0 } },
});
function openSpot(): { x: number; y: number } {
  const free = (x: number, y: number) => [-3, -1, 0, 1, 3].every((d) => !blocked(x + d, y, FOREST.walls) && !blocked(x, y + d, FOREST.walls));
  for (let y = 22; y < 90; y++) for (let x = 8; x < 90; x++) if (free(x, y)) return { x, y };
  throw new Error('sem lugar livre');
}

/** O curandeiro (kaito) e um aliado (mei) lado a lado na Floresta; `dist` = a distância entre eles. */
function duo(skill: string, dist = 2) {
  const w = setupWorld(config());
  const world: any = w.world;
  const a = w.connect('kaito');
  const b = w.connect('mei');
  const row = openSpot();
  placeIn(world, a.id, 'map_2', row.x, row.y);
  placeIn(world, b.id, 'map_2', row.x + dist, row.y);
  const s = world.sessions.get(a.id), ally = world.sessions.get(b.id);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4, hp: s.stats.maxHp });
  Object.assign(ally, { tutorial: 4 });
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [skill, ...s.kits[s.activeKit].filter((k: string) => k !== skill).slice(0, 3)];
  return { ...w, world, a, b, s, ally };
}

describe('Cura em quem está em foco', () => {
  it('Desintoxicação no aliado focado: tira a queimadura dele e cura; quem lançou não muda', () => {
    const { s, ally, a, world, run } = duo('heal_desintox');
    world.applyEffect({ kind: 'player', id: ally.id, x: ally.x, y: ally.y, session: ally }, 'queimadura', world.now(), 3000, 3);
    ally.hp = ally.stats.maxHp - 30;
    s.hp = s.stats.maxHp - 5;
    a.send({ type: 'cast', skill: 'heal_desintox', targetId: ally.id });
    run(60);
    assert.equal(ally.effects.has('queimadura'), false);
    assert.equal(ally.hp, ally.stats.maxHp - 20);
    assert.equal(s.hp, s.stats.maxHp - 5, 'o curandeiro não foi curado');
  });

  it('sem foco, a mesma cura vale para quem lançou', () => {
    const { s, ally, a, run } = duo('heal_desintox');
    ally.hp = ally.stats.maxHp - 30;
    s.hp = s.stats.maxHp - 30;
    a.send({ type: 'cast', skill: 'heal_desintox' });
    run(60);
    assert.equal(s.hp, s.stats.maxHp - 20);
    assert.equal(ally.hp, ally.stats.maxHp - 30);
  });

  it('aliado longe demais (acima de 4 casas): a cura cai em quem lançou', () => {
    const { s, ally, a, run } = duo('heal_desintox', 6);
    ally.hp = ally.stats.maxHp - 30;
    s.hp = s.stats.maxHp - 30;
    a.send({ type: 'cast', skill: 'heal_desintox', targetId: ally.id });
    run(60);
    assert.equal(s.hp, s.stats.maxHp - 20);
    assert.equal(ally.hp, ally.stats.maxHp - 30);
  });

  it('Renovação Celular no aliado: a regeneração é dele, com a vida máxima dele', () => {
    const { s, ally, a, run } = duo('heal_4');
    ally.hp = 10;
    a.send({ type: 'cast', skill: 'heal_4', targetId: ally.id });
    run(1000);   // os selos do jutsu
    assert.ok(ally.effects.has('regeneracao'));
    assert.equal(s.effects.has('regeneracao'), false);
    run(2100);
    assert.ok(ally.hp >= 10 + 2 * Math.round(ally.stats.maxHp * 0.03), 'cura por segundo no aliado');
  });

  it('Casca de Chakra no aliado: o escudo é dele', () => {
    const { s, ally, a, run } = duo('heal_casca');
    a.send({ type: 'cast', skill: 'heal_casca', targetId: ally.id });
    run(60);
    assert.ok(ally.absorb && ally.absorb.hp > 0, 'o aliado ganhou o escudo');
    assert.ok(!s.absorb || s.absorb.hp === 0, 'o curandeiro não');
  });

  it('a Cura básica no aliado focado e a Palma continuam curando ele', () => {
    const c = duo('heal');
    c.ally.hp = c.ally.stats.maxHp - 40;
    c.a.send({ type: 'cast', skill: 'heal', targetId: c.ally.id });
    c.run(60);
    assert.ok(c.ally.hp > c.ally.stats.maxHp - 40, 'Cura');
    const p = duo('heal_palma', 1);
    p.ally.hp = p.ally.stats.maxHp - 40;
    p.a.send({ type: 'cast', skill: 'heal_palma', targetId: p.ally.id });
    p.run(2200);
    assert.equal(p.ally.hp, p.ally.stats.maxHp - 40 + 30, 'Palma: cura cheia no aliado');
  });
});

describe('Cura em zona', () => {
  it('Zona de Cura e Aura curam o aliado dentro do círculo; Milagre cura de uma vez', () => {
    for (const [skill, wait] of [['heal_3', 3000], ['heal_aura', 2500], ['heal_milagre', 3000]] as const) {
      const { s, ally, a, run } = duo(skill, 2);
      ally.hp = ally.stats.maxHp - 60;
      s.hp = s.stats.maxHp - 60;
      a.send({ type: 'cast', skill });
      run(wait);
      assert.ok(ally.hp > ally.stats.maxHp - 60, `${skill} curou o aliado`);
      assert.ok(s.hp > s.stats.maxHp - 60, `${skill} curou quem lançou`);
    }
  });
});
