import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { ITEMS, ITEM_BY_CODE, SHURIKEN } from '../src/realtime/items.js';
import { JUTSU_BY_CODE } from '../src/realtime/jutsus.js';
import { blocked } from '../src/realtime/movement.js';
import { ATTRIBUTES, NO_ATTRIBUTES, derivedStats } from '../src/realtime/stats.js';
import { placeIn, setupWorld } from './support/world.js';

/* v53 (migração v32): os ajustes do Teste Alpha. A Agilidade saiu (Taijutsu dá velocidade e ritmo do Básico), o Chakra
 * aumenta a cura, a Shuriken de mão (consumível) e as invocações que andam até o alvo e batem. */

const FOREST = REALTIME.maps.map_2;
const config = (): RealtimeConfig => ({
  ...REALTIME,
  combat: { ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 }, pvp: false,
    monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0, attackDamage: 0 }, player: { ...REALTIME.combat.player, hpRegenPerSec: 0 } },
});
/** Um trecho livre da Floresta, com 8 casas abertas à direita (as invocações andam até o alvo). */
function openSpot(): { x: number; y: number } {
  const free = (x: number, y: number) => [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].every((d) => !blocked(x + d, y, FOREST.walls) && !blocked(x + d, y + 1, FOREST.walls) && !blocked(x + d, y - 1, FOREST.walls));
  for (let y = 22; y < 90; y++) for (let x = 8; x < 85; x++) if (free(x, y)) return { x, y };
  throw new Error('sem lugar livre');
}
function ninja(skill?: string, attributes = NO_ATTRIBUTES) {
  const w = setupWorld(config());
  const world: any = w.world;
  const a = w.connect('kaito');
  const row = openSpot();
  placeIn(world, a.id, 'map_2', row.x, row.y);
  const s = world.sessions.get(a.id);
  s.attributes = { ...attributes };
  s.stats = derivedStats(REALTIME.combat.player as any, REALTIME.combat.attributes, s.attributes, s.level);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4, hp: s.stats.maxHp });
  if (skill) {
    s.jutsus.set(skill, 0);
    s.kits[s.activeKit] = [skill, ...s.kits[s.activeKit].filter((k: string) => k !== skill).slice(0, 3)];
  }
  return { ...w, world, a, s, row };
}

describe('v53: a Agilidade saiu; Taijutsu, Chakra, Ninjutsu e Armas', () => {
  it('os atributos são 5 (sem Agilidade); Taijutsu dá velocidade e Básico mais rápido; Chakra dá cura', () => {
    assert.deepEqual([...ATTRIBUTES], ['vitality', 'chakra', 'taijutsu', 'ninjutsu', 'weapons']);
    const base = { maxHp: 100, maxChakra: 100, meditationChakraPerSec: 15, walkSpeed: 5, runSpeed: 8, attackCooldownMs: 600 };
    const none = derivedStats(base, REALTIME.combat.attributes, NO_ATTRIBUTES);
    const tai = derivedStats(base, REALTIME.combat.attributes, { ...NO_ATTRIBUTES, taijutsu: 20 });
    assert.ok(tai.walkSpeed > none.walkSpeed && tai.runSpeed > none.runSpeed, 'Taijutsu: mais velocidade');
    assert.ok(tai.attackCooldownMs < none.attackCooldownMs, 'Taijutsu: Básico mais rápido');
    assert.ok(tai.physicalMultiplier > 1, 'Taijutsu: mais dano físico');
    const ck = derivedStats(base, REALTIME.combat.attributes, { ...NO_ATTRIBUTES, chakra: 20 });
    assert.ok(ck.healMultiplier > 1 && ck.maxChakra > none.maxChakra && ck.meditationChakraPerSec > none.meditationChakraPerSec);
    assert.equal(derivedStats(base, REALTIME.combat.attributes, { ...NO_ATTRIBUTES, ninjutsu: 20 }).healMultiplier, 1, 'Ninjutsu não mexe na cura');
  });

  it('o servidor não aceita mais gastar ponto em Agilidade', () => {
    const { a, s } = ninja();
    s.statPoints = 3;
    a.send({ type: 'spend_point', attribute: 'agility' });
    assert.equal(s.statPoints, 3);
  });

  it('a Cura cura mais com Chakra (e o mesmo com Ninjutsu)', () => {
    const heal = (attributes: typeof NO_ATTRIBUTES) => {
      const { s, a, run } = ninja('heal', attributes);
      s.hp = 10;
      a.send({ type: 'cast', skill: 'heal' });
      run(1200);
      return s.hp - 10;
    };
    const plain = heal(NO_ATTRIBUTES);
    assert.ok(plain > 0);
    assert.ok(heal({ ...NO_ATTRIBUTES, chakra: 20 }) > plain, 'Chakra aumenta a cura');
    assert.equal(heal({ ...NO_ATTRIBUTES, ninjutsu: 20 }), plain, 'Ninjutsu não aumenta a cura');
  });

  it('auditoria: cada jutsu escala com o atributo da classe (Armas só com Armas; Taijutsu com Taijutsu; o resto com Ninjutsu)', () => {
    const wrong: string[] = [];
    for (const [code, cfg] of Object.entries(REALTIME.combat.skills) as [string, { scaling?: string }][]) {
      const cls = JUTSU_BY_CODE.get(code)?.class ?? null;
      const want = cls === 'weapons' ? 'weapons' : cls === 'taijutsu' ? 'taijutsu' : 'ninjutsu';
      if ((cfg.scaling ?? 'ninjutsu') !== want) wrong.push(`${code} (${cls}): ${cfg.scaling ?? 'ninjutsu'}, devia ${want}`);
    }
    assert.deepEqual(wrong, []);
    assert.equal(Object.keys(REALTIME.combat.skills).length, 186);
  });
});

describe('v53: a Shuriken de mão (consumível)', () => {
  it('no catálogo: consumível, à venda na loja de armas, igual à migração v32', () => {
    const def = ITEM_BY_CODE.get(SHURIKEN)!;
    assert.deepEqual([def.name, def.kind, def.price, def.shop], ['Shuriken', 'consumable', 10, 'weapons']);
    const sql = readFileSync(new URL('../db/schema_v32_alpha_ajustes.sql', import.meta.url), 'utf8');
    assert.match(sql, /\('shuriken', 'Shuriken', 'consumable', NULL, NULL, 10, 'weapons'\)/);
    assert.match(sql, /attr_taijutsu = attr_taijutsu \+ attr_agility/);
    assert.doesNotMatch(sql, /DO \$\$/, 'sem bloco DO no Neon');
    assert.equal(ITEMS.filter((i) => i.kind === 'consumable').length, 1);
  });

  it('lança uma (projétil "shuriken", só com Armas) e gasta 1; sem nenhuma, não atira', () => {
    const { a, s, run } = ninja(undefined, { ...NO_ATTRIBUTES, weapons: 10 });
    s.items = { [SHURIKEN]: 2 };
    a.send({ type: 'attack', shuriken: true });
    const p1 = a.conn.last('projectile');
    assert.equal(p1?.weapon, 'shuriken');
    assert.equal(s.items[SHURIKEN], 1);
    assert.equal(a.conn.last('attack').throw, 'shuriken');
    run(1000);
    a.send({ type: 'attack', shuriken: true });
    assert.equal(s.items[SHURIKEN], undefined, 'a última some do inventário');
    assert.equal(a.conn.last('inventory').items[SHURIKEN], undefined);
    run(1000);
    a.conn.clear();
    a.send({ type: 'attack', shuriken: true });
    assert.equal(a.conn.of('projectile').length, 0, 'sem Shuriken: nada voa');
    assert.equal(a.conn.of('attack').length, 0, 'v54: sem munição não atira (nem o golpe normal)');
    assert.match(a.conn.last('notice').text, /Sem Shurikens/);
  });

  it('acerta o monstro na linha e o dano sobe com Armas (e não com Taijutsu)', () => {
    const dmg = (attributes: typeof NO_ATTRIBUTES) => {
      const { a, s, world, run, row } = ninja(undefined, attributes);
      s.items = { [SHURIKEN]: 1 };
      const m = world.spawnMonster({ x: row.x + 4, y: row.y }, undefined, 'map_2');
      const hp = world.monsters.get(m.id).maxHp;
      a.send({ type: 'attack', shuriken: true });
      run(800);
      return hp - (world.monsters.get(m.id)?.hp ?? 0);
    };
    const plain = dmg(NO_ATTRIBUTES);
    assert.ok(plain > 0, 'acertou');
    assert.ok(dmg({ ...NO_ATTRIBUTES, weapons: 20 }) > plain, 'Armas aumenta');
    assert.equal(dmg({ ...NO_ATTRIBUTES, taijutsu: 20 }), plain, 'Taijutsu não muda o dano da Shuriken');
  });
});

describe('v53: as invocações andam até o alvo e batem', () => {
  for (const [skill, type] of [['stone_golem', 'golem'], ['shadow_sentinela', 'sentinela_sombra'], ['weapons_arsenal', 'arsenal']] as const) {
    it(`${JUTSU_BY_CODE.get(skill)!.name}: tipo próprio (${type}), anda até o monstro e soca para o lado dele`, () => {
      const { a, world, run, row } = ninja(skill);
      const target = world.spawnMonster({ x: row.x + 7, y: row.y }, undefined, 'map_2');
      const hp0 = world.monsters.get(target.id).hp;
      a.send({ type: 'cast', skill });
      run(1400);   // os selos
      const summon: any = [...world.monsters.values()].find((m: any) => m.ownerId === a.id);
      assert.ok(summon, 'invocou');
      assert.equal(summon.type, type);
      const d0 = Math.hypot(summon.x - target.x, summon.y - target.y);
      run(3000);
      const t = world.monsters.get(target.id);
      const d1 = Math.hypot(summon.x - (t?.x ?? target.x), summon.y - (t?.y ?? target.y));
      assert.ok(d1 < d0 - 1, `andou até o alvo (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
      run(4000);
      const punch = a.conn.last('summon_punch');
      assert.ok(punch && typeof punch.fx === 'number', 'socou, com a direção do golpe');
      assert.ok(punch.fx > 0, 'para o lado do monstro (à direita)');
      assert.ok((world.monsters.get(target.id)?.hp ?? 0) < hp0, 'o monstro apanhou');
    });
  }

  it('vai no alvo que o dono mirou (e não no mais perto)', () => {
    const { a, world, run, row } = ninja('stone_golem');
    const near = world.spawnMonster({ x: row.x + 3, y: row.y + 1 }, undefined, 'map_2');
    const far = world.spawnMonster({ x: row.x + 7, y: row.y }, undefined, 'map_2');
    a.send({ type: 'cast', skill: 'stone_golem', targetId: far.id });
    run(2000);
    const summon: any = [...world.monsters.values()].find((m: any) => m.ownerId === a.id);
    assert.equal(summon.summonTargetId, far.id);
    void near;
  });

  it('sem inimigo por perto, não fica parado longe do dono: volta para o lado dele', () => {
    const { a, s, world, run } = ninja('stone_golem');
    a.send({ type: 'cast', skill: 'stone_golem' });
    run(1400);
    const summon: any = [...world.monsters.values()].find((m: any) => m.ownerId === a.id);
    summon.x = s.x + 6;
    run(3000);
    assert.ok(Math.hypot(summon.x - s.x, summon.y - s.y) < 3, 'voltou para perto do dono');
  });
});

describe('v54: sem visão (Escuridão) o ninja perde o alvo', () => {
  it('com o alvo focado: sem escuridão acerta nele; na escuridão o foco é ignorado (o golpe sai para onde olha)', () => {
    const hitsFocused = (dark: boolean) => {
      const { a, s, world, run, row } = ninja('fire');
      // o alvo fica ao lado do caminho: só o foco (ou nada) o escolheria; o golpe em linha para a direita erra
      const m = world.spawnMonster({ x: row.x + 3, y: row.y + 1 }, undefined, 'map_2');
      if (dark) world.applyEffect({ kind: 'player', id: s.id, x: s.x, y: s.y, session: s }, 'escuridao', world.now(), 3000);
      const hp0 = world.monsters.get(m.id).hp;
      a.send({ type: 'attack', targetId: m.id });
      run(200);
      return { lost: hp0 - world.monsters.get(m.id).hp, aim: s.aimFocus?.id };
    };
    const clear = hitsFocused(false);
    const blind = hitsFocused(true);
    assert.equal(clear.aim !== undefined, true, 'enxergando: o alvo mirado é guardado');
    assert.equal(blind.aim, undefined, 'na escuridão: nenhum alvo guardado');
    assert.ok(blind.lost <= clear.lost);
  });
});

describe('v54: valores fixos (sem % da vida), Cura nova e Cegueira como estado', () => {
  const SK: any = REALTIME.combat.skills;
  it('nenhum jutsu usa % da vida máxima em cura ou escudo', () => {
    for (const [code, cfg] of Object.entries(SK) as [string, any][]) {
      assert.equal(cfg.shieldShare, undefined, `${code}: escudo em %`);
      assert.equal(cfg.hot, undefined, `${code}: cura em % por segundo`);
    }
  });

  it('valores base da classe Cura (pedido do Teste Alpha)', () => {
    assert.deepEqual([SK.heal_aura.zone.heal, SK.heal_aura.zone.ms], [10, 3000], 'Aura: 10 por pulso, 3 pulsos');
    assert.equal(SK.heal_palma.heal, 50);
    assert.equal(SK.heal_desintox.heal, 15);
    assert.equal(SK.heal_casca.shield, 40);
    assert.deepEqual([SK.heal_4.hotHeal, SK.heal_4.durationMs], [10, 10_000], 'Renovação: 10 por segundo por 10 s');
    assert.deepEqual([SK.heal_santuario.zone.heal, SK.heal_santuario.zone.ms, SK.heal_santuario.zoneDamageFlat], [10, 5000, 5]);
  });

  it('Casca de Chakra: escudo fixo de 40, maior com Chakra (e não com a vida)', () => {
    const shield = (attributes: typeof NO_ATTRIBUTES) => {
      const { a, s, run } = ninja('heal_casca', attributes);
      a.send({ type: 'cast', skill: 'heal_casca' });
      run(100);
      return s.absorb.hp;
    };
    assert.equal(shield(NO_ATTRIBUTES), 40);
    assert.ok(shield({ ...NO_ATTRIBUTES, chakra: 20 }) > 40);
    assert.equal(shield({ ...NO_ATTRIBUTES, vitality: 40 }), 40, 'mais vida não aumenta o escudo');
  });

  it('Santuário Vital: dentro dele cada golpe no dono perde 5', () => {
    const { a, s, world, run } = ninja('heal_santuario');
    a.send({ type: 'cast', skill: 'heal_santuario' });
    run(700);
    s.hp = 100;
    world.damagePlayer(s, 20, world.now());
    assert.equal(s.hp, 85);
  });

  it('Cegueira: quem pisa na zona escura fica cego até o fim dela, mesmo saindo', () => {
    const c = config();
    const w = setupWorld({ ...c, combat: { ...c.combat, pvp: true } });   // a escuridão pega quem o dono pode machucar
    const world: any = w.world;
    const caster = w.connect('kaito'), foe = w.connect('mei');
    const row = openSpot();
    placeIn(world, caster.id, 'map_2', row.x, row.y);
    placeIn(world, foe.id, 'map_2', row.x + 1, row.y);
    const s = world.sessions.get(caster.id), f = world.sessions.get(foe.id);
    world.spawnZone(s, { x: f.x, y: f.y, r: 2, kind: 'sombra', ms: 4000, tickMs: 500, dark: true, label: 'shadow_mancha' }, world.now());
    w.run(600);
    assert.ok(f.effects.has('escuridao'), 'cego dentro da zona');
    placeIn(world, foe.id, 'map_2', row.x + 6, row.y);   // saiu da zona
    w.run(1500);
    assert.ok(f.effects.has('escuridao'), 'continua cego fora da zona');
    w.run(2500);
    assert.equal(f.effects.has('escuridao'), false, 'acabou com a zona');
  });

  it('Duplo de Água também bate (golpe fraco) quando o inimigo está perto', () => {
    const { a, world, run, row } = ninja('water_clone');
    const m = world.spawnMonster({ x: row.x + 5, y: row.y }, undefined, 'map_2');
    const hp0 = world.monsters.get(m.id).hp;
    a.send({ type: 'cast', skill: 'water_clone' });
    run(5000);
    assert.ok(a.conn.of('summon_punch').length > 0, 'socou');
    assert.ok((world.monsters.get(m.id)?.hp ?? 0) < hp0);
  });
});
