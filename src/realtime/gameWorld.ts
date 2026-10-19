import { REALTIME, type RealtimeConfig } from './config.js';
import { CLOSE, ClientMessage, REALTIME_ERRORS, sanitizeChat, type PlayerView, type RealtimeErrorCode, type ServerMessage, type WorldInfo } from './protocol.js';
import { TokenBucket } from './tokenBucket.js';

/*
 * Estado do jogo em memória e regras do tempo real. Não sabe nada de rede: recebe
 * texto, devolve texto por uma `Connection`. Por isso dá para testar sem socket.
 *
 * Movimento AUTORITATIVO: o cliente manda só a direção do joystick (`move {dx, dy}`).
 * A cada tick (50 ms) o servidor anda cada jogador na velocidade do jogo e envia
 * UMA posição por jogador que andou. O cliente nunca informa a própria posição, então
 * não existe speed hack nem teleporte, e 1000 mensagens por segundo continuam gerando
 * no máximo 20 avisos por segundo.
 */

/** O que o mundo precisa de uma conexão. O WebSocket do `ws` satisfaz isto. */
export interface Connection {
  send(data: string): void;
  close(code: number, reason: string): void;
  readonly bufferedAmount: number;
}

export interface WorldLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

/** Estado de um jogador online. É o valor do Map playerId -> estado. */
interface Session {
  readonly id: string;
  readonly username: string;
  readonly conn: Connection;
  x: number;
  y: number;
  /** Direção atual (joystick), já normalizada: |(dx, dy)| <= 1. */
  dx: number;
  dy: number;
  /** Último tick em que a posição mudou (ms). */
  lastUpdate: number;
  readonly messages: TokenBucket;
  readonly chat: TokenBucket;
  dropWindowStart: number;
  dropped: number;
  /** Posição mudou desde o último envio. */
  dirty: boolean;
  closed: boolean;
}

/** Devolvido pelo `join`: o gateway entrega as mensagens e o fechamento desta conexão. */
export interface SessionHandle {
  receive(data: string | Buffer, isBinary?: boolean): void;
  leave(): void;
}

const silent: WorldLogger = { info() {}, warn() {} };

/** Posição na rede com 2 casas decimais: mensagens curtas. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export class GameWorld {
  private readonly sessions = new Map<string, Session>();
  private readonly pendingKicks: { session: Session; close: { code: number; reason: string } }[] = [];
  private timer: NodeJS.Timeout | undefined;
  private lastTick: number;

  constructor(
    private readonly config: RealtimeConfig = REALTIME,
    private readonly now: () => number = Date.now,
    private readonly log: WorldLogger = silent,
  ) {
    this.lastTick = now();
  }

  get online(): number {
    return this.sessions.size;
  }

  /** Lista dos jogadores online (para testes e diagnóstico). */
  players(): PlayerView[] {
    return [...this.sessions.values()].map(view);
  }

  private worldInfo(): WorldInfo {
    const { world, speedTilesPerSecond, tickMs } = this.config;
    return { width: world.width, height: world.height, speed: speedTilesPerSecond, tickMs };
  }

  /**
   * Jogador conectou. Recebe `welcome` com a própria posição, os OUTROS online e os dados
   * do mundo; os outros recebem `player_joined`. Se o mesmo jogador já estava conectado,
   * a conexão antiga é fechada (4000) e a nova herda a posição: ninguém vê ele sair e entrar.
   */
  join(player: { id: string; username: string }, conn: Connection): SessionHandle {
    const t = this.now();
    const previous = this.sessions.get(player.id);
    const session: Session = {
      id: player.id,
      username: player.username,
      conn,
      x: previous?.x ?? this.config.spawn.x,
      y: previous?.y ?? this.config.spawn.y,
      dx: 0,
      dy: 0,
      lastUpdate: t,
      messages: new TokenBucket(this.config.messageBurst, this.config.messagesPerSecond, t),
      chat: new TokenBucket(this.config.chatBurst, this.config.chatPerSecond, t),
      dropWindowStart: t,
      dropped: 0,
      dirty: false,
      closed: false,
    };

    if (previous) {
      previous.closed = true;
      this.sessions.set(player.id, session);
      safeClose(previous.conn, CLOSE.REPLACED);
      this.log.info({ playerId: player.id }, 'jogador reconectou; conexão antiga fechada');
    } else {
      this.sessions.set(player.id, session);
      this.broadcast({ type: 'player_joined', player: view(session) }, session.id);
      this.log.info({ playerId: player.id, online: this.sessions.size }, 'jogador entrou');
    }

    const others = [...this.sessions.values()].filter((s) => s !== session).map(view);
    this.sendTo(session, { type: 'welcome', you: view(session), players: others, world: this.worldInfo() });
    this.flushKicks();

    return {
      receive: (data, isBinary = false) => this.receive(session, data, isBinary),
      leave: () => this.leave(session),
    };
  }

  /** Conexão fechou. Idempotente; só remove se ainda for a sessão atual do jogador. */
  private leave(session: Session): void {
    session.closed = true;
    if (this.sessions.get(session.id) !== session) return;
    this.sessions.delete(session.id);
    this.broadcast({ type: 'player_left', playerId: session.id });
    this.log.info({ playerId: session.id, online: this.sessions.size }, 'jogador saiu');
    this.flushKicks();
  }

  /** Uma mensagem do cliente. Primeiro o anti-flood (barato), depois o JSON. */
  private receive(session: Session, data: string | Buffer, isBinary: boolean): void {
    if (session.closed) return;
    const t = this.now();

    if (!session.messages.take(t)) {
      if (t - session.dropWindowStart >= 1000) {
        session.dropWindowStart = t;
        session.dropped = 0;
      }
      session.dropped += 1;
      if (session.dropped > this.config.maxDroppedPerSecond) {
        this.log.warn({ playerId: session.id }, 'flood: conexão fechada');
        this.kick(session, CLOSE.FLOOD);
        this.flushKicks();
      }
      return;   // descartada sem resposta: responder cada uma amplificaria o flood
    }

    let parsed: ClientMessage | undefined;
    if (!isBinary) {
      try {
        const result = ClientMessage.safeParse(JSON.parse(typeof data === 'string' ? data : data.toString('utf8')));
        if (result.success) parsed = result.data;
      } catch {
        // JSON malformado: cai no erro abaixo
      }
    }
    if (!parsed) {
      this.sendError(session, 'INVALID_MESSAGE');
    } else if (parsed.type === 'move') {
      this.setDirection(session, parsed.dx, parsed.dy);
    } else if (parsed.type === 'chat') {
      this.chatMessage(session, parsed.message, t);
    }
    // 'cast': validado (habilidade existe) e aceito. Combate ainda não existe; quando existir, entra aqui.
    this.flushKicks();
  }

  /** Só guarda a direção; quem anda é o tick. Diagonal (1, 1) vira (0,71; 0,71): mesma velocidade. */
  private setDirection(session: Session, dx: number, dy: number): void {
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    session.dx = dx * scale;
    session.dy = dy * scale;
  }

  private chatMessage(session: Session, raw: string, t: number): void {
    if (!session.chat.take(t)) {
      this.sendError(session, 'CHAT_RATE_LIMITED');
      return;
    }
    const message = sanitizeChat(raw, this.config.chatMaxLength);
    if (message === undefined) {
      this.sendError(session, 'CHAT_INVALID');
      return;
    }
    this.broadcast({ type: 'chat', playerId: session.id, username: session.username, message });
  }

  /**
   * Um tick do game loop: anda quem tem direção (velocidade × tempo desde o último tick,
   * sem sair do mapa) e envia a posição nova de cada um que andou, para TODOS (quem andou
   * também recebe, para corrigir a previsão do próprio cliente). Devolve quantos andaram.
   */
  tick(): number {
    const t = this.now();
    const dt = Math.min(Math.max(0, t - this.lastTick), this.config.maxTickDtMs) / 1000;
    this.lastTick = t;
    const step = this.config.speedTilesPerSecond * dt;
    const { width, height } = this.config.world;

    let moved = 0;
    for (const session of this.sessions.values()) {
      if (session.closed) continue;
      if (session.dx !== 0 || session.dy !== 0) {
        const x = clamp(session.x + session.dx * step, 0, width);
        const y = clamp(session.y + session.dy * step, 0, height);
        if (x !== session.x || y !== session.y) {
          session.x = x;
          session.y = y;
          session.lastUpdate = t;
          session.dirty = true;
        }
      }
      if (!session.dirty) continue;
      session.dirty = false;
      moved += 1;
      this.broadcast({ type: 'player_moved', playerId: session.id, x: round2(session.x), y: round2(session.y) });
    }
    this.flushKicks();
    return moved;
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = this.now();
    this.timer = setInterval(() => this.tick(), this.config.tickMs);
    this.timer.unref();
  }

  /** Para o loop e fecha todo mundo (deploy/reinício do Render). */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const session of this.sessions.values()) {
      session.closed = true;
      safeClose(session.conn, CLOSE.SHUTDOWN);
    }
    this.sessions.clear();
  }

  // ---------------------------------------------------------------- envio

  /** Serializa UMA vez e manda para todos (menos `exceptId`). */
  private broadcast(message: ServerMessage, exceptId?: string): void {
    const data = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.id !== exceptId) this.sendRaw(session, data);
    }
  }

  private sendTo(session: Session, message: ServerMessage): void {
    this.sendRaw(session, JSON.stringify(message));
  }

  private sendError(session: Session, code: RealtimeErrorCode): void {
    this.sendTo(session, { type: 'error', code, message: REALTIME_ERRORS[code] });
  }

  /** Cliente que não lê o que mandamos acumula fila: acima do teto, é desconectado. */
  private sendRaw(session: Session, data: string): void {
    if (session.closed) return;
    if (session.conn.bufferedAmount > this.config.maxBufferedBytes) {
      this.kick(session, CLOSE.SLOW_CONSUMER);
      return;
    }
    try {
      session.conn.send(data);
    } catch {
      this.kick(session, CLOSE.SLOW_CONSUMER);
    }
  }

  /** Expulsões ficam numa fila e rodam depois do envio em andamento (sem recursão no broadcast). */
  private kick(session: Session, close: { code: number; reason: string }): void {
    if (session.closed) return;
    session.closed = true;
    this.pendingKicks.push({ session, close });
  }

  private flushKicks(): void {
    while (this.pendingKicks.length > 0) {
      const { session, close } = this.pendingKicks.shift()!;
      safeClose(session.conn, close);
      if (this.sessions.get(session.id) === session) {
        this.sessions.delete(session.id);
        this.broadcast({ type: 'player_left', playerId: session.id });
        this.log.info({ playerId: session.id, code: close.code }, 'jogador desconectado pelo servidor');
      }
    }
  }
}

function view(s: Session): PlayerView {
  return { id: s.id, username: s.username, x: round2(s.x), y: round2(s.y) };
}

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

function safeClose(conn: Connection, close: { code: number; reason: string }): void {
  try {
    conn.close(close.code, close.reason);
  } catch {
    // conexão já estava fechando
  }
}
