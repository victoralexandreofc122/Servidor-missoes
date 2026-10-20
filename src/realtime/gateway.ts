import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PlayerRequest } from '../http.js';
import { REALTIME, type RealtimeConfig } from './config.js';
import { GameWorld, type JoiningPlayer, type Progression, type WorldLogger } from './gameWorld.js';
import type { Missions } from './missions.js';
import type { Profile } from './profile.js';
import type { NinjaStore } from './ninjaStore.js';

/*
 * Endpoint WebSocket: wss://<servidor>/game
 *
 * Fica no MESMO servidor HTTP da API pública (mesma porta do Render). O JWT é validado
 * ANTES do upgrade: token ausente, inválido ou vencido recebe HTTP 401 e o socket é
 * fechado, sem nunca virar WebSocket nem tocar no estado do jogo.
 *
 * Onde o token pode vir (nesta ordem):
 *  1. `Authorization: Bearer <JWT>`: clientes nativos (o navegador não deixa mandar).
 *  2. `Sec-WebSocket-Protocol: nin.v1, jwt.<JWT>`: o cliente web do jogo. Vai num
 *     cabeçalho, fora da URL; o servidor responde só "nin.v1", nunca devolve o token.
 *  3. `?token=<JWT>`: só para teste manual (Hoppscotch). Fica na URL, então pode
 *     aparecer em logs de proxy; o cliente do jogo não usa.
 *
 * Logs: nunca a URL (ela tem o token), nunca o token, nunca o texto do chat. Só playerId.
 */

export interface GatewayDeps {
  /** O mesmo `authenticate` das rotas HTTP: preenche request.player.id ou lança 401. */
  authenticate: (request: PlayerRequest) => Promise<void>;
  /** Busca nome, XP e rank do jogador (1 consulta por conexão, não por passo). undefined = não existe. */
  findPlayer: (playerId: string) => Promise<JoiningPlayer | undefined>;
  /** Grava XP no banco quando o jogador mata um monstro. */
  progression?: Progression;
  /** Missões de sensei (NPC Mestre e abates) no banco. */
  missions?: Missions;
  /** Ficha no banco (gastar pontos, salvar kits). */
  profile?: Profile;
  /** Progressão v7 (jutsus, tutorial, classes, loja, Extração). */
  store?: NinjaStore;
  /** Sorteio dos monstros (testes). */
  random?: () => number;
  log: WorldLogger & { error(obj: object, msg?: string): void };
  config?: RealtimeConfig;
  now?: () => number;
}

export interface Gateway {
  world: GameWorld;
  /** Fecha todos os jogadores (1001), para o game loop e o heartbeat. */
  close(): void;
  /** Grava o que ainda está só em memória (uso dos jutsus). Antes do close, no desligamento. */
  flush(): Promise<void>;
}

/** Recusa o handshake com um status HTTP e fecha o socket. */
function reject(socket: Duplex, status: 401 | 404 | 503) {
  const text = { 401: 'Unauthorized', 404: 'Not Found', 503: 'Service Unavailable' }[status];
  if (!socket.writable) return void socket.destroy();
  // Mesmo jeito do próprio ws: termina de enviar a resposta e só então fecha.
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Prefixo do subprotocolo que carrega o token: "jwt.<token>" (JWT só tem caracteres válidos ali). */
export const TOKEN_SUBPROTOCOL_PREFIX = 'jwt.';

/** Token do handshake: header Authorization, subprotocolo "jwt.<token>" ou ?token=. Nunca vai para log. */
export function handshakeAuthorization(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.trim() !== '') return header;
  const protocols = req.headers['sec-websocket-protocol'];
  if (typeof protocols === 'string') {
    const entry = protocols.split(',').map((p) => p.trim()).find((p) => p.startsWith(TOKEN_SUBPROTOCOL_PREFIX));
    if (entry && entry.length > TOKEN_SUBPROTOCOL_PREFIX.length) return `Bearer ${entry.slice(TOKEN_SUBPROTOCOL_PREFIX.length)}`;
  }
  const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token');
  return token ? `Bearer ${token}` : undefined;
}

export function attachGameGateway(server: Server, deps: GatewayDeps): Gateway {
  const config = deps.config ?? REALTIME;
  const world = new GameWorld(config, deps.now, deps.log, {
    ...(deps.random ? { random: deps.random } : {}),
    ...(deps.progression ? { progression: deps.progression } : {}),
    ...(deps.missions ? { missions: deps.missions } : {}),
    ...(deps.profile ? { profile: deps.profile } : {}),
    ...(deps.store ? { store: deps.store } : {}),
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadBytes,   // mensagem maior: o ws fecha com 1009
    perMessageDeflate: false,             // compressão custa CPU e memória; mensagens já são pequenas
    clientTracking: false,
    // Responde só o nome do protocolo do jogo; o "jwt.<token>" oferecido nunca volta na resposta.
    handleProtocols: (protocols: Set<string>) => (protocols.has(config.subprotocol) ? config.subprotocol : false),
  });
  const alive = new WeakMap<WebSocket, boolean>();
  const sockets = new Set<WebSocket>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Erro no socket durante a autenticação (cliente desistiu) não pode derrubar o processo.
    const onSocketError = () => socket.destroy();
    socket.on('error', onSocketError);

    (async () => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path !== config.path) return reject(socket, 404);
      if (world.online >= config.maxPlayers) return reject(socket, 503);

      const request: PlayerRequest = { params: {}, body: undefined, headers: { authorization: handshakeAuthorization(req) } };
      try {
        await deps.authenticate(request);
      } catch {
        deps.log.info({}, 'websocket recusado: token ausente ou inválido');
        return reject(socket, 401);
      }

      let player: JoiningPlayer | undefined;
      try {
        player = await deps.findPlayer(request.player!.id);
      } catch (err) {
        deps.log.error({ err }, 'websocket: falha ao buscar o jogador');
        return reject(socket, 503);
      }
      if (!player) {
        deps.log.info({ playerId: request.player!.id }, 'websocket recusado: jogador não existe');
        return reject(socket, 401);
      }
      if (socket.destroyed) return;

      socket.removeListener('error', onSocketError);
      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.add(ws);
        alive.set(ws, true);
        const handle = world.join(player, ws);
        ws.on('message', (data, isBinary) => {
          const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
          handle.receive(buf, isBinary);
        });
        ws.on('pong', () => alive.set(ws, true));
        ws.on('error', () => ws.terminate());   // ex.: mensagem acima de maxPayload
        ws.on('close', () => {
          sockets.delete(ws);
          handle.leave();
        });
      });
    })().catch((err: unknown) => {
      deps.log.error({ err }, 'websocket: falha no handshake');
      socket.destroy();
    });
  });

  // Heartbeat (recomendação do Render): ping a cada 30 s; quem não respondeu o anterior cai.
  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, config.heartbeatMs);
  heartbeat.unref();

  world.start();

  return {
    world,
    flush: () => world.flushAll(),
    close() {
      clearInterval(heartbeat);
      world.close();   // manda o "close 1001" para cada jogador
      // Quem não completar o fechamento em 1 s é derrubado, para o deploy não ficar esperando.
      setTimeout(() => {
        for (const ws of sockets) ws.terminate();
        sockets.clear();
      }, 1000).unref();
    },
  };
}
