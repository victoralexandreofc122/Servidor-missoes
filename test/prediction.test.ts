import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { blocked, PLAYER_RADIUS, stepMove } from '../src/realtime/movement.js';
import { seededRandom, setupWorld } from './support/world.js';

// Cliente (JavaScript puro), importado direto de public/.
const client = await import(new URL('../public/movement.js', import.meta.url).href);

const S = REALTIME.spawn;
const STEP = (REALTIME.speedTilesPerSecond * REALTIME.tickMs) / 1000;   // 0,25 casa por entrada
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0 } } };
const sess = (world: any, id: string) => world.sessions.get(id);
const right = (n: number): [number, number][] => Array.from({ length: n }, () => [1, 0]);

describe('movimento: a MESMA função no cliente e no servidor', () => {
  it('10 mil passos aleatórios (diagonais, bordas, paredes): cliente e servidor dão exatamente o mesmo número', () => {
    const rnd = seededRandom(7);
    const walls = [{ x: 10, y: 10, w: 4, h: 3 }, { x: 3, y: 15, w: 2, h: 2 }];
    let x = 12, y = 8;
    for (let i = 0; i < 10_000; i++) {
      const dx = Math.round((rnd() * 2 - 1) * 20) / 20, dy = Math.round((rnd() * 2 - 1) * 20) / 20;
      const dist = [0.25, 0.4, 0.3, 0.45][i % 4]!;
      const s = stepMove(x, y, dx, dy, dist, 20, 20, walls);
      const c = client.stepMove(x, y, dx, dy, dist, 20, 20, walls);
      assert.deepEqual(c, s, `passo ${i}`);
      [x, y] = s;
      assert.ok(!blocked(x, y, walls), 'nunca entra na parede');
    }
  });

  it('paredes: bate e para; na diagonal, desliza ao longo da parede', () => {
    const wall = [{ x: 10, y: 0, w: 2, h: 20 }];
    assert.deepEqual(stepMove(9.6, 5, 1, 0, 0.25, 30, 30, wall), [9.6, 5], 'de frente: para');
    assert.deepEqual(stepMove(9.6, 5, 1, 1, 0.25, 30, 30, wall), [9.6, 5.177], 'na diagonal: escorrega no eixo livre');
    assert.ok(10 - PLAYER_RADIUS >= 9.6);
  });

  it('reconciliação: posição do servidor + entradas ainda não confirmadas = posição prevista', () => {
    const pending = [{ seq: 5, dx: 1, dy: 0 }, { seq: 6, dx: 1, dy: 0 }, { seq: 7, dx: 0, dy: 1 }];
    const maps = { m: { width: 100, height: 100, walls: [], exits: [] } };
    assert.deepEqual(client.replay(maps, 'm', 50, 50, pending, () => 0.25), ['m', 50.5, 50.25]);
  });
});

describe('servidor: entradas com predição (autoridade)', () => {
  it('cada entrada vale 1 tick (0,25 casa) e o servidor confirma a última aplicada (a)', () => {
    const { connect, run } = setupWorld(config);
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'input', seq: 1, inputs: right(4) });
    run(200);
    const last = a.conn.last('player_moved');
    assert.deepEqual([last.x, last.y, last.a], [S.x + 4 * STEP, S.y, 4]);
    assert.equal(b.conn.last('player_moved').x, S.x + 1, 'os outros veem a mesma posição oficial');
    run(500);
    assert.equal(a.conn.last('player_moved').x, S.x + 1, 'sem entradas, não anda sozinho');
  });

  it('entrada repetida (mesmo seq) não anda duas vezes', () => {
    const { connect, run, pos } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'input', seq: 1, inputs: right(2) });
    a.send({ type: 'input', seq: 1, inputs: right(2) });   // reenvio
    a.send({ type: 'input', seq: 2, inputs: right(2) });   // 2 repetida, 3 nova
    run(500);
    assert.equal(pos(a.id).x, S.x + 3 * STEP);
    assert.equal(a.conn.last('player_moved').a, 3);
  });

  it('anti speed hack: mandar entradas mais rápido que o relógio não faz andar mais rápido', () => {
    const { clock, connect, world, pos } = setupWorld(config);
    const a = connect('kaito');
    let seq = 1;
    for (let tick = 0; tick < 40; tick++) {                  // 2 s de jogo
      a.send({ type: 'input', seq, inputs: right(3) });      // 3 entradas por tick (3x a velocidade)
      seq += 3;
      clock.advance(REALTIME.tickMs);
      world.tick();
    }
    const walked = pos(a.id).x - S.x;
    const limit = (5 * 2) + (5 * REALTIME.inputBufferMs) / 1000;   // 2 s a 5 casas/s + a folga da rede
    assert.ok(walked <= limit, `andou ${walked} em 2 s (limite ${limit})`);
    assert.ok(walked >= 9.5, `mas anda normal (${walked})`);
  });

  it('fila cheia: o excesso é descartado e confirmado (o cliente será corrigido)', () => {
    const { connect, run, pos } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'input', seq: 1, inputs: right(10) });
    a.send({ type: 'input', seq: 11, inputs: right(10) });
    a.send({ type: 'input', seq: 21, inputs: right(10) });  // passa das 20 da fila
    run(2000);
    assert.equal(pos(a.id).x, S.x + REALTIME.maxQueuedInputs * STEP);
    assert.equal(a.conn.last('player_moved').a, 30, 'confirma até a 30 (as descartadas também)');
  });

  it('direção segurada (move) + entradas ao mesmo tempo não somam velocidade', () => {
    const { clock, connect, world, pos } = setupWorld(config);
    const a = connect('kaito');
    let seq = 1;
    for (let tick = 0; tick < 20; tick++) {
      a.send({ type: 'move', dx: 1, dy: 0 });
      if (tick % 4 === 0) { a.send({ type: 'input', seq, inputs: right(10) }); seq += 10; }
      clock.advance(REALTIME.tickMs);
      world.tick();
    }
    assert.ok(pos(a.id).x - S.x <= 5 + 1.25 + 0.01, `andou ${pos(a.id).x - S.x} em 1 s`);
  });

  it('paredes valem no servidor: andar contra uma casa da vila não atravessa', () => {
    const { connect, run, pos, world } = setupWorld(config);
    const a = connect('kaito');
    const house = REALTIME.maps.map_1.walls.find((w) => w.s === 'leader')!;          // sede da vila (31..46,6; 5,5..20,5)
    Object.assign(sess(world, a.id), { x: house.x - 1, y: house.y + 9.5 });          // no gramado à esquerda dela
    a.send({ type: 'input', seq: 1, inputs: right(10) });
    a.send({ type: 'input', seq: 11, inputs: right(10) });
    run(1500);
    assert.ok(pos(a.id).x <= house.x - PLAYER_RADIUS, `parou na parede (${pos(a.id).x})`);
    assert.equal(a.conn.last('player_moved').a, 20, 'as entradas foram aplicadas (e confirmadas), só não atravessou');
    a.send({ type: 'move', dx: 1, dy: 0 });                // direção segurada também colide
    run(500);
    assert.ok(pos(a.id).x <= house.x - PLAYER_RADIUS);
  });

  it('entrada inválida (fora de -1..1, mais de 10, seq 0) é recusada', () => {
    const { connect } = setupWorld(config);
    const a = connect('kaito');
    for (const bad of [
      { seq: 1, inputs: [[2, 0]] }, { seq: 1, inputs: right(11) }, { seq: 0, inputs: right(1) }, { seq: 1, inputs: [] }, { seq: 1.5, inputs: right(1) },
    ]) {
      a.send({ type: 'input', ...bad });
      assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE', JSON.stringify(bad));
    }
  });

  it('meditando: a 1ª entrada com direção encerra a meditação e anda; morto: entradas só são confirmadas', () => {
    const { world, connect, run, pos } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'meditate', active: true });
    a.send({ type: 'input', seq: 1, inputs: right(2) });
    assert.equal(a.conn.last('meditation').reason, 'moved');
    run(200);
    assert.equal(pos(a.id).x, S.x + 2 * STEP);
    sess(world, a.id).dead = true;
    a.send({ type: 'input', seq: 3, inputs: right(4) });
    run(300);
    assert.equal(pos(a.id).x, S.x + 2 * STEP, 'morto não anda');
    assert.equal(a.conn.last('player_moved').a, 6, 'mas confirma (o cliente para de esperar por elas)');
  });
});
