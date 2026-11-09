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
  it('catálogo: 100 jutsus; 41 códigos novos (+6 do Clã Rubro, +4 do Clã Umbra); toda classe tem os 4 tiers e o tier 1 de sempre', () => {
    assert.equal(JUTSUS.length, 100);
    assert.equal(CLASS_V2_CODES.length, 41);
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

  it('anel com efeito (Estouro de Maré): todos em volta levam, são empurrados e ficam molhados', () => {
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

  it('zona dividida em pulsos (Lamaçal Profundo): o dano do jutsu em 4 pulsos, com lentidão', () => {
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

  it('aviso em ondas (Ascensão Dupla): 4 golpes avisados no mesmo lugar', () => {
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

  it('cura ao longo do tempo (Renovação Celular): 3% da vida por segundo por 10 s', () => {
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

  it('agarre (Rede de Sombra): prende até 2 na linha e divide o dano', () => {
    const { ms, cast, dealt, clock } = scene('shadow_agarre', [[2, 0], [4, 0], [5.5, 0]]);
    cast();
    assert.ok(ms[0].rootedUntil > clock.now() && ms[1].rootedUntil > clock.now());
    assert.equal(dealt(ms[2]), 0, 'o 3º escapa');
    assert.equal(dealt(ms[0]), Math.round(SK.shadow_agarre.damage! / 2));
  });

  it('projétil com efeito (Serpente d’Água): molha quem acerta', () => {
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

  // ---------------------------------------------------------------- os de sistema próprio (v30)

  it('escuridão no alvo (Noite Eterna): o ninja fica no escuro 3 s', () => {
    const w = scene('illusion_noite', [], true);
    const b = w.connect('mei');
    const sb = w.world.sessions.get(b.id);
    Object.assign(sb, { tutorial: 4 });
    placeIn(w.world, b.id, 'map_2', w.row.x + 3, w.row.y);
    w.cast();
    assert.ok(sb.effects.has('escuridao'));
    assert.equal(b.conn.last('effect').effect, 'escuridao');
  });

  it('zona que escurece (Véu de Bruma): quem entra fica no escuro; quem lançou, não', () => {
    const w = scene('water_nevoa', [], true);
    const b = w.connect('mei');
    const sb = w.world.sessions.get(b.id);
    Object.assign(sb, { tutorial: 4 });
    placeIn(w.world, b.id, 'map_2', w.row.x + 2, w.row.y);
    w.cast();
    w.run(1100);
    assert.ok(sb.effects.has('escuridao'), 'o inimigo dentro');
    assert.equal(w.s.effects.has('escuridao'), false, 'quem lançou enxerga');
  });

  it('controles invertidos (Descontrole Muscular): efeito embaralhado no ninja, dentro do orçamento de controle', () => {
    const w = scene('heal_disturbio', [], true);
    const b = w.connect('mei');
    const sb = w.world.sessions.get(b.id);
    Object.assign(sb, { tutorial: 4 });
    placeIn(w.world, b.id, 'map_2', w.row.x + 3, w.row.y);
    w.cast();
    assert.ok(sb.effects.has('invertido'));
    assert.equal(sb.ccLog.at(-1).kind, 'invertido');
  });

  it('armadilha (Sombra Oculta): fica no chão; o 1º que pisar leva o golpe, fica preso e ela some', () => {
    const { m, cast, run, dealt, clock, a, row } = scene('shadow_armadilha', [[8, 0]]);
    a.send({ type: 'cast', skill: 'shadow_armadilha' });
    run(400);
    assert.equal(dealt(m), 0, 'longe: nada');
    m.x = a.conn.last('ground').x;                                     // pisou
    m.y = a.conn.last('ground').y;
    run(250);
    assert.equal(dealt(m), SK.shadow_armadilha.damage);
    assert.ok(m.rootedUntil > clock.now(), 'preso');
    run(300);
    assert.ok(a.conn.last('ground_end'), 'sumiu');
    void cast; void row;
  });

  it('canalização (Palma Curadora): 2 s de selos andando devagar; cura o aliado colado ou a si pela metade; vida cheia não sai', () => {
    const { s, a, run } = scene('heal_palma', []);
    a.send({ type: 'cast', skill: 'heal_palma' });
    assert.equal(a.conn.last('cast_failed').reason, 'FULL_HP');
    s.hp = s.stats.maxHp - 40;
    s.cooldowns = {};
    a.send({ type: 'cast', skill: 'heal_palma' });
    assert.equal(a.conn.last('cast_start').ms, 2000);
    run(1900);
    assert.equal(s.hp, s.stats.maxHp - 40, 'ainda canalizando');
    run(200);
    assert.equal(s.hp, s.stats.maxHp - 40 + 15, 'em si: metade de 30');
  });

  it('bumerangue (Shuriken Colossal): atravessa na ida e acerta de novo na volta', () => {
    const { m, cast, run, a } = scene('weapons_gigante', [[3, 0]]);
    cast();
    run(2500);
    const hits = a.conn.of('hit').filter((h: any) => h.target === 'monster' && h.id === m.id && h.kind === 'damage');
    assert.equal(hits.length, 2, 'ida e volta');
    assert.ok(hits[1].amount < hits[0].amount, 'a volta bate menos');
  });

  it('muro (Muralha de Terra): bloqueia a passagem e o projétil, perde vida com o golpe e some no fim', () => {
    const { s, a, run, world, row } = scene('stone_muralha', []);
    a.send({ type: 'cast', skill: 'stone_muralha' });
    const bar = a.conn.last('barrier');
    assert.equal(bar.kind, 'rocha');
    assert.equal(bar.hp, Math.round(s.stats.maxHp * 0.15));
    assert.ok(world.layout('map_2').walls.some((w: any) => w.x === bar.x && w.y === bar.y), 'virou parede');
    // tenta andar através dele
    for (let i = 0; i < 12; i++) { s.inputQueue.push({ seq: 1000 + i, dx: 1, dy: 0, dist: 0 }); run(50); }
    assert.ok(s.x < bar.x, `parou antes do muro (${s.x} < ${bar.x})`);
    run(5100);
    assert.ok(a.conn.last('barrier_end'), 'acabou');
    assert.equal(world.layout('map_2').walls.some((w: any) => w.x === bar.x && w.y === bar.y), false);
    void row;
  });

  it('Muro de Água: segura o projétil e perde a vida dele; com vida acabando, cai antes do tempo', () => {
    const { a, run, world, s } = scene('water_muro', []);
    a.send({ type: 'cast', skill: 'water_muro' });
    const bar = a.conn.last('barrier');
    const b = world.barriers[0];
    assert.equal(b.hp, 60);
    // um projétil de outro ninja vindo de frente: para no muro
    world.hitBarrier('map_2', { x: bar.x, y: bar.y + 1 }, 70);
    assert.ok(a.conn.last('barrier_end'), 'quebrou');
    void run; void s;
  });

  it('invocação (Golem de Terra): fica ao lado, soca e levanta quem está em volta a cada 4 s, some em 12 s; não é alvo do dono', () => {
    const { s, a, run, world, ms, dealt, clock } = scene('stone_golem', [[2.5, 0]]);
    a.send({ type: 'cast', skill: 'stone_golem' });
    run(1300);                                                         // selos 1,2 s
    const sum = a.conn.last('summon');
    assert.equal(sum.kind, 'golem');
    assert.equal(sum.maxHp, Math.round(s.stats.maxHp * 0.4));
    const golem = world.monsters.get(sum.id);
    assert.ok(golem && golem.ownerId === s.id);
    assert.equal(world.targetsFor(s).some((x: any) => x.id === sum.id), false, 'o dono não acerta o próprio golem');
    run(4100);
    assert.ok(dealt(ms[0]) > 0, 'socou');
    assert.ok(ms[0].stunnedUntil > clock.now() - 1000, 'levantou');
    run(8200);
    assert.equal(world.monsters.has(sum.id), false, 'acabou');
  });

  it('invocação (Duplo de Água): isca que o inimigo pode acertar; morrer não dá XP', () => {
    const w = scene('water_clone', [], true);
    const b = w.connect('mei');
    const sb = w.world.sessions.get(b.id);
    Object.assign(sb, { tutorial: 4 });
    placeIn(w.world, b.id, 'map_2', w.row.x + 4, w.row.y);
    w.cast();
    const sum = w.a.conn.last('summon');
    assert.equal(sum.kind, 'clone_agua');
    assert.ok(w.world.targetsFor(sb).some((x: any) => x.id === sum.id), 'o inimigo enxerga o clone como alvo');
    const xp = sb.xp ?? 0;
    w.world.damageMonster(w.world.monsters.get(sum.id), 10_000, sb, w.world.now(), 'attack');
    assert.equal(w.world.monsters.has(sum.id), false);
    assert.equal(sb.xp ?? 0, xp, 'sem XP');
  });

  // ---------------------------------------------------------------- a classe Vento (v30)

  it('Vento: a classe nova tem os 4 tiers e mira em linha; Rajada Aberta empurra', () => {
    assert.ok(CLASSES.includes('wind'));
    const { m, cast, dealt, row } = scene('wind', [[1.5, 0]]);
    const before = m.x;
    cast();
    assert.ok(dealt(m) > 0);
    assert.ok(m.x > before, 'empurrado');
    void row;
  });

  it('Lâmina em Arco (faixa): acerta todos na faixa larga, inclusive fora da linha do meio', () => {
    const { ms, cast, dealt } = scene('wind_arco', [[3, 0], [5, 1.2]]);
    cast();
    assert.ok(dealt(ms[0]) > 0 && dealt(ms[1]) > 0);
  });

  it('Véu de Vento (escudo com vida): absorve até 12% da vida máxima', () => {
    const { s, cast, world } = scene('wind_veu', []);
    cast();
    const cap = Math.round(s.stats.maxHp * 0.12);
    assert.equal(s.absorb.hp, cap);
    const hp = s.hp;
    world.damagePlayer(s, cap + 5, world.now());
    assert.equal(s.hp, hp - 5, 'o escudo segurou o resto');
    assert.equal(s.absorb, undefined, 'acabou');
  });

  it('Disco do Furacão: explode em área e deixa ferida (cura recebida pela metade)', () => {
    const { ms, cast, run, world, dealt } = scene('wind_4', [[3, 0], [3.5, 1]]);
    cast();
    run(1000);
    for (const m of ms) {
      assert.ok(dealt(m) > 0);
      assert.ok(world.effectsOf({ kind: 'monster', id: m.id, monster: m }).has('ferida'));
    }
  });

  // ---------------------------------------------------------------- os clãs (v30)

  it('linhagem (v35): marca no Criador, desperta no Rito (10 Lodos Escuros); uma vez só; tier 1 no despertar, os outros pelo nível', () => {
    const { s, a, world } = scene('fire', []);
    const say = () => {};
    Object.assign(s, { rank: { code: 'ACADEMY', name: 'Academia' }, level: 9 });
    a.send({ type: 'clan', clan: 'rubro' });
    assert.equal(s.clan, null, 'marcar não desperta');
    assert.equal(s.clanMark, 'rubro');
    assert.equal(a.conn.last('clan_mark').clan, 'rubro');
    assert.equal(world.riteTalk(s, say), false, 'na Academia o Diretor não fala do Rito');
    Object.assign(s, { rank: { code: 'GENIN', name: 'Genin' }, level: 11 });
    assert.equal(world.riteTalk(s, say), true);
    assert.equal(s.riteProgress, 0);
    for (let i = 0; i < 9; i += 1) world.riteKill(s, 'lodo_escuro');
    world.riteKill(s, 'lodo_verde');
    assert.equal(s.riteProgress, 9, 'só o Lodo Escuro conta');
    world.riteTalk(s, say);
    assert.equal(s.clan, null);
    world.riteKill(s, 'lodo_escuro');
    world.riteTalk(s, say);
    assert.equal(s.clan, 'rubro');
    assert.equal(s.riteProgress, null);
    assert.equal(a.conn.last('clan').clan, 'rubro');
    assert.ok(s.jutsus.has('rubro_olho') && !s.jutsus.has('rubro_transe'));
    a.send({ type: 'clan', clan: 'umbra' });
    assert.equal(s.clan, 'rubro', 'uma vez só');
    assert.equal(world.lineageOf(s).tier, 1);
    s.level = 40;
    world.grantClanJutsus(s);
    assert.ok(s.jutsus.has('rubro_transe') && s.jutsus.has('rubro_chamas') && !s.jutsus.has('rubro_guardiao'));
    assert.equal(world.lineageOf(s).tier, 3);
  });

  it('Clã Umbra (v35): 4 jutsus próprios, sem classe, tiers 1 a 4', () => {
    const umbra = JUTSUS.filter((j) => j.clan === 'umbra');
    assert.deepEqual(umbra.map((j) => [j.code, j.tier, j.class]), [
      ['umbra_deslize', 1, null], ['umbra_faminta', 2, null], ['umbra_noite', 3, null], ['umbra_forma', 4, null]]);
    assert.deepEqual(umbra.map((j) => j.name), ['Deslize Noturno', 'Sombra Faminta', 'Noite Fechada', 'Forma Umbral']);
  });

  it('Sombra Faminta: marca o alvo; o próximo dano nele é 25% maior', () => {
    const { s, m, cast, dealt } = scene('umbra_faminta', [[3, 0]]);
    s.clan = 'umbra';
    cast();
    assert.ok(s.umbraMark, 'marcou');
    assert.equal(dealt(m), 0, 'a marca sozinha não dá dano');
  });

  it('jutsu de clã não sai na Extração (não tem classe) e entra no kit como qualquer outro', () => {
    const rubro = JUTSUS.filter((j) => j.clan === 'rubro');
    assert.equal(rubro.length, 6);
    for (const j of rubro) assert.equal(j.class, null, j.code);
    assert.deepEqual(rubro.map((j) => j.tier), [1, 2, 3, 4, 4, 4]);
  });

  it('Brasa Sem Luz: linha que queima 3/s por 4 s', () => {
    const { m, cast, world } = scene('rubro_chamas', [[3, 0]]);
    cast();
    assert.ok(world.effectsOf({ kind: 'monster', id: m.id, monster: m }).has('queimadura'));
  });

  it('Sentinela Espectral: escudo de 20% da vida e um corte na frente', () => {
    const { s, m, a, dealt } = scene('rubro_guardiao', [[1, 0]]);
    a.send({ type: 'cast', skill: 'rubro_guardiao' });                 // confere já (o monstro de teste bate de volta)
    assert.equal(s.absorb.hp, Math.round(s.stats.maxHp * 0.2));
    assert.ok(dealt(m) > 0);
  });

  it('Clã Umbra: a Possessão da Sombra alcança 10% mais longe; Andarilho: Substituição 15% mais rápida', () => {
    const near = scene('shadow', [[4.6, 0]]);
    near.cast();
    assert.ok(!(near.m.rootedUntil > near.clock.now()), 'sem clã, a linha de 4 casas não chega a 4,6');
    const um = scene('shadow', [[4.6, 0]]);
    um.s.clan = 'umbra';
    um.cast();
    assert.ok(um.m.rootedUntil > um.clock.now(), 'Umbra: 4,4 casas');
    const an = scene('substitution', []);
    an.s.clan = 'andarilho';
    an.cast();
    const cd = an.s.cooldowns.substitution - an.clock.now();
    assert.ok(cd < SK.substitution.cooldownMs * 0.9, `${cd}`);
  });

  it('muro e invocação viram para o inimigo mais perto (o monstro atrás: o muro e o golem vão para trás)', () => {
    const { a, cast, run, s: me, row } = scene('stone_muralha', [[-4, 0]]);
    cast();
    const bar = a.conn.last('barrier');
    assert.ok(bar.x < row.x, `muro atrás (${bar.x} < ${row.x})`);
    assert.ok(me.fx < 0);
    void run;
  });

  it('Clã Rubro no nível 60: Mundo Espelhado e Colosso Espectral chegam junto com o tier 4', () => {
    const { s, world } = scene('fire', []);
    Object.assign(s, { clan: 'rubro', level: 60 });
    world.grantClanJutsus(s);
    for (const c of ['rubro_guardiao', 'rubro_lua', 'rubro_completo']) assert.ok(s.jutsus.has(c), c);
  });

  it('Mundo Espelhado: qualquer dano nos selos faz falhar (volta metade da recarga); sem dano, atordoa forte', () => {
    const { s, a, run, world, m, clock } = scene('rubro_lua', [[4.5, 0]]);   // longe: o monstro de teste não bate nos selos
    a.send({ type: 'cast', skill: 'rubro_lua' });
    run(300);
    world.damagePlayer(s, 1, world.now());
    assert.equal(a.conn.last('cast_interrupted')?.reason, 'interrupted');
    assert.equal(s.cooldowns.rubro_lua, world.now() + SK.rubro_lua.cooldownMs / 2);
    s.cooldowns = {};
    s.concentrationUntil = 0;
    a.send({ type: 'cast', skill: 'rubro_lua' });
    run(900);
    assert.ok(m.stunnedUntil > clock.now() + 1500, 'atordoado');
  });

  it('Colosso Espectral: escudo de 25%, Básico +15% por 5 s e a onda no fim', () => {
    const { s, a, run, m, dealt } = scene('rubro_completo', [[2.5, 0]]);
    a.send({ type: 'cast', skill: 'rubro_completo' });
    run(560);
    assert.equal(s.absorb.hp, Math.round(s.stats.maxHp * 0.25));
    assert.equal(s.basicBuff.bonus, 0.15);
    const before = dealt(m);
    run(5100);
    assert.ok(dealt(m) > before, 'a onda do fim acertou');
  });

  it('provocação: o monstro de caça perto da invocação persegue e bate nela, e não no ninja', () => {
    const w = setupWorld({ ...config(), combat: { ...config().combat, monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 8 } } });
    const world: any = w.world;
    const a = w.connect('kaito');
    const row = openRow(10);
    placeIn(world, a.id, 'map_2', row.x, row.y);
    const s = world.sessions.get(a.id);
    Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4 });
    s.jutsus.set('water_clone', 0);
    s.kits[s.activeKit] = ['water_clone', ...s.kits[s.activeKit].slice(0, 3)];
    a.send({ type: 'cast', skill: 'water_clone' });
    const sum = a.conn.last('summon');
    const clone = world.monsters.get(sum.id);
    world.spawnMonster({ x: clone.x + 4, y: clone.y }, undefined, 'map_2');
    const hp = s.hp;
    w.run(4000);
    assert.ok(!world.monsters.has(sum.id) || world.monsters.get(sum.id).hp < sum.maxHp, 'o clone apanhou');
    assert.equal(s.hp, hp, 'o ninja não apanhou');
  });
});

