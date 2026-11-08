import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { CAST_RULES, JUTSUS, castReward } from '../src/realtime/jutsus.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Jutsus v2, entrega 2 (o Fogo da adaptação, revisao_egm/jutsus/adapt_katon_suiton.md) e a conjuração ligada a ele
 * (revisao_egm/jutsus/conjuracao_tempos.md e conjuracao_interromper.md).
 */

const SK = REALTIME.combat.skills;
const FOREST = REALTIME.maps.map_2;

function config(pvp = false): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      damageScale: { jutsu: 1, basic: 1 },
      pvp,
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

/** Um trecho reto e livre da Floresta (com folga de 1 casa para cima e para baixo). */
function openRow(len: number): { x: number; y: number } {
  const free = (x: number, y: number) => [-1, -0.5, 0, 0.5, 1].every((d) => !blocked(x, y + d, FOREST.walls));
  for (let y = 22; y < 90; y += 1) {
    for (let x = 8; x < 90 - len; x += 1) {
      let ok = true;
      for (let k = 0; k <= len && ok; k += 0.25) ok = free(x + k, y);
      if (ok) return { x, y };
    }
  }
  throw new Error('sem trecho livre');
}

/** Um ninja na Floresta, olhando para a direita, com o jutsu no kit; um monstro parado a `dist` casas. */
function scene(skill: string, dist = 2, pvp = false) {
  const w = setupWorld(config(pvp));
  const world: any = w.world;
  const a = w.connect('kaito');
  const row = openRow(10);
  placeIn(world, a.id, 'map_2', row.x, row.y);
  const s = world.sessions.get(a.id);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {} });
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [skill, ...s.kits[s.activeKit].filter((k: string) => k !== skill).slice(0, 3)];
  const m = world.spawnMonster({ x: row.x + dist, y: row.y }, undefined, 'map_2', 'lodo_sombrio');
  const mm = world.monsters.get(m.id);
  mm.hp = mm.maxHp = 100_000;
  mm.stunnedUntil = w.clock.now() + 600_000;                       // parado, para contar o dano
  const dealt = () => 100_000 - mm.hp;
  return { ...w, world, a, s, m: mm, row, dealt };
}

/** Dois ninjas frente a frente com o PvP aberto (fora de vila): `a` conjura, `b` responde. */
function duel(skill: string) {
  const w = setupWorld(config(true));
  const world: any = w.world;
  const a = w.connect('kaito');
  const b = w.connect('mei');
  const row = openRow(10);
  placeIn(world, a.id, 'map_2', row.x, row.y);
  placeIn(world, b.id, 'map_2', row.x + 3, row.y);
  const sa = world.sessions.get(a.id), sb = world.sessions.get(b.id);
  for (const s of [sa, sb]) Object.assign(s, { tutorial: 4, chakra: 100, cooldowns: {} });
  Object.assign(sa, { fx: 1, fy: 0 });
  Object.assign(sb, { fx: -1, fy: 0 });
  sa.jutsus.set(skill, 0);
  sa.kits[sa.activeKit] = [skill, 'substitution', 'teleport', 'water'];
  sa.jutsus.set('water', 0);
  sb.jutsus.set('lightning', 0);
  sb.jutsus.set('water', 0);
  sb.kits[sb.activeKit] = ['lightning', 'water', 'substitution', 'teleport'];
  return { ...w, world, a, b, sa, sb, row };
}

describe('Jutsus v2, entrega 2: o Fogo novo', () => {
  it('catálogo: 11 jutsus de Fogo (2 a 3 por tier), os códigos antigos ficam, os nomes novos sem os da série', () => {
    const fire = JUTSUS.filter((j) => j.class === 'fire');
    assert.deepEqual(fire.map((j) => j.tier).sort(), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4]);
    for (const code of ['fire', 'fire_2', 'fire_3', 'fire_4']) assert.ok(fire.some((j) => j.code === code), code);
    assert.equal(fire.find((j) => j.code === 'fire')!.name, 'Fogo', 'a Bola de Fogo de hoje não muda');
    for (const j of fire) assert.doesNotMatch(j.name, /[ōū]|Katon|Karyū|Gōka/, j.name);
  });

  it('recompensa da conjuração: médio +5% de dano e -10% de recarga; rápido nada', () => {
    assert.deepEqual(castReward(600), { damage: 1.05, cooldown: 0.9 });
    assert.deepEqual(castReward(300), { damage: 1, cooldown: 1 });
    assert.equal(SK.fire_3.cooldownMs, 5400, 'Varredura Flamejante: 6 s x 0,9');
    assert.equal(SK.fire_3.base, 29.4, '28 x 1,05');
    assert.equal(SK.fire_2.cooldownMs, 2300, 'Revoada de Brasas (0,2 s): sem recompensa');
  });

  it('Sopro Incinerador: cone curto que acerta e queima (2/s por 2 s); de longe não pega', () => {
    const { a, run, dealt } = scene('fire_endan', 2);
    a.send({ type: 'cast', skill: 'fire_endan' });
    assert.equal(a.conn.last('cast_failed'), undefined);
    const hit = dealt();
    assert.equal(hit, SK.fire_endan.damage);
    run(2200);
    assert.equal(dealt() - hit, 2 * SK.fire_endan.burn!, '2 pulsos');
    const far = scene('fire_endan', 4.5);
    far.a.send({ type: 'cast', skill: 'fire_endan' });
    assert.equal(far.dealt(), 0, 'alcance 3');
  });

  it('Linha de Fogo Rasante: linha instantânea, acerta o primeiro', () => {
    const { a, dealt } = scene('fire_hibashiri', 4);
    a.send({ type: 'cast', skill: 'fire_hibashiri' });
    assert.equal(dealt(), SK.fire_hibashiri.damage);
  });

  it('Revoada de Brasas: 0,2 s de selos, 3 bolas em leque e cada alvo leva no máximo 2', () => {
    const { a, run, dealt } = scene('fire_2', 2);
    a.send({ type: 'cast', skill: 'fire_2' });
    assert.equal(a.conn.last('cast_start').ms, 200);
    assert.equal(a.conn.of('projectile').length, 0, 'ainda nos selos');
    run(250);
    assert.equal(a.conn.of('projectile').length, 3);
    run(800);
    assert.equal(dealt(), 2 * SK.fire_2.damage!, 'no máximo 2 no mesmo alvo');
  });

  it('Cinzas Detonantes: aviso em volta de quem lança e o golpe cai 1 s depois', () => {
    const { a, run, dealt } = scene('fire_haiseki', 1.5);
    a.send({ type: 'cast', skill: 'fire_haiseki' });
    const g = a.conn.last('ground');
    assert.deepEqual([g.kind, g.ms, g.r, g.skill], ['aviso', 1000, 2, 'fire_haiseki']);
    run(900);
    assert.equal(dealt(), 0);
    run(200);
    assert.equal(dealt(), SK.fire_haiseki.damage);
  });

  it('Névoa Inflamável: a nuvem fica à frente e detona sozinha no fim (3 s)', () => {
    const { a, run, dealt } = scene('fire_kasumi', 1.5);
    a.send({ type: 'cast', skill: 'fire_kasumi' });
    run(250);
    assert.equal(a.conn.last('ground').ms, 3000);
    run(2900);
    assert.equal(dealt(), 0);
    run(200);
    assert.equal(dealt(), SK.fire_kasumi.damage);
  });

  it('Chuva de Meteoros: selos parado; 5 avisos de 0,8 s; os 3 que caem no ponto acertam quem ficou parado', () => {
    const { a, s, run, dealt } = scene('fire_4', 3);
    a.send({ type: 'cast', skill: 'fire_4' });
    assert.equal(a.conn.last('cast_start').ms, 500);
    assert.equal(a.conn.last('stats').speed, 0, 'parado nos selos');
    assert.ok(s.casting);
    run(550);
    assert.equal(a.conn.of('ground').filter((g: any) => g.skill === 'fire_4').length, 5);
    run(2600);
    assert.equal(dealt(), 3 * SK.fire_4.damage!);
  });

  it('Projétil Dracônico: selos de 0,6 s e o projétil lento que explode', () => {
    const { a, run, dealt } = scene('fire_hotan', 3);
    a.send({ type: 'cast', skill: 'fire_hotan' });
    run(550);
    assert.equal(dealt(), 0);
    run(1000);
    assert.equal(dealt(), SK.fire_hotan.damage);
  });

  it('Lâmina de Fogo: o Ataque Básico bate 15% mais forte por 5 s; depois volta', () => {
    const { a, s, run, m, clock } = scene('fire_lamina', 1);
    const swing = () => { s.cooldowns = {}; const before = m.hp; a.send({ type: 'attack', targetId: m.id }); return before - m.hp; };
    const plain = swing();
    a.send({ type: 'cast', skill: 'fire_lamina' });
    assert.equal(swing(), Math.round(plain * 1.15));
    run(5100);
    assert.ok(clock.now() > s.basicBuff.until);
    assert.equal(swing(), plain);
  });
});

describe('Jutsus v2: conjuração (selos) e interrupção', () => {
  it('durante os selos: anda a 50%, nenhum outro jutsu sai (CASTING) e o Ataque Básico não sai', () => {
    const { a, sa, run } = duel('fire_3');
    const walk = sa.stats.walkSpeed;
    a.send({ type: 'cast', skill: 'fire_3' });
    assert.equal(a.conn.last('cast_start').ms, 600);
    assert.equal(a.conn.last('stats').speed, Math.round(walk * 0.5 * 100) / 100);
    a.send({ type: 'cast', skill: 'water' });
    assert.equal(a.conn.last('cast_failed').reason, 'CASTING');
    const casts = a.conn.of('cast').length;
    a.send({ type: 'attack' });
    assert.equal(a.conn.of('attack').length, 0);
    run(650);
    assert.equal(a.conn.of('cast').length, casts + 1, 'saiu no fim dos selos');
    assert.equal(sa.chakra, 100 - SK.fire_3.cost, 'cobra quando sai');
  });

  it('atordoar no meio dos selos interrompe: metade do chakra, recarga de 1,5 s e 3 s de Concentração', () => {
    const { a, b, sa, run, clock } = duel('fire_3');
    a.send({ type: 'cast', skill: 'fire_3' });
    run(200);
    b.send({ type: 'cast', skill: 'lightning', targetId: a.id });
    const stop = a.conn.last('cast_interrupted');
    assert.deepEqual([stop.playerId, stop.reason], [a.id, 'interrupted']);
    assert.equal(sa.casting, null);
    assert.equal(sa.chakra, 100 - Math.round(SK.fire_3.cost / 2));
    assert.equal(sa.cooldowns.fire_3, clock.now() + CAST_RULES.interruptCooldownMs);
    run(1000);
    assert.equal(a.conn.of('cast').filter((c: any) => c.skill === 'fire_3').length, 0, 'não saiu');
    assert.ok(sa.concentrationUntil >= clock.now() + CAST_RULES.concentrationMs - 1000, 'Concentração ligada');
  });

  it('com Concentração, o segundo atordoamento não interrompe; o jutsu sai', () => {
    const { a, b, sa, sb, run } = duel('fire_3');
    a.send({ type: 'cast', skill: 'fire_3' });
    run(100);
    b.send({ type: 'cast', skill: 'lightning', targetId: a.id });
    assert.equal(a.conn.of('cast_interrupted').length, 1);
    run(1600);                                                          // a recarga curta passou; Concentração ainda vale
    sa.stunnedUntil = 0;
    sb.cooldowns = {};
    sb.ccLog = [];
    a.send({ type: 'cast', skill: 'fire_3' });
    run(100);
    b.send({ type: 'cast', skill: 'water' });                           // empurra 1,5 casa
    assert.equal(a.conn.of('cast_interrupted').length, 1, 'Concentração: não interrompe');
    run(600);
    assert.equal(a.conn.of('cast').filter((c: any) => c.skill === 'fire_3').length, 1, JSON.stringify(a.conn.of('cast_failed')));
  });

  it('empurrão de 1,5 casa (Jato d\'Água) interrompe; dano comum não', () => {
    const { a, b, sa, sb, run } = duel('fire_3');
    a.send({ type: 'cast', skill: 'fire_3' });
    run(100);
    sa.x = sb.x - 1;
    b.send({ type: 'attack', targetId: a.id });
    assert.ok(sa.hp < sa.stats.maxHp, 'apanhou');
    assert.ok(sa.casting, 'dano comum não interrompe');
    b.send({ type: 'cast', skill: 'water' });
    assert.equal(a.conn.last('cast_interrupted')?.reason, 'interrupted');
  });

  it('Substituição no meio dos selos cancela (fuga): metade do chakra e a Substituição sai', () => {
    const { a, sa } = duel('fire_3');
    a.send({ type: 'cast', skill: 'fire_3' });
    a.send({ type: 'cast', skill: 'substitution' });
    assert.equal(a.conn.last('cast_interrupted').reason, 'cancel');
    assert.equal(sa.casting, null);
    assert.ok(sa.substituteUntil > 0, 'a Substituição saiu');
    assert.equal(sa.chakra, 100 - Math.round(SK.fire_3.cost / 2) - SK.substitution.cost);
  });

  it('controle e fim dos selos no mesmo tick: o controle vence', () => {
    const { a, b, sa, world, clock } = duel('fire_3');
    a.send({ type: 'cast', skill: 'fire_3' });
    clock.advance(600);                                                 // os selos acabam neste tick...
    b.send({ type: 'cast', skill: 'lightning', targetId: a.id });       // ...e o atordoamento chega antes do tick
    world.tick();
    assert.equal(a.conn.of('cast').filter((c: any) => c.skill === 'fire_3').length, 0);
    assert.equal(a.conn.last('cast_interrupted')?.reason, 'interrupted');
    assert.equal(sa.casting, null);
  });

  it('o welcome manda a forma (só a que não é a da mecânica), os selos e a duração do buff', () => {
    const { a } = scene('fire_lamina');
    const sk = a.conn.last('welcome').world.skills;
    assert.equal(sk.fire.form, undefined, 'Bola de Fogo: a forma da mecânica');
    assert.deepEqual([sk.fire_2.form, sk.fire_2.castMs], ['leque', 200]);
    assert.deepEqual([sk.fire_lamina.form, sk.fire_lamina.durationMs], ['buff_basico', 5000]);
    assert.equal(sk.fire_endan.coneDeg, 70);
  });
});
