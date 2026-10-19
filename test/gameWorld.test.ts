import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { GameWorld, type Connection } from '../src/realtime/gameWorld.js';
import { sanitizeChat } from '../src/realtime/protocol.js';

/** Conexão falsa: guarda o que o servidor mandou e como fechou. */
class FakeConn implements Connection {
  readonly sent: any[] = [];
  closed?: { code: number; reason: string };
  bufferedAmount = 0;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code: number, reason: string) {
    this.closed ??= { code, reason };
  }
  of(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
  clear() {
    this.sent.length = 0;
  }
}

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const world = new GameWorld(REALTIME, clock.now);
  const connect = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const handle = world.join({ id, username }, conn);
    const send = (msg: unknown) => handle.receive(JSON.stringify(msg));
    return { id, conn, handle, send };
  };
  return { world, clock, connect };
}

describe('GameWorld: entrar e sair', () => {
  it('quem entra recebe welcome (posição + OUTROS online); os outros recebem player_joined', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    assert.deepEqual(a.conn.sent, [{ type: 'welcome', you: { id: a.id, username: 'kaito', ...REALTIME.spawn }, players: [] }]);

    const b = connect('mei');
    assert.deepEqual(b.conn.of('welcome')[0].players, [{ id: a.id, username: 'kaito', ...REALTIME.spawn }]);
    assert.deepEqual(a.conn.of('player_joined'), [{ type: 'player_joined', player: { id: b.id, username: 'mei', ...REALTIME.spawn } }]);
    assert.equal(b.conn.of('player_joined').length, 0, 'quem entrou não recebe aviso de si mesmo');
    assert.equal(world.online, 2);
  });

  it('saída: sai do Map e os outros recebem player_left (uma vez só, mesmo chamando 2x)', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.handle.leave();
    b.handle.leave();
    assert.equal(world.online, 1);
    assert.deepEqual(a.conn.of('player_left'), [{ type: 'player_left', playerId: b.id }]);
  });

  it('mesmo jogador conecta de novo: conexão antiga fecha (4000), a nova herda a posição, ninguém vê sair/entrar', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    clock.advance(1000);
    b.send({ type: 'move', x: 12, y: 10 });
    a.conn.clear();

    const again = new FakeConn();
    const h2 = world.join({ id: b.id, username: 'mei' }, again);
    assert.equal(b.conn.closed?.code, 4000);
    assert.deepEqual(again.of('welcome')[0].you, { id: b.id, username: 'mei', x: 12, y: 10 });
    b.handle.leave();                                    // o "close" da conexão antiga chega depois
    assert.equal(world.online, 2);
    assert.deepEqual(a.conn.sent.filter((m) => m.type !== 'player_moved'), [], 'nem player_left nem player_joined');
    h2.leave();
    assert.equal(world.online, 1);
  });

  it('close(): todos recebem 1001 e o Map esvazia', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    world.close();
    assert.equal(a.conn.closed?.code, 1001);
    assert.equal(b.conn.closed?.code, 1001);
    assert.equal(world.online, 0);
  });
});

describe('GameWorld: movimento e game loop', () => {
  it('movimento válido: nada sai na hora; no tick os OUTROS recebem player_moved, quem andou não', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    a.conn.clear();
    b.conn.clear();
    clock.advance(200);
    a.send({ type: 'move', x: 11, y: 10 });
    assert.equal(b.conn.sent.length, 0);
    assert.equal(world.tick(), 1);
    assert.deepEqual(b.conn.sent, [{ type: 'player_moved', playerId: a.id, x: 11, y: 10 }]);
    assert.equal(a.conn.sent.length, 0);
    assert.equal(world.tick(), 0, 'sem movimento novo, tick não envia nada');
  });

  it('vários passos no mesmo tick viram UMA mensagem com a última posição', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.conn.clear();
    for (const x of [11, 12, 13]) {
      clock.advance(200);
      a.send({ type: 'move', x, y: 10 });
    }
    world.tick();
    assert.deepEqual(b.conn.sent, [{ type: 'player_moved', playerId: a.id, x: 13, y: 10 }]);
  });

  it('speed hack: pulo de 50 casas é recusado com a posição oficial, e ninguém vê o pulo', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.conn.clear();
    clock.advance(10_000);                               // ficar parado não acumula teleporte
    a.send({ type: 'move', x: 60, y: 10 });
    assert.deepEqual(a.conn.of('move_rejected'), [{ type: 'move_rejected', x: 10, y: 10, reason: 'TOO_FAST' }]);
    world.tick();
    assert.equal(b.conn.sent.length, 0);
    assert.deepEqual(world.players().find((p) => p.id === a.id), { id: a.id, username: 'kaito', x: 10, y: 10 });
  });

  it('velocidade: andar a 5 casas/s passa sempre; a 10 casas/s, a folga acaba e começa a recusar', () => {
    const { clock, connect } = setup();
    const lento = connect('lento');
    for (let i = 1; i <= 40; i++) {
      clock.advance(200);
      lento.send({ type: 'move', x: 10 + i, y: 10 });    // 1 casa a cada 200 ms = 5/s
    }
    assert.equal(lento.conn.of('move_rejected').length, 0);

    const rapido = connect('rapido');
    for (let i = 1; i <= 20; i++) {
      clock.advance(100);
      rapido.send({ type: 'move', x: Math.min(10 + i, 99), y: 11 });   // 10/s
    }
    const recusas = rapido.conn.of('move_rejected');
    assert.ok(recusas.length >= 5, `esperava recusas, veio ${recusas.length}`);
  });

  it('fora do mapa: OUT_OF_BOUNDS; coordenada quebrada (1.5, texto): INVALID_MESSAGE', () => {
    const { clock, connect } = setup();
    const a = connect('kaito');
    a.conn.clear();
    clock.advance(1000);
    a.send({ type: 'move', x: -1, y: 10 });
    a.send({ type: 'move', x: 10, y: REALTIME.world.height });
    assert.deepEqual(a.conn.of('move_rejected').map((m) => m.reason), ['OUT_OF_BOUNDS', 'OUT_OF_BOUNDS']);
    a.send({ type: 'move', x: 10.5, y: 10 });
    a.send({ type: 'move', x: '11', y: 10 });
    assert.equal(a.conn.of('error').filter((e) => e.code === 'INVALID_MESSAGE').length, 2);
  });
});

describe('GameWorld: chat e mensagens inválidas', () => {
  it('chat vai para TODOS (inclusive quem mandou), já limpo', () => {
    const { connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'chat', message: '  Olá,\n‮mundo! 🔥  ' });
    const expected = { type: 'chat', playerId: a.id, username: 'kaito', message: 'Olá, mundo! 🔥' };
    assert.deepEqual(a.conn.of('chat'), [expected]);
    assert.deepEqual(b.conn.of('chat'), [expected]);
  });

  it('chat vazio ou longo demais: CHAT_INVALID; 4ª mensagem seguida: CHAT_RATE_LIMITED', () => {
    const { clock, connect } = setup();
    const a = connect('kaito');
    a.send({ type: 'chat', message: '   ' });
    a.send({ type: 'chat', message: 'x'.repeat(REALTIME.chatMaxLength + 1) });
    assert.deepEqual(a.conn.of('error').map((e) => e.code), ['CHAT_INVALID', 'CHAT_INVALID']);

    clock.advance(5000);
    a.conn.clear();
    for (let i = 0; i < 4; i++) a.send({ type: 'chat', message: `oi ${i}` });
    assert.equal(a.conn.of('chat').length, 3);
    assert.deepEqual(a.conn.of('error').map((e) => e.code), ['CHAT_RATE_LIMITED']);
    clock.advance(1000);
    a.send({ type: 'chat', message: 'de novo' });
    assert.equal(a.conn.of('chat').length, 4, 'depois de 1 s libera de novo');
  });

  it('JSON quebrado, tipo desconhecido, binário: INVALID_MESSAGE, sem derrubar ninguém', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    a.conn.clear();
    a.handle.receive('{nao é json');
    a.handle.receive(JSON.stringify({ type: 'teleport', x: 1, y: 1 }));
    a.handle.receive(Buffer.from([1, 2, 3]), true);
    assert.deepEqual(a.conn.of('error').map((e) => e.code), ['INVALID_MESSAGE', 'INVALID_MESSAGE', 'INVALID_MESSAGE']);
    assert.equal(world.online, 1);
  });

  it('sanitizeChat: controles e inversão de texto viram espaço; limite em caracteres, não bytes', () => {
    assert.equal(sanitizeChat('a\u0000b\tc', 200), 'a b c');
    assert.equal(sanitizeChat('é'.repeat(200), 200), 'é'.repeat(200));
    assert.equal(sanitizeChat('é'.repeat(201), 200), undefined);
  });
});

describe('GameWorld: proteção contra flood', () => {
  it('1000 mensagens no mesmo instante: só a rajada (30) é processada, a conexão cai (1008) e é rápido', () => {
    const { world, connect } = setup();
    const atacante = connect('atacante');
    const vitima = connect('vitima');
    vitima.conn.clear();

    const inicio = performance.now();
    for (let i = 0; i < 1000; i++) atacante.send({ type: 'chat', message: `spam ${i}` });
    const ms = performance.now() - inicio;

    assert.ok(vitima.conn.of('chat').length <= REALTIME.chatBurst, 'o chat da vítima não é inundado');
    assert.equal(atacante.conn.closed?.code, 1008);
    assert.equal(world.online, 1);
    assert.deepEqual(vitima.conn.of('player_left'), [{ type: 'player_left', playerId: atacante.id }]);
    assert.ok(ms < 250, `1000 mensagens levaram ${ms.toFixed(1)} ms`);
  });

  it('1000 passos em 1 s: no máximo 20 avisos por segundo para os outros (1 por tick)', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.conn.clear();
    for (let i = 0; i < 1000; i++) {
      clock.advance(1);
      a.send({ type: 'move', x: 10 + (i % 2), y: 10 });
      if (i % REALTIME.tickMs === 0) world.tick();
    }
    assert.ok(b.conn.of('player_moved').length <= 1000 / REALTIME.tickMs, `${b.conn.of('player_moved').length} avisos`);
  });

  it('ritmo normal (20 mensagens/s por minutos) nunca é cortado', () => {
    const { clock, connect } = setup();
    const a = connect('kaito');
    for (let i = 0; i < 20 * 120; i++) {
      clock.advance(50);
      a.send({ type: 'move', x: 10 + (Math.floor(i / 4) % 2), y: 10 });   // 1 casa a cada 200 ms
    }
    assert.equal(a.conn.closed, undefined);
    assert.equal(a.conn.of('move_rejected').length, 0);
  });

  it('cliente que não lê (fila > 1 MiB) é desconectado (4001) sem atrapalhar os outros', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    const lento = connect('lento');
    const c = connect('rin');
    lento.conn.bufferedAmount = REALTIME.maxBufferedBytes + 1;
    a.send({ type: 'chat', message: 'oi' });
    assert.equal(lento.conn.closed?.code, 4001);
    assert.equal(c.conn.of('chat').length, 1);
    assert.deepEqual(c.conn.of('player_left').map((m) => m.playerId), [lento.id]);
    assert.equal(world.online, 2);
  });
});
