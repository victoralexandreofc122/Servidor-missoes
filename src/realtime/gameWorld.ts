import { distance, inCone, nearest, shieldedDamage, STEPS, type Point } from './combat.js';
import { REALTIME, type RealtimeConfig } from './config.js';
import {
  CLOSE, ClientMessage, DIRECTED_SKILLS, REALTIME_ERRORS, SKILLS, sanitizeChat,
  type CastFailReason, type KitName, type KitView, type Kits, type MeditationEnd, type MissionView, type MonsterView,
  type PlayerView, type ProgressView, type RankView, type RealtimeErrorCode, type SelfView, type ServerMessage,
  type Skill, type WorldInfo, type Appearance, type Dir,
} from './protocol.js';
import type { Missions, TalkOutcome } from './missions.js';
import type { Profile } from './profile.js';
import {
  damageMultiplier, derivedStats, levelProgress, NO_ATTRIBUTES, scaledDamage,
  type Attribute, type Attributes, type DerivedStats,
} from './stats.js';
import { blocked, moveStep } from './movement.js';
import { inSafeZone, type MapId, type MapLayout } from './maps.js';
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
 *
 * Mapas (salas): cada jogador e cada monstro está em UM mapa (Vila, Floresta). Posição,
 * combate e chat só vão para quem está no mesmo mapa. Andar até a saída de uma borda troca
 * de mapa (moveStep/crossExit, a mesma conta do cliente): só pelo portão, nunca por parede.
 *
 * Missões (NPC Mestre): o banco é a fonte da verdade (missions.ts). O mundo só decide
 * QUEM pode pedir (perto do NPC, vivo, sem pedido em andamento) e conta o abate quando
 * o próprio servidor mata o monstro. Não existe mensagem do cliente que mexa no progresso.
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

/** Resultado de gravar XP: total, rank (promoção) e nível (o trigger da v5 dá os pontos). */
export interface XpResult {
  totalXp: number;
  rank: RankView;
  promoted: boolean;
  level?: number;
  statPoints?: number;
  levelsGained?: number;
}

/** Grava XP no banco (e promove de rank quando atingir o limite). Ver progression.ts. */
export interface Progression {
  grantXp(playerId: string, amount: number): Promise<XpResult | undefined>;
}

/** Kits padrão (os mesmos DEFAULTs da migração v5). */
export const DEFAULT_KITS: Readonly<Kits> = { A: ['fire', 'water', 'taijutsu', 'heal'], B: ['illusion', 'shadow', 'stone', 'heal'] };

/** Visual de quem ainda não criou o personagem (os outros veem este boneco). */
export const DEFAULT_APPEARANCE: Readonly<Appearance> = { skin: '#f1c9a0', hair: '#2b2118', shirt: '#2f5d8a', pants: '#2a2a33', cape: '#8a2b2b' };

/** Direção do boneco a partir de para onde ele olha: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
export function dirOf(fx: number, fy: number): Dir {
  if (Math.abs(fx) > Math.abs(fy)) return fx < 0 ? 1 : 2;
  return fy < 0 ? 3 : 0;
}

const SKILL_SET: ReadonlySet<string> = new Set(SKILLS);
export function isSkillList(list: unknown): list is Skill[] {
  return Array.isArray(list) && list.length <= 4 && list.every((x) => SKILL_SET.has(x)) && new Set(list).size === list.length;
}

export interface WorldOptions {
  /** Sorteio (posições e passos dos monstros). Injetável para teste. */
  random?: () => number;
  progression?: Progression;
  /** Missões de sensei no banco (NPC Mestre, abates). Sem isto, o NPC aparece mas não passa missão. */
  missions?: Missions;
  /** Ficha no banco: gastar pontos e salvar kits. Sem isto, gastar/salvar dá PROFILE_UNAVAILABLE. */
  profile?: Profile;
}

export interface JoiningPlayer {
  id: string;
  username: string;
  xp?: number;
  rank?: RankView;
  canBeSensei?: boolean;
  level?: number;
  statPoints?: number;
  attributes?: Attributes;
  kits?: Kits;
  /** null = ainda não criou o personagem. */
  appearance?: Appearance | null;
}

/** Estado de um jogador online. É o valor do Map playerId -> estado. */
interface Session {
  readonly id: string;
  readonly username: string;
  readonly conn: Connection;
  /** Mapa onde está (posição x, y é dentro dele). */
  map: MapId;
  x: number;
  y: number;
  /** Direção "segurada" (mensagem move, sem predição), já normalizada: |(dx, dy)| <= 1. */
  dx: number;
  dy: number;
  /** Entradas do joystick com predição, na ordem, esperando o tick (1 entrada = 1 tick). */
  inputQueue: { seq: number; dx: number; dy: number }[];
  /** Maior número de entrada já recebido (repetidas são ignoradas). */
  lastQueuedSeq: number;
  /** Última entrada APLICADA: vai no player_moved (a) para o dono reconciliar. */
  ackSeq: number;
  /** Entradas descartadas (fila cheia) até este número: confirmadas quando a fila esvaziar. */
  droppedUpTo: number;
  /** Tempo real disponível para andar (ms). Cada passo gasta o seu tempo: ninguém anda mais rápido que o relógio. */
  moveBudgetMs: number;
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
  /** Meditando: parado, sem habilidades, chakra 3x mais rápido. Mover, atacar ou apanhar cancela. */
  meditating: boolean;
  /** Botão 🏃: corre (8) em vez de andar (5). */
  running: boolean;
  /** skill -> instante em que fica pronta de novo */
  cooldowns: Partial<Record<Skill | 'attack', number>>;
  xp: number;
  rank: RankView;
  canBeSensei: boolean;
  level: number;
  statPoints: number;
  attributes: Attributes;
  /** Vida/chakra máximos, velocidades e dano: sempre calculados aqui, dos atributos. */
  stats: DerivedStats;
  kits: Kits;
  activeKit: KitName;
  /** Visual (null = ainda não passou pelo Criador de Personagem). */
  appearance: Appearance | null;
  /**
   * Gravações de ficha (ponto, kit, visual) em FILA: uma por vez e no máximo 1 a cada
   * profileRequestEveryMs. Nada se perde se o jogador tocar "+" e "Salvar" em seguida;
   * acima de 5 na fila, recusa (PROFILE_BUSY) em vez de enfileirar sem fim.
   */
  profileBusy: boolean;
  lastProfileAt: number;
  profileQueue: ((profile: Profile) => Promise<void>)[];
  /** Últimos valores enviados (para mandar só quando muda). */
  sentStats: string;
  lastStatsAt: number;
  sentHp: number;
  lastHpAt: number;
  readonly messages: TokenBucket;
  readonly chat: TokenBucket;
  dropWindowStart: number;
  dropped: number;
  /** Pedido ao banco de missões em andamento (dois toques seguidos viram um). */
  missionBusy: boolean;
  lastMissionAt: number;
  /** Posição mudou desde o último envio. */
  dirty: boolean;
  closed: boolean;
}

interface Monster {
  readonly id: string;
  readonly type: string;
  readonly map: MapId;
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
/** Posição de JOGADOR com 3 casas: a mesma precisão da função de movimento (o cliente refaz a conta igual). */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Vida mostrada: arredonda para cima (0,4 de vida ainda é "vivo com 1"). */
const shownHp = (hp: number) => Math.ceil(hp);

export class GameWorld {
  private readonly sessions = new Map<string, Session>();
  private readonly monsters = new Map<string, Monster>();
  private readonly pendingKicks: { session: Session; close: { code: number; reason: string } }[] = [];
  private readonly random: () => number;
  private readonly progression: Progression | undefined;
  private readonly missions: Missions | undefined;
  private readonly profile: Profile | undefined;
  /** Quem está em cada mapa (envio só para o mesmo mapa sem percorrer todo mundo). */
  private readonly mapPlayers = new Map<MapId, Set<Session>>();
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
    this.missions = options.missions;
    this.profile = options.profile;
    for (const id of Object.keys(this.config.maps) as MapId[]) this.mapPlayers.set(id, new Set());
    this.lastTick = now();
    for (const layout of this.huntingMaps()) {
      while (this.monstersIn(layout.id).length < this.config.combat.monsters.count) this.spawnMonster(undefined, this.lastTick, layout.id);
    }
  }

  /** Está numa zona segura (sem combate)? Posição e mapa do servidor. */
  private inSafeZone(s: Session): boolean {
    return inSafeZone(this.layout(s.map), s.x, s.y);
  }

  /** Mapas com zona de caça (onde nascem monstros). */
  private huntingMaps(): MapLayout[] {
    return Object.values(this.config.maps).filter((m) => !m.safe && m.hunt);
  }

  private layout(id: MapId): MapLayout {
    return this.config.maps[id];
  }

  /** Monstros de um mapa (o que um jogador desse mapa vê). */
  private monstersIn(map: MapId): MonsterView[] {
    const out: MonsterView[] = [];
    for (const m of this.monsters.values()) if (m.map === map) out.push(monsterView(m));
    return out;
  }

  /** Os OUTROS jogadores no mesmo mapa. */
  private othersIn(session: Session): PlayerView[] {
    const out: PlayerView[] = [];
    for (const s of this.mapPlayers.get(session.map) ?? []) if (s !== session) out.push(this.view(s));
    return out;
  }

  get online(): number {
    return this.sessions.size;
  }

  /** Jogadores online (para testes e diagnóstico). */
  players(): PlayerView[] {
    return [...this.sessions.values()].map((s) => this.view(s));
  }

  private selfView(s: Session): SelfView {
    return {
      ...this.view(s), chakra: Math.floor(s.chakra), maxChakra: s.stats.maxChakra, shield: s.shield > 0, xp: s.xp,
      speed: this.speedOf(s), running: s.running, canBeSensei: s.canBeSensei, appearanceSet: s.appearance !== null,
    };
  }

  private view(s: Session): PlayerView {
    return {
      id: s.id, username: s.username, x: round3(s.x), y: round3(s.y), hp: shownHp(s.hp), maxHp: s.stats.maxHp,
      dead: s.dead, meditating: s.meditating, rank: s.rank, level: s.level,
      appearance: { ...(s.appearance ?? DEFAULT_APPEARANCE) }, dir: dirOf(s.fx, s.fy),
    };
  }

  /** Ficha: nível, XP do nível (zera a cada nível), pontos e o que os atributos dão. */
  private progressView(s: Session): ProgressView {
    const { xpInLevel, xpToNext } = levelProgress(s.xp, s.level);
    return {
      level: s.level, xpInLevel, xpToNext, totalXp: s.xp, statPoints: s.statPoints,
      attributes: { ...s.attributes }, maxPoints: this.config.combat.attributes.maxPoints, derived: { ...s.stats },
    };
  }

  private kitView(s: Session): KitView {
    return { active: s.activeKit, kits: { A: [...s.kits.A], B: [...s.kits.B] } };
  }

  private computeStats(attributes: Attributes): DerivedStats {
    const p = this.config.combat.player;
    return derivedStats(
      {
        maxHp: p.maxHp, maxChakra: p.maxChakra, meditationChakraPerSec: p.chakraRegenPerSec * p.meditationRegenMultiplier,
        walkSpeed: this.config.speedTilesPerSecond, runSpeed: this.config.runSpeedTilesPerSecond,
        attackCooldownMs: this.config.combat.basicAttack.cooldownMs,
      },
      this.config.combat.attributes, attributes,
    );
  }

  /** Velocidade atual (casas/s): andar ou correr, mais a agilidade. */
  private speedOf(s: Session): number {
    return s.running ? s.stats.runSpeed : s.stats.walkSpeed;
  }

  monsterList(): MonsterView[] {
    return [...this.monsters.values()].map(monsterView);
  }

  private worldInfo(map: MapId): WorldInfo {
    const { speedTilesPerSecond, tickMs, spawn, combat } = this.config;
    const here = this.layout(map);
    const skills = Object.fromEntries(
      Object.entries(combat.skills).map(([k, v]) => {
        const range = v.range ?? v.radius;
        return [k, { cost: v.cost, cooldownMs: v.cooldownMs, ...(range !== undefined ? { range } : {}) }];
      }),
    ) as WorldInfo['skills'];
    return {
      width: here.width, height: here.height, speed: speedTilesPerSecond, runSpeed: this.config.runSpeedTilesPerSecond,
      tickMs, spawn: { ...spawn }, respawnMs: combat.player.respawnMs, skills, promotion: { ...combat.promotion },
      meditationRegenMultiplier: combat.player.meditationRegenMultiplier,
      npcs: this.config.npcs.map((n) => ({ ...n })),
      basicAttack: { range: combat.basicAttack.range, cooldownMs: combat.basicAttack.cooldownMs },
      map,
      maps: this.config.maps as Record<MapId, MapLayout>,
      attributePerPoint: { ...combat.attributes.perPoint },
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
    const previous = this.sessions.get(player.id);
    const attributes = { ...(player.attributes ?? previous?.attributes ?? NO_ATTRIBUTES) };
    const stats = this.computeStats(attributes);
    const kits: Kits = player.kits ?? previous?.kits ?? DEFAULT_KITS;
    const session: Session = {
      id: player.id,
      username: player.username,
      conn,
      map: previous?.map ?? this.config.startMap,
      x: previous?.x ?? this.config.spawn.x,
      y: previous?.y ?? this.config.spawn.y,
      dx: 0,
      dy: 0,
      inputQueue: [],
      lastQueuedSeq: 0,
      ackSeq: 0,
      droppedUpTo: 0,
      moveBudgetMs: 0,
      fx: previous?.fx ?? 0,
      fy: previous?.fy ?? 1,
      lastUpdate: t,
      hp: Math.min(previous?.hp ?? stats.maxHp, stats.maxHp),
      chakra: Math.min(previous?.chakra ?? stats.maxChakra, stats.maxChakra),
      shield: previous?.shield ?? 0,
      dead: previous?.dead ?? false,
      meditating: false,
      running: previous?.running ?? false,
      deadAt: previous?.deadAt ?? 0,
      cooldowns: { ...(previous?.cooldowns ?? {}) },
      xp: player.xp ?? previous?.xp ?? 0,
      rank: player.rank ?? previous?.rank ?? DEFAULT_RANK,
      canBeSensei: player.canBeSensei ?? previous?.canBeSensei ?? false,
      level: player.level ?? previous?.level ?? 1,
      statPoints: player.statPoints ?? previous?.statPoints ?? 0,
      attributes,
      stats,
      kits: { A: [...kits.A], B: [...kits.B] },
      activeKit: previous?.activeKit ?? 'A',
      appearance: player.appearance !== undefined ? player.appearance : (previous?.appearance ?? null),
      profileBusy: false,
      lastProfileAt: 0,
      profileQueue: [],
      sentStats: '',
      lastStatsAt: t,
      sentHp: 0,
      lastHpAt: t,
      messages: new TokenBucket(this.config.messageBurst, this.config.messagesPerSecond, t),
      chat: new TokenBucket(this.config.chatBurst, this.config.chatPerSecond, t),
      dropWindowStart: t,
      dropped: 0,
      missionBusy: false,
      lastMissionAt: 0,
      dirty: false,
      closed: false,
    };
    session.sentStats = statsKey(session);
    session.sentHp = shownHp(session.hp);

    if (previous) {
      // A conexão nova começa sem meditar; se a antiga meditava, todos param de ver a aura.
      if (previous.meditating) this.broadcastMap(previous.map, { type: 'meditation', playerId: previous.id, active: false, reason: 'manual' });
      previous.closed = true;
      this.mapPlayers.get(previous.map)?.delete(previous);
      this.mapPlayers.get(session.map)!.add(session);
      this.sessions.set(player.id, session);
      safeClose(previous.conn, CLOSE.REPLACED);
      this.log.info({ playerId: player.id }, 'jogador reconectou; conexão antiga fechada');
    } else {
      this.sessions.set(player.id, session);
      this.mapPlayers.get(session.map)!.add(session);
      this.broadcastMap(session.map, { type: 'player_joined', player: this.view(session) }, session.id);
      this.log.info({ playerId: player.id, online: this.sessions.size }, 'jogador entrou');
    }

    this.sendTo(session, {
      type: 'welcome', you: this.selfView(session), players: this.othersIn(session), monsters: this.monstersIn(session.map), world: this.worldInfo(session.map),
      progress: this.progressView(session), kit: this.kitView(session),
    });
    this.syncMission(session.id);
    if (session.canBeSensei) this.syncSensei(session.id);
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
    this.mapPlayers.get(session.map)?.delete(session);
    this.broadcastMap(session.map, { type: 'player_left', playerId: session.id });
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
    else if (parsed.type === 'input') this.queueInputs(session, parsed.seq, parsed.inputs);
    else if (parsed.type === 'cast') this.cast(session, parsed.skill, t, parsed.targetId);
    else if (parsed.type === 'meditate') this.meditate(session, parsed.active);
    else if (parsed.type === 'respawn') this.respawn(session, t);
    else if (parsed.type === 'talk') this.talk(session, parsed.npcId, t);
    else if (parsed.type === 'missions') this.missionRequest(session, t, (m) => m.current(session.id).then((mission) => this.sendMission(session.id, mission, 'sync')));
    else if (parsed.type === 'attack') this.basicAttack(session, t, parsed.targetId);
    else if (parsed.type === 'run') this.setRunning(session, parsed.active, t);
    else if (parsed.type === 'switch_kit') this.switchKit(session, parsed.kit);
    else if (parsed.type === 'set_loadout') this.setLoadout(session, { A: parsed.kitA, B: parsed.kitB });
    else if (parsed.type === 'spend_point') this.spendPoint(session, parsed.attribute);
    else if (parsed.type === 'set_appearance') this.setAppearance(session, parsed.appearance);
    else if (parsed.type === 'create_mission') this.createPlayerMission(session, parsed.traineeId, parsed.difficulty, parsed.quantity, t);
    else if (parsed.type === 'deliver_mission') this.deliverPlayerMission(session, parsed.senseiId, t);
    else if (parsed.type === 'evaluate_mission') this.evaluatePlayerMission(session, parsed.missionId, parsed.approved, parsed.score, t);
    else this.chatMessage(session, parsed.message, t);
    this.flushKicks();
  }

  /** Só guarda a direção; quem anda é o tick. Diagonal (1, 1) vira (0,71; 0,71): mesma velocidade. */
  private setDirection(session: Session, dx: number, dy: number): void {
    if (session.dead) return;             // morto não anda
    const length = Math.hypot(dx, dy);
    // Tentar andar cancela a meditação (soltar o joystick, que manda 0,0, não cancela).
    if (length > 0) this.stopMeditation(session, 'moved');
    const scale = length > 1 ? 1 / length : 1;
    session.dx = dx * scale;
    session.dy = dy * scale;
    if (length > 0) {
      session.fx = dx / length;
      session.fy = dy / length;
    }
  }

  /**
   * Entradas com predição. O cliente já andou na tela; aqui elas só entram na fila, e o
   * tick aplica no máximo o tempo real que passou. Entrada repetida (seq já visto) é
   * ignorada; fila cheia descarta (o cliente será corrigido pela posição oficial).
   */
  private queueInputs(session: Session, seq: number, inputs: [number, number][]): void {
    session.dx = 0;                       // quem usa predição não usa a direção "segurada"
    session.dy = 0;
    inputs.forEach(([dx, dy], i) => {
      const n = seq + i;
      if (n <= session.lastQueuedSeq) return;
      session.lastQueuedSeq = n;
      if (session.dead) {                 // morto não anda: só confirma
        session.droppedUpTo = n;
        return;
      }
      if (dx !== 0 || dy !== 0) this.stopMeditation(session, 'moved');
      if (session.inputQueue.length >= this.config.maxQueuedInputs) {
        session.droppedUpTo = n;
        return;
      }
      session.inputQueue.push({ seq: n, dx, dy });
    });
    if (session.inputQueue.length === 0 && session.droppedUpTo > session.ackSeq) {
      session.ackSeq = session.droppedUpTo;
      session.dirty = true;
    }
  }

  /** Joga fora as entradas na fila, confirmando todas (morte, renascimento). */
  private dropInputs(session: Session): void {
    session.inputQueue.length = 0;
    session.droppedUpTo = Math.max(session.droppedUpTo, session.lastQueuedSeq);
    session.ackSeq = session.droppedUpTo;
    session.dirty = true;
  }

  /**
   * Anda o jogador neste tick. O orçamento ganha o tempo real do tick (com folga de
   * `inputBufferMs` para pacotes atrasados) e cada passo gasta o tempo dele:
   *  - entradas da fila: 1 tick (50 ms) cada, com a MESMA função do cliente (movement.ts);
   *  - direção "segurada" (sem predição): o tempo do tick.
   */
  private moveSession(s: Session, dtMs: number, t: number): void {
    const tickMs = this.config.tickMs;
    s.moveBudgetMs = Math.min(this.config.inputBufferMs, s.moveBudgetMs + dtMs);
    const before = [s.x, s.y, s.map];
    if (s.inputQueue.length > 0) {
      while (s.inputQueue.length > 0 && s.moveBudgetMs >= tickMs) {
        const input = s.inputQueue.shift()!;
        s.moveBudgetMs -= tickMs;
        s.ackSeq = input.seq;
        s.dirty = true;                   // o dono precisa do ack, mesmo parado numa parede
        if (s.meditating || (input.dx === 0 && input.dy === 0)) continue;
        const len = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
        s.fx = input.dx / len;
        s.fy = input.dy / len;
        this.step(s, input.dx, input.dy, (this.speedOf(s) * tickMs) / 1000);
      }
    } else if (!s.meditating && (s.dx !== 0 || s.dy !== 0)) {
      this.step(s, s.dx, s.dy, (this.speedOf(s) * dtMs) / 1000);
      s.moveBudgetMs = Math.max(0, s.moveBudgetMs - dtMs);
    }
    if (s.inputQueue.length === 0 && s.droppedUpTo > s.ackSeq) {
      s.ackSeq = s.droppedUpTo;
      s.dirty = true;
    }
    if (s.x !== before[0] || s.y !== before[1] || s.map !== before[2]) {
      s.lastUpdate = t;
      s.dirty = true;
    }
  }

  /**
   * Um passo: colide com as paredes do mapa atual e, encostado na borda empurrando para fora
   * dentro do portão, passa para o mapa vizinho (crossExit). A posição é sempre a do SERVIDOR.
   */
  private step(s: Session, dx: number, dy: number, dist: number): void {
    const [map, x, y] = moveStep(this.config.maps, s.map, s.x, s.y, dx, dy, dist);
    if (map === s.map) {
      s.x = x;
      s.y = y;
      return;
    }
    this.transfer(s, map as MapId, x, y, 'walk');
  }

  /**
   * Troca de mapa: some para quem ficou (player_left), aparece para quem está no mapa novo
   * (player_joined) e o próprio jogador recebe `map_changed` só com o que existe lá.
   */
  private transfer(s: Session, to: MapId, x: number, y: number, reason: 'walk' | 'respawn'): void {
    const from = s.map;
    s.x = x;
    s.y = y;
    if (from !== to) {
      this.mapPlayers.get(from)?.delete(s);
      this.broadcastMap(from, { type: 'player_left', playerId: s.id });
      s.map = to;
      this.mapPlayers.get(to)!.add(s);
      this.broadcastMap(to, { type: 'player_joined', player: this.view(s) }, s.id);
      this.log.info({ playerId: s.id, from, to }, 'jogador trocou de mapa');
    }
    this.sendTo(s, {
      type: 'map_changed', map: to, x: round3(x), y: round3(y), a: s.ackSeq,
      players: this.othersIn(s), monsters: this.monstersIn(to), reason,
    });
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
    this.broadcastMap(session.map, { type: 'chat', playerId: session.id, username: session.username, message });
  }

  // ---------------------------------------------------------------- combate

  /**
   * Habilidade. Ordem: vivo? recarregou? tem chakra? tem alvo/efeito? Só então cobra o
   * chakra, avisa todos (`cast`, para a animação) e aplica o efeito. Falhou antes de
   * cobrar: `cast_failed` só para quem tentou, sem gastar nada.
   */
  private cast(session: Session, skill: Skill, t: number, targetId?: string): void {
    const cfg = this.config.combat.skills[skill];
    const fail = (reason: CastFailReason) => this.sendTo(session, { type: 'cast_failed', skill, reason });
    // Qualquer TENTATIVA de usar habilidade encerra a meditação (mesmo que a habilidade falhe).
    this.stopMeditation(session, 'cast');
    if (session.dead) return fail('DEAD');
    // Zona segura (praça da Vila): nenhuma habilidade, nem cura. Vale a posição do SERVIDOR.
    if (this.inSafeZone(session)) return fail('SAFE_ZONE');
    // Só as 4 habilidades do kit ATIVO (o kit ativo é o que o servidor confirmou).
    if (!session.kits[session.activeKit].includes(skill)) return fail('NOT_EQUIPPED');
    if ((session.cooldowns[skill] ?? 0) > t) return fail('COOLDOWN');
    if (session.chakra < cfg.cost) return fail('NO_CHAKRA');

    const alive = (m: Monster) => m.hp > 0 && m.map === session.map;   // só monstros do MESMO mapa
    // Soco (Taijutsu 👊) escala com o atributo Taijutsu; jutsus elementais (Fogo, Água) com Ninjutsu.
    const dmg = scaledDamage(cfg.damage ?? 0, damageMultiplier(session.stats, cfg.scaling ?? 'ninjutsu'));
    let target: Monster | undefined;
    if (targetId !== undefined && DIRECTED_SKILLS.has(skill)) {
      // Jutsu direcionado: o alvo é o focado, mas o ALCANCE continua sendo o da habilidade.
      target = this.monsters.get(targetId);
      if (!target || !alive(target)) return fail('NO_TARGET');
      const reach = cfg.range ?? cfg.radius ?? 0;
      const d = distance(session, target);
      if (d > reach) return fail('OUT_OF_RANGE');
      // Mira: o servidor vira o jogador para o alvo (mesmo que ele estivesse olhando para o outro lado).
      if (d > 0.01) {
        session.fx = (target.x - session.x) / d;
        session.fy = (target.y - session.y) / d;
      }
    } else if (skill === 'taijutsu' || skill === 'illusion' || skill === 'shadow') {
      target = nearest(session, this.monsters.values(), cfg.range ?? 0, alive);
      if (!target) return fail('NO_TARGET');
    }
    if (skill === 'heal' && session.hp >= session.stats.maxHp) return fail('FULL_HP');
    if (skill === 'stone' && session.shield > 0) return fail('ALREADY_ACTIVE');

    session.chakra -= cfg.cost;
    session.cooldowns[skill] = t + cfg.cooldownMs;
    this.broadcastMap(session.map, { type: 'cast', playerId: session.id, skill, x: round2(session.x), y: round2(session.y), fx: round2(session.fx), fy: round2(session.fy) });

    switch (skill) {
      case 'fire':
        for (const m of [...this.monsters.values()]) {
          if (alive(m) && distance(session, m) <= (cfg.radius ?? 0)) this.damageMonster(m, dmg, session, t);
        }
        break;
      case 'water':
        for (const m of [...this.monsters.values()]) {
          if (alive(m) && inCone(session, session.fx, session.fy, m, cfg.range ?? 0, cfg.coneDeg ?? 90)) this.damageMonster(m, dmg, session, t);
        }
        break;
      case 'taijutsu':
        this.damageMonster(target!, dmg, session, t);
        break;
      case 'illusion':
        target!.stunnedUntil = t + (cfg.stunMs ?? 0);
        this.broadcastMap(session.map, { type: 'monster_status', id: target!.id, status: 'stunned', ms: cfg.stunMs ?? 0 });
        break;
      case 'shadow':
        target!.rootedUntil = t + (cfg.rootMs ?? 0);
        this.broadcastMap(session.map, { type: 'monster_status', id: target!.id, status: 'rooted', ms: cfg.rootMs ?? 0 });
        break;
      case 'stone':
        session.shield = cfg.reduction ?? 0.5;
        break;
      case 'heal': {
        const before = session.hp;
        session.hp = Math.min(session.stats.maxHp, session.hp + (cfg.heal ?? 0));
        const amount = shownHp(session.hp) - shownHp(before);
        this.broadcastMap(session.map, { type: 'hit', target: 'player', id: session.id, amount, kind: 'heal', hp: shownHp(session.hp), maxHp: session.stats.maxHp });
        session.sentHp = shownHp(session.hp);
        break;
      }
      default:
        break;
    }
    this.sendStats(session, t);
  }

  /** Começar ou parar de meditar. Morto não medita; meditar para o jogador na hora. */
  private meditate(session: Session, active: boolean): void {
    if (!active) {
      this.stopMeditation(session, 'manual');
      return;
    }
    if (session.dead) {
      this.sendError(session, 'CANNOT_MEDITATE');
      return;
    }
    if (session.meditating) return;
    session.meditating = true;
    session.dx = 0;
    session.dy = 0;
    this.broadcastMap(session.map, { type: 'meditation', playerId: session.id, active: true });
  }

  private stopMeditation(session: Session, reason: MeditationEnd): void {
    if (!session.meditating) return;
    session.meditating = false;
    this.broadcastMap(session.map, { type: 'meditation', playerId: session.id, active: false, reason });
  }

  /**
   * Ataque Básico: NÃO gasta chakra (o chakra só volta meditando, então sempre dá para lutar).
   * Dano FÍSICO: multiplicador de Taijutsu. Alvo focado se estiver no alcance; senão, o mais
   * perto no alcance. Tentar atacar encerra a meditação, como as habilidades.
   */
  private basicAttack(session: Session, t: number, targetId?: string): void {
    const cfg = this.config.combat.basicAttack;
    const fail = (reason: 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'DEAD' | 'SAFE_ZONE') => this.sendTo(session, { type: 'attack_failed', reason });
    this.stopMeditation(session, 'cast');
    if (session.dead) return fail('DEAD');
    if (this.inSafeZone(session)) return fail('SAFE_ZONE');
    if ((session.cooldowns.attack ?? 0) > t) return fail('COOLDOWN');
    const alive = (m: Monster) => m.hp > 0 && m.map === session.map;
    let target: Monster | undefined;
    if (targetId !== undefined) {
      const focused = this.monsters.get(targetId);
      if (focused && alive(focused) && distance(session, focused) <= cfg.range) target = focused;
    }
    target ??= nearest(session, this.monsters.values(), cfg.range, alive);
    if (!target) return fail(targetId !== undefined && this.monsters.get(targetId)?.map === session.map ? 'OUT_OF_RANGE' : 'NO_TARGET');
    const d = distance(session, target);
    if (d > 0.01) {
      session.fx = (target.x - session.x) / d;
      session.fy = (target.y - session.y) / d;
    }
    session.cooldowns.attack = t + session.stats.attackCooldownMs;   // Agilidade deixa o ataque mais rápido
    this.broadcastMap(session.map, { type: 'attack', playerId: session.id, x: round2(session.x), y: round2(session.y), fx: round2(session.fx), fy: round2(session.fy) });
    this.damageMonster(target, scaledDamage(cfg.damage, session.stats.physicalMultiplier), session, t);   // FÍSICO: Taijutsu
  }

  /** Correr liga/desliga. A velocidade vem SEMPRE daqui (5 ou 8, mais agilidade); o cliente só pede. */
  private setRunning(session: Session, active: boolean, t: number): void {
    if (session.running === active) return;
    session.running = active;
    this.sendStats(session, t);
  }

  /** Troca de kit: o cliente só mostra o kit novo quando recebe esta confirmação. */
  private switchKit(session: Session, kit: KitName): void {
    session.activeKit = kit;
    this.sendTo(session, { type: 'kit', ...this.kitView(session) });
  }

  /** Salvar kits (até 4 por kit, sem repetir: o Zod e o banco conferem). Vale na hora; grava no banco. */
  private setLoadout(session: Session, kits: Kits): void {
    const { id } = session;
    this.profileTask(session, (profile) => profile.saveLoadout(id, kits.A, kits.B).then(() => {
      const current = this.sessions.get(id);
      if (!current) return;
      current.kits = { A: [...kits.A], B: [...kits.B] };
      this.sendTo(current, { type: 'kit', ...this.kitView(current) });
      this.sendTo(current, { type: 'notice', text: 'Kits salvos.', tone: 'good' });
    }));
  }

  /**
   * Criador de Personagem: grava as 5 cores e TODOS passam a ver o boneco novo.
   * O visual só muda depois de gravado (o próprio jogador recebe a confirmação também).
   */
  private setAppearance(session: Session, appearance: Appearance): void {
    const { id } = session;
    this.profileTask(session, (profile) => profile.saveAppearance(id, appearance).then(() => {
      const current = this.sessions.get(id);
      if (!current) return;
      current.appearance = { ...appearance };
      this.broadcastMap(current.map, { type: 'player_appearance', playerId: id, appearance: { ...appearance } });
    }));
  }

  /** Gastar 1 ponto: o banco confere se tem ponto e se o atributo não passou do máximo. */
  private spendPoint(session: Session, attribute: Attribute): void {
    if (session.statPoints <= 0) return this.sendError(session, 'NO_POINTS');
    const { id } = session;
    this.profileTask(session, (profile) => profile.spendPoint(id, attribute).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendError(current, result.reason === 'NO_POINTS' ? 'NO_POINTS' : 'ATTRIBUTE_MAXED');
      const before = current.stats;
      current.statPoints = result.statPoints;
      current.attributes = result.attributes;
      current.stats = this.computeStats(result.attributes);
      // Vida/chakra máximos subiram: o valor atual sobe junto (não começa "faltando").
      current.hp += current.stats.maxHp - before.maxHp;
      current.chakra += current.stats.maxChakra - before.maxChakra;
      this.sendTo(current, { type: 'progress', ...this.progressView(current) });
      this.sendStats(current, this.now());
      if (current.stats.maxHp !== before.maxHp) {
        this.broadcastMap(current.map, { type: 'player_hp', playerId: id, hp: shownHp(current.hp), maxHp: current.stats.maxHp }, id);
      }
      return undefined;
    }));
  }

  /** Põe uma gravação de ficha na fila do jogador (ver profileQueue). */
  private profileTask(session: Session, run: (profile: Profile) => Promise<void>): void {
    if (!this.profile) return this.sendError(session, 'PROFILE_UNAVAILABLE');
    if (session.profileQueue.length >= 5) return this.sendError(session, 'PROFILE_BUSY');
    session.profileQueue.push(run);
    this.pumpProfile(session);
  }

  private pumpProfile(session: Session): void {
    const profile = this.profile;
    if (session.profileBusy || !profile) return;
    const next = session.profileQueue.shift();
    if (!next) return;
    session.profileBusy = true;
    const go = () => {
      session.lastProfileAt = this.now();
      next(profile)
        .catch((err: unknown) => this.profileFailed(session.id, err))
        .finally(() => {
          session.profileBusy = false;
          this.flushKicks();
          this.pumpProfile(session);
        });
    };
    const wait = session.lastProfileAt + this.config.profileRequestEveryMs - this.now();
    if (wait > 0) setTimeout(go, wait).unref();
    else go();
  }

  private profileFailed(playerId: string, err: unknown): void {
    this.log.warn({ playerId, err }, 'falha ao gravar a ficha do jogador');
    const current = this.sessions.get(playerId);
    if (current) this.sendError(current, 'PROFILE_UNAVAILABLE');
  }

  private damageMonster(m: Monster, amount: number, attacker: Session, t: number): void {
    m.hp = Math.max(0, m.hp - amount);
    this.broadcastMap(m.map, { type: 'hit', target: 'monster', id: m.id, amount, kind: 'damage', hp: m.hp, maxHp: m.maxHp });
    if (m.hp === 0) this.killMonster(m, attacker, t);
  }

  /** Último golpe ganha o XP. Um monstro novo nasce na hora no mesmo mapa (mapa de caça: sempre cheio). */
  private killMonster(m: Monster, killer: Session, t: number): void {
    this.monsters.delete(m.id);
    this.broadcastMap(m.map, { type: 'monster_died', id: m.id, killerId: killer.id });
    const layout = this.layout(m.map);
    if (!layout.safe && layout.hunt && this.monstersIn(m.map).length < this.config.combat.monsters.count) this.spawnMonster(undefined, t, m.map);
    this.awardXp(killer, this.config.combat.monsters.xp);
    this.trackKill(killer, m.type);
  }

  // ---------------------------------------------------------------- missões (NPC Mestre)

  /**
   * Abate conta para a missão DEFEAT_MONSTER do matador (o banco confere tipo, monstro,
   * estado e meta). Fora do loop, como o XP. Chegou na meta: avisa para voltar ao Mestre.
   */
  private trackKill(killer: Session, monsterType: string): void {
    if (!this.missions) return;
    const { id } = killer;
    this.missions.recordKill(id, monsterType).then((mission) => {
      if (mission) this.sendMission(id, mission, mission.ready ? 'ready' : 'progress');
    }).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha ao contar abate na missão');
    });
  }

  /** Ao conectar: a Sala de Missões já abre com a missão certa. */
  private syncMission(playerId: string): void {
    this.missions?.current(playerId).then((mission) => this.sendMission(playerId, mission, 'sync')).catch((err: unknown) => {
      this.log.warn({ playerId, err }, 'falha ao ler a missão do jogador');
    });
  }

  /** Conversar com um NPC: só vivo e perto dele (posição do SERVIDOR, não a do cliente). */
  private talk(session: Session, npcId: string, t: number): void {
    const npc = this.config.npcs.find((n) => n.id === npcId);
    if (!npc) return this.sendError(session, 'UNKNOWN_NPC');
    if (session.dead) return this.sendError(session, 'CANNOT_TALK');
    if (npc.map !== session.map || distance(session, npc) > npc.range) return this.sendError(session, 'NPC_TOO_FAR');
    const { id, username } = session;
    this.missionRequest(session, t, (m) => m.talk(id).then((outcome) => this.applyTalk(id, username, npc.id, outcome)));
  }

  /**
   * Um pedido ao banco de missões por vez, e no máximo 1 a cada `missionRequestEveryMs`.
   * Toque repetido no meio do caminho é ignorado (não enfileira consultas).
   */
  private missionRequest(session: Session, t: number, run: (missions: Missions) => Promise<void>): void {
    if (!this.missions) return this.sendError(session, 'MISSIONS_UNAVAILABLE');
    if (session.missionBusy || t - session.lastMissionAt < this.config.missionRequestEveryMs) return;
    session.missionBusy = true;
    session.lastMissionAt = t;
    const { id } = session;
    run(this.missions).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha no banco de missões');
      const current = this.sessions.get(id);
      if (current) this.sendError(current, 'MISSIONS_UNAVAILABLE');
    }).finally(() => {
      session.missionBusy = false;
      this.flushKicks();
    });
  }

  private sendMission(playerId: string, mission: MissionView | null, reason: 'sync' | 'assigned' | 'progress' | 'ready' | 'completed'): void {
    const session = this.sessions.get(playerId);
    if (session) this.sendTo(session, { type: 'mission', mission, reason });
  }

  // ---------------------------------------------------------------- missões entre jogadores

  /** Sensei (Chunin+) conectou: opções de missão e entregas esperando a avaliação dele. */
  private syncSensei(senseiId: string): void {
    const missions = this.missions;
    if (!missions) return;
    Promise.all([missions.senseiOptions(), missions.pendingEvaluations(senseiId)]).then(([difficulties, pending]) => {
      const s = this.sessions.get(senseiId);
      if (!s) return;
      this.sendTo(s, { type: 'sensei_options', difficulties, quantities: [...this.config.playerMissions.quantities] });
      for (const p of pending) this.sendTo(s, { type: 'evaluation_request', ...p });
    }).catch((err: unknown) => this.log.warn({ playerId: senseiId, err }, 'falha ao ler opções de sensei'));
  }

  /** Outro jogador online e perto (posições do SERVIDOR). Devolve a sessão dele ou avisa o erro. */
  private nearbyPlayer(session: Session, otherId: string): Session | undefined {
    const other = this.sessions.get(otherId);
    if (!other || other.closed || other === session) {
      this.sendError(session, 'PLAYER_NOT_FOUND');
      return undefined;
    }
    if (session.dead || other.map !== session.map || distance(session, other) > this.config.playerMissions.range) {
      this.sendError(session, 'PLAYER_TOO_FAR');
      return undefined;
    }
    return other;
  }

  private notice(playerId: string, text: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
    const s = this.sessions.get(playerId);
    if (s) this.sendTo(s, { type: 'notice', text, tone });
  }

  /**
   * "Criar Missão": sensei toca no aprendiz. Abate de slime (o que o jogo sabe contar), na
   * quantidade e dificuldade escolhidas. Rank do sensei (Chunin+), aprendiz abaixo e uma
   * missão aberta por aprendiz: quem decide é o banco (triggers + índice único).
   */
  private createPlayerMission(session: Session, traineeId: string, difficulty: string, quantity: number, t: number): void {
    if (!this.config.playerMissions.quantities.includes(quantity)) return this.sendError(session, 'INVALID_MISSION_OPTION');
    const trainee = this.nearbyPlayer(session, traineeId);
    if (!trainee) return;
    const { id: senseiId, username: senseiName } = session;
    const traineeName = trainee.username;
    this.missionRequest(session, t, (m) => m.create(senseiId, traineeId, difficulty, quantity).then((outcome) => {
      if (outcome.kind === 'refused') return this.notice(senseiId, outcome.text, 'bad');
      const what = `${npcTitle(outcome.mission)}`;
      this.notice(senseiId, `Missão criada para ${traineeName}: ${what}.`, 'good');
      this.sendMission(traineeId, outcome.mission, 'assigned');
      this.notice(traineeId, `O sensei ${senseiName} te passou uma missão: ${what}.`, 'good');
      this.log.info({ senseiId, traineeId }, 'missão de sensei criada');
    }));
  }

  /** Aprendiz entrega a missão tocando no sensei que a criou (perto dele). */
  private deliverPlayerMission(session: Session, senseiId: string, t: number): void {
    const sensei = this.nearbyPlayer(session, senseiId);
    if (!sensei) return;
    const { id: traineeId, username: traineeName } = session;
    const senseiName = sensei.username;
    this.missionRequest(session, t, (m) => m.deliver(traineeId, senseiId).then((outcome) => {
      switch (outcome.kind) {
        case 'refused':
          return this.notice(traineeId, outcome.text, 'bad');
        case 'no_mission':
          return this.notice(traineeId, `Você não tem missão do sensei ${senseiName}.`, 'bad');
        case 'already_submitted':
          return this.notice(traineeId, `Missão já entregue. Esperando a avaliação de ${senseiName}.`);
        case 'incomplete': {
          const left = outcome.mission.target.quantity - outcome.mission.progress;
          return this.notice(traineeId, `Ainda ${left === 1 ? 'falta' : 'faltam'} ${left} ${targetLabel(outcome.mission.target.code, left)}.`, 'bad');
        }
        case 'submitted': {
          this.sendMission(traineeId, outcome.mission, 'sync');
          this.notice(traineeId, `Missão entregue ao sensei ${senseiName}. Aguarde a avaliação.`, 'good');
          const s = this.sessions.get(senseiId);
          if (s) this.sendTo(s, { type: 'evaluation_request', missionId: outcome.mission.id, trainee: { id: traineeId, username: traineeName }, mission: outcome.mission });
          this.log.info({ senseiId, traineeId }, 'missão entregue ao sensei');
          return undefined;
        }
      }
    }));
  }

  /** Sensei avalia (aprovar emite o pergaminho; reprovar zera o progresso). O banco confere quem pode. */
  private evaluatePlayerMission(session: Session, missionId: string, approved: boolean, score: number, t: number): void {
    const { id: senseiId, username: senseiName } = session;
    this.missionRequest(session, t, (m) => m.evaluate(senseiId, missionId, approved, score).then((outcome) => {
      if (outcome.kind === 'refused') return this.notice(senseiId, outcome.text, 'bad');
      this.notice(senseiId, approved ? 'Missão aprovada: o pergaminho foi para o aprendiz.' : 'Missão reprovada: o aprendiz refaz do zero.', 'good');
      this.sendMission(outcome.traineeId, outcome.mission, 'sync');
      this.notice(outcome.traineeId, approved
        ? `O sensei ${senseiName} aprovou! Entregue o pergaminho ao Mestre (Sala de Missões).`
        : `O sensei ${senseiName} reprovou a missão. O progresso voltou a zero.`, approved ? 'good' : 'bad');
      this.log.info({ senseiId, traineeId: outcome.traineeId, approved }, 'missão avaliada');
      return undefined;
    }));
  }

  /** Resultado da conversa (já gravado no banco) vira fala do NPC, missão e recompensa. */
  private applyTalk(playerId: string, username: string, npcId: string, outcome: TalkOutcome): void {
    const session = this.sessions.get(playerId);
    const say = (text: string) => {
      if (session) this.sendTo(session, { type: 'npc_say', npcId, text });
    };
    switch (outcome.kind) {
      case 'assigned':
        say(npcLine.assigned(outcome.mission));
        this.sendMission(playerId, outcome.mission, 'assigned');
        break;
      case 'in_progress':
      case 'other_sensei':
        say(outcome.kind === 'in_progress' ? npcLine.inProgress(outcome.mission) : npcLine.otherSensei(outcome.mission));
        this.sendMission(playerId, outcome.mission, 'sync');
        break;
      case 'rewarded': {
        const gained = outcome.rewards.reduce((sum, r) => sum + r.xp, 0);
        if (session) {
          this.sendTo(session, {
            type: 'mission_reward',
            rewards: outcome.rewards.map(({ senseiName, xp, title, titleNew }) => ({ senseiName, xp, title, titleNew })),
            totalXp: outcome.totalXp, rank: outcome.rank, promoted: outcome.promoted,
          });
        }
        this.applyXp(playerId, username, gained, outcome);   // xp, nível, pontos e anúncio
        say(npcLine.rewarded(outcome.rewards));
        this.sendMission(playerId, outcome.mission, 'completed');
        this.log.info({ playerId, missions: outcome.rewards.length, xp: gained }, 'pergaminho entregue na Sala de Missões');
        break;
      }
      case 'rank_too_high':
        say('Seu rank já passou dos meus treinos. Procure um sensei à sua altura.');
        break;
      case 'unavailable':
        this.log.warn({}, 'missões do NPC indisponíveis: rode db/schema_v4_npc_missions.sql no banco');
        say('A Sala de Missões ainda não abriu. Volte mais tarde.');
        break;
    }
  }

  /** XP vai para o banco (fora do loop: o tick nunca espera o banco). O aviso só sai depois de gravado. */
  private awardXp(killer: Session, amount: number): void {
    if (!this.progression) return;
    const { id, username } = killer;
    this.progression.grantXp(id, amount).then((result) => {
      if (!result) return;
      this.applyXp(id, username, amount, result);
      this.flushKicks();
    }).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha ao gravar XP no banco');
    });
  }

  /**
   * XP gravado no banco: atualiza a ficha, avisa o dono (xp + progress) e, se subiu de rank
   * ou de nível, todos veem (anúncio e o nível sobre o boneco).
   */
  private applyXp(playerId: string, username: string, gained: number, result: XpResult): void {
    const session = this.sessions.get(playerId);
    const levelsGained = result.levelsGained ?? 0;
    if (session) {
      session.xp = result.totalXp;
      session.rank = result.rank;
      if (result.level !== undefined) session.level = result.level;
      if (result.statPoints !== undefined) session.statPoints = result.statPoints;
      this.sendTo(session, { type: 'xp', gained, totalXp: result.totalXp, rank: result.rank, promoted: result.promoted });
      this.sendTo(session, { type: 'progress', ...this.progressView(session) });
      if (levelsGained > 0) {
        this.sendTo(session, { type: 'notice', text: `Nível ${session.level}! +${levelsGained} ${levelsGained === 1 ? 'ponto' : 'pontos'} de atributo.`, tone: 'good' });
      }
      if (levelsGained > 0 || result.promoted) {
        this.broadcastMap(session.map, { type: 'player_rank', playerId, rank: session.rank, level: session.level }, playerId);
      }
    }
    if (result.promoted) {
      this.broadcast({ type: 'announce', message: `${username} subiu para ${result.rank.name}!` });
      this.log.info({ playerId, rank: result.rank.code }, 'jogador subiu de rank');
    }
  }

  private damagePlayer(session: Session, amount: number, t: number): void {
    // Apanhou: a meditação acaba ANTES do dano (não dá para meditar no meio da luta).
    this.stopMeditation(session, 'damaged');
    let dmg = amount;
    let shielded = false;
    if (session.shield > 0) {
      dmg = shieldedDamage(amount, session.shield);
      session.shield = 0;
      shielded = true;
    }
    session.hp = Math.max(0, session.hp - dmg);
    const maxHp = session.stats.maxHp;
    this.broadcastMap(session.map, { type: 'hit', target: 'player', id: session.id, amount: dmg, kind: 'damage', hp: shownHp(session.hp), maxHp, ...(shielded ? { shielded: true } : {}) });
    session.sentHp = shownHp(session.hp);
    if (session.hp <= 0) {
      session.dead = true;
      session.deadAt = t;
      session.dx = 0;
      session.dy = 0;
      this.dropInputs(session);           // morto não anda: entradas na fila só são confirmadas
      session.shield = 0;
      this.broadcastMap(session.map, { type: 'player_died', playerId: session.id, respawnInMs: this.config.combat.player.respawnMs });
    }
    this.sendStats(session, t);
  }

  /** Renascer: só morto e só depois do tempo. Volta à praça da Vila com vida e chakra cheios. */
  private respawn(session: Session, t: number): void {
    const p = this.config.combat.player;
    const { maxHp, maxChakra } = session.stats;
    if (!session.dead || t - session.deadAt < p.respawnMs) {
      this.sendError(session, 'RESPAWN_NOT_READY');
      return;
    }
    session.dead = false;
    session.hp = maxHp;
    session.chakra = maxChakra;
    session.shield = 0;
    session.cooldowns = {};
    session.dx = 0;
    session.dy = 0;
    this.dropInputs(session);             // teleporte para a praça: o cliente recomeça daqui
    const { startMap, spawn } = this.config;
    if (session.map !== startMap) this.transfer(session, startMap, spawn.x, spawn.y, 'respawn');   // morreu na Floresta
    session.x = spawn.x;
    session.y = spawn.y;
    session.sentHp = maxHp;
    this.broadcastMap(session.map, { type: 'player_respawned', playerId: session.id, x: session.x, y: session.y, hp: maxHp, maxHp });
    this.sendStats(session, t);
  }

  private sendStats(session: Session, t: number): void {
    session.sentStats = statsKey(session);
    session.lastStatsAt = t;
    this.sendTo(session, {
      type: 'stats', hp: shownHp(session.hp), maxHp: session.stats.maxHp, chakra: Math.floor(session.chakra),
      maxChakra: session.stats.maxChakra, shield: session.shield > 0, speed: this.speedOf(session), running: session.running,
    });
  }

  /**
   * Cria um monstro. Sem posição: numa casa livre (fora das árvores) da zona de caça do mapa,
   * longe dos jogadores. Com posição (testes): no mapa pedido ou, sem mapa, no de entrada.
   */
  spawnMonster(at?: Point, t: number = this.now(), map?: MapId): MonsterView {
    const cfg = this.config.combat.monsters;
    const mapId: MapId = map ?? (at ? this.config.startMap : (this.huntingMaps()[0]?.id ?? this.config.startMap));
    const layout = this.layout(mapId);
    const zone = layout.hunt ?? { x: 0, y: 0, w: layout.width, h: layout.height };
    const players = [...(this.mapPlayers.get(mapId) ?? [])];
    let pos = at;
    for (let i = 0; !pos && i < 30; i++) {
      const candidate = { x: Math.floor(zone.x + this.random() * zone.w), y: Math.floor(zone.y + this.random() * zone.h) };
      if (blocked(candidate.x, candidate.y, layout.walls) && i < 29) continue;
      const tooClose = players.some((s) => !s.dead && distance(s, candidate) < cfg.minPlayerDistance);
      if (!tooClose || i === 29) pos = candidate;
    }
    const m: Monster = {
      id: `m${++this.monsterSeq}`,
      type: cfg.type,
      map: mapId,
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
    this.broadcastMap(mapId, { type: 'monster_spawned', monster: monsterView(m) });
    return monsterView(m);
  }

  /** Andar aleatório: 1 casa (ou parado) a cada ~1 s, sem sair da zona de caça e sem entrar nas árvores. */
  private stepMonster(m: Monster, t: number): boolean {
    const cfg = this.config.combat.monsters;
    m.nextStepAt = t + cfg.stepMs * (0.8 + this.random() * 0.4);
    if (t < m.stunnedUntil || t < m.rootedUntil) return false;   // atordoado ou preso: não anda
    if (this.random() < 0.2) return false;                         // às vezes fica parado
    const layout = this.layout(m.map);
    if (!layout.hunt) return false;                                // fora de mapa de caça (teste): parado
    const z = layout.hunt;
    for (let attempt = 0; attempt < 4; attempt++) {
      const [sx, sy] = STEPS[Math.floor(this.random() * STEPS.length)]!;
      const next = { x: m.x + sx, y: m.y + sy };
      if (next.x >= z.x && next.y >= z.y && next.x < z.x + z.w && next.y < z.y + z.h && !blocked(next.x, next.y, layout.walls)) {
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
    const target = nearest(m, this.mapPlayers.get(m.map) ?? [], cfg.attackRange, (s) => !s.dead && !s.closed && !this.inSafeZone(s));
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
    const p = this.config.combat.player;

    // 1. Jogadores: movimento (andando 5, correndo 8, + agilidade) e energia.
    for (const s of this.sessions.values()) {
      if (s.closed || s.dead) continue;
      this.moveSession(s, dtMs, t);
      // Chakra: SÓ meditando (15/s + atributo). Vida: SÓ com o chakra no máximo.
      if (s.meditating) s.chakra = Math.min(s.stats.maxChakra, s.chakra + s.stats.meditationChakraPerSec * dt);
      if (s.chakra >= s.stats.maxChakra) s.hp = Math.min(s.stats.maxHp, s.hp + p.hpRegenPerSec * dt);
    }

    // 2. Monstros: andar e atacar. Mapa sem ninguém: os monstros esperam (nada a enviar).
    const moved = new Map<MapId, [string, number, number][]>();
    for (const m of this.monsters.values()) {
      if ((this.mapPlayers.get(m.map)?.size ?? 0) === 0) continue;
      if (t >= m.nextStepAt && this.stepMonster(m, t)) {
        let list = moved.get(m.map);
        if (!list) moved.set(m.map, (list = []));
        list.push([m.id, m.x, m.y]);
      }
      this.monsterAttack(m, t);
    }
    for (const [map, list] of moved) this.broadcastMap(map, { type: 'monsters_moved', m: list });

    // 3. Envios.
    let movedPlayers = 0;
    for (const s of this.sessions.values()) {
      if (s.closed) continue;
      if (s.dirty) {
        s.dirty = false;
        movedPlayers += 1;
        this.broadcastMap(s.map, { type: 'player_moved', playerId: s.id, x: round3(s.x), y: round3(s.y), d: dirOf(s.fx, s.fy), a: s.ackSeq });
      }
      if (statsKey(s) !== s.sentStats && t - s.lastStatsAt >= this.config.combat.statsEveryMs) this.sendStats(s, t);
      const hp = shownHp(s.hp);
      if (hp !== s.sentHp && t - s.lastHpAt >= 1000) {
        s.sentHp = hp;
        s.lastHpAt = t;
        this.broadcastMap(s.map, { type: 'player_hp', playerId: s.id, hp, maxHp: s.stats.maxHp }, s.id);
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
    for (const set of this.mapPlayers.values()) set.clear();
  }

  // ---------------------------------------------------------------- envio

  /** Serializa UMA vez e manda para quem está no mapa (menos `exceptId`). */
  private broadcastMap(map: MapId, message: ServerMessage, exceptId?: string): void {
    const players = this.mapPlayers.get(map);
    if (!players || players.size === 0) return;
    const data = JSON.stringify(message);
    for (const session of players) {
      if (session.id !== exceptId) this.sendRaw(session, data);
    }
  }

  /** Serializa UMA vez e manda para TODOS os mapas (menos `exceptId`): só avisos gerais. */
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
        this.mapPlayers.get(session.map)?.delete(session);
        this.broadcastMap(session.map, { type: 'player_left', playerId: session.id });
        this.log.info({ playerId: session.id, code: close.code }, 'jogador desconectado pelo servidor');
      }
    }
  }
}


/** Nome do alvo para as falas: "slime" -> "slimes". */
const TARGET_NAMES: Record<string, [string, string]> = { slime: ['slime', 'slimes'] };
export function targetLabel(code: string, quantity: number): string {
  const names = TARGET_NAMES[code];
  return names ? names[quantity === 1 ? 0 : 1] : code;
}

/** "Derrotar 5 slimes" (texto curto da missão para os avisos). */
export function npcTitle(m: MissionView): string {
  return m.type.code === 'DEFEAT_MONSTER' ? `Derrotar ${m.target.quantity} ${targetLabel(m.target.code, m.target.quantity)}` : `${m.type.name} (${m.target.quantity})`;
}

/** Falas do Mestre. */
export const npcLine = {
  assigned: (m: MissionView) => `Prove seu valor, jovem ninja: derrote ${m.target.quantity} ${targetLabel(m.target.code, m.target.quantity)} e volte aqui.`,
  inProgress: (m: MissionView) => {
    const left = m.target.quantity - m.progress;
    return `Ainda ${left === 1 ? 'falta' : 'faltam'} ${left} ${targetLabel(m.target.code, left)}. Eles rondam em volta da vila.`;
  },
  otherSensei: (m: MissionView) => m.status === 'submitted'
    ? `Sua missão está com o sensei ${m.senseiName}, esperando a avaliação.`
    : `Você está treinando com o sensei ${m.senseiName}. Termine essa missão primeiro.`,
  rewarded: (rewards: { xp: number; title: string | null; titleNew: boolean }[]) => {
    const xp = rewards.reduce((sum, r) => sum + r.xp, 0);
    const titles = rewards.filter((r) => r.title && r.titleNew).map((r) => `“${r.title}”`);
    const prize = titles.length > 0 ? `+${xp} XP e o título ${titles.join(' e ')}` : `+${xp} XP`;
    return `Excelente! Pergaminho entregue: ${prize}. Fale comigo de novo para outro treino.`;
  },
};

function monsterView(m: Monster): MonsterView {
  return { id: m.id, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp };
}

/** O que o dono vê nas barras (muda = manda `stats`). */
function statsKey(s: Session): string {
  return `${shownHp(s.hp)}|${Math.floor(s.chakra)}|${s.shield > 0 ? 1 : 0}|${s.running ? 1 : 0}|${s.stats.maxHp}|${s.stats.maxChakra}`;
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
