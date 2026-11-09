import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { EXTRACTION, JUTSUS, MASTERY, buildSkills, extractionChance, masteryBonus, masteryOf, withMastery } from '../src/realtime/jutsus.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Fase 0 (design final): a Extração nova (1/2/3/4 pergaminhos; tier 1 com as 2 primeiras garantidas e 90% depois;
 * 80/60/40%) e a maestria por jutsu (cada jutsu do Fogo evolui o que faz sentido: dano, efeito, alcance ou recarga).
 */

const SKILLS = buildSkills();
const FOREST = REALTIME.maps.map_2;

describe('Extração do design final', () => {
  it('pergaminhos 1/2/3/4 e chance 90/80/60/40%', () => {
    assert.deepEqual(EXTRACTION.map((e) => [e.level, e.scrolls, e.chance]), [[1, 1, 0.9], [2, 2, 0.8], [3, 3, 0.6], [4, 4, 0.4]]);
  });

  it('tier 1: as 2 primeiras de cada classe são garantidas, depois 90% (+10 por falha seguida)', () => {
    assert.equal(extractionChance(1, 0, 0), 1);
    assert.equal(extractionChance(1, 0, 1), 1);
    assert.equal(extractionChance(1, 0, 2), 0.9);
    assert.equal(extractionChance(1, 1, 2), 1);
    assert.equal(extractionChance(2, 0, 0), 0.8, 'só o tier 1 tem garantia');
  });

  it('a proteção contra azar vai até 100%: no tier 4, a 7ª tentativa seguida é certa', () => {
    assert.ok(extractionChance(4, 5) < 1);
    assert.equal(extractionChance(4, 6), 1);
    assert.equal(extractionChance(3, 4), 1);
    assert.equal(extractionChance(3, 3), 0.9);
  });
});

describe('Maestria por jutsu (Fogo)', () => {
  it('Fase 1.5: todo jutsu de classe e de clã tem a regra nova (no máximo 2 ganhos); a Academia evolui do jeito dela', () => {
    const all = JUTSUS.filter((j) => j.tier > 0).map((j) => j.code).sort();
    assert.deepEqual(Object.keys(MASTERY).sort(), all);
    assert.equal(all.length, 98);
    for (const [code, gains] of Object.entries(MASTERY)) assert.ok(gains.length >= 1 && gains.length <= 2, code);
    assert.ok(!MASTERY.teleport && !MASTERY.substitution);
    assert.deepEqual(masteryOf('water_3'), ['dano', 'efeito']);
    assert.deepEqual(masteryOf('fire_lamina'), ['recarga']);
  });

  it('Fase 1.5: cada ganho da tabela muda um número de verdade no nível 4', () => {
    const EFFECT = ['stunMs', 'rootMs', 'silenceMs', 'paralysisMs', 'burnMs', 'slowMs', 'darkMs', 'invertMs', 'woundMs', 'dotMs', 'firstStunMs',
      'liftMs', 'markMs', 'markSlowMs', 'stealthMs', 'nextHitMs'];
    for (const [code, gains] of Object.entries(MASTERY)) {
      const c: any = SKILLS[code as 'fire'];
      const m: any = withMastery(c, code, 4);
      for (const g of gains) {
        const changed = g === 'dano' ? (c.damage ?? 0) > 0
          : g === 'efeito' ? EFFECT.some((k) => c[k] && m[k] > c[k]) || (c.zone && ['firstRootMs', 'endStunMs'].some((k) => c.zone[k] && m.zone[k] > c.zone[k]))
          : g === 'cura' ? (c.heal && m.heal > c.heal) || (c.hot && m.hot > c.hot) || (c.zone?.heal && m.zone.heal > c.zone.heal)
          : g === 'alcance' ? (c.range && m.range > c.range) || (c.dash && Math.abs(m.dash) > Math.abs(c.dash))
          : g === 'recarga' ? m.cooldownMs < c.cooldownMs
          : g === 'duracao' ? (c.durationMs && m.durationMs > c.durationMs) || (c.zone && m.zone.ms > c.zone.ms)
          : ['shieldShare', 'wallHp', 'wallHpShare', 'summonHp'].some((k) => c[k] && m[k] > c[k]);
        assert.ok(changed, `${code}: "${g}" não muda nada`);
      }
    }
  });

  it('Fase 1.5: exemplos (controle, cura contínua, recuo, escudo, invocação)', () => {
    assert.equal(withMastery(SKILLS.shadow, 'shadow', 4).rootMs, 6500);
    assert.equal(withMastery(SKILLS.heal_4, 'heal_4', 4).hot, 0.039);
    assert.equal(withMastery(SKILLS.shadow_recuo, 'shadow_recuo', 4).dash, -3.45);
    assert.equal(withMastery(SKILLS.wind_veu, 'wind_veu', 4).shieldShare, 0.156);
    const clone: any = withMastery(SKILLS.water_clone, 'water_clone', 4);
    assert.deepEqual([clone.durationMs, clone.summonHp], [7800, 0.195]);
    assert.equal(withMastery(SKILLS.water_3, 'water_3', 4).selfRootMs, SKILLS.water_3.selfRootMs, 'o Cárcere prende mais o alvo, não você');
    assert.equal((SKILLS.umbra_noite as any).zone.ms, 4000, 'a ficha original não muda');
  });

  it('nível 4: dano/efeito +30%, alcance +15%, recarga -15%; o que o jutsu não evolui fica igual', () => {
    assert.equal(masteryBonus('fire_2', 'dano', 4), 0.30000000000000004);
    assert.equal(masteryBonus('fire_2', 'recarga', 4), 0);
    assert.equal(masteryBonus('fire_4', 'dano', 1), 0);
    const meteor = withMastery(SKILLS.fire_4, 'fire_4', 4);
    assert.equal(meteor.cooldownMs, Math.round(SKILLS.fire_4.cooldownMs * 0.85));
    const fire = withMastery(SKILLS.fire, 'fire', 4);
    assert.equal(fire.burnMs, Math.round((SKILLS.fire.burnMs ?? 0) * 1.3));
    assert.equal(fire.cooldownMs, SKILLS.fire.cooldownMs, 'o Fogo não evolui recarga');
    assert.equal(withMastery(SKILLS.fire_hibashiri, 'fire_hibashiri', 4).range, 5.75);
    assert.equal(withMastery(SKILLS.teleport, 'teleport', 4), SKILLS.teleport, 'fora da tabela (Academia): os mesmos números');
    assert.equal(withMastery(SKILLS.fire_4, 'fire_4', 1), SKILLS.fire_4, 'nível 1: nada muda');
  });
});

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 },
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

function openRow(len: number): { x: number; y: number } {
  const free = (x: number, y: number) => [-2, -1, -0.5, 0, 0.5, 1, 2].every((d) => !blocked(x, y + d, FOREST.walls));
  for (let y = 22; y < 90; y += 1) for (let x = 8; x < 90 - len; x += 1) {
    let ok = true;
    for (let k = -4; k <= len && ok; k += 0.25) ok = free(x + k, y);
    if (ok) return { x, y };
  }
  throw new Error('sem trecho livre');
}

/** Ninja na Floresta olhando para a direita, com o jutsu no kit e `uses` usos; um monstro parado 3 casas à frente. */
function cast(skill: string, uses: number) {
  const w = setupWorld(config());
  const world: any = w.world;
  const a = w.connect('kaito');
  const row = openRow(10);
  placeIn(world, a.id, 'map_2', row.x, row.y);
  const s = world.sessions.get(a.id);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4 });
  s.jutsus.set(skill, uses);
  s.kits[s.activeKit] = [skill, ...s.kits[s.activeKit].filter((k: string) => k !== skill).slice(0, 3)];
  const m = world.monsters.get(world.spawnMonster({ x: row.x + 3, y: row.y }, undefined, 'map_2', 'lodo_sombrio').id);
  m.hp = m.maxHp = 100_000;
  m.speed = 0;
  a.send({ type: 'cast', skill });
  w.run((SKILLS[skill as 'fire']?.castMs ?? 0) + 1500);
  return { dealt: 100_000 - m.hp, cd: a.conn.last('cast')?.cd as number };
}

describe('Maestria no jogo', () => {
  it('Lança de Fogo (dano puro): nível 4 dá 30% mais dano e a mesma recarga', () => {
    const low = cast('fire_ryuka', 0);
    const high = cast('fire_ryuka', 2000);
    assert.ok(low.dealt > 0);
    assert.ok(Math.abs(high.dealt / low.dealt - 1.3) < 0.05, `${high.dealt} / ${low.dealt}`);
    assert.equal(high.cd, low.cd);
  });

  it('Fase 1.5: Lâmina Umbral (projétil) prende 30% mais no nível 4 (o efeito vai no projétil)', () => {
    const ms = (uses: number) => {
      const w = setupWorld(config());
      const world: any = w.world;
      const a = w.connect('kaito');
      const row = openRow(12);
      placeIn(world, a.id, 'map_2', row.x, row.y);
      const s = world.sessions.get(a.id);
      Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4 });
      s.classes = { primary: 'shadow', secondary: null };
      s.jutsus.set('shadow_3', uses);
      s.kits[s.activeKit] = ['shadow_3'];
      const m = world.monsters.get(world.spawnMonster({ x: row.x + 4, y: row.y }, undefined, 'map_2', 'lodo_sombrio').id);
      m.hp = m.maxHp = 100_000;
      m.speed = 0;
      a.send({ type: 'cast', skill: 'shadow_3' });
      w.run((SKILLS.shadow_3.castMs ?? 0) + 700);
      return m.rootedUntil - w.clock.now();
    };
    const low = ms(0), high = ms(2000);
    assert.ok(low > 0, `prendeu (${low})`);
    assert.ok(high - low >= 400, `${high} vs ${low}`);
  });

  it('Chuva de Meteoros (dano + recarga): no nível 4 a recarga que o servidor manda é 15% menor', () => {
    const low = cast('fire_4', 0);
    const high = cast('fire_4', 2000);
    assert.equal(low.cd, SKILLS.fire_4.cooldownMs);
    assert.equal(high.cd, Math.round(SKILLS.fire_4.cooldownMs * 0.85));
  });
});
