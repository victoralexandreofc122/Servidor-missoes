import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { JUTSU_BY_CODE } from '../src/realtime/jutsus.js';
import { MEC_CODES } from '../src/realtime/jutsusMecanicas.js';
import { NO_ATTRIBUTES } from '../src/realtime/stats.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/* v50: mecânicas inéditas, pacote de recursos: roubo de vida, veneno que acumula, dano por vida perdida e queima de chakra. */
const C = REALTIME.combat;
const ARENA = { x: 66, y: 47 };
const config = (): RealtimeConfig => ({ ...REALTIME, combat: { ...C, monsters: { ...C.monsters, count: 0, stepMs: 1e12, attackDamage: 0 }, player: { ...C.player, hpRegenPerSec: 0 } } });

/** Dois ninjas da mesma vila na arena (PvP), nível 60; `a` com o jutsu no kit, `b` a 2 casas à direita. */
function duel(skill: string) {
  const w = setupWorld(config());
  const world = w.world as any;
  world.skyEffectsAt = () => null;
  const mk = (u: string) => { const conn = new FakeConn(); const id = randomUUID(); const h = w.world.join({ id, username: u, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn); return { id, conn, send: (m: unknown) => h.receive(JSON.stringify(m)), s: world.sessions.get(id) }; };
  const a = mk('kaito'), b = mk('mei');
  placeIn(w.world, a.id, 'map_1', ARENA.x, ARENA.y);
  placeIn(w.world, b.id, 'map_1', ARENA.x + 2, ARENA.y);
  for (const p of [a, b]) {
    p.s.attributes = { ...NO_ATTRIBUTES, ninjutsu: 20, taijutsu: 20, weapons: 19 };
    p.s.level = 60;
    p.s.stats = world.statsFor(p.s.village, p.s.attributes, 60);
    Object.assign(p.s, { hp: p.s.stats.maxHp, chakra: p.s.stats.maxChakra, tutorial: 4 });
  }
  Object.assign(a.s, { x: ARENA.x, y: ARENA.y, fx: 1, fy: 0, cooldowns: {} });
  Object.assign(b.s, { x: ARENA.x + 2, y: ARENA.y });
  a.s.jutsus.set(skill, 0);
  a.s.kits[a.s.activeKit] = [skill];
  const cast = () => { a.s.cooldowns = {}; a.s.chakra = a.s.stats.maxChakra; a.send({ type: 'cast', skill, targetId: b.id }); w.run((C.skills[skill as 'fire'].castMs ?? 0) + 400); };
  return { ...w, world, a, b, cast };
}

describe('v50: mecânicas inéditas (recursos)', () => {
  it('os 4 entram como o 5º jutsu do tier da classe', () => {
    assert.deepEqual(MEC_CODES.slice(0, 4), ['shadow_beijo', 'weapons_peconha', 'taijutsu_furia', 'heal_meridianos']);
    assert.deepEqual(MEC_CODES.slice(0, 4).map((c) => JUTSU_BY_CODE.get(c)!.name), ['Beijo do Breu', 'Fio Peçonhento', 'Fúria do Encurralado', 'Selo dos Meridianos']);
  });

  it('roubo de vida (Beijo do Breu): metade do dano volta como cura, no máximo 10% da vida; errou, não cura', () => {
    const { a, b, cast } = duel('shadow_beijo');
    a.s.hp = 200;
    const hpB = b.s.hp;
    cast();
    const dealt = hpB - b.s.hp;
    assert.ok(dealt > 0);
    assert.equal(a.s.hp - 200, Math.min(Math.round(a.s.stats.maxHp * 0.1), Math.round(dealt * 0.5)));
    // sem ninguém na linha: sai, não acerta, não cura
    b.s.y += 5;
    a.s.hp = 200;
    cast();
    assert.equal(a.s.hp, 200);
  });

  it('veneno que acumula (Fio Peçonhento): cada acerto soma uma carga até 5; o dano por segundo cresce; some 6 s depois do último acerto', () => {
    const { a, b, cast, run, clock } = duel('weapons_peconha');
    const stacks = () => b.s.effects.get('veneno')?.stacks ?? 0;
    for (let i = 1; i <= 7; i++) {
      cast();
      assert.equal(stacks(), Math.min(5, i), `acerto ${i}`);
    }
    assert.equal(b.s.effects.get('veneno').amount, 10, '5 cargas x 2 por segundo');
    assert.match(b.conn.of('effect').at(-1).effect, /veneno/);
    const hp = b.s.hp;
    run(2000);
    assert.ok(hp - b.s.hp >= 18 && hp - b.s.hp <= 22, `${hp - b.s.hp} de veneno em 2 s`);
    run(6000);
    assert.equal(b.s.effects.has('veneno'), false, 'acabou');
    cast();
    assert.equal(stacks(), 1, 'recomeça da 1ª carga');
    assert.ok(clock.now() > 0 && a.s.hp > 0);
  });

  it('dano por vida perdida (Fúria do Encurralado): vida cheia bate o normal; com 25% ou menos, 40% a mais', () => {
    const full = duel('taijutsu_furia'), low = duel('taijutsu_furia'), half = duel('taijutsu_furia');
    const hit = (d: ReturnType<typeof duel>, share: number) => { d.a.s.hp = Math.round(d.a.s.stats.maxHp * share); const hp = d.b.s.hp; d.cast(); return hp - d.b.s.hp; };
    const normal = hit(full, 1), strong = hit(low, 0.2), mid = hit(half, 0.625);
    assert.ok(normal > 0);
    assert.ok(Math.abs(strong / normal - 1.4) < 0.06, `${normal} -> ${strong}`);
    assert.ok(mid > normal && mid < strong, `meio do caminho: ${mid}`);
  });

  it('queima de chakra (Selo dos Meridianos): tira até 25 de chakra e causa dano pelo que tirou; alvo sem chakra só leva o golpe', () => {
    const { b, cast } = duel('heal_meridianos');
    b.s.chakra = 100;
    let hp = b.s.hp;
    cast();
    assert.equal(b.s.chakra, 75);
    const withChakra = hp - b.s.hp;
    b.s.chakra = 10;
    hp = b.s.hp;
    cast();
    assert.equal(b.s.chakra, 0, 'tira só o que tem');
    const little = hp - b.s.hp;
    b.s.chakra = 0;
    hp = b.s.hp;
    cast();
    const none = hp - b.s.hp;
    assert.equal(withChakra - none, 20, '25 de chakra x 0,8');
    assert.equal(little - none, 8, '10 de chakra x 0,8');
    assert.ok(none > 0);
  });

  it('a Desintoxicação Celular tira o veneno', () => {
    const { a, b, cast, world, clock } = duel('weapons_peconha');
    cast();
    assert.ok(b.s.effects.has('veneno'));
    b.s.jutsus.set('heal_desintox', 0);
    b.s.kits[b.s.activeKit] = ['heal_desintox'];
    b.s.classes = { primary: 'heal', secondary: null };
    b.send({ type: 'cast', skill: 'heal_desintox' });
    assert.equal(b.s.effects.has('veneno'), false);
    assert.ok(world && clock && a);
  });
});

describe('v51: mecânicas inéditas (reação)', () => {
  /** `b` ataca `a` com um jutsu (o kit e a classe de `b` são trocados para isso). */
  const strike = (d: ReturnType<typeof duel>, skill: string, ms = 600) => {
    d.b.s.jutsus.set(skill, 0);
    d.b.s.kits[d.b.s.activeKit] = [skill];
    Object.assign(d.b.s, { fx: -1, fy: 0, cooldowns: {}, chakra: d.b.s.stats.maxChakra });
    d.b.send({ type: 'cast', skill, targetId: d.a.id });
    d.run(ms);
  };

  it('contra-ataque (Resposta da Montanha): em guarda, o golpe é anulado e quem bateu leva o troco e fica atordoado', () => {
    const d = duel('stone_resposta');
    d.cast();
    assert.ok(d.a.s.counter, 'em guarda');
    const hpA = d.a.s.hp, hpB = d.b.s.hp;
    strike(d, 'fire_ryuka');
    assert.equal(d.a.s.hp, hpA, 'o golpe foi anulado');
    assert.ok(d.b.s.hp < hpB, 'o troco');
    assert.ok(d.b.s.stunnedUntil > d.clock.now() - 700, 'atordoado');
    assert.equal(d.a.s.counter, null, 'a guarda vale para um golpe só');
    d.run(1200);                              // o atordoamento do troco passa
    const hp2 = d.a.s.hp;
    strike(d, 'fire_ryuka');
    assert.ok(d.a.s.hp < hp2, 'sem guarda, apanha normal');
  });

  it('contra-ataque: se ninguém bater em 1,5 s, o jutsu se perde; dano de queimadura não gasta a guarda', () => {
    const d = duel('stone_resposta');
    d.a.send({ type: 'cast', skill: 'stone_resposta' });
    d.world.damagePlayer(d.a.s, 5, d.clock.now(), undefined, d.b.s, 'efeito:queimadura');   // pulso de queimadura: não é golpe direto
    assert.ok(d.a.s.counter, 'continua em guarda');
    d.run(1600);
    const hp = d.a.s.hp;
    strike(d, 'fire_ryuka');
    assert.ok(d.a.s.hp < hp, 'a guarda já tinha acabado');
  });

  it('reflexo (Espelho de Ar): o primeiro projétil volta e acerta quem lançou; o segundo passa', () => {
    const d = duel('wind_espelho');
    d.a.send({ type: 'cast', skill: 'wind_espelho' });
    assert.ok(d.a.s.reflectUntil > d.clock.now());
    const hpA = d.a.s.hp, hpB = d.b.s.hp;
    strike(d, 'wind_shuriken', 900);
    assert.equal(d.a.s.hp, hpA, 'não levou');
    assert.ok(d.b.s.hp < hpB, 'o projétil voltou em quem lançou');
    assert.equal(d.a.s.reflectUntil, 0, 'só o primeiro');
    strike(d, 'wind_shuriken', 900);
    assert.ok(d.a.s.hp < hpA, 'o segundo acerta');
  });

  it('marca que detona (Marca Incandescente): o próximo jutsu no alvo marcado explode a marca (+60%); uma vez só; a marca acaba em 5 s', () => {
    const d = duel('fire_marca');
    d.a.s.jutsus.set('fire_ryuka', 0);
    d.a.s.kits[d.a.s.activeKit] = ['fire_marca', 'fire_ryuka'];
    const lance = () => { const hp = d.b.s.hp; d.a.s.cooldowns = {}; d.a.s.chakra = d.a.s.stats.maxChakra; d.a.send({ type: 'cast', skill: 'fire_ryuka', targetId: d.b.id }); d.run(700); return hp - d.b.s.hp; };
    const normal = lance();
    d.cast();                                  // marca
    assert.equal(d.a.s.brand?.targetId, d.b.id);
    const boom = lance();
    assert.equal(boom, normal + Math.max(1, Math.round(normal * 0.6)), `${normal} -> ${boom}`);
    assert.equal(d.a.s.brand, null);
    assert.equal(d.a.conn.of('combo').at(-1).combo, 'detonacao');
    assert.equal(lance(), normal, 'sem marca, o dano de sempre');
    d.cast();
    d.run(5200);
    assert.equal(lance(), normal, 'a marca venceu');
  });

  it('roubo de buff (Empréstimo Forçado): escudo, proteção, bônus de Básico e velocidade mudam de dono; sem nada para roubar, só o dano', () => {
    const d = duel('illusion_emprestimo');
    const t = d.clock.now();
    Object.assign(d.b.s, { absorb: { hp: 40, until: t + 5000 }, shield: 0.5, basicBuff: { until: t + 5000, bonus: 0.15 }, haste: 0.2, hasteUntil: t + 5000 });
    d.cast();
    assert.equal(d.b.s.absorb, undefined);
    assert.equal(d.b.s.shield, 0);
    assert.equal(d.b.s.basicBuff, undefined);
    assert.equal(d.b.s.hasteUntil, 0);
    assert.equal(d.a.s.shield, 0.5);
    assert.equal(d.a.s.basicBuff.bonus, 0.15);
    assert.equal(d.a.s.haste, 0.2);
    assert.match(d.a.conn.of('notice').map((n: any) => n.text).join(' | '), /Você tomou: .*proteção, bônus de Básico, velocidade/);
    const d2 = duel('illusion_emprestimo');
    const hp = d2.b.s.hp;
    d2.cast();
    assert.ok(d2.b.s.hp < hp);
    assert.equal(d2.a.s.shield, 0);
  });

  it('entre as rodadas do duelo, a guarda, o espelho e a marca somem', () => {
    const d = duel('stone_resposta');
    Object.assign(d.a.s, { counter: { until: 9e15, damage: 1, hit: {}, stunMs: 0, skill: 'x' }, reflectUntil: 9e15, brand: { targetId: 'x', until: 9e15, bonus: 1 } });
    d.world.clearFight(d.a.s, d.clock.now());
    assert.deepEqual([d.a.s.counter, d.a.s.reflectUntil, d.a.s.brand], [null, 0, null]);
  });
});
