import { distance, inCone, nearest, randomInRing, shieldedDamage, STEPS, type Point } from './combat.js';
import { REALTIME, type RealtimeConfig } from './config.js';
import {
  CLOSE, ClientMessage, REALTIME_ERRORS, sanitizeChat,
  type CastFailReason, type MonsterView, type PlayerView, type RankView,
  type RealtimeErrorCode, type SelfView, type ServerMessage, type Skill, type WorldInfo,
} from './protocol.js';
import { TokenBucket } from './tokenBucket.js';

/*
 * Estado do jogo em memória e regras do tempo real. Não sabe nada de rede: recebe
 * texto, devolve texto por uma `Connection`. Por isso dá para testar sem socket.
 *
 * O SERVIDOR É A AUTORIDADE. O cliente só pede ("anda para lá", "usa Fogo", "renascer");
 * posição, acerto, dano, morte e XP são calculados aqui. Não existe mensagem do cliente
 * que diga quanto dano deu ou quanta vida tem.
 *
 * Game loop (tick de 50 ms): anda os jogadores, regenera HP/chakra, move e faz os
 * monstros atacarem, e envia só o que mudou.
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

/** Grava XP no banco (e promove de rank quando atingir o limite). Ver progression.ts. */
export interface Progression {
  grantXp(playerId: string, amount: number): Promise<{ totalXp: number; rank: RankView; promoted: boolean } | undefined>;
}

export interface WorldOptions {
  /** Sorteio (posições e passos dos monstros). Injetável para teste. */
  random?: () => number;
  progression?: Progression;
}

export interface JoiningPlayer {
  id: string;
  username: string;
  xp?: number;
  rank?: RankView;
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
  /** Para onde está virado (última direção usada): mira o cone da Água. */
  fx: number;
  fy: number;
  lastUpdate: number;
  hp: number;
  chakra: number;
  /** Escudo de Pedra: fração do próximo dano que some (0 = sem escudo). */
  shield: number;
  dead: boolean;
  deadAt: number;
  /** skill -> instante em que fica pronta de novo */
  cooldowns: Partial<Record<Skill, number>>;
  xp: number;
  rank: RankView;
  /** Últimos valores enviados (para mandar só quando muda). */
  sentStats: string;
  lastStatsAt: number;
  sentHp: number;
  lastHpAt: number;
  readonly messages: TokenBucket;
  readonly chat: TokenBucket;
  dropWindowStart: number;
  dropped: number;
  /** Posição mudou desde o último envio. */
  dirty: boolean;
  closed: boolean;
}

interface Monster {
  readonly id: string;
  readonly type: string;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  nextStepAt: number;
  nextAttackAt: number;
  stunnedUntil: number;
  rootedUntil: number;
}

/** Devolvido pelo `join`: o gateway entrega as mensagens e o fechamento desta conexão. */
export interface SessionHandle {
  receive(data: string | Buffer, isBinary?: boolean): void;
  leave(): void;
}

const silent: WorldLogger = { info() {}, warn() {} };
const DEFAULT_RANK: RankView = { code: 'ACADEMY', name: 'Academia' };

/** Posição na rede com 2 casas decimais: mensagens curtas. */
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Vida mostrada: arredonda para cima (0,4 de vida ainda é "vivo com 1"). */
const shownHp = (hp: number) => Math.ceil(hp);

export class GameWorld {
  private readonly sessions = new Map<string, Session>();
  private readonly monsters = new Map<string, Monster>();
  private readonly pendingKicks: { session: Session; close: { code: number; reason: string } }[] = [];
  private readonly random: () => number;
  private readonly progression: Progression | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastTick: number;
  private monsterSeq = 0;

  constructor(
    private readonly config: RealtimeConfig = REALTIME,
    private readonly now: () => number = Date.now,
    private readonly log: WorldLogger = silent,
    options: WorldOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.progression = options.progression;
    this.lastTick = now();
    while (this.monsters.size < this.config.combat.monsters.count) this.spawnMonster();
  }

  get online(): number {
    return this.sessions.size;
  }

  /** Jogadores online (para testes e diagnóstico). */
  players(): PlayerView[] {
    return [...this.sessions.values()].map((s) => this.view(s));
  }

  private selfView(s: Session): SelfView {
    const p = this.config.combat.player;
    return { ...this.view(s), chakra: Math.floor(s.chakra), maxChakra: p.maxChakra, shield: s.shield > 0, xp: s.xp, rank: s.rank };
  }

  private view(s: Session): PlayerView {
    return { id: s.id, username: s.username, x: round2(s.x), y: round2(s.y), hp: shownHp(s.hp), maxHp: this.config.combat.player.maxHp, dead: s.dead };
  }

  monsterList(): MonsterView[] {
    return [...this.monsters.values()].map(monsterView);
  }

  private worldInfo(): WorldInfo {
    const { world, speedTilesPerSecond, tickMs, spawn, combat } = this.config;
    const skills = Object.fromEntries(
      Object.entries(combat.skills).map(([k, v]) => [k, { cost: v.cost, cooldownMs: v.cooldownMs }]),
    ) as WorldInfo['skills'];
    return {
      width: world.width, height: world.height, speed: speedTilesPerSecond, tickMs, spawn: { ...spawn },
      respawnMs: combat.player.respawnMs, skills, promotion: { ...combat.promotion },
    };
  }

  /**
   * Jogador conectou. Recebe `welcome` com o próprio estado, os OUTROS online, os monstros e
   * os dados do mundo; os outros recebem `player_joined`. Se o mesmo jogador já estava
   * conectado, a conexão antiga é fechada (4000) e a nova herda posição, vida, chakra e
   * até a morte: reconectar não cura ninguém.
   */
  join(player: JoiningPlayer, conn: Connection): SessionHandle {
    const t = this.now();
    const p = this.config.combat.player;
    const previous = this.sessions.get(player.id);
    const session: Session = {
      id: player.id,
      username: player.username,
      conn,
      x: previous?.x ?? this.config.spawn.x,
      y: previous?.y ?? this.config.spawn.y,
      dx: 0,
      dy: 0,
      fx: previous?.fx ?? 0,
      fy: previous?.fy ?? 1,
      lastUpdate: t,
      hp: previous?.hp ?? p.maxHp,
      chakra: previous?.chakra ?? p.maxChakra,
      shield: previous?.shield ?? 0,
      dead: previous?.dead ?? false,
      deadAt: previous?.deadAt ?? 0,
      cooldowns: { ...(previous?.cooldowns ?? {}) },
      xp: player.xp ?? previous?.xp ?? 0,
      rank: player.rank ?? previous?.rank ?? DEFAULT_RANK,
      sentStats: '',
      lastStatsAt: t,
      sentHp: 0,
      lastHpAt: t,
      messages: new TokenBucket(this.config.messageBurst, this.config.messagesPerSecond, t),
      chat: new TokenBucket(this.config.chatBurst, this.config.chatPerSecond, t),
      dropWindowStart: t,
      dropped: 0,
      dirty: false,
      closed: false,
    };
    session.sentStats = statsKey(session);
    session.sentHp = shownHp(session.hp);

    if (previous) {
      previous.closed = true;
      this.sessions.set(player.id, session);
      safeClose(previous.conn, CLOSE.REPLACED);
      this.log.info({ playerId: player.id }, 'jogador reconectou; conexão antiga fechada');
    } else {
      this.sessions.set(player.id, session);
      this.broadcast({ type: 'player_joined', player: this.view(session) }, session.id);
      this.log.info({ playerId: player.id, online: this.sessions.size }, 'jogador entrou');
    }

    const others = [...this.sessions.values()].filter((s) => s !== session).map((s) => this.view(s));
    this.sendTo(session, { type: 'welcome', you: this.selfView(session), players: others, monsters: this.monsterList(), world: this.worldInfo() });
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
    if (!parsed) this.sendError(session, 'INVALID_MESSAGE');
    else if (parsed.type === 'move') this.setDirection(session, parsed.dx, parsed.dy);
    else if (parsed.type === 'cast') this.cast(session, parsed.skill, t);
    else if (parsed.type === 'respawn') this.respawn(session, t);
    else this.chatMessage(session, parsed.message, t);
    this.flushKicks();
  }

  /** Só guarda a direção; quem anda é o tick. Diagonal (1, 1) vira (0,71; 0,71): mesma velocidade. */
  private setDirection(session: Session, dx: number, dy: number): void {
    if (session.dead) return;             // morto não anda
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    session.dx = dx * scale;
    session.dy = dy * scale;
    if (length > 0) {
      session.fx = dx / length;
      session.fy = dy / length;
    }
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

  // ---------------------------------------------------------------- combate

  /**
   * Habilidade. Ordem: vivo? recarregou? tem chakra? tem alvo/efeito? Só então cobra o
   * chakra, avisa todos (`cast`, para a animação) e aplica o efeito. Falhou antes de
   * cobrar: `cast_failed` só para quem tentou, sem gastar nada.
   */
  private cast(session: Session, skill: Skill, t: number): void {
    const cfg = this.config.combat.skills[skill];
    const fail = (reason: CastFailReason) => this.sendTo(session, { type: 'cast_failed', skill, reason });
    if (session.dead) return fail('DEAD');
    if ((session.cooldowns[skill] ?? 0) > t) return fail('COOLDOWN');
    if (session.chakra < cfg.cost) return fail('NO_CHAKRA');

    const alive = (m: Monster) => m.hp > 0;
    let target: Monster | undefined;
    if (skill === 'taijutsu' || skill === 'illusion' || skill === 'shadow') {
      target = nearest(session, this.monsters.values(), cfg.range ?? 0, alive);
      if (!target) return fail('NO_TARGET');
    }
    if (skill === 'heal' && session.hp >= this.config.combat.player.maxHp) return fail('FULL_HP');
    if (skill === 'stone' && session.shield > 0) return fail('ALREADY_ACTIVE');

    session.chakra -= cfg.cost;
    session.cooldowns[skill] = t + cfg.cooldownMs;
    this.broadcast({ type: 'cast', playerId: session.id, skill, x: round2(session.x), y: round2(session.y), fx: round2(session.fx), fy: round2(session.fy) });

    switch (skill) {
      case 'fire':
        for (const m of [...this.monsters.values()]) {
          if (alive(m) && distance(session, m) <= (cfg.radius ?? 0)) this.damageMonster(m, cfg.damage ?? 0, session, t);
        }
        break;
      case 'water':
        for (const m of [...this.monsters.values()]) {
          if (alive(m) && inCone(session, session.fx, session.fy, m, cfg.range ?? 0, cfg.coneDeg ?? 90)) this.damageMonster(m, cfg.damage ?? 0, session, t);
        }
        break;
      case 'taijutsu':
        this.damageMonster(target!, cfg.damage ?? 0, session, t);
        break;
      case 'illusion':
        target!.stunnedUntil = t + (cfg.stunMs ?? 0);
        this.broadcast({ type: 'monster_status', id: target!.id, status: 'stunned', ms: cfg.stunMs ?? 0 });
        break;
      case 'shadow':
        target!.rootedUntil = t + (cfg.rootMs ?? 0);
        this.broadcast({ type: 'monster_status', id: target!.id, status: 'rooted', ms: cfg.rootMs ?? 0 });
        break;
      case 'stone':
        session.shield = cfg.reduction ?? 0.5;
        break;
      case 'heal': {
        const before = session.hp;
        session.hp = Math.min(this.config.combat.player.maxHp, session.hp + (cfg.heal ?? 0));
        const amount = shownHp(session.hp) - shownHp(before);
        this.broadcast({ type: 'hit', target: 'player', id: session.id, amount, kind: 'heal', hp: shownHp(session.hp), maxHp: this.config.combat.player.maxHp });
        session.sentHp = shownHp(session.hp);
        break;
      }
      default:
        break;
    }
    this.sendStats(session, t);
  }

  private damageMonster(m: Monster, amount: number, attacker: Session, t: number): void {
    m.hp = Math.max(0, m.hp - amount);
    this.broadcast({ type: 'hit', target: 'monster', id: m.id, amount, kind: 'damage', hp: m.hp, maxHp: m.maxHp });
    if (m.hp === 0) this.killMonster(m, attacker, t);
  }

  /** Último golpe ganha o XP. Um monstro novo nasce na hora: sempre 5 vivos. */
  private killMonster(m: Monster, killer: Session, t: number): void {
    this.monsters.delete(m.id);
    this.broadcast({ type: 'monster_died', id: m.id, killerId: killer.id });
    if (this.monsters.size < this.config.combat.monsters.count) this.spawnMonster(undefined, t);
    this.awardXp(killer, this.config.combat.monsters.xp);
  }

  /** XP vai para o banco (fora do loop: o tick nunca espera o banco). O aviso só sai depois de gravado. */
  private awardXp(killer: Session, amount: number): void {
    if (!this.progression) return;
    const { id, username } = killer;
    this.progression.grantXp(id, amount).then((result) => {
      if (!result) return;
      const session = this.sessions.get(id);
      if (session) {
        session.xp = result.totalXp;
        session.rank = result.rank;
        this.sendTo(session, { type: 'xp', gained: amount, totalXp: result.totalXp, rank: result.rank, promoted: result.promoted });
      }
      if (result.promoted) {
        this.broadcast({ type: 'announce', message: `${username} subiu para ${result.rank.name}!` });
        this.log.info({ playerId: id, rank: result.rank.code }, 'jogador subiu de rank');
      }
      this.flushKicks();
    }).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha ao gravar XP no banco');
    });
  }

  private damagePlayer(session: Session, amount: number, t: number): void {
    let dmg = amount;
    let shielded = false;
    if (session.shield > 0) {
      dmg = shieldedDamage(amount, session.shield);
      session.shield = 0;
      shielded = true;
    }
    session.hp = Math.max(0, session.hp - dmg);
    const maxHp = this.config.combat.player.maxHp;
    this.broadcast({ type: 'hit', target: 'player', id: session.id, amount: dmg, kind: 'damage', hp: shownHp(session.hp), maxHp, ...(shielded ? { shielded: true } : {}) });
    session.sentHp = shownHp(session.hp);
    if (session.hp <= 0) {
      session.dead = true;
      session.deadAt = t;
      session.dx = 0;
      session.dy = 0;
      session.shield = 0;
      this.broadcast({ type: 'player_died', playerId: session.id, respawnInMs: this.config.combat.player.respawnMs });
    }
    this.sendStats(session, t);
  }

  /** Renascer: só morto e só depois do tempo. Volta ao centro com vida e chakra cheios. */
  private respawn(session: Session, t: number): void {
    const p = this.config.combat.player;
    if (!session.dead || t - session.deadAt < p.respawnMs) {
      this.sendError(session, 'RESPAWN_NOT_READY');
      return;
    }
    session.dead = false;
    session.hp = p.maxHp;
    session.chakra = p.maxChakra;
    session.shield = 0;
    session.cooldowns = {};
    session.x = this.config.spawn.x;
    session.y = this.config.spawn.y;
    session.dx = 0;
    session.dy = 0;
    session.sentHp = p.maxHp;
    this.broadcast({ type: 'player_respawned', playerId: session.id, x: session.x, y: session.y, hp: p.maxHp, maxHp: p.maxHp });
    this.sendStats(session, t);
  }

  private sendStats(session: Session, t: number): void {
    const p = this.config.combat.player;
    session.sentStats = statsKey(session);
    session.lastStatsAt = t;
    this.sendTo(session, { type: 'stats', hp: shownHp(session.hp), maxHp: p.maxHp, chakra: Math.floor(session.chakra), maxChakra: p.maxChakra, shield: session.shield > 0 });
  }

  /** Cria um monstro numa casa livre da zona de caça (longe dos jogadores). Exposto para testes. */
  spawnMonster(at?: Point, t: number = this.now()): MonsterView {
    const cfg = this.config.combat.monsters;
    let pos = at;
    for (let i = 0; !pos && i < 20; i++) {
      const candidate = this.clampToWorld(randomInRing(this.config.spawn, cfg.safeRadius, cfg.zoneRadius, this.random));
      const tooClose = [...this.sessions.values()].some((s) => !s.dead && distance(s, candidate) < cfg.minPlayerDistance);
      if (!tooClose || i === 19) pos = candidate;
    }
    const m: Monster = {
      id: `m${++this.monsterSeq}`,
      type: cfg.type,
      x: pos!.x,
      y: pos!.y,
      hp: cfg.maxHp,
      maxHp: cfg.maxHp,
      nextStepAt: t + cfg.stepMs * (0.5 + this.random()),
      nextAttackAt: t,
      stunnedUntil: 0,
      rootedUntil: 0,
    };
    this.monsters.set(m.id, m);
    if (this.sessions.size > 0) this.broadcast({ type: 'monster_spawned', monster: monsterView(m) });
    return monsterView(m);
  }

  private clampToWorld(p: Point): Point {
    return { x: Math.min(this.config.world.width - 1, Math.max(0, p.x)), y: Math.min(this.config.world.height - 1, Math.max(0, p.y)) };
  }

  /** Andar aleatório: 1 casa (ou parado) a cada ~1 s, sem sair da zona de caça. */
  private stepMonster(m: Monster, t: number): boolean {
    const cfg = this.config.combat.monsters;
    m.nextStepAt = t + cfg.stepMs * (0.8 + this.random() * 0.4);
    if (t < m.stunnedUntil || t < m.rootedUntil) return false;   // atordoado ou preso: não anda
    if (this.random() < 0.2) return false;                         // às vezes fica parado
    for (let attempt = 0; attempt < 4; attempt++) {
      const [sx, sy] = STEPS[Math.floor(this.random() * STEPS.length)]!;
      const next = { x: m.x + sx, y: m.y + sy };
      const d = distance(next, this.config.spawn);
      if (d >= cfg.safeRadius && d <= cfg.zoneRadius && next.x >= 0 && next.y >= 0 && next.x < this.config.world.width && next.y < this.config.world.height) {
        m.x = next.x;
        m.y = next.y;
        return true;
      }
    }
    return false;
  }

  /** Monstro bate em quem está colado (o mais perto), no máximo a cada 2 s. Atordoado não ataca. */
  private monsterAttack(m: Monster, t: number): void {
    const cfg = this.config.combat.monsters;
    if (t < m.nextAttackAt || t < m.stunnedUntil) return;
    const target = nearest(m, this.sessions.values(), cfg.attackRange, (s) => !s.dead && !s.closed);
    if (!target) return;
    m.nextAttackAt = t + cfg.attackEveryMs;
    this.damagePlayer(target, cfg.attackDamage, t);
  }

  // ---------------------------------------------------------------- game loop

  /**
   * Um tick: anda os jogadores, regenera HP e chakra, move os monstros e faz eles atacarem,
   * e envia as mudanças (posições de quem andou para todos; HP/chakra para o dono;
   * barrinha de vida dos outros no máximo 1x por segundo). Devolve quantos jogadores andaram.
   */
  tick(): number {
    const t = this.now();
    const dtMs = Math.min(Math.max(0, t - this.lastTick), this.config.maxTickDtMs);
    const dt = dtMs / 1000;
    this.lastTick = t;
    const step = this.config.speedTilesPerSecond * dt;
    const { width, height } = this.config.world;
    const p = this.config.combat.player;

    // 1. Jogadores: movimento e regeneração.
    for (const s of this.sessions.values()) {
      if (s.closed || s.dead) continue;
      if (s.dx !== 0 || s.dy !== 0) {
        const x = clamp(s.x + s.dx * step, 0, width);
        const y = clamp(s.y + s.dy * step, 0, height);
        if (x !== s.x || y !== s.y) {
          s.x = x;
          s.y = y;
          s.lastUpdate = t;
          s.dirty = true;
        }
      }
      s.hp = Math.min(p.maxHp, s.hp + p.hpRegenPerSec * dt);
      s.chakra = Math.min(p.maxChakra, s.chakra + p.chakraRegenPerSec * dt);
    }

    // 2. Monstros: andar e atacar.
    const moved: [string, number, number][] = [];
    for (const m of this.monsters.values()) {
      if (t >= m.nextStepAt && this.stepMonster(m, t)) moved.push([m.id, m.x, m.y]);
      this.monsterAttack(m, t);
    }
    if (moved.length > 0) this.broadcast({ type: 'monsters_moved', m: moved });

    // 3. Envios.
    let movedPlayers = 0;
    for (const s of this.sessions.values()) {
      if (s.closed) continue;
      if (s.dirty) {
        s.dirty = false;
        movedPlayers += 1;
        this.broadcast({ type: 'player_moved', playerId: s.id, x: round2(s.x), y: round2(s.y) });
      }
      if (statsKey(s) !== s.sentStats && t - s.lastStatsAt >= this.config.combat.statsEveryMs) this.sendStats(s, t);
      const hp = shownHp(s.hp);
      if (hp !== s.sentHp && t - s.lastHpAt >= 1000) {
        s.sentHp = hp;
        s.lastHpAt = t;
        this.broadcast({ type: 'player_hp', playerId: s.id, hp, maxHp: p.maxHp }, s.id);
      }
    }
    this.flushKicks();
    return movedPlayers;
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


function monsterView(m: Monster): MonsterView {
  return { id: m.id, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp };
}

/** O que o dono vê nas barras (muda = manda `stats`). */
function statsKey(s: Session): string {
  return `${shownHp(s.hp)}|${Math.floor(s.chakra)}|${s.shield > 0 ? 1 : 0}`;
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
