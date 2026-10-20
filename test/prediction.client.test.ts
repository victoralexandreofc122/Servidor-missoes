import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { FakeConn, seededRandom } from './support/world.js';
import { GameWorld } from '../src/realtime/gameWorld.js';

// Cliente (JavaScript puro), importado direto de public/: a MESMA predição do navegador.
const { Predictor, pushSnapshot, sampleSnapshots, quantize, INTERP_DELAY_MS } = await import(new URL('../public/prediction.js', import.meta.url).href);

let pred_: any = null;   // o Predictor da simulação em andamento (para o teste de trapaça)
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0 } } };

/**
 * Cliente de verdade (Predictor) ligado a um servidor de verdade (GameWorld), com latência:
 * cada mensagem leva `oneWay()` ms para ir e para voltar. Quadros do cliente a cada 16 ms,
 * ticks do servidor a cada 50 ms.
 */
function simulate(opts: {
  ms: number;
  joystick: (t: number) => [number, number];
  oneWay?: () => number;
  clientSpeed?: number;
  start?: [number, number];
  after?: (t: number, world: any, id: string) => void;
}) {
  let now = 1_000_000;
  const world = new GameWorld(config, () => now, undefined, { random: seededRandom() });
  const conn = new FakeConn();
  const handle = world.join({ id: 'p1', username: 'kaito' }, conn);
  const s = (world as any).sessions.get('p1');
  if (opts.start) [s.x, s.y] = opts.start;
  const walls = (world as any).walls;
  const W = { width: config.world.width, height: config.world.height, walls, tickMs: config.tickMs };
  const pred = new Predictor();
  pred.reset(s.x, s.y);
  pred_ = pred;
  const oneWay = opts.oneWay ?? (() => 100);
  const toServer: { at: number; msg: unknown }[] = [];
  const toClient: { at: number; msg: any }[] = [];
  let seen = conn.sent.length;
  const results = { snaps: 0, smooth: 0, firstMoveMs: -1, maxView: 0 };
  let lastView: number[] | null = null;
  let prevView: number[] | null = null;
  const t0 = now;
  for (let t = 0; t <= opts.ms; t++) {
    now = t0 + t;
    // entrega com atraso
    while (toServer.length && toServer[0]!.at <= now) handle.receive(JSON.stringify(toServer.shift()!.msg));
    while (toClient.length && toClient[0]!.at <= now) {
      const msg = toClient.shift()!.msg;
      if (msg.type === 'player_moved' && msg.playerId === 'p1') {
        const r = pred.reconcile(msg.x, msg.y, msg.a, W);
        if (r === 'snap') results.snaps += 1;
        if (r === 'smooth') results.smooth += 1;
      }
    }
    if (t % config.tickMs === 0) world.tick();
    for (; seen < conn.sent.length; seen++) toClient.push({ at: now + oneWay(), msg: conn.sent[seen] });
    toClient.sort((a, b) => a.at - b.at);
    if (t % 16 === 0) {
      const [jx, jy] = opts.joystick(t);
      const dx = quantize(jx), dy = quantize(jy);
      for (const msg of pred.advance(16, dx, dy, opts.clientSpeed ?? 5, W, true)) toServer.push({ at: now + oneWay(), msg });
      toServer.sort((a, b) => a.at - b.at);
      const v = pred.view(16, dx, dy, opts.clientSpeed ?? 5, W, true);
      if (results.firstMoveMs < 0 && (jx !== 0 || jy !== 0) && lastView && (v[0] !== lastView[0] || v[1] !== lastView[1])) {
        results.firstMoveMs = t;
      }
      if (prevView && lastView) results.maxView = Math.max(results.maxView, Math.hypot(v[0] - lastView[0]!, v[1] - lastView[1]!));
      prevView = lastView;
      lastView = v;
    }
    opts.after?.(t, world, 'p1');
  }
  return { pred, s, results, lastView: lastView! };
}

describe('predição + reconciliação (cliente real x servidor real, 200 ms de ida e volta)', () => {
  it('responde no MESMO quadro: o boneco anda já no 1º quadro do joystick, sem esperar o servidor', () => {
    const { results } = simulate({ ms: 600, joystick: (t) => (t >= 160 ? [1, 0] : [0, 0]) });
    assert.ok(results.firstMoveMs >= 160 && results.firstMoveMs <= 176, `andou em t=${results.firstMoveMs} (joystick em t=160)`);
  });

  it('jogador honesto: 3 s andando e virando, nenhum pulo; previsão = servidor no fim', () => {
    const { pred, s, results } = simulate({
      ms: 3500,
      joystick: (t) => (t < 1000 ? [1, 0] : t < 2000 ? [0.7, -0.7] : t < 3000 ? [0, 1] : [0, 0]),
    });
    assert.equal(results.snaps, 0);
    assert.ok(pred.stats.maxError < 0.01, `maior diferença ${pred.stats.maxError}`);
    assert.deepEqual([pred.x, pred.y], [s.x, s.y], 'parou exatamente onde o servidor diz');
    assert.equal(pred.pending.length, 0, 'todas as entradas confirmadas');
  });

  it('rede instável (60 a 180 ms por trecho): continua sem pulos', () => {
    const rnd = seededRandom(3);
    const { pred, s, results } = simulate({ ms: 3000, oneWay: () => 60 + rnd() * 120, joystick: (t) => (t < 2500 ? [1, 0.3] : [0, 0]) });
    assert.equal(results.snaps, 0);
    assert.deepEqual([pred.x, pred.y], [s.x, s.y]);
  });

  it('parede (casa da vila): o cliente prevê a batida igual ao servidor, sem correção', () => {
    const { pred, s, results } = simulate({ ms: 2500, start: [40, 44], joystick: (t) => (t < 2000 ? [1, 0] : [0, 0]) });
    assert.equal(results.snaps + results.smooth, 0, 'nenhuma correção: a previsão já parou na parede');
    assert.ok(s.x < 42 && pred.x === s.x, `parou em ${s.x}`);
  });

  it('cliente trapaceiro (velocidade 15 em vez de 5): o servidor só aplica a velocidade real e o cliente é puxado de volta', () => {
    const { pred, s } = simulate({ ms: 3000, clientSpeed: 15, joystick: (t) => (t < 2000 ? [1, 0] : [0, 0]) });
    assert.ok(pred.stats.smooth + pred.stats.snap >= 10, 'corrigido a cada confirmação');
    assert.ok(s.x - REALTIME.spawn.x <= 10 + 1.25, `no servidor andou só ${s.x - REALTIME.spawn.x}`);
    assert.deepEqual([pred.x, pred.y], [s.x, s.y], 'o cliente terminou onde o servidor manda');
  });

  it('cliente trapaceiro (teleporte de 6 casas): correção brusca para a posição oficial', () => {
    const { pred, s, results } = simulate({
      ms: 1500,
      joystick: (t) => (t < 1000 ? [1, 0] : [0, 0]),
      after: (t) => { if (t === 400) pred_.x += 6; },
    });
    assert.ok(results.snaps >= 1, 'pulou de volta');
    assert.deepEqual([pred.x, pred.y], [s.x, s.y]);
    assert.ok(s.x - REALTIME.spawn.x <= 5 + 1.25, `o servidor ignorou o teleporte (${s.x - REALTIME.spawn.x})`);
  });

  it('leve: andando, manda no máximo 10 mensagens/s e guarda poucas entradas pendentes', () => {
    let maxPending = 0, msgs = 0;
    const pred = new Predictor();
    pred.reset(50, 50);
    const W = { width: 100, height: 100, walls: [], tickMs: 50 };
    for (let t = 0; t < 1000; t += 16) {
      msgs += pred.advance(16, 1, 0, 5, W, true).length;
      maxPending = Math.max(maxPending, pred.pending.length);
    }
    assert.ok(msgs <= 10, `${msgs} mensagens em 1 s`);
    assert.ok(maxPending <= 20, `${maxPending} pendentes sem resposta (sem servidor) em 1 s`);
  });
});

describe('interpolação dos outros jogadores', () => {
  it('desenha entre duas posições que chegaram (nunca pula para a última)', () => {
    const buf: any[] = [];
    pushSnapshot(buf, 1000, 50, 50, 50);
    pushSnapshot(buf, 1050, 50.25, 50, 50);
    pushSnapshot(buf, 1100, 50.5, 50, 50);
    assert.deepEqual(sampleSnapshots(buf, 1000 + INTERP_DELAY_MS + 25), [50.125, 50]);   // meio do caminho entre a 1ª e a 2ª
    assert.deepEqual(sampleSnapshots(buf, 1100 + INTERP_DELAY_MS), [50.5, 50]);
    assert.deepEqual(sampleSnapshots(buf, 5000), [50.5, 50], 'sem aviso novo: fica parado na última');
  });

  it('parado há tempo e volta a andar: começa do lugar certo (âncora), sem escorregar devagar', () => {
    const buf: any[] = [];
    pushSnapshot(buf, 0, 10, 10, 50);
    pushSnapshot(buf, 5000, 10.25, 10, 50);
    assert.equal(buf.length, 3);
    assert.deepEqual(sampleSnapshots(buf, 5000 - 50 + INTERP_DELAY_MS), [10, 10]);
    assert.deepEqual(sampleSnapshots(buf, 5000 + INTERP_DELAY_MS), [10.25, 10]);
  });
});
