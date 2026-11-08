import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { placeIn, setupWorld, withMonsters } from './support/world.js';

// Monstro parado e sem ataque, num mapa de caça: a zona e o aviso acertam monstros como os jutsus de hoje.
const cfg = (): RealtimeConfig => {
  const base = withMonsters(1);
  return { ...base, combat: { ...base.combat, player: { ...base.combat.player, hpRegenPerSec: 0 }, monsters: { ...base.combat.monsters, count: 1, perPlayer: 0, stepMs: 1e12, attackDamage: 0 } } };
};

function scene() {
  const w = setupWorld(cfg());
  const a = w.connect('kaito');
  w.run(REALTIME.tickMs);
  const world: any = w.world;
  const s = world.sessions.get(a.id);
  const m = [...world.monsters.values()][0];
  s.tutorial = 4;
  placeIn(world, a.id, 'map_2', 51, 10);                       // clareira da Floresta (fora de zona segura)
  m.map = s.map;
  m.x = s.x + 2; m.y = s.y;
  return { ...w, a, s, m, world };
}

describe('Jutsus v2, entrega 1: zona no chão e aviso de golpe', () => {
  it('zona de fogo: quem está dentro apanha a cada segundo, quem está fora não; some no fim', () => {
    const { world, s, m, run, a } = scene();
    const hp = m.hp;
    world.spawnZone(s, { x: s.x + 1, y: s.y, r: 3, kind: 'fogo', ms: 2500, damage: 20, label: 'teste' });   // o monstro anda até o ninja: a zona cobre o caminho
    assert.equal(a.conn.last('ground').kind, 'fogo');
    run(900);
    assert.equal(m.hp, hp, 'antes do primeiro segundo, nada');
    run(200);
    assert.ok(m.hp < hp, 'no primeiro pulso, apanhou');
    const after1 = m.hp;
    m.x += 12;                                                    // saiu da zona (longe: mesmo voltando, não entra em 1 s)
    run(1000);
    assert.equal(m.hp, after1, 'fora da zona não apanha');
    run(1000);
    assert.ok(a.conn.last('ground_end'), 'a zona acabou');
  });

  it('aviso: o círculo aparece e o dano só cai depois do tempo; quem saiu escapa', () => {
    const { world, s, m, run, a } = scene();
    const hp = m.hp;
    world.warnStrike(s, { x: m.x, y: m.y, r: 1.5, delayMs: 800, damage: 20 });
    assert.equal(a.conn.last('ground').kind, 'aviso');
    run(700);
    assert.equal(m.hp, hp, 'ainda não caiu');
    run(200);
    assert.ok(m.hp < hp, 'caiu em quem ficou dentro');
    const hp2 = m.hp;
    world.warnStrike(s, { x: m.x, y: m.y, r: 1.5, delayMs: 800, damage: 20 });
    m.x += 4;                                                     // saiu a tempo
    run(900);
    assert.equal(m.hp, hp2);
  });

  it('zona de cura: cura quem lançou, sem passar da vida máxima', () => {
    const { world, s, run } = scene();
    s.hp = s.stats.maxHp - 5;
    world.spawnZone(s, { x: s.x, y: s.y, r: 2, kind: 'cura', ms: 3000, heal: 4 });
    run(1050);
    assert.equal(s.hp, s.stats.maxHp - 1);
    run(1000);
    assert.equal(s.hp, s.stats.maxHp);
  });
});
