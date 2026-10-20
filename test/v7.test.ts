import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { GameWorld, blinkTarget, type JoiningPlayer } from '../src/realtime/gameWorld.js';
import { JUTSUS, jutsuLevel, substitutionCooldownMs, teleportRange } from '../src/realtime/jutsus.js';
import { ACADEMY, WORLD_MAPS, academySpawn, shopDoor } from '../src/realtime/maps.js';
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

describe('v7: Academia (mapa e portas travadas pelo tutorial)', () => {
  it('4 salas de 16 x 16; porta para a próxima sala só abre no passo certo; a de volta sempre abre', () => {
    assert.deepEqual([A.width, A.height, A.kind], [64, 16, 'interior']);
    const maps = WORLD_MAPS;
    for (let k = 0; k < 3; k++) {
      const door = A.doors.find((d) => d.dir === 'east' && d.x > 16 * k && d.x < 16 * (k + 1))!;
      const inside: [number, number] = [door.x + 1, door.y + 1.5];
      assert.equal(door.step, k + 1);
      // passo k: travada (o jogador só encosta na parede); passo k+1: passa para a sala seguinte
      const locked = moveStep(maps, 'academy_interior', ...inside, 1, 0, 0.25, { tutorial: k });
      assert.ok(locked[1] < 16 * (k + 1), `sala ${k + 1} travada no passo ${k}`);
      const open = moveStep(maps, 'academy_interior', ...inside, 1, 0, 0.25, { tutorial: k + 1 });
      assert.ok(open[1] > 16 * (k + 1) + 1, `sala ${k + 1} aberta no passo ${k + 1}`);
      // volta (oeste) sempre abre
      const back = moveStep(maps, 'academy_interior', 16 * (k + 1) + 1.4, 8, -1, 0, 0.25, { tutorial: 0 });
      assert.ok(back[1] < 16 * (k + 1) - 1, 'a porta de volta sempre abre');
    }
  });

  it('saída (sala 4, embaixo) só no passo 4: leva à frente da Academia na Vila; a porta do prédio leva à sala 4', () => {
    const maps = WORLD_MAPS;
    let s: [string, number, number] = ['academy_interior', 56, 12];
    for (let i = 0; i < 30; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25, { tutorial: 3 });
    assert.equal(s[0], 'academy_interior', 'passo 3: a saída está trancada');
    s = ['academy_interior', 56, 12];
    for (let i = 0; i < 30 && s[0] === 'academy_interior'; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25, { tutorial: 4 });
    assert.deepEqual(s, ['map_1', shopDoor(ACADEMY.building).outside.x, shopDoor(ACADEMY.building).outside.y]);
    const { door } = shopDoor(ACADEMY.building);
    assert.deepEqual(moveStep(maps, 'map_1', door.x + 1, door.y + 0.3, 0, -1, 0.1, { tutorial: 4 }), ['academy_interior', ACADEMY.arrive.x, ACADEMY.arrive.y]);
    for (const x of [54.8, 55.5, 56, 56.5, 57.2]) {                 // ninguém fica preso no canto do vão
      let e: [string, number, number] = ['academy_interior', x, 11];
      for (let i = 0; i < 40 && e[0] !== 'map_1'; i++) e = moveStep(maps, e[0], e[1], e[2], 0, 1, 0.25, { tutorial: 4 });
      assert.equal(e[0], 'map_1', `preso em x=${x}`);
    }
  });

  it('cliente (JS) e servidor (TS): mesmo resultado com as portas travadas, em 20 mil passos', () => {
    const rnd = seededRandom(9);
    let st: [string, number, number] = ['academy_interior', 8, 8];
    let tutorial = 0;
    let crossed = 0;
    for (let i = 0; i < 20_000; i++) {
      if (i % 4000 === 3999) tutorial += 1;
      const dx = i % 500 < 300 ? 1 : -1;
      const dy = Math.round((rnd() * 2 - 1) * 10) / 20;
      const a = moveStep(WORLD_MAPS, st[0], st[1], st[2], dx, dy, 0.25, { tutorial });
      const b = client.moveStep(WORLD_MAPS, st[0], st[1], st[2], dx, dy, 0.25, { tutorial });
      assert.deepEqual(b, a, `passo ${i}`);
      if (Math.floor(a[1] / 16) !== Math.floor(st[1] / 16)) crossed += 1;
      assert.ok(Math.floor(a[1] / 16) <= tutorial, `passou de sala sem ter o passo (${a}, passo ${tutorial})`);
      st = a;
    }
    assert.ok(crossed > 3);
  });
});

describe('v7: tutorial no servidor', () => {
  it('conta nova nasce na Sala 1 da Academia; morrer no tutorial renasce na sala do passo, nunca na Vila', () => {
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

  it('tutorial completo, só com o que o SERVIDOR viu: bonecos (Ataque Básico), meditar, Teleporte + Substituição, equipar', async () => {
    const fake = fakeNinjaStore();
    const { join, run, sess, monsters, world } = setup({ store: fake.store });
    const p = join('novato', NEW);
    const s = sess(p.id);
    const seq = { n: 1 };

    // Sala 1: jutsu não conta; Ataque Básico conta. A porta só abre depois de 3.
    walk(p, run, seq, 10, [1, 0]);
    assert.ok(s.x < 16, 'a porta da Sala 1 está travada');
    for (const d of monsters('dummy')) {
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
    assert.equal(Math.round(s.chakra), 25, 'Sala 2: começa com o chakra baixo');
    assert.equal(monsters('dummy').length, 0);
    run(2600);
    assert.equal(monsters('dummy').length, 3, 'os bonecos renascem no mesmo lugar');

    // Sala 2: meditar FORA da sala não conta; dentro, até encher, conta.
    p.send({ type: 'meditate', active: true });
    run(6000);
    assert.equal(s.tutorial, 1, 'meditou na Sala 1: não conta');
    Object.assign(s, { x: 24, y: 9, chakra: 25 });
    p.send({ type: 'meditate', active: true });
    run(6000);
    await flush();
    assert.equal(s.tutorial, 2);

    // Sala 3: Teleporte e Substituição (o boneco que bate).
    Object.assign(s, { x: 36, y: 11, chakra: 100, cooldowns: {} });
    p.send({ type: 'cast', skill: 'teleport', dir: [1, 0] });
    const tp = p.conn.last('teleport');
    assert.deepEqual([tp.fromX, tp.x, tp.y], [36, 39, 11], 'Teleporte Nv 1: 3 casas');
    const sparring = monsters('sparring')[0]!;
    Object.assign(s, { x: sparring.x, y: sparring.y + 1.2 });
    p.send({ type: 'cast', skill: 'substitution' });
    const hpBefore = s.hp;
    run(200);
    await flush();
    const sub = p.conn.last('substitution');
    assert.ok(sub, 'o golpe acertou o tronco');
    assert.equal(s.hp, hpBefore, 'dano anulado');
    assert.equal(s.tutorial, 3);
    assert.equal(s.items.kunai_training, 1, 'recompensa: Kunai de Treino');

    // Sala 4: equipar a Kunai conclui. A saída abre.
    Object.assign(s, { x: 56, y: 10 });
    p.send({ type: 'equip', item: 'kunai_training' });
    await flush(); await flush();
    assert.equal(s.tutorial, 4);
    assert.equal(s.equipped, 'kunai_training');
    assert.equal(s.ryo, 100);
    walk(p, run, seq, 30, [0, 1]);
    assert.equal(s.map, 'map_1', 'saiu da Academia');
    assert.ok(world.online === 1);
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
});

describe('v7: Substituição e Teleporte (combate)', () => {
  it('Substituição anula o golpe, deixa o tronco e aparece ATRÁS do atacante; acaba em 5 s; recarga pelo nível', () => {
    const { join, run, sess, world, advance } = setup();
    const p = join('kaito');
    const s = sess(p.id);
    (world as any).transfer(s, 'map_2', 40, 20, 'walk');            // na trilha da Floresta (sem árvores)
    const m = world.spawnMonster({ x: 40, y: 21 }, undefined, 'map_2');
    Object.assign((world as any).monsters.get(m.id), { nextAttackAt: 0 });
    s.kits.A = ['substitution', 'teleport'];
    p.send({ type: 'cast', skill: 'substitution' });
    assert.equal(p.conn.last('cast').skill, 'substitution');
    run(50);
    const sub = p.conn.last('substitution');
    assert.deepEqual([sub.logX, sub.logY], [40, 20], 'tronco onde ele estava');
    assert.deepEqual([sub.x, sub.y], [40, 22], 'apareceu atrás do slime (do lado oposto)');
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
    Object.assign(live, { x: 40, y: 21, nextAttackAt: 0, nextStepAt: 1e15 });
    Object.assign(s, { x: 40, y: 20 });
    run(50);
    assert.ok(s.hp < 100, 'depois dos 5 s, o golpe acerta');
  });

  it('Substituição Nível 4 (2000 usos): recarga 15 s e aparece atrás do alvo FOCADO', () => {
    const { join, run, sess, world } = setup();
    const p = join('kaito', { jutsus: { substitution: 2000, teleport: 0 }, kits: { A: ['substitution'], B: [] } });
    const s = sess(p.id);
    (world as any).transfer(s, 'map_2', 40, 20, 'walk');
    const attacker = world.spawnMonster({ x: 40, y: 21 }, undefined, 'map_2');
    const focus = world.spawnMonster({ x: 40, y: 17 }, undefined, 'map_2');
    Object.assign((world as any).monsters.get(attacker.id), { nextAttackAt: 0 });
    Object.assign((world as any).monsters.get(focus.id), { nextAttackAt: 1e15 });
    p.send({ type: 'cast', skill: 'substitution', targetId: focus.id });
    assert.equal(s.cooldowns.substitution - (world as any).now(), 15_000);
    run(50);
    const sub = p.conn.last('substitution');
    assert.deepEqual([sub.x, sub.y], [40, 16], 'atrás do focado, não do atacante');
  });

  it('Teleporte Curto: alcance 3/4/5/6 pelo uso (100/500/2000) e nunca atravessa parede', () => {
    assert.deepEqual([0, 99, 100, 499, 500, 1999, 2000].map((u) => teleportRange(jutsuLevel(u))), [3, 3, 4, 4, 5, 5, 6]);
    for (const [uses, range] of [[0, 3], [100, 4], [500, 5], [2000, 6]] as const) {
      const { join, sess, world } = setup();
      const p = join('kaito', { jutsus: { teleport: uses }, kits: { A: ['teleport'], B: [] } });
      const s = sess(p.id);
      (world as any).transfer(s, 'map_2', 40, 20, 'walk');
      p.send({ type: 'cast', skill: 'teleport', dir: [0, 1] });
      assert.equal(p.conn.last('teleport').y - 20, range, `${uses} usos`);
    }
    // de frente para a parede da sala: não sai do lugar (BLOCKED, sem gastar chakra)
    const { join, sess } = setup();
    const p = join('aluno', { ...NEW, tutorialStep: 2 });
    const s = sess(p.id);
    Object.assign(s, { x: 33.4, y: 8 });
    p.send({ type: 'cast', skill: 'teleport', dir: [-1, 0] });
    assert.equal(p.conn.last('cast_failed').reason, 'BLOCKED');
    assert.equal(s.chakra, 100);
    // perto da parede: para antes dela, dentro da sala
    const spot = blinkTarget(A, 35, 8, -1, 0, 6);
    assert.ok(!blocked(spot.x, spot.y, A.walls) && spot.x >= 33.3 && spot.x < 33.5, `${spot.x}`);
  });
});

describe('v7: jutsus aprendidos e nível pelo uso', () => {
  it('só jutsu APRENDIDO: cast e kit recusam (NOT_LEARNED)', () => {
    const { join } = setup();
    const p = join('novato', NEW);
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
    (world as any).transfer(s, 'map_2', 40, 20, 'walk');
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

  it('catálogo: 38 jutsus (2 da Academia + 9 classes x 4 tiers), tier 1 = código da classe', () => {
    assert.equal(JUTSUS.length, 38);
    assert.equal(JUTSUS.filter((j) => j.tier === 0).length, 2);
    for (const j of JUTSUS.filter((x) => x.tier === 1)) assert.equal(j.code, j.class);
  });
});

describe('v7: Armas, loja, Extração e classe (servidor)', () => {
  it('Ataque Básico com a Kunai de Treino: +10 de dano; o atributo Armas escala a arma', () => {
    for (const [weapons, expected] of [[0, 22], [4, 24]] as const) {
      const { join, sess, world } = setup();
      const p = join('kaito', { equipped: 'kunai_training', items: { kunai_training: 1 }, attributes: { vitality: 0, chakraMax: 0, chakraRegen: 0, agility: 0, taijutsu: 0, ninjutsu: 0, weapons } });
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
    assert.deepEqual(fake.calls.at(-1), ['extract', p.id, 'fire', 1, 0.95, 0.1]);
    assert.equal(p.conn.last('extract_result').outcome, 'failed', '0,95 >= 80%: falhou e gastou o pergaminho');
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
    assert.equal(p.conn.last('class_choice').classes.length, 9);
    p.send({ type: 'choose_class', class: 'lightning' });
    await flush(); await flush();
    assert.deepEqual(s.rank, { code: 'GENIN', name: 'Genin' });
    assert.deepEqual(p.conn.last('classes'), { type: 'classes', primary: 'lightning', secondary: null });
    assert.equal(p.conn.last('inventory').items.scroll_lightning, 1);
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
