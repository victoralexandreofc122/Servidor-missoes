import { REALTIME, type RealtimeConfig } from './config.js';
import { CLOSE, ClientMessage, REALTIME_ERRORS, sanitizeChat, type PlayerView, type RealtimeErrorCode, type ServerMessage } from './protocol.js';
import { TokenBucket } from './tokenBucket.js';

/*
 * Estado do jogo em memória e regras do tempo real. Não sabe nada de rede: recebe
 * texto, devolve texto por uma `Connection`. Por isso dá para testar sem socket.
 *
 * Game loop: movimentos aceitos só marcam o jogador como "mudou"; a cada tick (50 ms)
 * o servidor envia UMA posição por jogador que mudou. Quem manda 1000 passos por
 * segundo continua gerando no máximo 20 avisos por segundo para os outros.
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
  /** Último movimento aceito (ms). */
  lastUpdate: number;
  /** Casas que ainda pode andar agora (anti speed hack). */
  moveBudget: number;
  moveBudgetAt: number;
  readonly messages: TokenBucket;
  readonly chat: TokenBucket;
  dropWindowStart: number;
  dropped: number;
  /** Posição mudou desde o último tick. */
  dirty: boolean;
  closed: boolean;
}

/** Devolvido pelo `join`: o gateway entrega as mensagens e o fechamento desta conexão. */
export interface SessionHandle {
  receive(data: string | Buffer, isBinary?: boolean): void;
  leave(): void;
}

const silent: WorldLogger = { info() {}, warn() {} };

export class GameWorld {
  private readonly sessions = new Map<string, Session>();
  private readonly pendingKicks: { session: Session; close: { code: number; reason: string } }[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: RealtimeConfig = REALTIME,
    private readonly now: () => number = Date.now,
    private readonly log: WorldLogger = silent,
  ) {}

  get online(): number {
    return this.sessions.size;
  }

  /** Lista dos jogadores online (para testes e diagnóstico). */
  players(): PlayerView[] {
    return [...this.sessions.values()].map(view);
  }

  /**
   * Jogador conectou. Recebe `welcome` com a própria posição e os OUTROS online;
   * os outros recebem `player_joined`. Se o mesmo jogador já estava conectado, a conexão
   * antiga é fechada (4000) e a nova herda a posição: ninguém vê ele sair e entrar.
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
      lastUpdate: t,
      moveBudget: this.config.maxMoveBurstTiles,
      moveBudgetAt: t,
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
    this.sendTo(session, { type: 'welcome', you: view(session), players: others });
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
      this.move(session, parsed.x, parsed.y, t);
    } else {
      this.chatMessage(session, parsed.message, t);
    }
    this.flushKicks();
  }

  private move(session: Session, x: number, y: number, t: number): void {
    const { width, height } = this.config.world;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      this.sendTo(session, { type: 'move_rejected', x: session.x, y: session.y, reason: 'OUT_OF_BOUNDS' });
      return;
    }
    // Orçamento de passos: recarrega pela velocidade máxima, até o teto de rajada.
    const refill = ((t - session.moveBudgetAt) / 1000) * this.config.maxSpeedTilesPerSecond;
    session.moveBudget = Math.min(this.config.maxMoveBurstTiles, session.moveBudget + Math.max(0, refill));
    session.moveBudgetAt = t;

    const distance = Math.hypot(x - session.x, y - session.y);
    if (distance === 0) return;
    if (distance > session.moveBudget + 1e-9) {
      this.sendTo(session, { type: 'move_rejected', x: session.x, y: session.y, reason: 'TOO_FAST' });
      return;
    }
    session.moveBudget -= distance;
    session.x = x;
    session.y = y;
    session.lastUpdate = t;
    session.dirty = true;
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

  /** Um tick do game loop: envia a posição nova de quem andou. Devolve quantos andaram. */
  tick(): number {
    let moved = 0;
    for (const session of this.sessions.values()) {
      if (!session.dirty || session.closed) continue;
      session.dirty = false;
      moved += 1;
      this.broadcast({ type: 'player_moved', playerId: session.id, x: session.x, y: session.y }, session.id);
    }
    this.flushKicks();
    return moved;
  }

  start(): void {
    if (this.timer) return;
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
  return { id: s.id, username: s.username, x: s.x, y: s.y };
}

function safeClose(conn: Connection, close: { code: number; reason: string }): void {
  try {
    conn.close(close.code, close.reason);
  } catch {
    // conexão já estava fechando
  }
}
