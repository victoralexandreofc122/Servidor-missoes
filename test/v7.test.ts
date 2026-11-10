import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { GameWorld, blinkTarget, type JoiningPlayer } from '../src/realtime/gameWorld.js';
import { CLASSES, JUTSUS, jutsuLevel, substitutionCooldownMs, teleportRange } from '../src/realtime/jutsus.js';
import { ACADEMY, WORLD_MAPS, academySpawn, shopDoor, villagePlan } from '../src/realtime/maps.js';
import { blocked, moveStep } from '../src/realtime/movement.js';
import type { NinjaStore } from '../src/realtime/ninjaStore.js';
import { FakeConn, seededRandom } from './support/world.js';
import { fakeNinjaStore } from './support/ninjaStore.js';

const client = await import(new URL('../public/movement.js', import.meta.url).href);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const A = WORLD_MAPS.academy_interior;

/** Mundo com relógio de teste e (opcional) o "banco" da v7 em memória. */
function setup(opts: { store?: NinjaStore; secureRandom?: () => number } = {}) {
  let t = 1_000_000;
  const world = new GameWorld(REALTIME, () => t, undefined, {
    random: seededRandom(),
    ...(opts.store ? { store: opts.store } : {}),
    ...(opts.secureRandom ? { secureRandom: opts.secureRandom } : {}),
  });
  const join = (username: string, extra: Partial<JoiningPlayer> = {}) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const handle = world.join({ id, username, ...extra }, conn);
    return { id, conn, send: (m: unknown) => handle.receive(JSON.stringify(m)), leave: () => handle.leave() };
  };
  const run = (ms: number) => {
    for (let x = 0; x < ms; x += REALTIME.tickMs) {
      t += REALTIME.tickMs;
      world.tick();
    }
  };
  const sess = (id: string) => (world as any).sessions.get(id);
  const monsters = (type: string) => world.monsterList().filter((m) => m.type === type);
  return { world, join, run, sess, monsters, advance: (ms: number) => { t += ms; } };
}

/** Anda com entradas de predição (2 por 100 ms, como o cliente). */
function walk(p: { send: (m: unknown) => void }, run: (ms: number) => void, seq: { n: number }, ticks: number, dir: [number, number]) {
  for (let left = ticks; left > 0; left -= 2) {
    const k = Math.min(2, left);
    p.send({ type: 'input', seq: seq.n, inputs: Array.from({ length: k }, () => dir) });
    seq.n += k;
    run(100);
  }
}

const NEW: Partial<JoiningPlayer> = { tutorialStep: 0, jutsus: { teleport: 0, substitution: 0 }, kits: { A: ['teleport', 'substitution'], B: [] } };

describe('v7/v8: Academia (mapa: salas fechadas, saída travada pelo tutorial)', () => {
  it('4 salas de 16 x 16 FECHADAS (v8): nenhuma porta entre elas, em nenhum passo; só a saída de baixo, no passo 4', () => {
    assert.deepEqual([A.width, A.height, A.kind], [64, 16, 'interior']);
    assert.deepEqual(A.doors.map((d) => [d.map, d.step]), [['map_1', 4]], 'a única porta é a saída');
    for (let k = 0; k < 3; k++) {
      for (const tutorial of [0, 1, 2, 3, 4]) {
        let st: [string, number, number] = ['academy_interior', 16 * k + 12, 11];
        for (let i = 0; i < 40; i++) st = moveStep(WORLD_MAPS, st[0], st[1], st[2], 1, 0, 0.25, { tutorial });
        assert.ok(st[0] === 'academy_interior' && st[1] < 16 * (k + 1), `sala ${k + 1} sem passagem (passo ${tutorial})`);
      }
    }
  });

  it('saída (sala 4, embaixo) só no passo 4: leva à frente da Academia na Vila; a porta do prédio leva à sala 4', () => {
    const maps = WORLD_MAPS;
    let s: [string, number, number] = ['academy_interior', 56, 12];
    for (let i = 0; i < 30; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25, { tutorial: 3 });
    assert.equal(s[0], 'academy_interior', 'passo 3: a saída está trancada');
    s = ['academy_interior', 56, 12];
    for (let i = 0; i < 30 && s[0] === 'academy_interior'; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25, { tutorial: 4 });
    assert.deepEqual(s, ['map_1', shopDoor(villagePlan('map_1').academy).outside.x, shopDoor(villagePlan('map_1').academy).outside.y]);
    const { door } = shopDoor(villagePlan('map_1').academy);
    assert.deepEqual(moveStep(maps, 'map_1', door.x + 1, door.y + 0.3, 0, -1, 0.1, { tutorial: 4 }), ['academy_interior', ACADEMY.arrive.x, ACADEMY.arrive.y]);
    for (const x of [54.8, 55.5, 56, 56.5, 57.2]) {                 // ninguém fica preso no canto do vão
      let e: [string, number, number] = ['academy_interior', x, 11];
      for (let i = 0; i < 40 && e[0] !== 'map_1'; i++) e = moveStep(maps, e[0], e[1], e[2], 0, 1, 0.25, { tutorial: 4 });
      assert.equal(e[0], 'map_1', `preso em x=${x}`);
    }
  });

  it('cliente (JS) e servidor (TS): mesmo resultado na Academia (vão e saída), em 20 mil passos; ninguém troca de sala andando', () => {
    const rnd = seededRandom(9);
    let st: [string, number, number] = ['academy_interior', 8, 8];
    let tutorial = 0;
    for (let i = 0; i < 20_000; i++) {
      if (i % 4000 === 3999) {
        tutorial += 1;
        st = ['academy_interior', academySpawn(Math.min(3, tutorial)).x, academySpawn(Math.min(3, tutorial)).y];   // o servidor leva
      }
      const dx = i % 500 < 300 ? 1 : -1;
      const dy = Math.round((rnd() * 2 - 1) * 10) / 20;
      const a = moveStep(WORLD_MAPS, st[0], st[1], st[2], dx, dy, 0.25, { tutorial });
      const b = client.moveStep(WORLD_MAPS, st[0], st[1], st[2], dx, dy, 0.25, { tutorial });
      assert.deepEqual(b, a, `passo ${i}`);
      if (a[0] === 'academy_interior') assert.equal(Math.floor(a[1] / 16), Math.floor(st[1] / 16), `trocou de sala andando (${a}, passo ${tutorial})`);
      if (a[0] !== 'academy_interior') break;
      st = a;
    }
  });

  it('Sala de Jutsus: o vão bloqueia quem anda, mas o Teleporte salta por cima (nunca para dentro dele)', () => {
    const g = ACADEMY.gap;
    let st: [string, number, number] = ['academy_interior', 40, 11];
    for (let i = 0; i < 40; i++) st = moveStep(WORLD_MAPS, st[0], st[1], st[2], 0, -1, 0.25, { tutorial: 2 });
    assert.ok(st[2] > g.y + g.h, `andando, para na beira do vão (${st[2]})`);
    const over = blinkTarget(A, 40, st[2], 0, -1, 3);
    assert.ok(over.y < g.y && !blocked(over.x, over.y, A.walls), `Teleporte da beira: do outro lado (${over.y})`);
    const short = blinkTarget(A, 40, 11, 0, -1, 3);
    assert.ok(short.y > g.y + g.h && !blocked(short.x, short.y, A.walls), `longe da beira: cai antes do vão (${short.y})`);
  });
});

describe('v8: tutorial linear da Academia (servidor)', () => {
  it('conta nova nasce na Sala de Taijutsu; morrer no tutorial renasce na sala do passo, nunca na Vila', () => {
    const { join, sess } = setup();
    const p = join('novato', NEW);
    const w = p.conn.last('welcome');
    assert.equal(w.world.map, 'academy_interior');
    assert.deepEqual([w.you.x, w.you.y], [academySpawn(0).x, academySpawn(0).y]);
    assert.equal(w.ninja.tutorialStep, 0);
    assert.deepEqual(w.ninja.jutsus, { teleport: 0, substitution: 0 });
    const s = sess(p.id);
    Object.assign(s, { tutorial: 2, hp: 0, dead: true, deadAt: 0 });
    p.send({ type: 'respawn' });
    assert.equal(s.map, 'academy_interior');
    assert.deepEqual([s.x, s.y], [academySpawn(2).x, academySpawn(2).y]);
  });

  it('as 4 etapas, só com o que o SERVIDOR viu, e o servidor leva de sala em sala até a Praça da Vila', async () => {
    const fake = fakeNinjaStore();
    const { join, run, sess, monsters } = setup({ store: fake.store });
    const p = join('novato', NEW);
    const s = sess(p.id);
    const seq = { n: 1 };
    const room = () => Math.floor(s.x / 16);

    // Etapa 1 (Sala de Taijutsu): jutsus travados; só o Ataque Básico; andar não sai da sala.
    p.send({ type: 'cast', skill: 'teleport', dir: [1, 0] });
    assert.equal(p.conn.last('cast_failed').reason, 'TUTORIAL_LOCKED');
    walk(p, run, seq, 40, [1, 0]);
    assert.equal(room(), 0, 'sem porta para a sala seguinte');
    const roomOneDummies = monsters('dummy').filter((d) => d.x < 16);
    assert.equal(roomOneDummies.length, 3);
    for (const d of roomOneDummies) {
      Object.assign(s, { x: d.x, y: d.y + 1.2 });
      for (let hit = 0; hit < 2; hit++) {
        s.cooldowns = {};
        p.send({ type: 'attack', targetId: d.id });
      }
      await flush();
    }
    await flush();
    assert.deepEqual(fake.calls.filter((c) => c[0] === 'advanceTutorial').map((c) => c[2]), [1]);
    assert.equal(s.tutorial, 1);
    assert.deepEqual(p.conn.last('tutorial'), { type: 'tutorial', step: 1 });
    assert.deepEqual([s.x, s.y], [academySpawn(1).x, academySpawn(1).y], 'levado para a Sala de Controle');
    assert.equal(p.conn.last('map_changed').reason, 'tutorial');
    assert.equal(Math.round(s.chakra), 25, 'começa com o chakra baixo');
    run(2600);
    assert.equal(monsters('dummy').filter((d) => d.x < 16).length, 3, 'os bonecos renascem no mesmo lugar');

    // Etapa 2 (Sala de Controle): o campo drena o chakra; meditar vence o dreno e enche a barra.
    p.send({ type: 'cast', skill: 'teleport', dir: [1, 0] });
    assert.equal(p.conn.last('cast_failed').reason, 'TUTORIAL_LOCKED', 'ainda sem jutsus');
    assert.ok(s.chakra < 25, 'o campo já drenou enquanto os bonecos renasciam');
    s.chakra = 25;
    run(1000);
    assert.ok(Math.abs(s.chakra - (25 - ACADEMY.drainField.chakraPerSec)) < 0.01, `o campo drena ${ACADEMY.drainField.chakraPerSec}/s (${s.chakra})`);
    p.send({ type: 'meditate', active: true });
    run(10_000);
    await flush();
    assert.equal(s.tutorial, 2);
    assert.deepEqual([s.x, s.y], [academySpawn(2).x, academySpawn(2).y], 'levado para a Sala de Jutsus');
    assert.equal(s.meditating, false, 'a viagem encerra a meditação');

    // Etapa 3 (Sala de Jutsus): Teleporte que NÃO atravessa o vão não conta; por cima do vão, conta.
    Object.assign(s, { chakra: 100, cooldowns: {} });
    p.send({ type: 'cast', skill: 'teleport', dir: [1, 0] });
    assert.equal(s.tutorialTeleport, false, 'de lado, sem atravessar: não conta');
    Object.assign(s, { x: 40, y: ACADEMY.gap.y + ACADEMY.gap.h + 0.35, cooldowns: {} });
    p.send({ type: 'cast', skill: 'teleport', dir: [0, -1] });
    assert.ok(s.y < ACADEMY.gap.y, `do outro lado do vão (${s.y})`);
    assert.equal(s.tutorialTeleport, true);
    const trap = monsters('sparring')[0]!;
    Object.assign(s, { x: trap.x, y: trap.y + 1.2 });
    p.send({ type: 'cast', skill: 'substitution' });
    const hpBefore = s.hp;
    run(200);
    await flush();
    assert.ok(p.conn.last('substitution'), 'o golpe da armadilha acertou o tronco');
    assert.equal(s.hp, hpBefore, 'dano anulado');
    assert.equal(s.tutorial, 3);
    assert.equal(s.items.kunai_training, 1, 'recompensa: Kunai de Treino');
    assert.deepEqual([s.x, s.y], [academySpawn(3).x, academySpawn(3).y], 'levado para a Sala de Armas');

    // Etapa 4 (Sala de Armas): sem arma, acertar o boneco não conclui; com a Kunai equipada, conclui.
    const dummy = monsters('dummy').find((d) => d.x > 48)!;
    Object.assign(s, { x: dummy.x, y: dummy.y + 1.2, cooldowns: {} });
    p.send({ type: 'attack', targetId: dummy.id });
    assert.equal(s.tutorial, 3);
    assert.match(p.conn.last('notice').text, /mochila/);
    p.send({ type: 'equip', item: 'kunai_training' });
    await flush(); await flush();
    assert.equal(s.equipped, 'kunai_training');
    assert.equal(s.tutorial, 3, 'equipar sozinho não conclui');
    s.cooldowns = {};
    p.send({ type: 'attack', targetId: dummy.id });
    await flush(); await flush();
    assert.equal(s.tutorial, 4);
    assert.equal(s.ryo, 100);
    assert.deepEqual([s.map, s.x, s.y], ['map_1', REALTIME.tutorialEnd.x, REALTIME.tutorialEnd.y], 'liberado na Praça da Vila');
    assert.equal(p.conn.last('map_changed').map, 'map_1');
  });

  it('não dá para sair antes: no passo 3 a saída não abre (e o cliente não manda passo nenhum)', () => {
    const { join, run, sess } = setup();
    const p = join('aluno', { ...NEW, tutorialStep: 3 });
    const s = sess(p.id);
    Object.assign(s, { x: 56, y: 12 });
    walk(p, run, { n: 1 }, 30, [0, 1]);
    assert.equal(s.map, 'academy_interior');
    p.send({ type: 'tutorial', step: 4 });
    assert.equal(p.conn.last('error').code, 'INVALID_MESSAGE');
  });

  it('a Praça da Vila (fim do tutorial) é casa livre e zona segura', () => {
    const plaza = REALTIME.tutorialEnd;
    assert.ok(!blocked(plaza.x, plaza.y, WORLD_MAPS.map_1.walls));
    assert.ok(WORLD_MAPS.map_1.safeZones.some((z) => plaza.x >= z.x && plaza.x <= z.x + z.w && plaza.y >= z.y && plaza.y <= z.y + z.h));
  });
});

describe('v7: Substituição e Teleporte (combate)', () => {
  it('Substituição anula o golpe, deixa o tronco e aparece ATRÁS do atacante; acaba em 5 s; recarga pelo nível', () => {
    const { join, run, sess, world, advance } = setup();
    const p = join('kaito');
    const s = sess(p.id);
    (world as any).transfer(s, 'map_2', 48.5, 20, 'walk');            // na trilha da Floresta (sem árvores)
    const m = world.spawnMonster({ x: 48.5, y: 21 }, undefined, 'map_2');
    Object.assign((world as any).monsters.get(m.id), { nextAttackAt: 0 });
    s.kits.A = ['substitution', 'teleport'];
    p.send({ type: 'cast', skill: 'substitution' });
    assert.equal(p.conn.last('cast').skill, 'substitution');
    run(50);
    const sub = p.conn.last('substitution');
    assert.deepEqual([sub.logX, sub.logY], [48.5, 20], 'tronco onde ele estava');
    assert.deepEqual([sub.x, sub.y], [48.5, 22], 'apareceu atrás do slime (do lado oposto)');
    assert.deepEqual([s.fx, s.fy], [0, -1], 'virado para o slime');
    assert.equal(s.hp, 100);
    assert.equal(p.conn.of('hit').filter((h: any) => h.target === 'player').length, 0);
    // recarga 30 s no nível 1
    advance(1000);
    p.send({ type: 'cast', skill: 'substitution' });
    assert.equal(p.conn.last('cast_failed').reason, 'COOLDOWN');
    assert.deepEqual([1, 2, 3, 4].map(substitutionCooldownMs), [30_000, 25_000, 20_000, 15_000]);
    // armada e sem golpe por 5 s: acaba; o golpe seguinte machuca
    s.cooldowns = {};
    p.send({ type: 'cast', skill: 'substitution' });
    Object.assign(s, { x: 10, y: 10 });
    run(5100);
    const live = (world as any).monsters.get(m.id);                  // o slime andou nesse tempo
    Object.assign(live, { x: 48.5, y: 21, nextAttackAt: 0, nextStepAt: 1e15 });
    Object.assign(s, { x: 48.5, y: 20 });
    run(50);
    assert.ok(s.hp < 100, 'depois dos 5 s, o golpe acerta');
  });

  it('Substituição Nível 4 (2000 usos): recarga 15 s e aparece atrás do alvo FOCADO', () => {
    const { join, run, sess, world } = setup();
    const p = join('kaito', { jutsus: { substitution: 2000, teleport: 0 }, kits: { A: ['substitution'], B: [] } });
    const s = sess(p.id);
    (world as any).transfer(s, 'map_2', 48.5, 20, 'walk');
    const attacker = world.spawnMonster({ x: 48.5, y: 21 }, undefined, 'map_2');
    const focus = world.spawnMonster({ x: 48.5, y: 17 }, undefined, 'map_2');
    Object.assign((world as any).monsters.get(attacker.id), { nextAttackAt: 0 });
    Object.assign((world as any).monsters.get(focus.id), { nextAttackAt: 1e15 });
    p.send({ type: 'cast', skill: 'substitution', targetId: focus.id });
    assert.equal(s.cooldowns.substitution - (world as any).now(), 15_000);
    run(50);
    const sub = p.conn.last('substitution');
    assert.deepEqual([sub.x, sub.y], [48.5, 16], 'atrás do focado, não do atacante');
  });

  it('Teleporte Curto: alcance 3/4/5/6 pelo uso (100/500/2000) e nunca atravessa parede', () => {
    assert.deepEqual([0, 99, 100, 499, 500, 1999, 2000].map((u) => teleportRange(jutsuLevel(u))), [3, 3, 4, 4, 5, 5, 6]);
    for (const [uses, range] of [[0, 3], [100, 4], [500, 5], [2000, 6]] as const) {
      const { join, sess, world } = setup();
      const p = join('kaito', { jutsus: { teleport: uses }, kits: { A: ['teleport'], B: [] } });
      const s = sess(p.id);
      (world as any).transfer(s, 'map_2', 48.5, 20, 'walk');
      p.send({ type: 'cast', skill: 'teleport', dir: [0, 1] });
      assert.equal(p.conn.last('teleport').y - 20, range, `${uses} usos`);
    }
    // de frente para a parede da sala: não sai do lugar (BLOCKED, sem gastar chakra)
    const { join, sess } = setup();
    const p = join('aluno', { ...NEW, tutorialStep: 2 });
    const s = sess(p.id);
    Object.assign(s, { x: 33.4, y: 11 });
    p.send({ type: 'cast', skill: 'teleport', dir: [-1, 0] });
    assert.equal(p.conn.last('cast_failed').reason, 'BLOCKED');
    assert.equal(s.chakra, 100);
    // perto da parede: para antes dela, dentro da sala
    const spot = blinkTarget(A, 35, 11, -1, 0, 6);
    assert.ok(!blocked(spot.x, spot.y, A.walls) && spot.x >= 33.3 && spot.x < 33.5, `${spot.x}`);
  });
});

describe('v7: jutsus aprendidos e nível pelo uso', () => {
  it('só jutsu APRENDIDO: cast e kit recusam (NOT_LEARNED)', () => {
    const { join } = setup();
    const p = join('novato', { ...NEW, tutorialStep: 4 });
    p.send({ type: 'cast', skill: 'fire' });
    assert.equal(p.conn.last('cast_failed').reason, 'NOT_LEARNED');
    p.send({ type: 'set_loadout', kitA: ['fire'], kitB: [] });
    assert.equal(p.conn.last('error').code, 'NOT_LEARNED');
    p.send({ type: 'cast', skill: 'nao_existe' });
    assert.equal(p.conn.last('error').code, 'INVALID_MESSAGE');
  });

  it('o servidor conta cada uso ACEITO; no 100º sobe para o Nível 2 (aviso + gravação na hora); falha não conta', async () => {
    const fake = fakeNinjaStore();
    const { join, sess, world } = setup({ store: fake.store });
    const p = join('kaito', { jutsus: { teleport: 98 }, kits: { A: ['teleport'], B: [] } });
    const s = sess(p.id);
    (world as any).transfer(s, 'map_2', 48.5, 20, 'walk');
    s.chakra = 5;
    p.send({ type: 'cast', skill: 'teleport', dir: [0, 1] });       // sem chakra: não conta
    assert.equal(s.jutsus.get('teleport'), 98);
    s.chakra = 100;
    p.send({ type: 'cast', skill: 'teleport', dir: [0, 1] });
    s.cooldowns = {};
    p.send({ type: 'cast', skill: 'teleport', dir: [0, -1] });
    assert.equal(s.jutsus.get('teleport'), 100);
    assert.deepEqual(p.conn.last('jutsu_level'), { type: 'jutsu_level', skill: 'teleport', level: 2 });
    await flush();
    assert.deepEqual(fake.calls.filter((c) => c[0] === 'flushUsage').map((c) => c[2]), [[['teleport', 2]]]);
    s.cooldowns = {};
    p.send({ type: 'cast', skill: 'teleport', dir: [0, 1] });
    assert.equal(p.conn.last('teleport').y - p.conn.last('teleport').fromY, 4, 'agora o alcance é 4');
    p.leave();
    await flush();
    assert.deepEqual(fake.calls.filter((c) => c[0] === 'flushUsage').at(-1)![2], [['teleport', 1]], 'ao sair, grava o que faltava');
  });

  it('catálogo: 72 jutsus (2 da Academia + 9 classes x 4 tiers + 7 do Fogo + 27 das outras classes), o tier 1 de cada classe tem o código dela', () => {
    assert.equal(JUTSUS.length, 100);
    assert.equal(JUTSUS.filter((j) => j.tier === 0).length, 2);
    for (const c of CLASSES) assert.equal(JUTSUS.find((j) => j.class === c && j.tier === 1)!.code, c);
    assert.equal(JUTSUS.filter((j) => j.class === 'fire').length, 11, 'o Fogo inteiro da adaptação');
  });
});

describe('v7: Armas, loja, Extração e classe (servidor)', () => {
  it('Ataque Básico com a Kunai de Treino: +10 de dano base (x0,5 na v28); o atributo Armas escala a arma pela metade', () => {
    for (const [weapons, expected] of [[0, 11], [20, 13]] as const) {
      const { join, sess, world } = setup();
      const p = join('kaito', { equipped: 'kunai_training', items: { kunai_training: 1 }, attributes: { vitality: 0, chakra: 0, agility: 0, taijutsu: 0, ninjutsu: 0, weapons } });
      const s = sess(p.id);
      (world as any).transfer(s, 'map_2', 30, 50, 'walk');
      const m = world.spawnMonster({ x: 31, y: 50 }, undefined, 'map_2');
      p.send({ type: 'attack', targetId: m.id });
      assert.equal(p.conn.last('hit').amount, expected);
    }
  });

  it('Extração: o sorteio é do SERVIDOR (campos do cliente são ignorados) e só perto do Sábio Ren', async () => {
    const fake = fakeNinjaStore({ classes: { primary: 'fire', secondary: null }, items: { scroll_fire: 3 } });
    const rolls = [0.95, 0.1, 0.1, 0.5];
    const { join, sess } = setup({ store: fake.store, secureRandom: () => rolls.shift() ?? 0.5 });
    const p = join('kaito', { classes: { primary: 'fire', secondary: null }, items: { scroll_fire: 3 } });
    const s = sess(p.id);
    p.send({ type: 'extract', class: 'fire', level: 1 });
    assert.equal(p.conn.last('error').code, 'SHOP_TOO_FAR');
    const npc = REALTIME.npcs.find((n) => n.id === 'shop_scrolls')!;
    // dentro da Casa dos Pergaminhos, em frente ao balcão
    s.map = 'interior_scrolls';
    Object.assign(s, { x: npc.x, y: npc.y + 3 });
    p.send({ type: 'extract', class: 'fire', level: 1, roll: 0, success: true });   // "roll" do cliente: ignorado
    await flush(); await flush();
    assert.deepEqual(fake.calls.filter((c) => c[0] === 'extract').at(-1), ['extract', p.id, 'fire', 1, 0.95, 0.1]);
    assert.equal(p.conn.last('extract_result').outcome, 'failed', '0,95 >= 80%: falhou e gastou o pergaminho');
    assert.deepEqual(p.conn.last('extract_odds').failures, { fire: { 1: 1 } }, 'v10: a próxima tem +10 pontos (proteção contra azar)');
    await new Promise((r) => setTimeout(r, 300));
    p.send({ type: 'extract', class: 'fire', level: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const ok = p.conn.last('extract_result');
    assert.equal(ok.outcome, 'success');
    assert.ok(s.jutsus.has(ok.jutsu), 'aprendeu e já pode pôr no kit');
    assert.deepEqual(p.conn.last('inventory').items, { scroll_fire: 1 });
  });

  it('Missão de Genin com o Diretor: escolha de classe só perto dele; no nível 11 vira Genin com 1 pergaminho', async () => {
    const fake = fakeNinjaStore({ level: 11 });
    const { join, sess } = setup({ store: fake.store });
    const p = join('kaito', { level: 11 });
    const s = sess(p.id);
    p.send({ type: 'choose_class', class: 'lightning' });
    assert.equal(p.conn.last('error').code, 'DIRECTOR_TOO_FAR');
    s.map = 'academy_interior';
    Object.assign(s, { x: ACADEMY.director.x, y: ACADEMY.director.y + 2 });
    p.send({ type: 'talk', npcId: 'director' });
    assert.deepEqual(p.conn.last('class_choice').kind, 'primary');
    assert.equal(p.conn.last('class_choice').classes.length, 10);   // v30: + Vento
    p.send({ type: 'choose_class', class: 'lightning' });
    await flush(); await flush();
    assert.deepEqual(s.rank, { code: 'GENIN', name: 'Genin' });
    assert.deepEqual(p.conn.last('classes'), { type: 'classes', primary: 'lightning', secondary: null });
    assert.equal(p.conn.last('inventory').items.scroll_lightning, 1);
  });

  it('v37: admin refaz a Missão de Genin com outra classe: os jutsus da classe antiga saem do kit (antes travavam os 4 espaços)', async () => {
    const fake = fakeNinjaStore({ level: 11, classes: { primary: 'fire', secondary: null } });
    const { join, sess } = setup({ store: fake.store });
    const p = join('kaito', { level: 11, isAdmin: true, classes: { primary: 'fire', secondary: null },
      jutsus: { teleport: 0, substitution: 0, fire: 10, fire_endan: 3, fire_2: 0 }, kits: { A: ['teleport', 'fire', 'fire_endan', 'fire_2'], B: ['substitution', 'fire'] } });
    const s = sess(p.id);
    s.map = 'academy_interior';
    Object.assign(s, { x: ACADEMY.director.x, y: ACADEMY.director.y + 2 });
    s.rank = { code: 'ACADEMY', name: 'Academia' };
    p.send({ type: 'talk', npcId: 'director' });
    p.send({ type: 'choose_class', class: 'water' });
    await flush(); await flush();
    assert.deepEqual(s.classes, { primary: 'water', secondary: null });
    assert.deepEqual(s.kits, { A: ['teleport'], B: ['substitution'] });
    assert.deepEqual(p.conn.last('kit').kits, { A: ['teleport'], B: ['substitution'] });
    assert.ok(s.jutsus.has('fire'), 'os jutsus antigos ficam guardados no perfil (só saem do kit)');
  });

  it('Missão de Genin (v23): admin que voltou à Academia refaz com outra classe; quem não é admin cai na Secundária (uma vez só)', async () => {
    for (const admin of [true, false]) {
      const fake = fakeNinjaStore({ level: 11, classes: { primary: 'fire', secondary: null } });
      const { join, sess } = setup({ store: fake.store });
      const p = join('kaito', { level: 11, isAdmin: admin, classes: { primary: 'fire', secondary: null } });
      const s = sess(p.id);
      s.map = 'academy_interior';
      Object.assign(s, { x: ACADEMY.director.x, y: ACADEMY.director.y + 2 });
      s.rank = { code: 'ACADEMY', name: 'Academia' };          // o admin voltou à Academia pelo /admin patente
      p.send({ type: 'talk', npcId: 'director' });
      assert.equal(p.conn.last('class_choice').kind, 'primary', 'a Academia sempre oferece a Missão de Genin');
      p.send({ type: 'choose_class', class: 'water' });
      await flush(); await flush();
      if (admin) {
        assert.deepEqual(fake.calls.filter((c) => c[0] === 'becomeGenin' || c[0] === 'chooseSecondary').at(-1), ['becomeGenin', p.id, 'water']);
        assert.deepEqual(s.rank, { code: 'GENIN', name: 'Genin' });
        assert.deepEqual(p.conn.last('classes'), { type: 'classes', primary: 'water', secondary: null });
      } else {
        assert.deepEqual(fake.calls.filter((c) => c[0] === 'becomeGenin' || c[0] === 'chooseSecondary').at(-1), ['chooseSecondary', p.id, 'water']);
        assert.equal(s.rank.code, 'ACADEMY');
      }
    }
  });

  it('v34: com banco, só entra no kit (e só sai) jutsu da Academia, das suas classes ou da sua linhagem; o resto fica guardado', async () => {
    const fake = fakeNinjaStore({ level: 40, classes: { primary: 'fire', secondary: null } });
    const { join, sess } = setup({ store: fake.store });
    // conta de antes da v7: os 7 jutsus de todas as classes aprendidos e no kit; Primária Fogo, linhagem Rubro
    const p = join('veterano', {
      level: 40, classes: { primary: 'fire', secondary: null }, clan: 'rubro',
      jutsus: { teleport: 0, substitution: 0, fire: 0, water: 0, taijutsu: 0, heal: 0, illusion: 0, shadow: 0, stone: 0, rubro_olho: 0 },
      kits: { A: ['fire', 'water', 'taijutsu', 'heal'], B: ['illusion', 'shadow', 'substitution', 'rubro_olho'] },
    });
    const s = sess(p.id);
    assert.deepEqual(p.conn.last('welcome').kit.kits, { A: ['fire'], B: ['substitution', 'rubro_olho'] }, 'ao entrar, o kit perde o que é de outra classe');
    assert.ok(s.jutsus.has('water'), 'o jutsu continua aprendido (nada se apaga)');
    p.send({ type: 'set_loadout', kitA: ['fire', 'water'], kitB: [] });
    assert.equal(p.conn.last('error').code, 'NOT_YOUR_CLASS');
    s.kits.A = ['water'];                                     // mesmo se o kit tivesse ficado com ele: não sai
    Object.assign(s, { tutorial: 4, chakra: 100, cooldowns: {} });
    s.map = 'map_2';
    p.send({ type: 'cast', skill: 'water' });
    assert.equal(p.conn.last('cast_failed').reason, 'NOT_YOUR_CLASS');
    // a classe Secundária (nível 40) libera os jutsus dela
    s.classes.secondary = 'water';
    const errors = p.conn.of('error').length;
    p.send({ type: 'set_loadout', kitA: ['fire', 'water'], kitB: ['rubro_olho'] });
    await flush(); await flush();
    // passou da regra da classe (aqui, sem perfil gravável, o teste só confere que o motivo não é mais a classe)
    assert.ok(p.conn.of('error').slice(errors).every((e: { code: string }) => e.code !== 'NOT_YOUR_CLASS'), 'com a Água como Secundária, o kit passa da regra da classe');
  });

  it('compra: só perto do lojista que VENDE o item; preço do banco', async () => {
    const fake = fakeNinjaStore({ ryo: 500 });
    const { join, sess } = setup({ store: fake.store });
    const p = join('kaito', { ryo: 500 });
    const s = sess(p.id);
    p.send({ type: 'buy', item: 'kunai', qty: 1 });
    assert.equal(p.conn.last('error').code, 'SHOP_TOO_FAR');
    s.map = 'interior_scrolls';
    Object.assign(s, { x: 7.5, y: 7.7 });
    p.send({ type: 'buy', item: 'kunai', qty: 1 });
    assert.equal(p.conn.last('error').code, 'SHOP_TOO_FAR', 'a Kunai é da Armaria');
    s.map = 'interior_weapons';
    p.send({ type: 'buy', item: 'kunai', qty: 1, price: 1 });
    await flush(); await flush();
    assert.deepEqual(fake.calls.at(-1), ['buy', p.id, 'kunai', 1]);
    assert.deepEqual([p.conn.last('inventory').ryo, p.conn.last('inventory').items.kunai], [200, 1]);
    p.send({ type: 'buy', item: 'kunai_training', qty: 1 });
    assert.match(p.conn.last('notice').text, /não está à venda/);
  });
});
