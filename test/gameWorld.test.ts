import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { sanitizeChat } from '../src/realtime/protocol.js';
import { FakeConn, setupWorld } from './support/world.js';

/*
 * Movimento, entrada/saída, chat e flood, num mundo SEM monstros (os monstros têm
 * testes próprios em combat.test.ts). Posições relativas ao ponto de nascimento.
 */
const S = REALTIME.spawn;
const setup = () => setupWorld();

describe('GameWorld: entrar e sair', () => {
  it('quem entra recebe welcome (estado próprio + OUTROS online + monstros + mundo); os outros recebem player_joined', () => {
    const { world, connect } = setup();
    const a = connect('kaito', { xp: 40 });
    const w = a.conn.of('welcome')[0];
    assert.equal(a.conn.sent.length, 1);
    assert.deepEqual(
      { ...w.you },
      { id: a.id, username: 'kaito', x: S.x, y: S.y, hp: 100, maxHp: 100, dead: false, meditating: false, chakra: 100, maxChakra: 100, shield: false, xp: 40, rank: { code: 'ACADEMY', name: 'Academia' } },
    );
    assert.deepEqual(w.players, []);
    assert.deepEqual(w.monsters, []);
    assert.equal(w.world.speed, REALTIME.speedTilesPerSecond);
    assert.deepEqual(w.world.spawn, S);
    assert.deepEqual(w.world.skills.fire, { cost: 20, cooldownMs: 1500, range: 3 });

    const b = connect('mei');
    assert.deepEqual(b.conn.of('welcome')[0].players, [{ id: a.id, username: 'kaito', x: S.x, y: S.y, hp: 100, maxHp: 100, dead: false, meditating: false }]);
    assert.deepEqual(a.conn.of('player_joined').map((m) => m.player.username), ['mei']);
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

  it('mesmo jogador conecta de novo: conexão antiga fecha (4000), a nova herda posição, vida e chakra', () => {
    const { world, connect, run } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.send({ type: 'move', dx: 1, dy: 0 });
    run(200);                                            // 200 ms a 5 casas/s = 1 casa
    b.send({ type: 'cast', skill: 'stone' });            // gasta 15 de chakra e ganha escudo
    a.conn.clear();

    const again = new FakeConn();
    const h2 = world.join({ id: b.id, username: 'mei' }, again);
    assert.equal(b.conn.closed?.code, 4000);
    const you = again.of('welcome')[0].you;
    assert.deepEqual([you.x, you.y, you.chakra, you.shield], [S.x + 1, S.y, 85, true], 'reconectar não recarrega chakra nem perde o escudo');
    b.handle.leave();                                    // o "close" da conexão antiga chega depois
    assert.equal(world.online, 2);
    run(200);
    assert.deepEqual(a.conn.of('player_left'), []);
    assert.deepEqual(a.conn.of('player_joined'), []);
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

describe('GameWorld: movimento autoritativo (joystick) e game loop', () => {
  it('move só guarda a direção; o tick anda e manda player_moved para TODOS (inclusive quem andou)', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    a.conn.clear();
    b.conn.clear();
    a.send({ type: 'move', dx: 1, dy: 0 });
    assert.equal(b.conn.sent.length + a.conn.sent.length, 0, 'nada sai antes do tick');
    clock.advance(50);
    assert.equal(world.tick(), 1);
    const expected = { type: 'player_moved', playerId: a.id, x: S.x + 0.25, y: S.y };   // 5 casas/s × 50 ms
    assert.deepEqual(b.conn.of('player_moved'), [expected]);
    assert.deepEqual(a.conn.of('player_moved'), [expected], 'quem andou recebe a posição oficial (corrige a previsão do cliente)');
  });

  it('segurar o joystick 1 s anda exatamente 5 casas, em 20 avisos', () => {
    const { connect, run, pos } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.conn.clear();
    a.send({ type: 'move', dx: 1, dy: 0 });
    run(1000);
    assert.deepEqual(pos(a.id), { x: S.x + 5, y: S.y });
    assert.equal(b.conn.of('player_moved').length, 20);
  });

  it('diagonal (1, 1) é normalizada: mesma velocidade que em linha reta', () => {
    const { connect, run, pos } = setup();
    const a = connect('kaito');
    a.send({ type: 'move', dx: 1, dy: 1 });
    run(1000);
    const p = pos(a.id);
    assert.ok(Math.abs(Math.hypot(p.x - S.x, p.y - S.y) - 5) < 0.02, `andou ${Math.hypot(p.x - S.x, p.y - S.y)}`);
  });

  it('meia força (0.5) anda na metade da velocidade; soltar (0, 0) para e o tick não envia mais nada', () => {
    const { world, clock, connect, run, pos } = setup();
    const a = connect('kaito');
    a.send({ type: 'move', dx: 0, dy: -0.5 });
    run(1000);
    assert.deepEqual(pos(a.id), { x: S.x, y: S.y - 2.5 });
    a.send({ type: 'move', dx: 0, dy: 0 });
    a.conn.clear();
    clock.advance(50);
    assert.equal(world.tick(), 0);
    assert.equal(a.conn.of('player_moved').length, 0);
  });

  it('anti speed hack: direção fora de -1..1, NaN ou texto é INVALID_MESSAGE e não muda nada', () => {
    const { connect, run, pos } = setup();
    const a = connect('kaito');
    a.conn.clear();
    for (const bad of [{ dx: 5, dy: 0 }, { dx: -1.01, dy: 0 }, { dx: '1', dy: 0 }, { dx: 1 }, { x: 90, y: 90 }]) {
      a.send({ type: 'move', ...bad });
    }
    a.handle.receive('{"type":"move","dx":NaN,"dy":0}');
    assert.equal(a.conn.of('error').filter((e) => e.code === 'INVALID_MESSAGE').length, 6);
    run(500);
    assert.deepEqual(pos(a.id), S);
  });

  it('borda do mapa: o jogador para em 0 e em width/height', () => {
    const { world, clock, connect, run, pos } = setup();
    const a = connect('kaito');
    a.send({ type: 'move', dx: -1, dy: -1 });
    run(20_000);
    assert.deepEqual(pos(a.id), { x: 0, y: 0 });
    a.conn.clear();
    clock.advance(50);
    assert.equal(world.tick(), 0, 'parado na parede não gera aviso');
  });

  it('servidor travado 5 s: o tick seguinte anda no máximo 250 ms (sem pulo)', () => {
    const { world, clock, connect, pos } = setup();
    const a = connect('kaito');
    a.send({ type: 'move', dx: 1, dy: 0 });
    clock.advance(5000);
    world.tick();
    assert.deepEqual(pos(a.id), { x: S.x + 1.25, y: S.y });
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

  it('1000 comandos de movimento por segundo: atacante cai (1008), não anda mais rápido e não inunda os outros', () => {
    const { world, clock, connect } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    b.conn.clear();
    for (let i = 0; i < 1000; i++) {
      clock.advance(1);
      a.send({ type: 'move', dx: i % 2 ? 1 : 0.99, dy: 0 });
      if (i % REALTIME.tickMs === 0) world.tick();
    }
    assert.equal(a.conn.closed?.code, 1008);
    const moved = b.conn.of('player_moved');
    assert.ok(moved.length <= 1000 / REALTIME.tickMs, `${moved.length} avisos`);
    const last = moved.at(-1);
    assert.ok(!last || last.x <= S.x + REALTIME.speedTilesPerSecond * 1.0 + 1e-9, 'nunca mais rápido que 5 casas/s');
  });

  it('1000 habilidades por segundo: chakra e recarga limitam o efeito, e a conexão cai (1008)', () => {
    const { world, connect } = setup();
    const a = connect('kaito');
    a.conn.clear();
    for (let i = 0; i < 1000; i++) a.send({ type: 'cast', skill: 'heal' });
    assert.equal(a.conn.closed?.code, 1008);
    assert.equal(a.conn.of('cast').length, 0, 'vida cheia: nenhuma Cura foi aceita');
    assert.equal(world.online, 0);
  });

  it('ritmo do joystick (20 mensagens/s por 2 minutos) nunca é cortado e anda exatamente 5 casas/s', () => {
    const { world, clock, connect, pos } = setup();
    const a = connect('kaito');
    for (let i = 0; i < 20 * 120; i++) {
      a.send({ type: 'move', dx: i < 120 ? 1 : 0, dy: 0 });   // 6 s andando, depois parado
      clock.advance(50);
      world.tick();
    }
    assert.equal(a.conn.closed, undefined);
    assert.equal(a.conn.of('error').length, 0);
    assert.deepEqual(pos(a.id), { x: S.x + 30, y: S.y });
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
