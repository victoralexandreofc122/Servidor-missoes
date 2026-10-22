import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { REALTIME } from '../src/realtime/config.js';
import { JWT_SECRET, playerToken } from './support/harness.js';

/*
 * WebSocket DE VERDADE: pacote `ws` no servidor + cliente WebSocket nativo do Node 22
 * (o mesmo que navegadores e o Hoppscotch usam). Sem `ws` instalado, o grupo é pulado.
 */
let gatewayModule: typeof import('../src/realtime/gateway.js') | undefined;
let unavailable: string | false = false;
try {
  gatewayModule = await import('../src/realtime/gateway.js');
} catch (err) {
  unavailable = `pacote ws não pôde ser carregado (${(err as Error).message.split('\n')[0]}). Rode npm install.`;
}

/** Cliente de teste: guarda as mensagens e espera por um tipo. */
function client(url: string, protocols?: string[]) {
  const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
  const messages: any[] = [];
  const waiters: { match: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  // Handshake recusado: o cliente do Node dispara "error" (nem sempre "close"), como o navegador.
  const opened = new Promise<boolean>((resolve) => {
    ws.addEventListener('open', () => resolve(true));
    ws.addEventListener('error', () => resolve(false));
    ws.addEventListener('close', () => resolve(false));
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener('close', (ev) => resolve({ code: ev.code, reason: ev.reason }));
  });
  const waitFor = (type: string, pred: (m: any) => boolean = () => true, ms = 2000) => {
    const found = messages.find((m) => m.type === type && pred(m));
    if (found) return Promise.resolve(found);
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando "${type}"`)), ms);
      waiters.push({ match: (m) => m.type === type && pred(m), resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  };
  const send = (msg: unknown) => ws.send(JSON.stringify(msg));
  return { ws, messages, opened, closed, waitFor, send };
}

describe('WebSocket /game (ws real + cliente nativo)', { skip: unavailable }, () => {
  let server: Server;
  let gateway: import('../src/realtime/gateway.js').Gateway;
  let base: string;
  const players = new Map<string, string>();
  const logs: string[] = [];
  const log = {
    info: (o: object, m?: string) => logs.push(JSON.stringify(o) + ' ' + (m ?? '')),
    warn: (o: object, m?: string) => logs.push(JSON.stringify(o) + ' ' + (m ?? '')),
    error: (o: object, m?: string) => logs.push(JSON.stringify(o) + ' ' + (m ?? '')),
  };
  const tokens: string[] = [];
  const opened: ReturnType<typeof client>[] = [];

  async function newPlayer(username: string) {
    const id = randomUUID();
    players.set(id, username);
    const token = await playerToken(id);
    tokens.push(token);
    return { id, token };
  }
  function connect(query: string) {
    const c = client(`${base}${query}`);
    opened.push(c);
    return c;
  }

  before(async () => {
    server = createServer((_req, res) => res.writeHead(404).end());
    gateway = gatewayModule!.attachGameGateway(server, {
      authenticate: makeAuthenticate({ secret: JWT_SECRET }),
      findPlayer: async (id) => (players.has(id) ? { id, username: players.get(id)! } : undefined),
      log,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    for (const c of opened) c.ws.close();
    gateway.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('handshake: sem token, token inválido, vencido, de jogador inexistente ou caminho errado: recusado', async () => {
    const kaito = await newPlayer('kaito');
    const ghost = await playerToken(randomUUID());
    const wrongSecret = await playerToken(kaito.id, { secret: 'outro-segredo-com-mais-de-32-caracteres!!' });
    const expired = await playerToken(kaito.id, { expiresIn: '-10s' });
    for (const q of [REALTIME.path, `${REALTIME.path}?token=`, `${REALTIME.path}?token=abc.def.ghi`, `${REALTIME.path}?token=${wrongSecret}`,
      `${REALTIME.path}?token=${expired}`, `${REALTIME.path}?token=${ghost}`, `/outra-rota?token=${kaito.token}`]) {
      const c = connect(q);
      assert.equal(await c.opened, false, `deveria recusar: ${q.slice(0, 40)}`);
    }
    assert.equal(gateway.world.online, 0, 'nada entrou no Map');
  });

  it('token válido: conecta e recebe welcome no spawn', async () => {
    const rin = await newPlayer('rin');
    const c = connect(`${REALTIME.path}?token=${rin.token}`);
    assert.equal(await c.opened, true);
    const welcome = await c.waitFor('welcome');
    assert.deepEqual([welcome.you.id, welcome.you.username, welcome.you.x, welcome.you.y], [rin.id, 'rin', REALTIME.spawn.x, REALTIME.spawn.y]);
    assert.deepEqual([welcome.you.hp, welcome.you.chakra], [100, 100]);
    assert.equal(welcome.world.map, 'map_1', 'entra na Vila');
    assert.equal(welcome.monsters.length, 0, 'Vila: área segura, os monstros ficam na Floresta');

    // combate pela rede: Fogo é aceito (todos veem) e cobra o chakra; renascer vivo é recusado
    c.send({ type: 'cast', skill: 'fire' });
    assert.equal((await c.waitFor('cast')).skill, 'fire');
    assert.equal((await c.waitFor('stats')).chakra, 100 - REALTIME.combat.skills.fire.cost);
    c.send({ type: 'respawn' });
    assert.equal((await c.waitFor('error')).code, 'RESPAWN_NOT_READY');
    c.ws.close();
    await c.closed;
  });

  it('cliente do jogo: token no subprotocolo (fora da URL); o servidor responde só "nin.v1", nunca o token', async () => {
    const hana = await newPlayer('hana');
    const c = client(`${base}${REALTIME.path}`, [REALTIME.subprotocol, `jwt.${hana.token}`]);
    opened.push(c);
    assert.equal(await c.opened, true);
    assert.equal(c.ws.protocol, REALTIME.subprotocol);
    assert.equal((await c.waitFor('welcome')).you.username, 'hana');
    c.ws.close();
    await c.closed;

    const bad = client(`${base}${REALTIME.path}`, [REALTIME.subprotocol, 'jwt.token-falso']);
    opened.push(bad);
    assert.equal(await bad.opened, false, 'token inválido no subprotocolo: recusado no handshake');
  });

  it('também aceita Authorization: Bearer no handshake (cliente nativo com header)', async () => {
    const { WebSocket: WsClient } = await import('ws');
    const yuki = await newPlayer('yuki');
    const ws = new WsClient(`${base}${REALTIME.path}`, { headers: { authorization: `Bearer ${yuki.token}` } });
    const first = await new Promise<any>((resolve, reject) => {
      ws.once('message', (d) => resolve(JSON.parse(String(d))));
      ws.once('error', reject);
    });
    assert.equal(first.type, 'welcome');
    ws.close();
  });

  it('dois jogadores: lista inicial, entrada, movimento, chat e saída', async () => {
    const a = await newPlayer('kaito_a');
    const b = await newPlayer('mei_b');
    const ca = connect(`${REALTIME.path}?token=${a.token}`);
    await ca.waitFor('welcome');
    const cb = connect(`${REALTIME.path}?token=${b.token}`);
    const welcomeB = await cb.waitFor('welcome');
    assert.ok(welcomeB.players.some((p: any) => p.id === a.id && p.username === 'kaito_a'), 'B vê A na lista');
    await ca.waitFor('player_joined', (m) => m.player.id === b.id);

    ca.send({ type: 'move', dx: 1, dy: 0 });                       // joystick para a direita
    const moved = await cb.waitFor('player_moved', (m) => m.playerId === a.id);
    assert.ok(moved.x > REALTIME.spawn.x && moved.y === REALTIME.spawn.y, JSON.stringify(moved));
    await ca.waitFor('player_moved', (m) => m.playerId === a.id);   // quem anda também recebe a posição oficial
    ca.send({ type: 'move', dx: 0, dy: 0 });

    ca.send({ type: 'move', dx: 9, dy: 0 });                       // speed hack: recusado
    assert.equal((await ca.waitFor('error')).code, 'INVALID_MESSAGE');
    ca.send({ type: 'cast', skill: 'fire' });                      // aceito, sem resposta

    cb.send({ type: 'chat', message: 'Olá!' });
    const expected = { type: 'chat', playerId: b.id, username: 'mei_b', message: 'Olá!', channel: 'local' };
    assert.deepEqual(await ca.waitFor('chat'), expected);
    assert.deepEqual(await cb.waitFor('chat'), expected);

    cb.ws.close();
    await ca.waitFor('player_left', (m) => m.playerId === b.id);
    ca.ws.close();
    await ca.closed;
  });

  it('flood real: 1000 mensagens seguidas derrubam só o atacante (1008); os outros seguem rápidos', async () => {
    const atk = await newPlayer('atacante');
    const ok = await newPlayer('tranquilo');
    const cOk = connect(`${REALTIME.path}?token=${ok.token}`);
    await cOk.waitFor('welcome');
    const cAtk = connect(`${REALTIME.path}?token=${atk.token}`);
    await cAtk.waitFor('welcome');

    const payload = JSON.stringify({ type: 'move', dx: 1, dy: 0 });
    for (let i = 0; i < 1000; i++) {
      if (cAtk.ws.readyState !== WebSocket.OPEN) break;
      cAtk.ws.send(payload);
    }
    assert.equal((await cAtk.closed).code, 1008);

    const t0 = performance.now();
    cOk.send({ type: 'chat', message: 'ainda aqui' });
    await cOk.waitFor('chat', (m) => m.message === 'ainda aqui');
    assert.ok(performance.now() - t0 < 500, 'servidor respondeu rápido depois do flood');
    await cOk.waitFor('player_left', (m) => m.playerId === atk.id);
    cOk.ws.close();
  });

  it('mensagem maior que 1 KiB: conexão fechada (1009), servidor segue de pé', async () => {
    const p = await newPlayer('grandao');
    const c = connect(`${REALTIME.path}?token=${p.token}`);
    await c.waitFor('welcome');
    c.send({ type: 'chat', message: 'x'.repeat(5000) });
    assert.equal((await c.closed).code, 1009);
    const again = connect(`${REALTIME.path}?token=${p.token}`);
    await again.waitFor('welcome');
    again.ws.close();
  });

  it('logs: nenhum token, nenhuma URL com ?token, nenhum texto de chat', () => {
    const all = logs.join('\n');
    assert.ok(logs.length > 0);
    for (const t of tokens) assert.ok(!all.includes(t), 'token no log');
    assert.ok(!all.includes('token='), 'URL com token no log');
    assert.ok(!all.includes('Olá!') && !all.includes('ainda aqui'), 'chat no log');
  });
});
