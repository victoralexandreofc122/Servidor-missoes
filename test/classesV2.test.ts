import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { CLASSES, JUTSUS } from '../src/realtime/jutsus.js';
import { CLASS_V2_CODES } from '../src/realtime/jutsusClasses.js';
import { blocked } from '../src/realtime/movement.js';
import { pvpCostCooldown } from '../src/realtime/pvpBalance.js';
import { placeIn, setupWorld } from './support/world.js';

/* v30 (Jutsus v2, entrega 5): as outras 8 classes da adaptação (src/realtime/jutsusClasses.ts). Um jutsu de cada forma. */

const SK = REALTIME.combat.skills;
const FOREST = REALTIME.maps.map_2;

function config(pvp = false): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 }, pvp,
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

/** Ninja na Floresta olhando para a direita, com o jutsu no kit; monstros parados (muita vida) nas posições dadas. */
function scene(skill: string, monsters: [number, number][] = [[2, 0]], pvp = false) {
  const w = setupWorld(config(pvp));
  const world: any = w.world;
  const a = w.connect('kaito');
  const row = openRow(10);
  placeIn(world, a.id, 'map_2', row.x, row.y);
  const s = world.sessions.get(a.id);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4 });
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [skill, ...s.kits[s.activeKit].filter((k: string) => k !== skill).slice(0, 3)];
  const ms = monsters.map(([dx, dy]) => {
    const m = world.spawnMonster({ x: row.x + dx, y: row.y + dy }, undefined, 'map_2', 'lodo_sombrio');
    const mm = world.monsters.get(m.id);
    mm.hp = mm.maxHp = 100_000;
    mm.speed = 0;
    return mm;
  });
  const dealt = (m: any) => 100_000 - m.hp;
  const cast = () => { a.send({ type: 'cast', skill }); w.run((SK[skill as 'fire']?.castMs ?? 0) + 60); };
  return { ...w, world, a, s, ms, m: ms[0], row, dealt, cast };
}

describe('Jutsus v2, entrega 5: as outras classes', () => {
  it('catálogo: 72 jutsus; 27 códigos novos; toda classe tem os 4 tiers e o tier 1 de sempre', () => {
    assert.equal(JUTSUS.length, 72);
    assert.equal(CLASS_V2_CODES.length, 27);
    for (const c of CLASSES) {
      const tiers = new Set(JUTSUS.filter((j) => j.class === c).map((j) => j.tier));
      assert.deepEqual([...tiers].sort(), [1, 2, 3, 4], c);
    }
    for (const j of JUTSUS) assert.doesNotMatch(j.name, /Uchiha|Nara|Tsunade|Chidori|Kirin|Izanami|[ōū]/, j.name);
  });

  it('PvP: os jutsus novos pagam o próprio custo (o x4 do Taijutsu é só do Golpe Avançado); Armas novas pagam o x2,5', () => {
    assert.equal(pvpCostCooldown('taijutsu', 5, 500).cost, 20, 'o Golpe Avançado de sempre');
    assert.ok(SK.taijutsu_4.cost === 30 && !SK.taijutsu_4.pvpScale);
    assert.ok(SK.weapons_kunai.pvpScale && SK.weapons_multi.pvpScale);
  });

  it('linha com efeito (Estaca da Ilusão): acerta o primeiro e prende', () => {
    const { m, cast, dealt, clock } = scene('illusion_estaca', [[3, 0]]);
    cast();
    assert.ok(dealt(m) > 0);
    assert.ok(m.rootedUntil > clock.now(), 'preso');
  });

  it('alvo (Prisão de Pilares): prende o mais perto no alcance; ninguém no alcance: não sai nem gasta', () => {
    const { m, cast, clock, a, s } = scene('stone_pilares', [[4, 0]]);
    cast();
    assert.ok(m.rootedUntil > clock.now());
    const far = scene('stone_pilares', [[9, 0]]);
    far.a.send({ type: 'cast', skill: 'stone_pilares' });
    far.run(400);
    assert.equal(far.a.conn.last('cast_failed').reason, 'NO_TARGET');
    assert.equal(far.s.chakra, 1000, 'não gastou');
    void a; void s;
  });

  it('anel com efeito (Onda de Choque Aquática): todos em volta levam, são empurrados e ficam molhados', () => {
    const { ms, cast, world, dealt } = scene('water_2', [[2, 0], [-2, 0]]);
    const before = ms.map((m) => m.x);
    cast();
    for (const [i, m] of ms.entries()) {
      assert.ok(dealt(m) > 0, `monstro ${i}`);
      assert.notEqual(m.x, before[i], 'empurrado');
      assert.ok(world.effectsOf({ kind: 'monster', id: m.id, monster: m }).has('molhado'));
    }
  });

  it('cone com vários golpes (Cem Golpes): 3 golpes no mesmo alvo', () => {
    const { m, cast, dealt } = scene('taijutsu_3', [[1.2, 0]]);
    cast();
    assert.equal(dealt(m), 3 * SK.taijutsu_3.damage!);
  });

  it('zona dividida em pulsos (Pântano do Submundo): o dano do jutsu em 4 pulsos, com lentidão', () => {
    const { m, cast, run, dealt, world } = scene('stone_2', [[3, 0]]);
    cast();
    run(1050);
    assert.ok(world.effectsOf({ kind: 'monster', id: m.id, monster: m }).has('lentidao'), 'lento no 1º pulso');
    run(3200);
    const per = Math.max(1, Math.round(SK.stone_2.damage! / 4));
    assert.equal(dealt(m), 4 * per);
  });

  it('zona sem foco vai no inimigo mais perto no alcance, mesmo atrás (Prisão do Vórtice)', () => {
    const { m, a, cast } = scene('water_4', [[-3, 0]]);
    cast();
    const g = a.conn.last('ground');
    assert.ok(Math.abs(g.x - m.x) < 0.05 && Math.abs(g.y - m.y) < 0.05, `${g.x},${g.y} x ${m.x},${m.y}`);
  });

  it('zona com golpe no fim e prisão do 1º que entra (Domínio das Sombras)', () => {
    const { m, cast, run, dealt, clock } = scene('shadow_4', [[3, 0]]);
    cast();
    assert.ok(m.rootedUntil > clock.now(), 'o 1º dentro ficou preso');
    run(3500);
    assert.equal(dealt(m), 0, 'o golpe é só no fim');
    run(700);
    assert.equal(dealt(m), SK.shadow_4.damage);
  });

  it('zona que anda junto (Aura de Regeneração): cura quem lançou mesmo andando', () => {
    const { s, cast, run, a } = scene('heal_aura', []);
    s.hp = s.stats.maxHp - 20;
    cast();
    s.x += 3;                                                          // andou para longe de onde lançou
    run(1100);
    assert.ok(s.hp > s.stats.maxHp - 20, 'curou');
    assert.equal(a.conn.last('ground').follow, s.id);
  });

  it('investida com efeito (Investida Elétrica): avança e atordoa', () => {
    const { m, cast, dealt, clock, s, row } = scene('lightning_3', [[4, 0]]);
    cast();
    assert.ok(s.x > row.x + 2, 'avançou');
    assert.ok(dealt(m) > 0);
    assert.ok(m.stunnedUntil > clock.now());
  });

  it('recuo (Reflexo Tático): salta 3 casas para trás, sem dano', () => {
    const { s, cast, row } = scene('shadow_recuo', []);
    cast();
    assert.ok(Math.abs(s.x - (row.x - 3)) < 0.01, `${s.x}`);
  });

  it('aviso em ondas (Dragões Gêmeos): 4 golpes avisados no mesmo lugar', () => {
    const { m, cast, run, dealt, a } = scene('weapons_dragoes', [[3, 0]]);
    cast();
    assert.equal(a.conn.of('ground').filter((g: any) => g.skill === 'weapons_dragoes').length, 4);
    run(2200);
    assert.ok(dealt(m) > 0);
    assert.equal(a.conn.of('ground_end').length >= 4, true);
  });

  it('limpeza (Desintoxicação): tira a queimadura de si e cura 10', () => {
    const { s, cast, world } = scene('heal_desintox', []);
    world.applyEffect({ kind: 'player', id: s.id, x: s.x, y: s.y, session: s }, 'queimadura', world.now(), 3000, 3);
    s.hp = s.stats.maxHp - 30;
    cast();
    assert.equal(s.effects.has('queimadura'), false);
    assert.equal(s.hp, s.stats.maxHp - 20);
  });

  it('Dissipação sai em silêncio e tira o silêncio', () => {
    const { s, a, world, run } = scene('illusion_kai', []);
    world.applyEffect({ kind: 'player', id: s.id, x: s.x, y: s.y, session: s }, 'silencio', world.now(), 3000);
    a.send({ type: 'cast', skill: 'illusion_kai' });
    run(60);
    assert.equal(a.conn.last('cast_failed'), undefined);
    assert.equal(s.effects.has('silencio'), false);
  });

  it('cura ao longo do tempo (Regeneração Mitótica): 3% da vida por segundo por 10 s', () => {
    const { s, cast, run } = scene('heal_4', []);
    s.hp = 10;
    cast();
    assert.ok(s.effects.has('regeneracao'));
    run(2100);
    assert.equal(s.hp, 10 + 2 * Math.round(s.stats.maxHp * 0.03));
  });

  it('impacto (Punho Sísmico): o alvo direto leva tudo e é levantado; quem está em volta, metade', () => {
    const { ms, cast, dealt, clock } = scene('heal_2', [[1, 0], [1.8, 0.6]]);
    cast();
    assert.equal(dealt(ms[0]), SK.heal_2.damage);
    assert.equal(dealt(ms[1]), Math.round(SK.heal_2.damage! * 0.5));
    assert.ok(ms[0].stunnedUntil > clock.now(), 'levantado');
  });

  it('ricochete (Lança Saltadora): o 2º alvo leva 70%', () => {
    const { ms, cast, dealt } = scene('lightning_raio', [[3, 0], [4.5, 1.5]]);
    cast();
    assert.equal(dealt(ms[0]), SK.lightning_raio.damage);
    assert.equal(dealt(ms[1]), Math.round(SK.lightning_raio.damage! * 0.7));
  });

  it('agarre (Agarre Múltiplo): prende até 2 na linha e divide o dano', () => {
    const { ms, cast, dealt, clock } = scene('shadow_agarre', [[2, 0], [4, 0], [5.5, 0]]);
    cast();
    assert.ok(ms[0].rootedUntil > clock.now() && ms[1].rootedUntil > clock.now());
    assert.equal(dealt(ms[2]), 0, 'o 3º escapa');
    assert.equal(dealt(ms[0]), Math.round(SK.shadow_agarre.damage! / 2));
  });

  it('projétil com efeito (Dragão d’Água): molha quem acerta', () => {
    const { m, cast, run, world, dealt } = scene('water_dragao', [[3, 0]]);
    cast();
    run(600);
    assert.ok(dealt(m) > 0);
    assert.ok(world.effectsOf({ kind: 'monster', id: m.id, monster: m }).has('molhado'));
  });

  it('só em alvo preso (Estrangulamento): sem ninguém preso não sai; preso, acerta', () => {
    const { m, a, s, run, world, dealt } = scene('shadow_estrangular', [[3, 0]]);
    a.send({ type: 'cast', skill: 'shadow_estrangular' });
    assert.equal(a.conn.last('cast_failed').reason, 'NO_TARGET');
    m.rootedUntil = world.now() + 2000;
    s.cooldowns = {};
    a.send({ type: 'cast', skill: 'shadow_estrangular' });
    run(60);
    assert.equal(dealt(m), SK.shadow_estrangular.damage);
  });

  it('buff de Básico com atordoar no 1º golpe (Punho de Rocha)', () => {
    const { m, a, s, cast, clock } = scene('stone_punho', [[1, 0]]);
    cast();
    s.cooldowns = {};
    a.send({ type: 'attack', targetId: m.id });
    assert.ok(m.stunnedUntil > clock.now(), 'o 1º soco atordoou');
  });

  it('custo em vida e velocidade (Despertar do Corpo): -10% da vida atual, mais rápido, nunca mata', () => {
    const { s, cast } = scene('taijutsu_portoes', []);
    const hp = s.hp;
    const walk = s.stats.walkSpeed;
    cast();
    assert.equal(s.hp, hp - Math.round(hp * 0.1));
    assert.ok(s.hasteUntil > 0 && s.haste === 0.15);
    void walk;
    s.hp = 1;
    s.cooldowns = {};
    cast();
    assert.ok(s.hp >= 1);
  });

  it('redução de dano (Dança dos Mil Cortes): 8 cortes em 1,6 s e metade do dano recebido durante', () => {
    const { m, cast, run, dealt, s, world, a } = scene('weapons_4', [[1, 0]]);
    cast();
    assert.ok(s.drUntil > world.now() && s.drPct === 0.5);
    run(1700);
    const cuts = a.conn.of('hit').filter((h: any) => h.target === 'monster' && h.id === m.id && h.kind === 'damage');
    assert.equal(cuts.length, 8, '8 cortes');
    assert.equal(dealt(m), cuts.reduce((t: number, h: any) => t + h.amount, 0));
  });
});
