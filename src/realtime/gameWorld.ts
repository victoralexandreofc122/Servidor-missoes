import { randomInt } from 'node:crypto';
import { SKY, dayPhase, offsetFor, outdoors, pickWeather, skyEffects, weatherFits, type DayPhase, type SkyEffects, type Weather } from './weather.js';
import {
  ahead, distance, firstOnLine, HIT_RADIUS, isInArc, isInCircle, isInCone, lineIntersects, nearest, rotate, shieldedDamage, STEPS, STRIKE_AHEAD,
  unit, type Point,
} from './combat.js';
import { REALTIME, type MonsterType, type RealtimeConfig } from './config.js';
import {
  CLOSE, ClientMessage, DIRECTED_SKILLS, REALTIME_ERRORS, SKILLS, sanitizeChat,
  type CastFailReason, type KitName, type KitView, type Kits, type MapChangeReason, type MeditationEnd, type MissionView, type MonsterView,
  type NinjaView, type PlayerView, type ProgressView, type RankView, type RealtimeErrorCode, type SelfView, type ServerMessage,
  type Skill, type WorldInfo, type Appearance, type Dir, type MonsterStatus,
  type EndgameView, type FactionView, type PowerFailReason, type TravelOption, type SkyView,
} from './protocol.js';
import { NPC_OFFER_CODES, type Missions, type TalkOutcome } from './missions.js';
import {
  ADMIN_HELP, isAdminCommand, isEndgameAdmin, parseAdminCommand, type AdminCommand, type AdminPlayerState, type AdminStore, type EndgameAdminCommand,
} from './admin.js';
import { CHAT_HISTORY, memoryChatLog, type ChatLog, type ChatRecord } from './chatLog.js';
import type { Profile } from './profile.js';
import type { Classes, Inventory, NinjaStore } from './ninjaStore.js';
import {
  ACADEMY_JUTSUS, CLASSES, CLASS_INFO, EXTRACTION, EXTRACTION_PITY_STEP, JUTSUS, JUTSU_BY_CODE, JUTSU_LEVEL_USES, LEGACY_JUTSUS,
  jutsuLevel, jutsuPower, substitutionCooldownMs, teleportRange, type ClassCode,
} from './jutsus.js';
import { ITEMS, ITEM_BY_CODE, KILL_RYO, ROLE_CAPES, SCROLL_DROP_CHANCE, gearOf, scrollOf, type Gear } from './items.js';
import { DEFAULT_APPEARANCE, OPEN_VILLAGES, VILLAGES, villageAllowed, type Village } from './appearance.js';
import { activeModules, dueModules, type EndgameModule } from './endgame.js';
import { SHOW_ALL, type Display, type EndgamePlayer, type EndgameStore, type KageAction, type Politics, type PvpKill, type TickEvent } from './endgameStore.js';
import { VILLAGE_INFO, alliesOf, conflictHostile, mapAllowed, type Diplomacy, type Faction, type MapAccess, type PassiveKind } from './villages.js';
import { POWERS, POWER_BY_SLOT, type PowerDef, type PowerKind } from './akatsuki.js';
import {
  damageMultiplier, derivedStats, levelProgress, MAX_LEVEL, NO_ATTRIBUTES, nextPointGains, scaledDamage,
  type Attribute, type Attributes, type DerivedStats,
} from './stats.js';
import { blocked, moveStep, q3, type Box, type MoveGates } from './movement.js';
import {
  ACADEMY, REFUGE, TRAVEL_POST, academySpawn, arenaAt, conflictCamp, crossedGap, inSafeZone, type Arena, type CampOwner, type HuntZone, type MapId,
  type MapLayout,
} from './maps.js';
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
 *
 * Progressão (v7, ninjaStore.ts): jutsus aprendidos e o USO de cada um (contado aqui, a cada
 * uso aceito; o nível do jutsu sai do uso), tutorial da Academia (o passo trava as portas e só
 * avança quando o SERVIDOR vê o jogador cumprir a sala), classes, Extração com sorteio do
 * servidor, loja (preço do banco) e arma equipada (dano somado ao Ataque Básico).
 *
 * v8: Modo Administrador (comandos "/admin" no chat, só para players.is_admin, auditados no
 * banco e sem disparar recompensa, anúncio ou rank), chat com canais (local, "/g" global e
 * "/w" sussurro) e histórico de 24 h, Sala de Missões com cartões, redefinição de atributos,
 * equipamento visível no boneco e o tutorial linear da Academia (o servidor leva o jogador de
 * uma etapa para a outra e, no fim, para a Praça da Vila).
 *
 * v15 (design geral): arena de PvP em cada vila (só entre os ninjas dela; fora da arena a Vila nunca tem
 * PvP), XP do monstro para todos que participaram (20% da vida), monstros a mais quando há mais gente no
 * mapa, teto de atordoar/prender em jogadores e o jeito de lutar de cada arma.
 *
 * v16 (fim de jogo, docs/endgame.md, migração v11): módulos que ligam com a população (vilas -> pvp -> renegados ->
 * akatsuki). O BANCO é a autoridade de quem é de qual vila, de quem é Kage, das guerras, alianças, renegados e da
 * Akatsuki; o mundo guarda uma cópia (politics, relida a cada mudança e na manutenção) para decidir na hora quem
 * entra em qual mapa, quem bate em quem na Zona de Conflito e as passivas. Sem a v11 tudo fica desligado.
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

/** Resultado de gravar XP: total, rank e nível (o trigger da v5 dá os pontos) e ryō. */
export interface XpResult {
  totalXp: number;
  rank: RankView;
  promoted: boolean;
  level?: number;
  statPoints?: number;
  levelsGained?: number;
  ryo?: number;
}

/** Grava XP (e ryō do abate) no banco. Ver progression.ts. O XP não promove de rank (v7). */
export interface Progression {
  grantXp(playerId: string, amount: number, ryo?: number): Promise<XpResult | undefined>;
}

/** Kits de quem já jogava antes da v7 (DEFAULTs da migração v5). Conta nova: NEW_KITS. */
export const DEFAULT_KITS: Readonly<Kits> = { A: ['fire', 'water', 'taijutsu', 'heal'], B: ['illusion', 'shadow', 'stone', 'heal'] };
export const NEW_KITS: Readonly<Kits> = { A: ['teleport', 'substitution'], B: [] };
/** Sem ficha do banco (testes, jogo sem banco): sabe os 7 de antes e os 2 da Academia. */
const DEFAULT_JUTSUS: readonly Skill[] = [...LEGACY_JUTSUS, ...ACADEMY_JUTSUS];

/** Visual de quem ainda não criou o personagem (os outros veem este boneco). */
export { DEFAULT_APPEARANCE } from './appearance.js';

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
  /** Progressão v7 no banco (uso de jutsu, tutorial, classes, loja, Extração). */
  store?: NinjaStore;
  /** Sorteio da Extração e dos drops (padrão: crypto). Injetável para teste. */
  secureRandom?: () => number;
  /** Histórico do chat (game.chat_logs). Sem isto: em memória. */
  chatLog?: ChatLog;
  /** Comandos do administrador no banco (auditados). Sem isto: só o /admin spawn funciona (em memória). */
  admin?: AdminStore;
  /** Fim de jogo no banco (migração v11). Sem isto, ou sem a v11 aplicada: módulos desligados. */
  endgame?: EndgameStore;
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
  /** v7. Sem isto (testes): tutorial concluído, sem ryō, os 9 jutsus de antes. */
  tutorialStep?: number;
  ryo?: number;
  items?: Inventory;
  equipped?: string | null;
  classes?: Classes;
  /** Jutsu -> usos já gravados no banco. */
  jutsus?: Record<string, number>;
  kageCandidate?: boolean;
  /** v8: pergaminho levado nas costas (só visual). */
  equippedScroll?: string | null;
  /** v8: Modo Administrador (players.is_admin). Sem isto: false. */
  isAdmin?: boolean;
  /** v16: vila, renegado, Kage, Akatsuki, recompensa e capa (do banco, migração v11). Sem isto: da sessão antiga ou do visual. */
  endgame?: EndgamePlayer;
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
  /** PvP: atordoado (não anda nem ataca) e preso (não anda) até estes instantes. */
  stunnedUntil: number;
  rootedUntil: number;
  /** Teto de controle (config.controlDr): quantas vezes já foi atordoado/preso na janela, e até quando ela vale. */
  controlDr: Record<MonsterStatus, { n: number; until: number }>;
  /** Acabou de renascer: nenhum jogador o machuca até este instante. */
  protectedUntil: number;
  dead: boolean;
  deadAt: number;
  /** Quanto espera para renascer desta morte (na arena é mais curto) e onde ela aconteceu (arena: renasce na entrada). */
  respawnMs: number;
  diedIn: Arena | undefined;
  /** Meditando: parado, sem habilidades, chakra 3x mais rápido. Mover, atacar ou apanhar cancela. */
  meditating: boolean;
  /** Botão 🏃: corre (8) em vez de andar (5). */
  running: boolean;
  /** skill -> instante em que fica pronta de novo */
  cooldowns: Partial<Record<Skill | 'attack' | 'power', number>>;
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
  profileQueue: (() => Promise<void>)[];
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
  /** Aceitar/entregar que chegou dentro da janela: vai uma vez quando ela abrir. */
  missionRetry: ((missions: Missions) => Promise<void>) | undefined;
  /** Posição mudou desde o último envio. */
  dirty: boolean;
  closed: boolean;
  // ------------------------------------------------ v7: progressão
  /** Passo do tutorial (0 a 4) GRAVADO no banco: trava as portas da Academia. */
  tutorial: number;
  /** Pedido de avanço do tutorial a caminho do banco (não repete). */
  tutorialBusy: boolean;
  /** Sala 1: bonecos destruídos com o Ataque Básico. Sala 3: Teleporte e Substituição usados. */
  tutorialKills: number;
  tutorialTeleport: boolean;
  tutorialSubstitution: boolean;
  ryo: number;
  items: Inventory;
  equipped: string | null;
  classes: Classes;
  /** Jutsus aprendidos -> usos (os do banco + os contados nesta sessão). */
  jutsus: Map<string, number>;
  /** Usos ainda não gravados (vão em lote). */
  usagePending: Map<string, number>;
  lastUsageFlush: number;
  kageCandidate: boolean;
  /** Substituição armada até este instante (anula o próximo golpe). */
  substituteUntil: number;
  substituteLevel: number;
  /** Alvo focado quando armou (no nível 4 aparece atrás DELE). */
  substituteFocus: string | undefined;
  // ------------------------------------------------ v8
  /** Modo Administrador (lido do banco ao conectar; o banco confere de novo a cada comando). */
  readonly isAdmin: boolean;
  /** Pergaminho levado nas costas (só visual). */
  equippedScroll: string | null;
  /** Último pedido de histórico do chat. */
  lastHistoryAt: number;
  // ------------------------------------------------ fim de jogo (v16, migração v11)
  /** Layouts de mapa já enviados a esta conexão (os outros vão no map_changed). */
  sentMaps: Set<MapId>;
  /** Vila (null = renegado). O banco é a autoridade; aqui é a cópia lida ao conectar e a cada mudança. */
  village: Village | null;
  renegadeFrom: Village | null;
  bounty: number;
  kageOf: Village | null;
  akatsukiSlot: number | null;
  cape: string | null;
  display: Display;
  villageSwitches: number;
  /** Por onde entrou na sala compartilhada (loja, Academia): a porta de saída leva de volta para lá. */
  doorBack: { map: string; x: number; y: number } | undefined;
  /** Akatsuki: golpes que drenam chakra ou curam até `until`; escudo de cargas; intangível; velocidade extra. */
  powerBuff: { kind: 'drain' | 'lifesteal'; until: number; amount: number } | undefined;
  hearts: number;
  heartsCut: number;
  intangibleUntil: number;
  hasteUntil: number;
  haste: number;
  /** Último pedido de painel (vila, ranking, viagem): toque repetido não vira enxurrada no banco. */
  lastPanelAt: number;
}

/** Sem a v11 (ou antes de ler o banco): nenhum módulo, nenhuma relação. */
const NO_POLITICS: Politics = { modules: [], kages: [], relations: [], events: [], elections: [], akatsuki: [], season: null };
/** Nome de cada módulo no anúncio de quando ele abre. */
const MODULE_NAMES: Record<EndgameModule, string> = {
  vilas: 'as cinco vilas e os Kages', pvp: 'a Zona de Conflito e as temporadas de PvP', renegados: 'os renegados', akatsuki: 'a Akatsuki',
};
const villageName = (v: Village) => `Vila da ${VILLAGE_INFO[v].name}`;
/** Pedidos do fim de jogo que vão ao banco (endgameRequest). */
type EndgameRequest = 'village_panel' | 'kage_vote' | 'kage_action' | 'kage_answer' | 'kage_exile' | 'report_player' | 'kage_report' | 'ranking'
  | 'akatsuki_invite' | 'akatsuki_answer' | 'akatsuki_expel' | 'akatsuki_leave';

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
  /** Dano de cada jogador neste monstro: quem passou de `participation` da vida ganha o abate junto. */
  readonly damageBy: Map<string, number>;
  /** Boneco fixo do mapa: renasce neste ponto. */
  readonly home?: Point;
  /** Invocado por /admin spawn: não dá XP, ryō, drop, missão nem tutorial, e não renasce. */
  readonly admin?: boolean;
  /** Zona de caça onde nasceu (anda só dentro dela). Sem isto: a zona de caça do mapa. */
  readonly zone?: Box;
}

/** Quem uma hitbox pode acertar: um monstro ou (com o PvP ligado) outro jogador. */
type Target =
  | { readonly kind: 'monster'; readonly id: string; readonly x: number; readonly y: number; readonly monster: Monster }
  | { readonly kind: 'player'; readonly id: string; readonly x: number; readonly y: number; readonly session: Session };

/** Fogo, Kunai e Shuriken Gigante voando: o tick anda com eles e decide a colisão (stepProjectile). */
interface Projectile {
  readonly id: number;
  readonly owner: Session;
  readonly map: MapId;
  /** Jutsu que lançou (Fogo, Kunais) ou a arma lançada no Ataque Básico (Shuriken Gigante). */
  readonly skill?: Skill;
  readonly weapon?: string;
  readonly power?: PowerKind;
  x: number;
  y: number;
  readonly ux: number;
  readonly uy: number;
  /** Casas por segundo. */
  readonly speed: number;
  /** Casas que ainda pode andar. */
  left: number;
  readonly damage: number;
  /** Raio da explosão (Fogo). 0 = acerta só quem encostou (Kunai). */
  readonly radius: number;
  /** Kunais do mesmo arremesso: quem já levou uma não leva outra (a kunai passa por ele). */
  readonly volley: Set<string>;
  /** Meia largura da linha que acerta (casas). */
  readonly hitRadius: number;
  /** Atravessa: acerta todos no caminho (cada um uma vez) e só para na parede ou no fim do alcance. */
  readonly pierce: boolean;
  readonly source: 'attack' | 'skill';
}

/** Como um projétil sai: o que é, a força e a forma da hitbox. */
interface LaunchSpec {
  skill?: Skill;
  weapon?: string;
  /** Poder da Akatsuki (Argila Viva, Chuva de Papel). */
  power?: PowerKind;
  speed: number;
  range: number;
  damage: number;
  radius: number;
  volley: Set<string>;
  hitRadius?: number;
  pierce?: boolean;
  source?: 'attack' | 'skill';
}

/** Devolvido pelo `join`: o gateway entrega as mensagens e o fechamento desta conexão. */
export interface SessionHandle {
  receive(data: string | Buffer, isBinary?: boolean): void;
  leave(): void;
}

const silent: WorldLogger = { info() {}, warn() {} };
const DEFAULT_RANK: RankView = { code: 'ACADEMY', name: 'Academia' };

/** Até onde um jogador vê (casas): a densidade só tira monstro que ninguém está vendo. */
const VIEW_RADIUS = 16;

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
  /** O céu: o clima agora, até quando ele dura, o ajuste do relógio (admin "hora") e a última fase avisada. */
  private sky: { weather: Weather; until: number; offsetMs: number; phase: DayPhase };
  private readonly progression: Progression | undefined;
  private readonly missions: Missions | undefined;
  private readonly profile: Profile | undefined;
  private readonly store: NinjaStore | undefined;
  private readonly secureRandom: () => number;
  private readonly chatLog: ChatLog;
  private readonly admin: AdminStore | undefined;
  private purgeTimer: NodeJS.Timeout | undefined;
  /** Bonecos fixos esperando para renascer. */
  private readonly respawns: { type: string; map: MapId; home: Point; at: number }[] = [];
  /** Quem está em cada mapa (envio só para o mesmo mapa sem percorrer todo mundo). */
  private readonly mapPlayers = new Map<MapId, Set<Session>>();
  private timer: NodeJS.Timeout | undefined;
  private lastTick: number;
  private monsterSeq = 0;
  /** Projéteis no ar (Fogo, Kunais), na ordem em que saíram. */
  private readonly projectiles: Projectile[] = [];
  private projectileSeq = 0;
  /** Placar da arena (vitórias e derrotas desde que o servidor subiu; não vai para o banco). */
  private readonly arenaRecord = new Map<string, { wins: number; losses: number }>();
  /** Densidade: quando cada mapa de caça pode ganhar ou perder o próximo monstro. */
  private readonly densityAt = new Map<MapId, number>();
  // ------------------------------------------------ fim de jogo (v16)
  private readonly endgame: EndgameStore | undefined;
  /** A migração v11 já foi encontrada (conferida na manutenção: aplicar no Neon não precisa reiniciar). */
  private endgameReady = false;
  private politics: Politics = NO_POLITICS;
  private modules: ReadonlySet<EndgameModule> = new Set();
  private endgameTimer: NodeJS.Timeout | undefined;
  private endgameBusy = false;

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
    this.store = options.store;
    this.secureRandom = options.secureRandom ?? (() => randomInt(0, 1_000_000) / 1_000_000);
    this.chatLog = options.chatLog ?? memoryChatLog(now);
    this.admin = options.admin;
    this.endgame = options.endgame;
    for (const id of Object.keys(this.config.maps) as MapId[]) this.mapPlayers.set(id, new Set());
    this.lastTick = now();
    // Começa sempre com o clima normal; o primeiro sorteio vem depois do tempo mínimo de um clima.
    this.sky = { weather: 'normal', until: this.lastTick + SKY.weatherMinMs, offsetMs: 0, phase: dayPhase(this.lastTick).phase };
    for (const layout of this.huntingMaps()) {
      while (this.monstersIn(layout.id).length < this.config.combat.monsters.count) this.spawnMonster(undefined, this.lastTick, layout.id);
    }
    // Bonecos fixos (Academia): cada um no seu lugar.
    for (const layout of Object.values(this.config.maps)) {
      for (const sp of layout.spawns ?? []) this.spawnMonster({ x: sp.x, y: sp.y }, this.lastTick, layout.id, sp.type, true);
    }
  }

  /** Números de um tipo de monstro: os bonecos da Academia têm os próprios; o resto é o slime. */
  private monsterType(type: string): MonsterType {
    const known = this.config.combat.monsterTypes[type];
    if (known) return known;
    const m = this.config.combat.monsters;
    return { maxHp: m.maxHp, xp: m.xp, attackRange: m.attackRange, attackDamage: m.attackDamage, attackEveryMs: m.attackEveryMs, stationary: false, respawnMs: 0 };
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
      ...(s.doorBack ? { doorBack: { ...s.doorBack } } : {}),
    };
  }

  private view(s: Session): PlayerView {
    return {
      id: s.id, username: s.username, x: round3(s.x), y: round3(s.y), hp: shownHp(s.hp), maxHp: s.stats.maxHp,
      dead: s.dead, meditating: s.meditating, rank: s.rank, level: s.level,
      appearance: { ...(s.appearance ?? DEFAULT_APPEARANCE) }, dir: dirOf(s.fx, s.fy), gear: this.gear(s),
      ...(this.on('vilas') ? { faction: this.factionView(s) } : {}),
    };
  }

  /**
   * O que aparece no boneco (todos veem): arma na mão ou nas costas e o pergaminho nas costas. Esconder (⚙️) só muda o
   * que os outros veem: a arma continua valendo no golpe.
   */
  private gear(s: Session): Gear {
    const g = gearOf(s.equipped, s.equippedScroll);
    return { hand: s.display.weapon ? g.hand : null, back: s.display.weapon ? g.back : null, scroll: s.display.scroll ? g.scroll : null };
  }

  /** Equipamento mudou: todos no mapa veem o boneco novo. */
  private broadcastGear(s: Session): void {
    this.broadcastMap(s.map, { type: 'player_gear', playerId: s.id, gear: this.gear(s) });
  }

  /** Ficha: nível, XP do nível (zera a cada nível), pontos e o que os atributos dão. */
  private progressView(s: Session): ProgressView {
    const { xpInLevel, xpToNext } = levelProgress(s.xp, s.level);
    const rules = this.config.combat.attributes;
    return {
      level: s.level, xpInLevel, xpToNext, totalXp: s.xp, statPoints: s.statPoints,
      attributes: { ...s.attributes }, nextGain: nextPointGains(rules, s.attributes), derived: { ...s.stats },
      resetCost: rules.resetCostRyo,
    };
  }

  private kitView(s: Session): KitView {
    return { active: s.activeKit, kits: { A: [...s.kits.A], B: [...s.kits.B] } };
  }

  /** Stats da sessão: os dos atributos com a passiva da vila (Pedra: vida; Névoa: velocidade). */
  private statsFor(village: Village | null, attributes: Attributes): DerivedStats {
    const base = this.computeStats(attributes);
    const hp = this.passiveOf(village, 'hp');
    const speed = this.passiveOf(village, 'speed');
    if (hp === 1 && speed === 1) return base;
    return { ...base, maxHp: Math.round(base.maxHp * hp), walkSpeed: round2(base.walkSpeed * speed), runSpeed: round2(base.runSpeed * speed) };
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

  /** Velocidade atual (casas/s): andar ou correr, mais a agilidade (e a passiva da Névoa, já nos stats). Raízes Gêmeas: +20%. */
  private speedOf(s: Session): number {
    const base = s.running ? s.stats.runSpeed : s.stats.walkSpeed;
    return s.hasteUntil > 0 ? round2(base * (1 + s.haste)) : base;
  }

  monsterList(): MonsterView[] {
    return [...this.monsters.values()].map(monsterView);
  }

  /**
   * Layouts que o cliente precisa e ainda não tem: o mapa e os vizinhos dele (saídas e portas: a predição atravessa
   * na hora, então o vizinho já tem que estar lá). Cada um vai uma vez por conexão.
   */
  private layoutsFor(s: Session, map: MapId): Partial<Record<MapId, MapLayout>> {
    const here = this.layout(map);
    const want = [map, ...here.exits.map((e) => e.map), ...here.doors.map((d) => d.map)];
    const out: Partial<Record<MapId, MapLayout>> = {};
    for (const id of want) {
      if (s.sentMaps.has(id) || !this.config.maps[id]) continue;
      s.sentMaps.add(id);
      out[id] = this.config.maps[id];
    }
    return out;
  }

  private worldInfo(s: Session): WorldInfo {
    const map = s.map;
    const { speedTilesPerSecond, tickMs, spawn, combat } = this.config;
    const here = this.layout(map);
    const skills = Object.fromEntries(
      JUTSUS.map((j) => {
        const v = combat.skills[j.code];
        const range = v.range ?? v.radius;
        return [j.code, {
          name: j.name, class: j.class, tier: j.tier, mechanic: v.mechanic, cost: v.cost, cooldownMs: v.cooldownMs,
          ...(range !== undefined ? { range } : {}),
          ...(v.radius !== undefined ? { radius: v.radius } : {}),
        }];
      }),
    ) as WorldInfo['skills'];
    return {
      width: here.width, height: here.height, speed: speedTilesPerSecond, runSpeed: this.config.runSpeedTilesPerSecond,
      tickMs, spawn: { ...spawn }, respawnMs: combat.player.respawnMs, skills,
      meditationRegenMultiplier: combat.player.meditationRegenMultiplier,
      npcs: this.config.npcs.map((n) => ({ ...n })),
      basicAttack: { range: combat.basicAttack.range, cooldownMs: combat.basicAttack.cooldownMs },
      sky: this.skyView(this.now()),
      map,
      maps: this.layoutsFor(s, map),
      attributePerPoint: { ...combat.attributes.perPoint },
      rankLevels: { ...combat.rankLevels },
      classes: CLASSES.map((code) => ({ code, ...CLASS_INFO[code] })),
      items: ITEMS.map((i) => ({ ...i })),
      extraction: EXTRACTION.map((e) => ({ ...e })),
      extractionPityStep: EXTRACTION_PITY_STEP,
      openVillages: this.on('vilas') ? [...VILLAGES] : [...OPEN_VILLAGES],
      jutsuLevelUses: [...JUTSU_LEVEL_USES],
      maxLevel: MAX_LEVEL,
    };
  }

  private ninjaView(s: Session): NinjaView {
    return {
      tutorialStep: s.tutorial, ryo: s.ryo, items: { ...s.items }, equipped: s.equipped, equippedScroll: s.equippedScroll,
      classes: { ...s.classes }, jutsus: Object.fromEntries(s.jutsus), kageCandidate: s.kageCandidate, isAdmin: s.isAdmin,
      villageSwitches: s.villageSwitches, cape: s.cape, display: { ...s.display },
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
    let appearance = player.appearance !== undefined ? player.appearance : (previous?.appearance ?? null);
    // Vila: do banco (v11); sem ele, a da sessão antiga ou a da bandana (o jogo de antes: todos da Folha).
    const eg = player.endgame;
    // A bandana mostra a vila do banco (o admin pode ter mudado; o renegado fica com a de onde saiu, riscada).
    const bandana = eg ? (eg.village ?? eg.renegadeFrom) : null;
    if (appearance && bandana && appearance.village !== bandana) appearance = { ...appearance, village: bandana };
    const village: Village | null = eg ? eg.village : previous ? previous.village : (appearance?.village ?? 'vila_1');
    const stats = this.statsFor(village, attributes);
    const kits: Kits = player.kits ?? previous?.kits ?? DEFAULT_KITS;
    const tutorial = player.tutorialStep ?? previous?.tutorial ?? 4;
    // Quem não terminou o tutorial nasce na Academia, na sala do passo em que está; os outros, na praça da vila deles.
    const home = tutorial < 4 ? { map: 'academy_interior' as MapId, ...academySpawn(tutorial) } : this.homeOf(village);
    const jutsus = new Map<string, number>(
      player.jutsus ? Object.entries(player.jutsus) : previous ? [...previous.jutsus] : DEFAULT_JUTSUS.map((j) => [j, 0]),
    );
    // Reconexão rápida: usos da sessão antiga que ainda não foram para o banco continuam contando.
    if (player.jutsus && previous) for (const [code, n] of previous.usagePending) jutsus.set(code, (jutsus.get(code) ?? 0) + n);
    const session: Session = {
      id: player.id,
      username: player.username,
      conn,
      map: previous?.map ?? home.map,
      x: previous?.x ?? home.x,
      y: previous?.y ?? home.y,
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
      respawnMs: previous?.respawnMs ?? this.config.combat.player.respawnMs,
      diedIn: previous?.diedIn,
      controlDr: { stunned: { n: 0, until: 0 }, rooted: { n: 0, until: 0 } },
      protectedUntil: previous?.protectedUntil ?? 0,
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
      appearance,
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
      missionRetry: undefined,
      dirty: false,
      closed: false,
      tutorial,
      tutorialBusy: false,
      tutorialKills: previous?.tutorialKills ?? 0,
      tutorialTeleport: previous?.tutorialTeleport ?? false,
      tutorialSubstitution: previous?.tutorialSubstitution ?? false,
      ryo: player.ryo ?? previous?.ryo ?? 0,
      items: { ...(player.items ?? previous?.items ?? {}) },
      equipped: player.equipped !== undefined ? player.equipped : (previous?.equipped ?? null),
      classes: { ...(player.classes ?? previous?.classes ?? { primary: null, secondary: null }) },
      jutsus,
      usagePending: new Map(previous?.usagePending ?? []),
      lastUsageFlush: t,
      kageCandidate: player.kageCandidate ?? previous?.kageCandidate ?? false,
      substituteUntil: previous?.substituteUntil ?? 0,
      stunnedUntil: 0,
      rootedUntil: 0,
      substituteLevel: previous?.substituteLevel ?? 1,
      substituteFocus: previous?.substituteFocus,
      isAdmin: player.isAdmin ?? previous?.isAdmin ?? false,
      equippedScroll: player.equippedScroll !== undefined ? player.equippedScroll : (previous?.equippedScroll ?? null),
      lastHistoryAt: 0,
      sentMaps: new Set(),
      village,
      renegadeFrom: eg ? eg.renegadeFrom : (previous?.renegadeFrom ?? null),
      bounty: eg ? eg.bounty : (previous?.bounty ?? 0),
      kageOf: eg ? eg.kageOf : (previous?.kageOf ?? null),
      akatsukiSlot: eg ? eg.akatsukiSlot : (previous?.akatsukiSlot ?? null),
      cape: eg ? eg.cape : (previous?.cape ?? null),
      display: { ...(eg?.display ?? previous?.display ?? SHOW_ALL) },
      villageSwitches: eg ? eg.villageSwitches : (previous?.villageSwitches ?? 0),
      doorBack: previous?.doorBack,
      powerBuff: previous?.powerBuff,
      hearts: previous?.hearts ?? 0,
      heartsCut: previous?.heartsCut ?? 0,
      intangibleUntil: previous?.intangibleUntil ?? 0,
      hasteUntil: previous?.hasteUntil ?? 0,
      haste: previous?.haste ?? 0,
      lastPanelAt: 0,
    };
    // Sala compartilhada (Academia, loja) sem saber por onde entrou: a saída leva para a porta da vila dele.
    if (!session.doorBack) session.doorBack = this.backFor(session, session.map);
    // Sala 2 do tutorial (meditar até encher): quem chega nela começa com o chakra baixo.
    if (!previous && tutorial === 1) session.chakra = Math.floor(session.stats.maxChakra * 0.25);
    if (previous) previous.usagePending.clear();   // passaram para a sessão nova (gravadas uma vez só)
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
      type: 'welcome', you: this.selfView(session), players: this.othersIn(session), monsters: this.monstersIn(session.map), world: this.worldInfo(session),
      progress: this.progressView(session), kit: this.kitView(session), ninja: this.ninjaView(session),
    });
    this.joinEndgame(session, !eg);
    this.syncMission(session.id);
    if (session.canBeSensei) this.syncSensei(session.id);
    this.sendChatHistory(session, t);          // ao abrir o jogo: as mensagens anteriores
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
    this.flushUsage(session);
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
    else if (parsed.type === 'cast') this.cast(session, parsed.skill, t, parsed.targetId, parsed.dir);
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
    else if (parsed.type === 'choose_class') this.chooseClass(session, parsed.class);
    else if (parsed.type === 'extract') this.extract(session, parsed.class, parsed.level);
    else if (parsed.type === 'buy') this.buy(session, parsed.item, parsed.qty);
    else if (parsed.type === 'equip') parsed.slot === 'cape' ? this.equipCape(session, parsed.item) : this.equip(session, parsed.item, parsed.slot ?? 'weapon');
    else if (parsed.type === 'kage_apply' || parsed.type === 'hokage_apply') this.applyKage(session);
    else if (parsed.type === 'reset_attributes') this.resetAttributes(session);
    else if (parsed.type === 'accept_mission') this.acceptMission(session, parsed.offer, t);
    else if (parsed.type === 'deliver_npc_mission') this.deliverNpcMission(session, t);
    else if (parsed.type === 'chat_history') this.sendChatHistory(session, t);
    else if (parsed.type === 'chat') this.chatMessage(session, parsed.message, t);
    else if (parsed.type === 'power') this.power(session, t, parsed.targetId, parsed.dir);
    else if (parsed.type === 'set_display') this.setDisplay(session, { cape: parsed.cape, weapon: parsed.weapon, scroll: parsed.scroll });
    else if (parsed.type === 'travel') this.travel(session, parsed.to, t);
    else this.endgameRequest(session, parsed, t);
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
    // Atordoado ou preso (PvP): as entradas são confirmadas, mas o jogador não sai do lugar.
    const held = t < s.stunnedUntil || t < s.rootedUntil;
    if (s.inputQueue.length > 0) {
      while (s.inputQueue.length > 0 && s.moveBudgetMs >= tickMs) {
        const input = s.inputQueue.shift()!;
        s.moveBudgetMs -= tickMs;
        s.ackSeq = input.seq;
        s.dirty = true;                   // o dono precisa do ack, mesmo parado numa parede
        if (held || s.meditating || (input.dx === 0 && input.dy === 0)) continue;
        const len = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
        s.fx = input.dx / len;
        s.fy = input.dy / len;
        this.step(s, input.dx, input.dy, (this.speedOf(s) * tickMs) / 1000);
      }
    } else if (!held && !s.meditating && (s.dx !== 0 || s.dy !== 0)) {
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
    // Portas da Academia travadas pelo passo GRAVADO do tutorial; vilas em que ele não entra viram parede; a porta de
    // saída da sala compartilhada leva de volta para onde ele entrou (a mesma regra no cliente).
    const gates: MoveGates = { tutorial: s.tutorial, access: this.accessOf(s), back: s.doorBack };
    const [map, x, y] = moveStep(this.config.maps, s.map, s.x, s.y, dx, dy, dist, gates);
    s.doorBack = gates.back;
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
  private transfer(s: Session, to: MapId, x: number, y: number, reason: MapChangeReason): void {
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
    const maps = this.layoutsFor(s, to);
    this.sendTo(s, {
      type: 'map_changed', map: to, x: round3(x), y: round3(y), a: s.ackSeq,
      players: this.othersIn(s), monsters: this.monstersIn(to), reason, ...(Object.keys(maps).length > 0 ? { maps } : {}),
    });
  }

  /**
   * Chat. Ritmo (1/s) e texto limpo primeiro; depois o canal:
   *   "/admin ..."      comando do administrador (nunca vira chat; ver admin.ts)
   *   "/g texto"        global: todos os mapas
   *   "/w Nome texto"   sussurro: só o Nome (online) e quem mandou recebem
   *   outro "/..."      ajuda dos comandos (não vira chat)
   *   texto             fala local: quem está no mesmo mapa
   * Toda fala entra no histórico (24 h), fora do loop.
   */
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
    if (isAdminCommand(message)) return this.adminCommand(session, message, t);
    if (message.startsWith('/')) {
      const global = /^\/g(?:lobal)?\s+(.+)$/i.exec(message);
      if (global) return this.sayGlobal(session, global[1]!);
      const whisper = /^\/(?:w|sussurro)\s+([A-Za-z0-9_]{3,24})\s+(.+)$/i.exec(message);
      if (whisper) return this.whisper(session, whisper[1]!, whisper[2]!);
      return this.sendTo(session, { type: 'notice', text: 'Chat: /g mensagem (global) · /w Nome mensagem (sussurro).', tone: 'info' });
    }
    this.broadcastMap(session.map, { type: 'chat', playerId: session.id, username: session.username, message, channel: 'local' });
    this.recordChat({ channel: 'local', senderId: session.id, senderName: session.username, map: session.map, message });
  }

  /** Global: todos os mapas. */
  private sayGlobal(session: Session, message: string): void {
    this.broadcast({ type: 'chat', playerId: session.id, username: session.username, message, channel: 'global' });
    this.recordChat({ channel: 'global', senderId: session.id, senderName: session.username, message });
  }

  /** Sussurro: só para o destinatário (online) e de volta para quem mandou. */
  private whisper(session: Session, name: string, message: string): void {
    const lower = name.toLowerCase();
    let target: Session | undefined;
    for (const other of this.sessions.values()) if (!other.closed && other.username.toLowerCase() === lower) target = other;
    if (!target) return this.sendTo(session, { type: 'notice', text: `${name} não está online.`, tone: 'bad' });
    if (target === session) return this.sendTo(session, { type: 'notice', text: 'Sussurrar para si mesmo? Tente outro nome.', tone: 'info' });
    const out: ServerMessage = { type: 'chat', playerId: session.id, username: session.username, message, channel: 'whisper', to: target.username };
    this.sendTo(target, out);
    this.sendTo(session, out);
    this.recordChat({ channel: 'whisper', senderId: session.id, senderName: session.username, recipientId: target.id, recipientName: target.username, message });
  }

  private recordChat(entry: ChatRecord): void {
    this.chatLog.record(entry).catch((err: unknown) => this.log.warn({ playerId: entry.senderId, err }, 'falha ao gravar o histórico do chat'));
  }

  /** Histórico (últimas 100 em 24 h): ao conectar e no botão 🕘. No máximo 1 pedido a cada 2 s. */
  private sendChatHistory(session: Session, t: number): void {
    if (t - session.lastHistoryAt < CHAT_HISTORY.requestEveryMs) return;
    session.lastHistoryAt = t;
    const { id } = session;
    this.chatLog.history(id, session.map).then((messages) => {
      const current = this.sessions.get(id);
      if (current) this.sendTo(current, { type: 'chat_history', messages });
      this.flushKicks();
    }).catch((err: unknown) => this.log.warn({ playerId: id, err }, 'falha ao ler o histórico do chat'));
  }

  // ---------------------------------------------------------------- Modo Administrador

  /** Tipos que o /admin spawn aceita: o slime de caça e os bonecos da Academia. */
  private monsterTypeNames(): string[] {
    return [this.config.combat.monsters.type, ...Object.keys(this.config.combat.monsterTypes)];
  }

  /**
   * "/admin ...": só para quem entrou como administrador (players.is_admin). Quem não é admin
   * recebe "Comando desconhecido" e o servidor registra a tentativa no log. Os comandos que
   * mexem no banco vão em fila (um por vez) e cada função do banco confere is_admin de novo e
   * grava a auditoria; o /admin spawn é só de memória e também vai para a auditoria.
   */
  private adminCommand(session: Session, text: string, t: number): void {
    if (!session.isAdmin) {
      this.log.warn({ playerId: session.id }, 'comando de admin recusado: jogador não é administrador');
      return this.sendTo(session, { type: 'notice', text: 'Comando desconhecido.', tone: 'bad' });
    }
    const parsed = parseAdminCommand(text, this.monsterTypeNames(), Object.keys(this.config.maps));
    if (!parsed.ok) {
      this.audit(session.id, /^[a-z]{2,24}$/.test(parsed.command) ? parsed.command : 'invalid', null, { text }, false, parsed.text);
      return this.sendTo(session, { type: 'notice', text: parsed.text, tone: 'bad' });
    }
    const c = parsed.command;
    if (c.cmd === 'help') return this.sendTo(session, { type: 'notice', text: ADMIN_HELP, tone: 'info' });
    if (c.cmd === 'spawn') return this.adminSpawn(session, c.monster, c.quantity, t);
    if (c.cmd === 'ir') return this.adminGo(session, c.map as MapId, c.x, c.y);
    if (c.cmd === 'clima' || c.cmd === 'hora') return this.adminSky(session, c, t);
    const store = this.admin;
    if (!store) return this.sendTo(session, { type: 'notice', text: 'Modo Administrador sem banco: aqui só o /admin spawn funciona.', tone: 'bad' });
    if (isEndgameAdmin(c)) {
      if (!this.readyStore() || !store.endgame) return this.sendTo(session, { type: 'notice', text: 'Admin: rode a migração v11 (fim de jogo) no Neon primeiro.', tone: 'bad' });
      return this.queueTask(session, () => this.runEndgameAdmin(session.id, store, c));
    }
    this.queueTask(session, () => this.runAdmin(session.id, store, c));
  }

  /**
   * Comandos de admin do fim de jogo (v11). O banco confere is_admin e grava a auditoria; aqui só se relê o que mudou.
   * Sem anúncio para ninguém (só o aviso para o admin e, se for o caso, para o alvo).
   */
  private async runEndgameAdmin(adminId: string, store: AdminStore, c: EndgameAdminCommand): Promise<void> {
    const say = (text: string, tone: 'info' | 'good' | 'bad') => this.notice(adminId, text, tone);
    let target: { id: string; username: string } | undefined;
    if ('username' in c) {
      target = await store.findPlayer(c.username);
      if (!target) {
        await store.log(adminId, c.cmd, null, { username: c.username }, false, 'jogador não encontrado');
        return say(`Admin: jogador "${c.username}" não encontrado.`, 'bad');
      }
    }
    const r = await store.endgame!(adminId, c, target?.id ?? null);
    if (!r.ok) return say(`Admin: ${r.text}`, 'bad');
    await this.refreshPolitics();
    if (target) await this.reloadFaction(target.id);
    if (c.cmd === 'temporada') for (const id of this.sessions.keys()) await this.reloadFaction(id);
    say(this.adminEndgameText(c, target?.username ?? '', r.result), 'good');
    // O alvo (online) fica sabendo só ele: nada de anúncio.
    const forTarget = target && target.id !== adminId ? this.adminTargetText(c) : null;
    if (forTarget) this.notice(target!.id, forTarget, 'info');
    this.log.info({ adminId, command: c.cmd, targetId: target?.id ?? null }, 'comando de admin aplicado');
  }

  /** Auditoria sem esperar (spawn e comandos recusados antes do banco). Sem banco: só o log do servidor. */
  private audit(adminId: string, command: string, targetId: string | null, args: Record<string, unknown>, ok: boolean, detail: string | null): void {
    this.log.info({ adminId, command, targetId, ok }, 'comando de admin');
    this.admin?.log(adminId, command, targetId, args, ok, detail).catch((err: unknown) => this.log.warn({ adminId, err }, 'falha ao gravar a auditoria do admin'));
  }

  /**
   * Leva o próprio admin a um mapa (inclusive os lacrados pela história), para testar. No ponto pedido ou, sem ponto,
   * no chão livre mais perto do meio do mapa. Só em memória; vai para a auditoria.
   */
  private adminGo(s: Session, map: MapId, x?: number, y?: number): void {
    const layout = this.layout(map);
    const want = { x: x ?? layout.width / 2, y: y ?? layout.height / 2 };
    let at: Point | undefined;
    for (let r = 0; !at && r < Math.max(layout.width, layout.height); r += 0.5) {
      for (let a = 0; a < 16 && !at; a++) {
        const p = { x: q3(want.x + Math.cos((a / 16) * Math.PI * 2) * r), y: q3(want.y + Math.sin((a / 16) * Math.PI * 2) * r) };
        if (p.x > 0.5 && p.y > 0.5 && p.x < layout.width - 0.5 && p.y < layout.height - 0.5 && !blocked(p.x, p.y, layout.walls)) at = p;
      }
    }
    this.audit(s.id, 'ir', null, { map, x: at?.x ?? null, y: at?.y ?? null }, !!at, null);
    if (!at) return this.sendTo(s, { type: 'notice', text: 'Admin: nenhum chão livre nesse mapa.', tone: 'bad' });
    this.stopMeditation(s, 'manual');
    s.dx = 0;
    s.dy = 0;
    this.dropInputs(s);
    this.transfer(s, map, at.x, at.y, 'travel');
    s.doorBack = this.backFor(s, map);
    s.lastUpdate = this.now();
    s.dirty = true;
    this.sendTo(s, { type: 'notice', text: `Admin: ${layout.name} (${at.x}, ${at.y}).`, tone: 'good' });
  }

  // ---------------------------------------------------------------- o céu (weather.ts)

  /** O que o céu muda nos jutsus no mapa `map` agora; null dentro de casa e na caverna. */
  private skyEffectsAt(map: MapId): SkyEffects | null {
    return outdoors(this.layout(map).kind) ? skyEffects(this.sky.phase, this.sky.weather) : null;
  }

  private skyView(t: number): SkyView {
    const { phase } = dayPhase(t, this.sky.offsetMs);
    return {
      serverNow: t, cycleMs: SKY.cycleMs, offsetMs: this.sky.offsetMs, phaseStarts: { ...SKY.phaseStarts },
      phase, weather: this.sky.weather, effects: skyEffects(phase, this.sky.weather),
    };
  }

  /**
   * A cada tick: virou a fase do dia (escureceu: o dia quente vira normal) ou acabou o tempo do clima (sorteia o
   * próximo)? Avisa todos. O sorteio só acontece aqui, quando o clima vence.
   */
  private updateSky(t: number): void {
    const { phase } = dayPhase(t, this.sky.offsetMs);
    const phaseChanged = phase !== this.sky.phase;
    this.sky.phase = phase;
    let weatherChanged = false;
    if (t >= this.sky.until) {
      this.sky.weather = pickWeather(this.random, phase, this.sky.weather);
      this.sky.until = t + SKY.weatherMinMs + Math.floor(this.random() * (SKY.weatherMaxMs - SKY.weatherMinMs));
      weatherChanged = true;
    } else if (!weatherFits(this.sky.weather, phase)) {
      this.sky.weather = 'normal';
      weatherChanged = true;
    }
    if (phaseChanged || weatherChanged) {
      this.broadcast({ type: 'sky', sky: this.skyView(t), changed: phaseChanged && weatherChanged ? 'both' : phaseChanged ? 'phase' : 'weather' });
    }
  }

  /** Admin: "/admin clima chuva 10" (por N minutos) ou "/admin hora noite" (o ciclo pula para o começo da fase). */
  private adminSky(s: Session, c: { cmd: 'clima'; weather: Weather; minutes: number } | { cmd: 'hora'; phase: DayPhase }, t: number): void {
    if (c.cmd === 'hora') {
      this.sky.offsetMs = offsetFor(c.phase, t);
      if (!weatherFits(this.sky.weather, c.phase)) this.sky.weather = 'normal';
      this.audit(s.id, 'hora', null, { phase: c.phase }, true, null);
    } else {
      const { phase } = dayPhase(t, this.sky.offsetMs);
      if (!weatherFits(c.weather, phase)) {
        this.audit(s.id, 'clima', null, { weather: c.weather }, false, 'dia quente só de dia');
        return this.sendTo(s, { type: 'notice', text: 'Admin: dia quente só de dia (use /admin hora dia antes).', tone: 'bad' });
      }
      this.sky.weather = c.weather;
      this.sky.until = t + c.minutes * 60_000;
      this.audit(s.id, 'clima', null, { weather: c.weather, minutes: c.minutes }, true, null);
    }
    this.sky.phase = dayPhase(t, this.sky.offsetMs).phase;
    this.broadcast({ type: 'sky', sky: this.skyView(t), changed: c.cmd === 'hora' ? 'phase' : 'weather' });
    this.sendTo(s, { type: 'notice', text: c.cmd === 'hora' ? `Admin: agora é ${c.phase}.` : `Admin: clima ${c.weather} por ${c.minutes} min.`, tone: 'good' });
  }

  /** Invoca monstros em volta do admin (casas livres do mapa dele). Não dão recompensa nenhuma. */
  private adminSpawn(s: Session, type: string, quantity: number, t: number): void {
    const layout = this.layout(s.map);
    let made = 0;
    for (let i = 0; i < quantity; i++) {
      const angle = (i / quantity) * Math.PI * 2;
      for (const r of [2, 3, 1.5, 4, 5]) {
        const at = { x: q3(s.x + Math.cos(angle) * r), y: q3(s.y + Math.sin(angle) * r) };
        if (at.x < 0.5 || at.y < 0.5 || at.x > layout.width - 0.5 || at.y > layout.height - 0.5 || blocked(at.x, at.y, layout.walls)) continue;
        this.spawnMonster(at, t, s.map, type, false, true);
        made += 1;
        break;
      }
    }
    this.audit(s.id, 'spawn', null, { monster: type, qty: quantity, map: s.map, made }, made > 0, null);
    this.sendTo(s, { type: 'notice', text: made > 0 ? `Admin: ${made}x ${type} invocado(s) (sem recompensa).` : 'Admin: nenhum espaço livre por perto.', tone: made > 0 ? 'good' : 'bad' });
  }

  /** O aviso para quem o comando mudou (sem anúncio para os outros). */
  private adminTargetText(c: EndgameAdminCommand): string | null {
    switch (c.cmd) {
      case 'vila': return `O administrador mudou a sua vila: agora você é da ${villageName(c.village)}.`;
      case 'kage': return `Você é o Kage da ${villageName(c.village)}.`;
      case 'renegado': return c.on ? 'O administrador tornou você renegado.' : 'O administrador devolveu você à sua vila.';
      case 'akatsuki': return c.action === 'lider' ? 'Você é o líder da Akatsuki.' : 'Você saiu da Akatsuki.';
      default: return null;
    }
  }

  private adminEndgameText(c: EndgameAdminCommand, who: string, result: string | null): string {
    const name = (x: Village | null) => (x ? VILLAGE_INFO[x].name : 'todas');
    switch (c.cmd) {
      case 'endgame': return `Admin: módulo ${c.module} em ${c.mode}. Ligados agora: ${[...this.modules].join(', ') || 'nenhum'}.`;
      case 'vila': return `Admin: ${who} agora é da ${villageName(c.village)}.`;
      case 'kage': return `Admin: ${who} é o Kage da ${villageName(c.village)}.`;
      case 'eleicao': return `Admin: eleição da ${villageName(c.village)} fechada${result ? '' : ' (sem vencedor)'}.`;
      case 'evento': return `Admin: ${c.kind === 'guerra' ? 'guerra' : 'trégua'} forçada (${name(c.a)}${c.b ? ` x ${name(c.b)}` : ''}) por ${c.hours} h.`;
      case 'renegado': return c.on ? `Admin: ${who} virou renegado.` : `Admin: ${who} voltou para a vila de antes.`;
      case 'akatsuki': return c.action === 'lider' ? `Admin: ${who} é o líder da Akatsuki.` : `Admin: ${who} saiu da Akatsuki.`;
      case 'temporada': return `Admin: temporada ${result ?? ''} fechada.`;
    }
  }

  /** Comandos de admin no banco. O alvo online vê a ficha nova na hora (sem anúncio, sem XP de abate). */
  private async runAdmin(adminId: string, store: AdminStore, c: Exclude<AdminCommand, { cmd: 'help' } | { cmd: 'spawn' } | { cmd: 'ir' } | { cmd: 'clima' } | { cmd: 'hora' } | EndgameAdminCommand>): Promise<void> {
    const say = (text: string, tone: 'info' | 'good' | 'bad') => this.notice(adminId, text, tone);
    const target = await store.findPlayer(c.username);
    if (!target) {
      await store.log(adminId, c.cmd, null, { username: c.username }, false, 'jogador não encontrado');
      return say(`Admin: jogador "${c.username}" não encontrado.`, 'bad');
    }
    switch (c.cmd) {
      case 'level': {
        const r = await store.setLevel(adminId, target.id, c.level);
        if (!r.ok) return say(`Admin: ${r.text}`, 'bad');
        this.applyAdminState(target.id, r);
        say(`Admin: ${target.username} agora está no nível ${r.level} (${r.statPoints} pontos livres).`, 'good');
        break;
      }
      case 'givejutsu': {
        const r = await store.giveJutsu(adminId, target.id, c.jutsu, c.level);
        if (!r.ok) return say(`Admin: ${r.text}`, 'bad');
        const s = this.sessions.get(target.id);
        if (s) {
          s.jutsus.set(c.jutsu, Math.max(s.jutsus.get(c.jutsu) ?? 0, r.uses));
          this.sendTo(s, { type: 'jutsus', jutsus: Object.fromEntries(s.jutsus) });
        }
        say(`Admin: ${target.username} recebeu ${JUTSU_BY_CODE.get(c.jutsu as Skill)?.name ?? c.jutsu} (Nv ${jutsuLevel(r.uses)}).`, 'good');
        break;
      }
      case 'giveitem': {
        const r = await store.giveItem(adminId, target.id, c.item, c.quantity);
        if (!r.ok) return say(`Admin: ${r.text}`, 'bad');
        const s = this.sessions.get(target.id);
        if (s) {
          s.items = { ...r.items };
          this.sendInventory(s);
        }
        say(`Admin: ${c.quantity}x ${ITEM_BY_CODE.get(c.item)?.name ?? c.item} para ${target.username}.`, 'good');
        break;
      }
      case 'resetstats': {
        const r = await store.resetStats(adminId, target.id);
        if (!r.ok) return say(`Admin: ${r.text}`, 'bad');
        this.applyAdminState(target.id, r);
        say(`Admin: atributos de ${target.username} redefinidos (${r.statPoints} pontos livres).`, 'good');
        break;
      }
    }
    this.log.info({ adminId, command: c.cmd, targetId: target.id }, 'comando de admin aplicado');
  }

  /** Ficha nova vinda de um comando de admin: nível, XP, pontos e atributos (sem 'xp', sem anúncio). */
  private applyAdminState(playerId: string, state: AdminPlayerState): void {
    const s = this.sessions.get(playerId);
    if (!s) return;
    const levelBefore = s.level;
    s.xp = state.totalXp;
    s.level = state.level;
    this.applyAttributes(s, state.statPoints, state.attributes);
    if (s.level !== levelBefore) this.broadcastMap(s.map, { type: 'player_rank', playerId, rank: s.rank, level: s.level });
  }

  // ---------------------------------------------------------------- combate

  /**
   * Jutsu. Ordem: vivo? fora da zona segura? APRENDEU? está no kit ativo? recarregou? tem
   * chakra? a HITBOX acha alguém? Só então cobra o chakra, avisa todos (`cast`, para a
   * animação), aplica o efeito e CONTA O USO (o nível do jutsu sobe pelo uso, contado só aqui).
   * Falhou antes de cobrar: `cast_failed` só para quem tentou, sem gastar nada.
   *
   * Hitboxes (combat.ts), sempre na posição do SERVIDOR:
   *   Água       cone na direção em que o jogador olha (ou no alvo focado)
   *   Ilusão     círculo em volta do jogador: atordoa todos
   *   Taijutsu   avança até o mais perto e acerta um círculo pequeno na frente
   *   Relâmpago  linha instantânea: o primeiro que ela encosta (dano + choque)
   *   Sombra     linha instantânea: prende o primeiro que ela encosta
   *   Fogo       projétil em linha reta que explode (círculo) no primeiro alvo, na parede ou no fim
   *   Kunais     3 projéteis em leque; cada alvo leva no máximo uma
   *   Cura       em si mesmo ou num aliado perto; Pedra, em si mesmo
   * Acertam monstros e, com o PvP ligado, outros jogadores (targetsFor).
   */
  private cast(session: Session, skill: Skill, t: number, targetId?: string, dir?: [number, number]): void {
    const cfg = this.config.combat.skills[skill];
    const fail = (reason: CastFailReason) => this.sendTo(session, { type: 'cast_failed', skill, reason });
    // Qualquer TENTATIVA de usar habilidade encerra a meditação (mesmo que a habilidade falhe).
    this.stopMeditation(session, 'cast');
    if (session.dead) return fail('DEAD');
    if (t < session.stunnedUntil) return fail('STUNNED');
    // Academia, etapas 1 e 2: só o Ataque Básico (os jutsus chegam na etapa 3, a Sala de Jutsus).
    if (session.tutorial < 2) return fail('TUTORIAL_LOCKED');
    // Zona segura (praça da Vila, lojas, canto do Diretor): nenhuma habilidade. Vale a posição do SERVIDOR.
    if (this.inSafeZone(session)) return fail('SAFE_ZONE');
    // Só jutsu APRENDIDO (Academia, os de antes ou os da Extração) e no kit ATIVO.
    if (!session.jutsus.has(skill)) return fail('NOT_LEARNED');
    if (!session.kits[session.activeKit].includes(skill)) return fail('NOT_EQUIPPED');
    if ((session.cooldowns[skill] ?? 0) > t) return fail('COOLDOWN');
    if (session.chakra < cfg.cost) return fail('NO_CHAKRA');

    const mechanic = cfg.mechanic;
    const level = jutsuLevel(session.jutsus.get(skill) ?? 0);
    // Taijutsu escala com o atributo Taijutsu; Armas com Armas (+ a arma equipada); o resto com Ninjutsu.
    // Nível do jutsu (uso): +10% por nível acima do 1.
    const weaponBonus = mechanic === 'weapons' ? this.weaponDamage(session) : 0;
    // Passiva da Nuvem: +10% no dano dos jutsus.
    // Clima e hora (ao ar livre): Fogo no dia quente, Água e Raio na chuva... (weather.ts).
    const sky = this.skyEffectsAt(session.map);
    const dmg = scaledDamage((cfg.damage ?? 0) + weaponBonus,
      damageMultiplier(session.stats, cfg.scaling ?? 'ninjutsu') * jutsuPower(level) * this.passive(session, 'jutsu') * (sky?.damage[mechanic] ?? 1));
    const lasting = (ms: number) => Math.round(ms * (sky?.status[mechanic] ?? 1));
    const reach = cfg.range ?? cfg.radius ?? 0;
    const targets = this.targetsFor(session);

    // 1. Mira. Jutsu que mira + alvo focado: o focado, dentro do alcance. Sem foco, as formas
    //    estreitas (linha, avanço, projétil) procuram o mais perto; a Água vai para onde o
    //    jogador olha, e o Fogo sem ninguém por perto sai reto para a frente.
    let aim: Target | undefined;
    if (targetId !== undefined && DIRECTED_SKILLS.has(skill)) {
      aim = targets.find((x) => x.id === targetId);
      if (!aim) return fail('NO_TARGET');
      if (distance(session, aim) > reach) return fail('OUT_OF_RANGE');
    } else if (mechanic === 'taijutsu' || mechanic === 'shadow' || mechanic === 'lightning' || mechanic === 'weapons' || mechanic === 'fire') {
      aim = nearest(session, targets, reach);
      if (!aim && mechanic !== 'fire') return fail('NO_TARGET');
    }
    // Mira: o servidor vira o jogador para o alvo (mesmo que ele estivesse olhando para o outro lado).
    if (aim) this.faceTo(session, aim);
    const o: Point = { x: session.x, y: session.y };
    const { fx, fy } = session;

    // 2. Hitbox, ANTES de cobrar: sem ninguém para acertar, falha sem gastar nada.
    let hits: Target[] = [];
    let to: Point | undefined;            // onde o efeito acontece (vai no `cast`, para a animação)
    let dashTo: Point | undefined;
    let healed: Session | undefined;
    let blink: Point | undefined;
    switch (mechanic) {
      case 'water':
        hits = targets.filter((x) => isInCone(o, fx, fy, x, reach, cfg.coneDeg ?? 90));
        break;
      case 'illusion':
        hits = targets.filter((x) => isInCircle(o, cfg.radius ?? 0, x));
        if (hits.length === 0) return fail('NO_TARGET');
        break;
      case 'lightning':
      case 'shadow': {
        const end = rayEnd(this.layout(session.map), o.x, o.y, fx, fy, reach);
        const first = firstOnLine(o, end, targets);
        if (!first) return fail('BLOCKED');            // uma parede entre o jogador e o alvo
        hits = [first.target];
        to = first.at;
        break;
      }
      case 'taijutsu': {
        // Avança até ficar colado no alvo (para antes de parede e de vão), e golpeia um círculo na frente.
        const r = cfg.radius ?? 1;
        const dash = Math.max(0, Math.min(distance(o, aim!) - STRIKE_AHEAD, reach - r));
        dashTo = dash > 0.05 ? rayEnd(this.layout(session.map), o.x, o.y, fx, fy, dash, true) : o;
        to = ahead(dashTo, fx, fy, STRIKE_AHEAD);
        hits = targets.filter((x) => isInCircle(to!, r, x));
        if (hits.length === 0) return fail('BLOCKED');
        break;
      }
      case 'heal': {
        // O aliado FOCADO (perto); senão em si mesmo; senão o aliado mais ferido por perto.
        const hurt = (p: Session) => !p.dead && !p.closed && p.hp < p.stats.maxHp;
        const allies = [...(this.mapPlayers.get(session.map) ?? [])]
          .filter((p) => p !== session && hurt(p) && !this.canHurt(session, p) && isInCircle(o, cfg.radius ?? 0, p))
          .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
        healed = (targetId !== undefined ? allies.find((p) => p.id === targetId) : undefined) ?? (hurt(session) ? session : allies[0]);
        if (!healed) return fail('FULL_HP');
        if (healed !== session) to = { x: healed.x, y: healed.y };
        break;
      }
      case 'stone':
        if (session.shield > 0) return fail('ALREADY_ACTIVE');
        break;
      case 'substitution':
        if (session.substituteUntil > t) return fail('ALREADY_ACTIVE');
        break;
      case 'teleport': {
        // Teleporte Curto: na direção do joystick (ou para onde está virado), até o alcance do NÍVEL,
        // parando antes da primeira parede. Não atravessa parede, porta nem borda.
        const len = dir ? Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]) : 0;
        if (dir && len > 0.1) {
          session.fx = dir[0] / len;
          session.fy = dir[1] / len;
        }
        blink = blinkTarget(this.layout(session.map), session.x, session.y, session.fx, session.fy, teleportRange(level));
        if (distance(session, blink) < 0.5) return fail('BLOCKED');
        break;
      }
      default:
        break;
    }

    // 3. Cobra, avisa todos e aplica.
    session.chakra -= cfg.cost;
    session.cooldowns[skill] = t + (mechanic === 'substitution' ? substitutionCooldownMs(level) : cfg.cooldownMs);
    this.broadcastMap(session.map, {
      type: 'cast', playerId: session.id, skill, x: round2(session.x), y: round2(session.y), fx: round2(session.fx), fy: round2(session.fy),
      ...(to ? { tx: round2(to.x), ty: round2(to.y) } : {}),
    });

    switch (mechanic) {
      case 'water':
        for (const x of hits) this.hitTarget(x, dmg, session, t, 'skill');
        break;
      case 'taijutsu':
        if (dashTo && distance(o, dashTo) > 0.01) this.dash(session, dashTo, t);
        for (const x of hits) this.hitTarget(x, dmg, session, t, 'skill');
        break;
      case 'lightning':
        for (const x of hits) {
          this.applyStatus(x, 'stunned', cfg.stunMs ?? 0, t);
          this.hitTarget(x, dmg, session, t, 'skill');
        }
        break;
      case 'illusion':
        for (const x of hits) this.applyStatus(x, 'stunned', lasting(cfg.stunMs ?? 0), t);
        break;
      case 'shadow':
        for (const x of hits) this.applyStatus(x, 'rooted', lasting(cfg.rootMs ?? 0), t);
        break;
      case 'fire':
        this.launch(session, fx, fy, { skill, speed: cfg.speed ?? 12, range: reach, damage: dmg, radius: cfg.radius ?? 0, volley: new Set() });
        break;
      case 'weapons': {
        // Leque: a do meio primeiro, depois as dos lados (-fan/2 e +fan/2).
        const n = Math.max(1, cfg.shots ?? 3);
        const fan = cfg.fanDeg ?? 45;
        const volley = new Set<string>();
        const angles = [0, ...Array.from({ length: n - 1 }, (_, k) => -fan / 2 + (fan * k) / Math.max(1, n - 2))];
        for (const deg of angles) {
          const [ux, uy] = rotate(fx, fy, deg);
          this.launch(session, ux, uy, { skill, speed: cfg.speed ?? 16, range: reach, damage: dmg, radius: 0, volley });
        }
        break;
      }
      case 'stone':
        session.shield = cfg.reduction ?? 0.5;
        break;
      case 'heal': {
        const h = healed!;
        const before = h.hp;
        // Passiva da Folha: +10% de cura (de quem cura).
        h.hp = Math.min(h.stats.maxHp, h.hp + Math.round((cfg.heal ?? 0) * jutsuPower(level) * this.passive(session, 'heal')));
        const amount = shownHp(h.hp) - shownHp(before);
        this.broadcastMap(h.map, { type: 'hit', target: 'player', id: h.id, amount, kind: 'heal', hp: shownHp(h.hp), maxHp: h.stats.maxHp });
        h.sentHp = shownHp(h.hp);
        if (h !== session) this.sendStats(h, t);
        break;
      }
      case 'teleport': {
        const from = { x: session.x, y: session.y };
        session.x = blink!.x;
        session.y = blink!.y;
        session.lastUpdate = t;
        session.dirty = true;
        // a = última entrada aplicada: o dono refaz as que faltam a partir daqui (sem perder nenhuma).
        this.broadcastMap(session.map, { type: 'teleport', playerId: session.id, fromX: round3(from.x), fromY: round3(from.y), x: round3(session.x), y: round3(session.y), a: session.ackSeq });
        // Etapa 3: o Teleporte precisa ATRAVESSAR o vão da Sala de Jutsus.
        if (session.tutorial === 2 && session.map === 'academy_interior') {
          if (crossedGap(from, session)) {
            session.tutorialTeleport = true;
            this.tutorialProgress(session);
          } else if (!session.tutorialTeleport) {
            this.sendTo(session, { type: 'notice', text: 'Chegue na beira do vão e use o Teleporte na direção dele para saltar por cima.', tone: 'info' });
          }
        }
        break;
      }
      case 'substitution':
        // Fica armada 5 s: o PRÓXIMO golpe acerta um tronco (dano anulado) e o ninja aparece atrás.
        session.substituteUntil = t + (cfg.durationMs ?? 5000);
        session.substituteLevel = level;
        session.substituteFocus = targetId;
        break;
      default:
        break;
    }
    this.countUse(session, skill);
    this.sendStats(session, t);
  }

  // ---------------------------------------------------------------- hitboxes: alvos, projéteis, efeitos

  /**
   * PvP: `attacker` pode machucar `victim`? Os dois vivos, no mesmo mapa, já fora da Academia, fora da zona
   * segura, e quem apanha não acabou de renascer. Então:
   *  - na ARENA: os dois dentro da mesma arena e os dois da vila dona dela (treino entre os ninjas da vila);
   *  - na ZONA DE CONFLITO (módulo pvp): todos contra todos, menos aliados, trégua e Akatsuki com Akatsuki;
   *  - fora delas: só com o PvP aberto ligado, e nunca num mapa de vila (nem com alguém dentro de uma arena).
   */
  private canHurt(attacker: Session, victim: Session, t: number = this.now()): boolean {
    if (attacker === victim || victim.dead || victim.closed || victim.map !== attacker.map) return false;
    if (attacker.tutorial < 4 || victim.tutorial < 4 || t < victim.protectedUntil) return false;
    if (this.inSafeZone(attacker) || this.inSafeZone(victim)) return false;
    const layout = this.layout(attacker.map);
    const arena = arenaAt(layout, attacker.x, attacker.y);
    const victimArena = arenaAt(layout, victim.x, victim.y);
    if (arena || victimArena) {
      // Quem ainda não passou pelo Criador de Personagem só assiste.
      return arena === victimArena && attacker.appearance !== null && victim.appearance !== null
        && attacker.village === arena!.village && victim.village === arena!.village;
    }
    // Zona de Conflito (Módulo 2): PvP livre, menos aliados, trégua e Akatsuki entre si (villages.ts).
    if (layout.conflict) return this.on('pvp') && conflictHostile(this.factionOf(attacker), this.factionOf(victim), this.diplomacy(), t);
    return this.config.combat.pvp && !layout.village;
  }

  /** A arena (dentro da cerca) em que o jogador está agora. */
  private arenaOf(s: Session): Arena | undefined {
    return arenaAt(this.layout(s.map), s.x, s.y);
  }

  /** O que as hitboxes de `s` podem acertar agora: os monstros vivos do mapa e os jogadores que ele pode machucar (arena, PvP aberto). */
  private targetsFor(s: Session): Target[] {
    const out: Target[] = [];
    const t = this.now();
    for (const m of this.monsters.values()) if (m.hp > 0 && m.map === s.map) out.push({ kind: 'monster', id: m.id, x: m.x, y: m.y, monster: m });
    for (const o of this.mapPlayers.get(s.map) ?? []) if (this.canHurt(s, o, t)) out.push({ kind: 'player', id: o.id, x: o.x, y: o.y, session: o });
    return out;
  }

  /** Dano de uma hitbox: no monstro (XP para quem matou) ou no jogador (PvP). Quem já morreu no meio do golpe não apanha de novo. */
  private hitTarget(target: Target, amount: number, attacker: Session, t: number, source: 'attack' | 'skill'): void {
    let hurt = false;
    if (target.kind === 'monster') {
      if (target.monster.hp > 0 && this.monsters.has(target.id)) {
        this.damageMonster(target.monster, amount, attacker, t, source);
        hurt = true;
      }
    } else if (this.canHurt(attacker, target.session, t)) {
      this.damagePlayer(target.session, amount, t, attacker, attacker);
      hurt = true;
    }
    // Akatsuki (Lâmina Sanguessuga / Foice do Pacto): o Ataque Básico drena chakra do ninja atingido ou cura o dono.
    const buff = attacker.powerBuff;
    if (hurt && source === 'attack' && buff && t < buff.until && !attacker.dead) {
      if (buff.kind === 'lifesteal') {
        attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + Math.round(amount * buff.amount));
      } else if (target.kind === 'player') {
        const got = Math.min(buff.amount, target.session.chakra);
        target.session.chakra -= got;
        attacker.chakra = Math.min(attacker.stats.maxChakra, attacker.chakra + got);
      }
    }
  }

  /**
   * Atordoar ou prender um alvo (todos veem). Em JOGADOR vale o teto de controle: de novo dentro da janela,
   * dura a metade, depois um quarto, e depois nada (imune até a janela passar).
   */
  private applyStatus(target: Target, status: MonsterStatus, ms: number, t: number): void {
    const who = target.kind === 'monster' ? target.monster : target.session;
    if (target.kind === 'player') {
      if (t < target.session.intangibleUntil) return;          // Máscara Intangível: nada de atordoar
      const { windowMs, factors } = this.config.combat.controlDr;
      const dr = target.session.controlDr[status];
      if (t >= dr.until) dr.n = 0;
      const factor = factors[Math.min(dr.n, factors.length - 1)] ?? 0;
      dr.n += 1;
      dr.until = t + windowMs;
      ms = Math.round(ms * factor);
      if (ms <= 0) return;
    }
    if (status === 'stunned') who.stunnedUntil = Math.max(who.stunnedUntil, t + ms);
    else who.rootedUntil = Math.max(who.rootedUntil, t + ms);
    if (target.kind === 'monster') this.broadcastMap(target.monster.map, { type: 'monster_status', id: target.id, status, ms });
    else this.broadcastMap(target.session.map, { type: 'player_status', playerId: target.id, status, ms });
  }

  /** O servidor vira o jogador para `p` (mira automática do golpe e dos jutsus). */
  private faceTo(s: Session, p: Point): void {
    const d = distance(s, p);
    if (d > 0.01) {
      s.fx = (p.x - s.x) / d;
      s.fy = (p.y - s.y) / d;
    }
  }

  /** Avanço do Taijutsu: o servidor move o jogador; o dono refaz as entradas que faltam a partir daqui. */
  private dash(s: Session, to: Point, t: number): void {
    const from = { x: s.x, y: s.y };
    s.x = to.x;
    s.y = to.y;
    s.lastUpdate = t;
    s.dirty = true;
    this.broadcastMap(s.map, { type: 'dash', playerId: s.id, fromX: round3(from.x), fromY: round3(from.y), x: round3(s.x), y: round3(s.y), a: s.ackSeq });
  }

  /** Um projétil sai do jogador na direção (fx, fy). Todos veem; o tick anda com ele. */
  private launch(owner: Session, fx: number, fy: number, spec: LaunchSpec): void {
    const [ux, uy] = unit(fx, fy);
    const p: Projectile = {
      id: ++this.projectileSeq, owner, map: owner.map, skill: spec.skill, weapon: spec.weapon, power: spec.power, x: owner.x, y: owner.y, ux, uy,
      speed: spec.speed, left: spec.range, damage: spec.damage, radius: spec.radius, volley: spec.volley,
      hitRadius: spec.hitRadius ?? HIT_RADIUS, pierce: spec.pierce ?? false, source: spec.source ?? 'skill',
    };
    this.projectiles.push(p);
    this.broadcastMap(owner.map, {
      type: 'projectile', id: p.id, playerId: owner.id, ...projectileKind(p),
      x: round2(p.x), y: round2(p.y), fx: round2(ux), fy: round2(uy), speed: spec.speed, range: spec.range,
    });
  }

  /**
   * Um tick de um projétil: o trecho que ele anda neste tick é uma LINHA. O primeiro alvo que
   * ela encosta, a parede ou o fim do alcance param o projétil; o que atravessa (Shuriken Gigante)
   * acerta todos no trecho e segue. Devolve true quando acabou (bateu, ou o dono saiu do jogo ou do mapa).
   */
  private stepProjectile(p: Projectile, dt: number, t: number): boolean {
    if (p.owner.closed || p.owner.map !== p.map) return true;
    const step = Math.min(p.left, p.speed * dt);
    const from = { x: p.x, y: p.y };
    const end = rayEnd(this.layout(p.map), p.x, p.y, p.ux, p.uy, step);
    const wall = distance(from, end) < step - 0.06;
    const fresh = this.targetsFor(p.owner).filter((x) => !p.volley.has(x.id));
    p.x = end.x;
    p.y = end.y;
    p.left -= step;
    if (p.pierce) {
      for (const x of fresh) {
        if (!lineIntersects(from, end, x, p.hitRadius)) continue;
        p.volley.add(x.id);
        this.hitTarget(x, p.damage, p.owner, t, p.source);
      }
      if (!wall && p.left > 1e-9) return false;
      this.impact(p, end, undefined, t);
      return true;
    }
    const first = firstOnLine(from, end, fresh, p.hitRadius);
    if (first) this.impact(p, first.at, first.target, t);
    else if (wall || p.left <= 1e-9) this.impact(p, end, undefined, t);
    else return false;
    return true;
  }

  /** O projétil bateu: o Fogo explode (círculo); a kunai acerta só quem ela encostou. */
  private impact(p: Projectile, at: Point, hit: Target | undefined, t: number): void {
    this.broadcastMap(p.map, {
      type: 'impact', id: p.id, ...projectileKind(p), x: round2(at.x), y: round2(at.y), r: p.radius,
    });
    if (p.radius > 0) {
      for (const x of this.targetsFor(p.owner)) if (isInCircle(at, p.radius, x)) this.hitTarget(x, p.damage, p.owner, t, p.source);
    } else if (hit) {
      p.volley.add(hit.id);
      this.hitTarget(hit, p.damage, p.owner, t, p.source);
    }
  }

  /** Dano da arma equipada (Kunai: +10). Escala com o atributo Armas. */
  private weaponDamage(s: Session): number {
    return (s.equipped ? ITEM_BY_CODE.get(s.equipped)?.damage : undefined) ?? 0;
  }

  /**
   * +1 uso do jutsu (só o servidor conta, e só uso ACEITO). Subiu de nível: avisa o dono e grava
   * na hora; senão grava em lote (a cada 20 usos ou 15 s, e ao sair).
   */
  private countUse(s: Session, skill: Skill): void {
    const before = s.jutsus.get(skill) ?? 0;
    const after = before + 1;
    s.jutsus.set(skill, after);
    s.usagePending.set(skill, (s.usagePending.get(skill) ?? 0) + 1);
    const level = jutsuLevel(after);
    if (level > jutsuLevel(before)) {
      this.sendTo(s, { type: 'jutsu_level', skill, level });
      this.sendTo(s, { type: 'notice', text: `${JUTSU_BY_CODE.get(skill)?.name ?? skill} subiu para o Nível ${level}!`, tone: 'good' });
      this.flushUsage(s);
      return;
    }
    let pending = 0;
    for (const n of s.usagePending.values()) pending += n;
    if (pending >= 20) this.flushUsage(s);
  }

  /** Grava os usos pendentes (fora do loop: o tick nunca espera o banco). */
  private flushUsage(s: Session): Promise<void> {
    s.lastUsageFlush = this.now();
    if (!this.store || s.usagePending.size === 0) {
      s.usagePending.clear();
      return Promise.resolve();
    }
    const uses = [...s.usagePending.entries()];
    s.usagePending.clear();
    const { id } = s;
    return this.store.flushUsage(id, uses).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha ao gravar o uso dos jutsus');
    });
  }

  /** Grava o uso de TODO mundo (desligando o servidor). */
  async flushAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.flushUsage(s)));
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
   * Dano FÍSICO: multiplicador de Taijutsu. Mira no alvo focado (se estiver no alcance) ou no
   * mais perto, e acerta TODOS no ARCO (raio 1,6, 90°) na direção dele. Tentar atacar encerra a
   * meditação, como as habilidades.
   */
  private basicAttack(session: Session, t: number, targetId?: string): void {
    const cfg = this.config.combat.basicAttack;
    const fail = (reason: 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'DEAD' | 'SAFE_ZONE' | 'STUNNED') => this.sendTo(session, { type: 'attack_failed', reason });
    this.stopMeditation(session, 'cast');
    if (session.dead) return fail('DEAD');
    if (t < session.stunnedUntil) return fail('STUNNED');
    if (this.inSafeZone(session)) return fail('SAFE_ZONE');
    if ((session.cooldowns.attack ?? 0) > t) return fail('COOLDOWN');
    // Arma de arremesso (Shuriken Gigante): o golpe vira um lançamento dela, com o alcance dela.
    // As outras mudam o JEITO do golpe (items.ts, `swing`): a kunai é rápida e estreita, a espada longa lenta e larga.
    const weapon = session.equipped ? ITEM_BY_CODE.get(session.equipped) : undefined;
    const thrown = weapon?.throw;
    const swing = weapon?.swing ?? { cooldownFactor: 1, arcDeg: cfg.arcDeg, range: cfg.range };
    const range = thrown ? thrown.range : swing.range;
    const targets = this.targetsFor(session);
    const focused = targetId !== undefined ? targets.find((x) => x.id === targetId) : undefined;
    const aim = focused && distance(session, focused) <= range ? focused : nearest(session, targets, range);
    if (!aim) return fail(focused ? 'OUT_OF_RANGE' : 'NO_TARGET');
    this.faceTo(session, aim);
    const cd = Math.round(session.stats.attackCooldownMs * (thrown ? thrown.cooldownFactor : swing.cooldownFactor));   // Agilidade deixa mais rápido
    session.cooldowns.attack = t + cd;
    this.broadcastMap(session.map, {
      type: 'attack', playerId: session.id, x: round2(session.x), y: round2(session.y), fx: round2(session.fx), fy: round2(session.fy), cd,
      ...(thrown ? { throw: weapon!.code } : { r: swing.range, arc: swing.arcDeg }),
    });
    // FÍSICO: base x Taijutsu + a arma equipada x Armas (Kunai de Treino: +10).
    // Passiva da Areia: +10% no que a arma soma.
    const damage = scaledDamage(cfg.damage, session.stats.physicalMultiplier)
      + scaledDamage(this.weaponDamage(session) * this.passive(session, 'weapons'), session.stats.weaponMultiplier);
    if (thrown) {
      this.launch(session, session.fx, session.fy, {
        weapon: weapon!.code, speed: thrown.speed, range: thrown.range, damage: Math.round(damage * thrown.damageFactor), radius: 0,
        volley: new Set(), hitRadius: thrown.hitRadius, pierce: true, source: 'attack',
      });
      return;
    }
    const hits = targets.filter((x) => isInArc(session, session.fx, session.fy, x, swing.range, swing.arcDeg));
    for (const x of hits) this.hitTarget(x, damage, session, t, 'attack');
    // Etapa 4 (Sala de Armas): acertar o boneco com o Ataque Básico E a arma equipada conclui a Academia.
    if (session.tutorial === 3 && session.map === 'academy_interior' && hits.some((x) => x.kind === 'monster' && x.monster.type === 'dummy')) {
      if (session.equipped) this.advanceTutorial(session, 4);
      else this.sendTo(session, { type: 'notice', text: 'Primeiro abra a mochila 🎒 e equipe a Kunai de Treino.', tone: 'info' });
    }
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

  /** Salvar kits (até 4 por kit, sem repetir: o Zod e o banco conferem; só jutsu APRENDIDO). Grava no banco. */
  private setLoadout(session: Session, kits: Kits): void {
    if (![...kits.A, ...kits.B].every((j) => session.jutsus.has(j))) return this.sendError(session, 'NOT_LEARNED');
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
   * Criador de Personagem: grava o visual (nomes de paleta) e TODOS passam a ver o boneco novo.
   * O visual só muda depois de gravado (o próprio jogador recebe a confirmação também).
   */
  /**
   * Criador de Personagem. Sem o módulo de vilas: só as vilas abertas (ou a que o jogador já tinha). Com ele, a vila da
   * bandana É a vila do ninja: escolher outra passa pelo banco (game.choose_village: de graça na criação, depois uma
   * troca só; renegado não escolhe, a bandana fica a riscada).
   */
  private setAppearance(session: Session, appearance: Appearance): void {
    const { id } = session;
    const store = this.readyStore();
    const membership = this.on('vilas') && store !== undefined;
    if (membership && session.village === null) appearance = { ...appearance, village: session.renegadeFrom ?? appearance.village };
    else if (!membership && !villageAllowed(appearance.village, session.appearance?.village)) return this.sendError(session, 'VILLAGE_LOCKED');
    const choose = membership && session.village !== null && appearance.village !== session.village;
    this.profileTask(session, async (profile) => {
      if (choose) {
        const r = await store!.chooseVillage(id, appearance.village);
        if (!r.ok) return this.notice(id, r.text, 'bad');
      }
      await profile.saveAppearance(id, appearance);
      const current = this.sessions.get(id);
      if (!current) return;
      current.appearance = { ...appearance };
      if (!this.endgame) current.village = appearance.village;   // sem banco do fim de jogo: a vila é a da bandana
      this.broadcastMap(current.map, { type: 'player_appearance', playerId: id, appearance: { ...appearance } });
      if (choose) {
        await this.reloadFaction(id);
        this.notice(id, `Agora você é da ${villageName(appearance.village)}: ${VILLAGE_INFO[appearance.village].passive.text}.`, 'good');
      }
    });
  }

  /** Gastar 1 ponto: o banco confere se tem ponto (sem teto por atributo; o soft cap é daqui). */
  private spendPoint(session: Session, attribute: Attribute): void {
    if (session.statPoints <= 0) return this.sendError(session, 'NO_POINTS');
    const { id } = session;
    this.profileTask(session, (profile) => profile.spendPoint(id, attribute).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendError(current, 'NO_POINTS');
      this.applyAttributes(current, result.statPoints, result.attributes);
      return undefined;
    }));
  }

  /**
   * "Redefinir Atributos": devolve TODOS os pontos investidos e cobra o custo em ryō. O custo é
   * do servidor (config), nunca do cliente; o banco confere saldo e pontos na mesma linha travada.
   */
  private resetAttributes(session: Session): void {
    const cost = this.config.combat.attributes.resetCostRyo;
    const spent = Object.values(session.attributes).reduce((sum, n) => sum + n, 0);
    if (spent === 0) return this.sendTo(session, { type: 'notice', text: 'Você ainda não investiu nenhum ponto.', tone: 'bad' });
    if (session.ryo < cost) return this.sendTo(session, { type: 'notice', text: `Redefinir os atributos custa ${cost} ryō.`, tone: 'bad' });
    const { id } = session;
    this.profileTask(session, (profile) => profile.resetAttributes(id, cost).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendTo(current, { type: 'notice', text: result.text, tone: 'bad' });
      current.ryo = result.ryo;
      this.applyAttributes(current, result.statPoints, result.attributes);
      this.sendInventory(current);
      this.sendTo(current, { type: 'notice', text: `Atributos redefinidos (-${cost} ryō): ${result.statPoints} pontos para distribuir.`, tone: 'good' });
      return undefined;
    }));
  }

  /**
   * Atributos novos (gastar ponto, redefinir, admin): o SERVIDOR recalcula tudo pela curva.
   * Máximo subiu: o valor atual sobe junto (não começa "faltando"); desceu: não passa do máximo.
   */
  private applyAttributes(s: Session, statPoints: number, attributes: Attributes): void {
    const before = s.stats;
    s.statPoints = statPoints;
    s.attributes = { ...attributes };
    s.stats = this.statsFor(s.village, s.attributes);
    if (!s.dead) {
      s.hp = Math.min(s.stats.maxHp, s.hp + Math.max(0, s.stats.maxHp - before.maxHp));
      s.chakra = Math.min(s.stats.maxChakra, s.chakra + Math.max(0, s.stats.maxChakra - before.maxChakra));
    }
    this.sendTo(s, { type: 'progress', ...this.progressView(s) });
    this.sendStats(s, this.now());
    if (s.stats.maxHp !== before.maxHp) {
      this.broadcastMap(s.map, { type: 'player_hp', playerId: s.id, hp: shownHp(s.hp), maxHp: s.stats.maxHp }, s.id);
    }
  }

  /** Põe uma gravação de ficha na fila do jogador (ver profileQueue). */
  private profileTask(session: Session, run: (profile: Profile) => Promise<void>): void {
    const profile = this.profile;
    if (!profile) return this.sendError(session, 'PROFILE_UNAVAILABLE');
    this.queueTask(session, () => run(profile));
  }

  /** Mesma fila para a progressão v7 (loja, Extração, classe, arma, tutorial): uma gravação por vez. */
  private storeTask(session: Session, run: (store: NinjaStore) => Promise<void>): void {
    const store = this.store;
    if (!store) return this.sendError(session, 'PROFILE_UNAVAILABLE');
    this.queueTask(session, () => run(store));
  }

  private queueTask(session: Session, run: () => Promise<void>): void {
    if (session.profileQueue.length >= 5) return this.sendError(session, 'PROFILE_BUSY');
    session.profileQueue.push(run);
    this.pumpProfile(session);
  }

  private pumpProfile(session: Session): void {
    if (session.profileBusy) return;
    const next = session.profileQueue.shift();
    if (!next) return;
    session.profileBusy = true;
    const go = () => {
      session.lastProfileAt = this.now();
      next()
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

  private damageMonster(m: Monster, amount: number, attacker: Session, t: number, source: 'attack' | 'skill'): void {
    m.damageBy.set(attacker.id, (m.damageBy.get(attacker.id) ?? 0) + Math.min(amount, m.hp));   // só o que tirou de verdade
    m.hp = Math.max(0, m.hp - amount);
    this.broadcastMap(m.map, { type: 'hit', target: 'monster', id: m.id, amount, kind: 'damage', hp: m.hp, maxHp: m.maxHp });
    if (m.hp === 0) this.killMonster(m, attacker, t, source);
  }

  /**
   * XP, ryō, chance de pergaminho e o abate da missão para quem PARTICIPOU: o último golpe e todo jogador
   * (ainda online, no mesmo mapa) que tirou pelo menos `participation` da vida dele. Cada um sorteia o seu
   * ryō. Monstro de caça: um novo nasce na hora se o mapa estiver abaixo do alvo de densidade. Boneco fixo
   * (Academia): renasce no mesmo lugar depois de um tempo.
   */
  private killMonster(m: Monster, killer: Session, t: number, source: 'attack' | 'skill'): void {
    this.monsters.delete(m.id);
    this.broadcastMap(m.map, { type: 'monster_died', id: m.id, killerId: killer.id });
    const type = this.monsterType(m.type);
    if (m.home) {
      this.respawns.push({ type: m.type, map: m.map, home: m.home, at: t + type.respawnMs });
    } else if (!m.admin) {
      const layout = this.layout(m.map);
      if (!layout.safe && layout.hunt && this.huntCount(m.map) < this.densityTarget(m.map)) this.spawnMonster(undefined, t, m.map);
    }
    // Invocado pelo admin: nada de XP, ryō, drop, missão nem tutorial (e não renasce).
    if (m.admin) return;
    // Etapa 1 do tutorial: bonecos destruídos com o ATAQUE BÁSICO.
    if (m.type === 'dummy' && source === 'attack' && killer.tutorial === 0) {
      killer.tutorialKills += 1;
      this.tutorialProgress(killer);
    }
    if (type.xp <= 0) return;                                    // boneco de treino: sem XP, sem ryō
    for (const who of this.participants(m, killer)) {
      const ryo = KILL_RYO.min + Math.floor(this.random() * (KILL_RYO.max - KILL_RYO.min + 1));
      this.awardXp(who, type.xp, ryo);
      this.trackKill(who, m.type);
      this.maybeDropScroll(who);
    }
  }

  /** Quem ganha o abate: o último golpe primeiro, depois quem tirou `participation` da vida (online, no mapa). */
  private participants(m: Monster, killer: Session): Session[] {
    const min = m.maxHp * this.config.combat.participation;
    const out = [killer];
    for (const [id, dmg] of m.damageBy) {
      const s = this.sessions.get(id);
      if (s && s !== killer && !s.closed && s.map === m.map && dmg >= min - 1e-9) out.push(s);
    }
    return out;
  }

  /** Monstros de caça de um mapa (sem os bonecos fixos e os do admin). */
  private huntCount(map: MapId): number {
    let n = 0;
    for (const m of this.monsters.values()) if (m.map === map && !m.home && !m.admin) n += 1;
    return n;
  }

  /** Quantos monstros o mapa de caça deve ter agora: a base + `perPlayer` por jogador lá, até o teto. Base 0 = sem caça (testes). */
  private densityTarget(map: MapId): number {
    const cfg = this.config.combat.monsters;
    if (cfg.count <= 0) return 0;
    const players = this.mapPlayers.get(map)?.size ?? 0;
    return Math.min(Math.max(cfg.count, cfg.maxCount ?? cfg.count), cfg.count + (cfg.perPlayer ?? 0) * players);
  }

  /**
   * Densidade, 1 passo a cada `spawnEveryMs` por mapa de caça: faltando monstro, nasce um (longe de todos);
   * sobrando (gente saiu), some um que esteja com a vida cheia e longe de todos (ninguém vê sumir).
   */
  private adjustDensity(t: number): void {
    const cfg = this.config.combat.monsters;
    for (const layout of this.huntingMaps()) {
      if ((this.densityAt.get(layout.id) ?? 0) > t) continue;
      const want = this.densityTarget(layout.id);
      const have = this.huntCount(layout.id);
      if (have === want) continue;
      this.densityAt.set(layout.id, t + (cfg.spawnEveryMs ?? 1000));
      if (have < want) {
        this.spawnMonster(undefined, t, layout.id);
        continue;
      }
      const players = [...(this.mapPlayers.get(layout.id) ?? [])];
      for (const m of this.monsters.values()) {
        if (m.map !== layout.id || m.home || m.admin || m.hp < m.maxHp) continue;
        if (players.some((p) => distance(p, m) < VIEW_RADIUS)) continue;
        this.monsters.delete(m.id);
        this.broadcastMap(m.map, { type: 'monster_gone', id: m.id });
        break;
      }
    }
  }

  /** Genin ou acima: às vezes o monstro deixa 1 pergaminho de uma classe do jogador. */
  private maybeDropScroll(killer: Session): void {
    const store = this.store;
    const owned = [killer.classes.primary, killer.classes.secondary].filter((c): c is ClassCode => c !== null);
    if (!store || owned.length === 0 || this.secureRandom() >= SCROLL_DROP_CHANCE) return;
    const cls = owned[Math.floor(this.secureRandom() * owned.length)]!;
    const { id } = killer;
    store.addItem(id, scrollOf(cls), 1).then((items) => {
      const s = this.sessions.get(id);
      if (!s) return;
      s.items = items;
      this.sendInventory(s);
      this.sendTo(s, { type: 'notice', text: `O monstro deixou um Pergaminho de ${CLASS_INFO[cls].name}!`, tone: 'good' });
    }).catch((err: unknown) => this.log.warn({ playerId: id, err }, 'falha ao gravar o pergaminho do drop'));
  }

  private sendInventory(s: Session): void {
    this.sendTo(s, { type: 'inventory', ryo: s.ryo, items: { ...s.items }, equipped: s.equipped, equippedScroll: s.equippedScroll, cape: s.cape });
  }

  // ---------------------------------------------------------------- tutorial da Academia

  /**
   * O SERVIDOR confere cada etapa (o cliente não diz que concluiu nada):
   *   passo 0 (Sala de Taijutsu) 3 bonecos destruídos com o Ataque Básico (jutsus travados);
   *   passo 1 (Sala de Controle) meditar até o chakra encher, contra o campo que drena (tick);
   *   passo 2 (Sala de Jutsus)   Teleporte Curto por cima do vão e um golpe da armadilha anulado
   *                              pela Substituição;
   *   passo 3 (Sala de Armas)    acertar o boneco com o Ataque Básico e a Kunai de Treino equipada.
   * Concluída a etapa, o servidor leva o jogador para a sala seguinte; no fim, para a Praça da Vila.
   */
  private tutorialProgress(s: Session): void {
    if (s.tutorial === 0) {
      this.sendTo(s, { type: 'notice', text: `Bonecos destruídos: ${Math.min(3, s.tutorialKills)}/3`, tone: 'info' });
      if (s.tutorialKills >= 3) this.advanceTutorial(s, 1);
    } else if (s.tutorial === 2) {
      if (s.tutorialTeleport && s.tutorialSubstitution) this.advanceTutorial(s, 3);
      else this.sendTo(s, { type: 'notice', text: `Teleporte pelo vão ${s.tutorialTeleport ? '✓' : '…'} · Substituição na armadilha ${s.tutorialSubstitution ? '✓' : '…'}`, tone: 'info' });
    }
  }

  /**
   * Avança UM passo, gravando no banco (recompensas lá: Kunai no passo 3; ryō e XP no 4), e leva o
   * jogador para a sala da etapa seguinte (ou para a Praça da Vila, no fim).
   */
  private advanceTutorial(s: Session, to: number): void {
    if (s.tutorialBusy || s.tutorial >= to) return;
    const done = (current: Session) => {
      current.tutorial = to;
      this.sendTo(current, { type: 'tutorial', step: to });
      const lines = [
        '',
        'Etapa 1 concluída! Na Sala de Controle, um campo drena o seu chakra: medite 🧘 até a barra encher.',
        'Etapa 2 concluída! Você aprendeu o Teleporte Curto e a Substituição: salte o vão e use a Substituição contra a armadilha.',
        'Etapa 3 concluída! Você ganhou a Kunai de Treino: abra a mochila 🎒, equipe e acerte o boneco com o Ataque Básico.',
        'Academia concluída! +100 ryō e +50 XP. Bem-vindo à Praça da Vila: o mundo está aberto.',
      ];
      this.sendTo(current, { type: 'notice', text: lines[to] ?? '', tone: 'good' });
      this.moveToStage(current, to);
      if (to === 1) {
        // Sala de Controle: começa com o chakra baixo para o treino valer.
        current.chakra = Math.min(current.chakra, Math.floor(current.stats.maxChakra * 0.25));
        this.sendStats(current, this.now());
      }
    };
    const store = this.store;
    if (!store) {
      // Sem banco (testes, jogo local): avança só em memória, com a Kunai de Treino no passo 3.
      if (to === 3) s.items.kunai_training = Math.max(1, s.items.kunai_training ?? 0);
      done(s);
      if (to === 3) this.sendInventory(s);
      return;
    }
    s.tutorialBusy = true;
    const { id, username } = s;
    store.advanceTutorial(id, to).then((result) => {
      const current = this.sessions.get(id);
      if (!current || !result) return;
      const levelBefore = current.level;
      current.ryo = result.ryo;
      current.items = result.items;
      done(current);
      this.sendInventory(current);
      if (result.totalXp !== current.xp) {
        this.applyXp(id, username, result.totalXp - current.xp, {
          totalXp: result.totalXp, rank: current.rank, promoted: false, level: result.level, statPoints: result.statPoints,
          levelsGained: result.level - levelBefore,
        });
      }
    }).catch((err: unknown) => {
      this.log.warn({ playerId: id, err }, 'falha ao gravar o passo do tutorial');
    }).finally(() => {
      const current = this.sessions.get(id);
      if (current) current.tutorialBusy = false;
      s.tutorialBusy = false;
      this.flushKicks();
    });
  }

  /** Leva o jogador para a sala da etapa `step` (0 a 3) ou, no passo 4, para a Praça da Vila. */
  private moveToStage(s: Session, step: number): void {
    this.stopMeditation(s, 'manual');
    s.dx = 0;
    s.dy = 0;
    this.dropInputs(s);                 // as entradas a caminho são confirmadas: o cliente recomeça do lugar novo
    s.substituteUntil = 0;
    // Fim da Academia: a praça da vila dele (renegado: o Refúgio).
    const home = this.homeOf(s.village);
    const at = step < 4 ? academySpawn(step) : home.map === 'refugio' ? home : this.config.tutorialEnd;
    this.transfer(s, step >= 4 ? home.map : 'academy_interior', at.x, at.y, 'tutorial');
    s.lastUpdate = this.now();
    s.dirty = true;
  }

  /** Chakra/s drenado onde o jogador está (campo da Sala de Controle). */
  private drainAt(s: Session): number {
    const fields = this.layout(s.map).fields;
    if (!fields) return 0;
    for (const f of fields) if (s.x >= f.x && s.x <= f.x + f.w && s.y >= f.y && s.y <= f.y + f.h) return f.chakraPerSec;
    return 0;
  }

  // ---------------------------------------------------------------- classes, loja, Extração, arma, Kage

  /** NPC perto (mesmo mapa, no alcance)? Posição do SERVIDOR. */
  /** O Mestre perto dele (cada vila tem o seu, o mesmo da Sala de Missões). */
  private senseiNear(session: Session): string | undefined {
    return this.config.npcs.find((n) => n.role === 'sensei' && this.near(session, n.id))?.id;
  }

  private near(session: Session, npcId: string): boolean {
    const npc = this.config.npcs.find((n) => n.id === npcId);
    return !!npc && !session.dead && npc.map === session.map && distance(session, npc) <= npc.range;
  }

  /** Diretor da Academia: Missão de Genin (classe Primária) ou, Chunin 40, a classe Secundária. */
  private chooseClass(session: Session, cls: ClassCode): void {
    if (!this.near(session, 'director')) return this.sendError(session, 'DIRECTOR_TOO_FAR');
    const { id, username } = session;
    const refuse = (current: Session, text: string) => this.sendTo(current, { type: 'notice', text, tone: 'bad' });
    if (session.classes.primary !== null) {
      // Já tem a Primária: é a Secundária (Chunin nível 40; o banco confere).
      this.storeTask(session, (store) => store.chooseSecondary(id, cls).then((result) => {
        const current = this.sessions.get(id);
        if (!current) return;
        if (!result.ok) return refuse(current, result.text);
        current.classes = { ...result.classes };
        this.sendTo(current, { type: 'classes', ...current.classes });
        this.sendTo(current, { type: 'notice', text: `Classe Secundária: ${CLASS_INFO[cls].name}.`, tone: 'good' });
        return undefined;
      }));
      return;
    }
    // Missão de Genin: nível 11, tutorial feito, ainda da Academia (o banco confere tudo).
    this.storeTask(session, (store) => store.becomeGenin(id, cls).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return refuse(current, result.text);
      current.classes = { ...result.classes };
      current.rank = result.rank;
      current.canBeSensei = result.canBeSensei;
      current.items = result.items;
      this.sendTo(current, { type: 'classes', ...current.classes });
      this.sendInventory(current);
      this.broadcastMap(current.map, { type: 'player_rank', playerId: id, rank: current.rank, level: current.level });
      this.broadcast({ type: 'announce', message: `${username} passou na Missão de Genin (classe ${CLASS_INFO[cls].name})!` });
      this.sendTo(current, { type: 'notice', text: `Você é Genin! Classe Primária: ${CLASS_INFO[cls].name}. Ganhou 1 pergaminho dela: use na Extração.`, tone: 'good' });
      this.log.info({ playerId: id, cls }, 'jogador virou Genin');
      return undefined;
    }));
  }

  /**
   * Extração (Casa dos Pergaminhos): o SORTEIO é daqui (crypto), nunca do cliente; o banco
   * confere a classe, gasta os pergaminhos e ensina o jutsu na mesma transação.
   */
  private extract(session: Session, cls: ClassCode, level: number): void {
    if (!this.near(session, 'shop_scrolls')) return this.sendError(session, 'SHOP_TOO_FAR');
    const { id } = session;
    const roll = this.secureRandom();
    const pick = this.secureRandom();
    this.storeTask(session, (store) => store.extract(id, cls, level, roll, pick).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendTo(current, { type: 'notice', text: result.text, tone: 'bad' });
      current.items = result.items;
      if (current.equippedScroll !== result.equippedScroll) {
        current.equippedScroll = result.equippedScroll;   // gastou o último que levava nas costas
        this.broadcastGear(current);
      }
      if (result.outcome === 'success' && result.jutsu) {
        current.jutsus.set(result.jutsu, current.jutsus.get(result.jutsu) ?? 0);
        this.sendTo(current, { type: 'jutsus', jutsus: Object.fromEntries(current.jutsus) });
      }
      this.sendTo(current, {
        type: 'extract_result', class: cls, level, outcome: result.outcome, jutsu: (result.jutsu as Skill | null),
        consumed: result.consumed, scrollsLeft: result.scrollsLeft,
      });
      this.sendInventory(current);
      return this.sendExtractOdds(current, store);
    }));
  }

  /** Falhas seguidas na Extração (proteção contra azar): a Casa dos Pergaminhos mostra a chance de verdade. */
  private async sendExtractOdds(s: Session, store: NinjaStore): Promise<void> {
    const { id } = s;
    const failures = await store.extractionFailures(id);
    const current = this.sessions.get(id);
    if (current) this.sendTo(current, { type: 'extract_odds', failures });
  }

  /** Compra: perto do lojista que VENDE o item. Preço e saldo: o banco. */
  private buy(session: Session, item: string, qty: number): void {
    const def = ITEM_BY_CODE.get(item);
    const npc = def?.shop ? this.config.npcs.find((n) => n.shop === def.shop) : undefined;
    if (!def || !npc) return this.sendTo(session, { type: 'notice', text: 'Esse item não está à venda.', tone: 'bad' });
    if (!this.near(session, npc.id)) return this.sendError(session, 'SHOP_TOO_FAR');
    const { id } = session;
    this.storeTask(session, (store) => store.buy(id, item, qty).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendTo(current, { type: 'notice', text: result.text, tone: 'bad' });
      current.ryo = result.ryo;
      current.items = result.items;
      this.sendInventory(current);
      this.sendTo(current, { type: 'notice', text: `Comprou ${qty}x ${def.name}.`, tone: 'good' });
      return undefined;
    }));
  }

  /**
   * Equipar do inventário (item null = guardar): arma (slot weapon) ou pergaminho nas costas
   * (slot scroll). O boneco muda para TODOS (player_gear). Etapa 4 da Academia: equipar a arma é o
   * primeiro passo; acertar o boneco com ela conclui.
   */
  private equip(session: Session, item: string | null, slot: 'weapon' | 'scroll'): void {
    if (item !== null) {
      const kind = ITEM_BY_CODE.get(item)?.kind;
      if (slot === 'weapon' && kind !== 'weapon') return this.sendError(session, 'NOT_A_WEAPON');
      if (slot === 'scroll' && kind !== 'scroll') return this.sendError(session, 'NOT_A_SCROLL');
      if (!((session.items[item] ?? 0) > 0)) return this.sendError(session, 'ITEM_NOT_OWNED');
    }
    const finish = (current: Session, equipped: string | null) => {
      const before = this.gear(current);
      if (slot === 'scroll') current.equippedScroll = equipped;
      else current.equipped = equipped;
      this.sendInventory(current);
      const after = this.gear(current);
      if (before.hand !== after.hand || before.back !== after.back || before.scroll !== after.scroll) this.broadcastGear(current);
      if (slot === 'weapon' && equipped && current.tutorial === 3) {
        this.sendTo(current, { type: 'notice', text: 'Arma equipada! Agora acerte o boneco com o 🗡️ Ataque Básico.', tone: 'good' });
      }
    };
    if (!this.store) {
      finish(session, item);                      // sem banco: só em memória
      return;
    }
    const { id } = session;
    this.storeTask(session, (store) => store.equip(id, item, slot).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendTo(current, { type: 'notice', text: result.text, tone: 'bad' });
      finish(current, result.equipped);
      return undefined;
    }));
  }

  /** Candidatura a Kage: nível 60, com o Diretor. Registrada; a eleição vem numa versão futura. */
  private applyKage(session: Session): void {
    if (!this.near(session, 'director')) return this.sendError(session, 'DIRECTOR_TOO_FAR');
    if (session.level < this.config.combat.rankLevels.kage) {
      return this.sendTo(session, { type: 'notice', text: `A candidatura a Kage é no nível ${this.config.combat.rankLevels.kage}.`, tone: 'bad' });
    }
    const { id, username } = session;
    this.storeTask(session, (store) => store.applyKage(id).then((result) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!result.ok) return this.sendTo(current, { type: 'notice', text: result.text, tone: 'bad' });
      current.kageCandidate = true;
      this.sendTo(current, { type: 'notice', text: result.already ? 'Sua candidatura a Kage já está registrada.' : 'Candidatura a Kage registrada! Aguarde a eleição.', tone: 'good' });
      if (!result.already) this.broadcast({ type: 'announce', message: `${username} se candidatou a Kage!` });
      return undefined;
    }));
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
    if (npc.shop) {
      // Lojista: abre a loja. Mesmo ritmo dos pedidos de missão (toque repetido não vira enxurrada).
      if (t - session.lastMissionAt < this.config.missionRequestEveryMs) return;
      session.lastMissionAt = t;
      if (npc.shop === 'scrolls' && this.store) this.storeTask(session, (store) => this.sendExtractOdds(session, store));
      return this.sendTo(session, { type: 'shop_open', shop: npc.shop, npcId: npc.id });
    }
    if (npc.role === 'travel') {
      // Posto de Viagem (fim de jogo): os destinos que ele tem agora (o servidor confere de novo ao viajar).
      if (!this.on('vilas')) return this.sendError(session, 'ENDGAME_OFF');
      if (t - session.lastMissionAt < this.config.missionRequestEveryMs) return;
      session.lastMissionAt = t;
      return this.sendTo(session, { type: 'travel_options', npcId: npc.id, options: this.travelOptions(session) });
    }
    if (npc.id === 'director' || npc.id.startsWith('tutor_')) {
      if (t - session.lastMissionAt < this.config.missionRequestEveryMs) return;
      session.lastMissionAt = t;
      return npc.id === 'director' ? this.talkDirector(session) : this.sendTo(session, { type: 'npc_say', npcId: npc.id, text: tutorLine(npc.id, session.tutorial) });
    }
    // Mestre: abre a Sala de Missões (cartões + a missão atual). Escolher e entregar são pedidos à parte.
    const { id } = session;
    this.missionRequest(session, t, (m) => Promise.all([m.current(id), m.board()]).then(([mission, offers]) => {
      const current = this.sessions.get(id);
      if (current) this.sendTo(current, { type: 'mission_board', npcId: npc.id, offers, mission });
    }));
  }

  /** Cartão escolhido na Sala de Missões (perto do Mestre). O banco cria a missão com a recompensa do catálogo. */
  private acceptMission(session: Session, offer: string, t: number): void {
    if (!NPC_OFFER_CODES.includes(offer)) return this.sendError(session, 'INVALID_MISSION_OPTION');
    const npcId = this.senseiNear(session);
    if (!npcId) return this.sendError(session, 'SENSEI_TOO_FAR');
    const { id, username } = session;
    this.missionRequest(session, t, (m) => m.talk(id, offer).then((outcome) => this.applyTalk(id, username, npcId, outcome)), true);
  }

  /** Botão "Entregar" da Sala de Missões: o banco confere o objetivo de novo (o cliente só pede). */
  private deliverNpcMission(session: Session, t: number): void {
    const npcId = this.senseiNear(session);
    if (!npcId) return this.sendError(session, 'SENSEI_TOO_FAR');
    const { id, username } = session;
    this.missionRequest(session, t, (m) => m.talk(id, null).then((outcome) => this.applyTalk(id, username, npcId, outcome)), true);
  }

  /** Diretor: o que o jogador pode fazer agora (Missão de Genin, classe Secundária, Exame Chunin, Kage). */
  private talkDirector(s: Session): void {
    const say = (text: string) => this.sendTo(s, { type: 'npc_say', npcId: 'director', text });
    const lv = this.config.combat.rankLevels;
    if (s.tutorial < 4) return say('Primeiro, conclua as quatro etapas da Academia. Os Professores levam você de uma sala para a outra.');
    if (s.rank.code === 'ACADEMY') {
      if (s.level < lv.genin) return say(`A Missão de Genin é no nível ${lv.genin}. Cace na Floresta, ao sul do portão, e volte aqui. (Nível ${s.level})`);
      say('Chegou a hora da Missão de Genin. Escolha sua classe: ela decide quais jutsus você pode aprender.');
      return this.sendTo(s, { type: 'class_choice', kind: 'primary', classes: [...CLASSES] });
    }
    if (s.level >= lv.kage && !s.kageCandidate) {
      return say('Poucos chegam tão longe. Se quiser, registre aqui a sua candidatura a Kage.');
    }
    if (s.rank.code === 'GENIN') {
      if (s.level < lv.chunin) return say(`O Exame Chunin é no nível ${lv.chunin}. Até lá, treine seus jutsus: cada uso conta. (Nível ${s.level})`);
      return say('Você já pode fazer o Exame Chunin. Peça a um Chunin (ou acima) que crie o “Exame Chunin” para você e cumpra a prova.');
    }
    if (s.classes.primary && !s.classes.secondary && s.level >= lv.chunin) {
      say('Um Chunin pode dominar uma segunda classe. Escolha a sua classe Secundária.');
      return this.sendTo(s, { type: 'class_choice', kind: 'secondary', classes: CLASSES.filter((c) => c !== s.classes.primary) });
    }
    return say(s.kageCandidate ? 'Sua candidatura a Kage está registrada. A eleição virá em breve.' : 'Continue treinando. A Vila conta com você.');
  }

  /**
   * Um pedido ao banco de missões por vez, e no máximo 1 a cada `missionRequestEveryMs`.
   * Toque repetido no meio do caminho é ignorado (não enfileira consultas).
   */
  private missionRequest(session: Session, t: number, run: (missions: Missions) => Promise<void>, retry = false): void {
    if (!this.missions) return this.sendError(session, 'MISSIONS_UNAVAILABLE');
    if (session.missionBusy || t - session.lastMissionAt < this.config.missionRequestEveryMs) {
      // Botão da Sala de Missões (aceitar/entregar) logo depois de abrir: não some em silêncio,
      // vai uma vez quando a janela abrir (só o último pedido; toque repetido não enfileira).
      if (retry) this.retryMission(session, run);
      return;
    }
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

  private retryMission(session: Session, run: (missions: Missions) => Promise<void>): void {
    const first = !session.missionRetry;
    session.missionRetry = run;
    if (!first) return;
    const wait = Math.max(50, session.lastMissionAt + this.config.missionRequestEveryMs - this.now());
    setTimeout(() => {
      const again = session.missionRetry;
      session.missionRetry = undefined;
      if (!again || session.closed || this.sessions.get(session.id) !== session) return;
      if (session.missionBusy) return this.retryMission(session, again);
      this.missionRequest(session, this.now(), again);
      this.flushKicks();
    }, wait).unref();
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
      // Exame Chunin aprovado: o banco já promoveu. Atualiza o aprendiz online e anuncia.
      const trainee = this.sessions.get(outcome.traineeId);
      if (trainee && outcome.traineeRank.code !== trainee.rank.code) {
        trainee.rank = { code: outcome.traineeRank.code, name: outcome.traineeRank.name };
        trainee.canBeSensei = outcome.traineeRank.canBeSensei;
        this.broadcastMap(trainee.map, { type: 'player_rank', playerId: trainee.id, rank: trainee.rank, level: trainee.level });
        this.broadcast({ type: 'announce', message: `${trainee.username} passou no Exame Chunin e virou ${trainee.rank.name}!` });
        if (trainee.canBeSensei) this.syncSensei(trainee.id);
      }
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
      case 'none':
        say('Você não tem missão para entregar. Escolha um dos meus treinos.');
        this.sendMission(playerId, null, 'sync');
        break;
      case 'unavailable':
        this.log.warn({}, 'missões do NPC indisponíveis: rode db/schema_v4_npc_missions.sql no banco');
        say('A Sala de Missões ainda não abriu. Volte mais tarde.');
        break;
    }
  }

  /** XP vai para o banco (fora do loop: o tick nunca espera o banco). O aviso só sai depois de gravado. */
  private awardXp(killer: Session, amount: number, ryo = 0): void {
    if (!this.progression) return;
    const { id, username } = killer;
    this.progression.grantXp(id, amount, ryo).then((result) => {
      if (!result) return;
      this.applyXp(id, username, amount, result);
      const current = this.sessions.get(id);
      if (current && result.ryo !== undefined && result.ryo !== current.ryo) {
        current.ryo = result.ryo;
        this.sendInventory(current);
      }
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

  /** Dano num jogador. `by` = outro jogador (arena, PvP aberto): na arena, quem derruba vence a luta. */
  private damagePlayer(session: Session, amount: number, t: number, attacker?: Point, by?: Session): void {
    if (t < session.intangibleUntil) return;                    // Máscara Intangível (Akatsuki)
    // Apanhou: a meditação acaba ANTES do dano (não dá para meditar no meio da luta).
    this.stopMeditation(session, 'damaged');
    if (attacker && session.substituteUntil > t) return this.substitute(session, attacker, t);
    let dmg = amount;
    let shielded = false;
    if (session.shield > 0) {
      dmg = shieldedDamage(amount, session.shield);
      session.shield = 0;
      shielded = true;
    } else if (session.hearts > 0) {                            // Cinco Corações: cada carga corta metade de um golpe
      dmg = Math.round(amount * (1 - session.heartsCut));
      session.hearts -= 1;
      shielded = true;
    }
    session.hp = Math.max(0, session.hp - dmg);
    const maxHp = session.stats.maxHp;
    this.broadcastMap(session.map, { type: 'hit', target: 'player', id: session.id, amount: dmg, kind: 'damage', hp: shownHp(session.hp), maxHp, ...(shielded ? { shielded: true } : {}) });
    session.sentHp = shownHp(session.hp);
    if (session.hp <= 0) {
      const arena = this.arenaOf(session);
      session.dead = true;
      session.deadAt = t;
      session.diedIn = arena;
      session.respawnMs = arena ? this.config.combat.arena.respawnMs : this.config.combat.player.respawnMs;
      session.dx = 0;
      session.dy = 0;
      this.dropInputs(session);           // morto não anda: entradas na fila só são confirmadas
      session.shield = 0;
      this.broadcastMap(session.map, { type: 'player_died', playerId: session.id, respawnInMs: session.respawnMs, ...(arena ? { arena: true } : {}) });
      if (arena && by) this.arenaResult(by, session);
      else if (by && this.layout(session.map).conflict) this.pvpKill(by, session);
    }
    this.sendStats(session, t);
  }

  /** Luta de arena acabou: placar (em memória) e aviso para todos no mapa. Sem XP nem ryō: é treino. */
  private arenaResult(winner: Session, loser: Session): void {
    const rec = (id: string) => {
      let r = this.arenaRecord.get(id);
      if (!r) this.arenaRecord.set(id, (r = { wins: 0, losses: 0 }));
      return r;
    };
    const w = rec(winner.id);
    const l = rec(loser.id);
    w.wins += 1;
    l.losses += 1;
    this.broadcastMap(winner.map, {
      type: 'arena_result', winnerId: winner.id, winner: winner.username, loserId: loser.id, loser: loser.username,
      winnerRecord: { ...w }, loserRecord: { ...l },
    });
  }

  /**
   * Substituição: o golpe acerta um TRONCO no lugar do ninja (dano anulado) e ele aparece
   * atrás do atacante. Nível 4: atrás do alvo FOCADO (se estiver vivo no mesmo mapa).
   */
  private substitute(s: Session, attacker: Point, t: number): void {
    s.substituteUntil = 0;
    const focusId = s.substituteLevel >= 4 ? s.substituteFocus : undefined;
    const focus = focusId ? (this.monsters.get(focusId) ?? this.sessions.get(focusId)) : undefined;   // monstro ou ninja (arena)
    const anchor = focus && focus.hp > 0 && focus.map === s.map ? focus : attacker;
    const log = { x: s.x, y: s.y };
    const spot = behind(this.layout(s.map), s, anchor);
    if (spot) {
      s.x = spot.x;
      s.y = spot.y;
      const d = distance(s, anchor);
      if (d > 0.01) {
        s.fx = (anchor.x - s.x) / d;
        s.fy = (anchor.y - s.y) / d;
      }
      s.lastUpdate = t;
      s.dirty = true;
    }
    this.broadcastMap(s.map, {
      type: 'substitution', playerId: s.id, logX: round3(log.x), logY: round3(log.y), x: round3(s.x), y: round3(s.y), a: s.ackSeq,
    });
    if (s.tutorial === 2 && s.map === 'academy_interior') {
      s.tutorialSubstitution = true;
      this.tutorialProgress(s);
    }
  }

  /**
   * Renascer: só morto e só depois do tempo. Volta à avenida da Vila (ou à sala da Academia; perdeu na arena:
   * na entrada dela) com vida e chakra cheios, e fica uns segundos sem apanhar de outro jogador.
   */
  private respawn(session: Session, t: number): void {
    const { maxHp, maxChakra } = session.stats;
    if (!session.dead || t - session.deadAt < session.respawnMs) {
      this.sendError(session, 'RESPAWN_NOT_READY');
      return;
    }
    session.dead = false;
    session.hp = maxHp;
    session.chakra = maxChakra;
    session.shield = 0;
    session.stunnedUntil = 0;
    session.rootedUntil = 0;
    session.cooldowns = {};
    session.dx = 0;
    session.dy = 0;
    this.dropInputs(session);             // teleporte para a praça: o cliente recomeça daqui
    session.substituteUntil = 0;
    session.protectedUntil = t + this.config.combat.arena.protectMs;
    // Tutorial: renasce na sala do passo em que está (nunca fora da Academia). Arena: na entrada dela.
    const arena = session.diedIn;
    session.diedIn = undefined;
    // Fora da arena: volta para a própria vila (renegado: o Refúgio).
    const home = this.homeOf(session.village);
    const startMap: MapId = session.tutorial < 4 ? 'academy_interior' : arena ? session.map : home.map;
    const spawn = session.tutorial < 4 ? academySpawn(session.tutorial) : arena ? arena.respawn : home;
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
  spawnMonster(at?: Point, t: number = this.now(), map?: MapId, typeName?: string, fixed = false, admin = false): MonsterView {
    const cfg = this.config.combat.monsters;
    const mapId: MapId = map ?? (at ? this.config.startMap : (this.huntingMaps()[0]?.id ?? this.config.startMap));
    const layout = this.layout(mapId);
    // Zonas de caça (docs/mapas.md): sorteia a zona pelo peso; o monstro é o dela e anda só dentro dela.
    const picked = !at && !typeName ? this.pickZone(layout) : undefined;
    const type = typeName ?? picked?.type ?? layout.huntType ?? cfg.type;          // cada mapa de caça tem o seu monstro
    const stats = this.monsterType(type);
    const zone: Box = picked ?? layout.hunt ?? { x: 0, y: 0, w: layout.width, h: layout.height };
    const players = [...(this.mapPlayers.get(mapId) ?? [])];
    let pos = at;
    for (let i = 0; !pos && i < 30; i++) {
      const candidate = { x: Math.floor(zone.x + this.random() * zone.w), y: Math.floor(zone.y + this.random() * zone.h) };
      if ((blocked(candidate.x, candidate.y, layout.walls) || inSafeZone(layout, candidate.x, candidate.y)) && i < 29) continue;
      const tooClose = players.some((s) => !s.dead && distance(s, candidate) < cfg.minPlayerDistance);
      if (!tooClose || i === 29) pos = candidate;
    }
    const m: Monster = {
      id: `m${++this.monsterSeq}`,
      type,
      map: mapId,
      x: pos!.x,
      y: pos!.y,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      nextStepAt: t + cfg.stepMs * (0.5 + this.random()),
      nextAttackAt: t,
      stunnedUntil: 0,
      rootedUntil: 0,
      damageBy: new Map(),
      ...(fixed ? { home: { x: pos!.x, y: pos!.y } } : {}),
      ...(admin ? { admin: true } : {}),
      ...(picked ? { zone: { x: picked.x, y: picked.y, w: picked.w, h: picked.h } } : {}),
    };
    this.monsters.set(m.id, m);
    this.broadcastMap(mapId, { type: 'monster_spawned', monster: monsterView(m) });
    return monsterView(m);
  }

  /** Zona de caça sorteada pelo peso (mapas com `zones`). */
  private pickZone(layout: MapLayout): HuntZone | undefined {
    const zones = layout.zones;
    if (!zones || zones.length === 0) return undefined;
    let roll = this.random() * zones.reduce((sum, z) => sum + z.weight, 0);
    for (const z of zones) {
      roll -= z.weight;
      if (roll < 0) return z;
    }
    return zones[zones.length - 1];
  }

  /** Andar aleatório: 1 casa (ou parado) a cada ~1 s, sem sair da zona de caça e sem entrar nas árvores. */
  private stepMonster(m: Monster, t: number): boolean {
    const cfg = this.config.combat.monsters;
    m.nextStepAt = t + cfg.stepMs * (0.8 + this.random() * 0.4);
    if (t < m.stunnedUntil || t < m.rootedUntil) return false;   // atordoado ou preso: não anda
    if (this.monsterType(m.type).stationary) return false;        // boneco de treino
    if (this.random() < 0.2) return false;                         // às vezes fica parado
    const layout = this.layout(m.map);
    const z = m.zone ?? layout.hunt;
    if (!z) return false;                                          // fora de mapa de caça (teste): parado
    for (let attempt = 0; attempt < 4; attempt++) {
      const [sx, sy] = STEPS[Math.floor(this.random() * STEPS.length)]!;
      const next = { x: m.x + sx, y: m.y + sy };
      if (next.x >= z.x && next.y >= z.y && next.x < z.x + z.w && next.y < z.y + z.h && !blocked(next.x, next.y, layout.walls)
        && !inSafeZone(layout, next.x, next.y)) {                    // monstro não entra em acampamento (zona segura)
        m.x = next.x;
        m.y = next.y;
        return true;
      }
    }
    return false;
  }

  /** Monstro bate em quem está colado (o mais perto), no ritmo do tipo dele. Atordoado não ataca. */
  private monsterAttack(m: Monster, t: number): void {
    const cfg = this.monsterType(m.type);
    if (cfg.attackDamage <= 0 || t < m.nextAttackAt || t < m.stunnedUntil) return;
    const target = nearest(m, this.mapPlayers.get(m.map) ?? [], cfg.attackRange, (s) => !s.dead && !s.closed && !this.inSafeZone(s));
    if (!target) return;
    m.nextAttackAt = t + cfg.attackEveryMs;
    this.damagePlayer(target, cfg.attackDamage, t, m);
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
      // Campo da Sala de Controle: drena o chakra (antes da meditação, que vence o dreno).
      const drain = this.drainAt(s);
      if (drain > 0) s.chakra = Math.max(0, s.chakra - drain * dt);
      // Chakra: SÓ meditando (15/s + atributo). Vida: SÓ com o chakra no máximo.
      if (s.meditating) s.chakra = Math.min(s.stats.maxChakra, s.chakra + s.stats.meditationChakraPerSec * dt);
      if (s.chakra >= s.stats.maxChakra) s.hp = Math.min(s.stats.maxHp, s.hp + p.hpRegenPerSec * dt);
      // Etapa 2 do tutorial: meditando DENTRO da Sala de Controle até o chakra encher.
      if (s.tutorial === 1 && s.meditating && s.chakra >= s.stats.maxChakra && s.map === 'academy_interior'
        && s.x >= ACADEMY.room && s.x < ACADEMY.room * 2) this.advanceTutorial(s, 2);
      if (s.usagePending.size > 0 && t - s.lastUsageFlush >= 15_000) void this.flushUsage(s);
      // Raízes Gêmeas: a velocidade extra acabou (o cliente prevê com a velocidade nova).
      if (s.hasteUntil > 0 && t >= s.hasteUntil) {
        s.hasteUntil = 0;
        this.sendStats(s, t);
      }
    }

    // 0. O céu: virou a fase do dia ou o clima? (avisa todos)
    this.updateSky(t);

    // 1a. Projéteis (Fogo, Kunais): andam e batem (depois de os jogadores andarem neste tick).
    if (this.projectiles.length > 0) {
      let alive = 0;
      for (const pr of this.projectiles) if (!this.stepProjectile(pr, dt, t)) this.projectiles[alive++] = pr;
      this.projectiles.length = alive;
    }

    // 1b. Densidade dos mapas de caça (mais gente, mais monstros) e bonecos fixos que renascem.
    this.adjustDensity(t);
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]!;
      if (t < r.at) continue;
      this.respawns.splice(i, 1);
      this.spawnMonster({ ...r.home }, t, r.map, r.type, true);
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
    // Histórico do chat: apaga o que passou de 24 h (fora do loop).
    this.purgeTimer = setInterval(() => {
      this.chatLog.purge().catch((err: unknown) => this.log.warn({ err }, 'falha ao limpar o histórico do chat'));
    }, CHAT_HISTORY.purgeEveryMs);
    this.purgeTimer.unref();
    // Fim de jogo: confere a v11, a população e roda a manutenção (eleições, temporadas) a cada minuto.
    if (this.endgame) {
      void this.endgameMaintenance();
      this.endgameTimer = setInterval(() => void this.endgameMaintenance(), this.config.endgame.tickMs);
      this.endgameTimer.unref();
    }
  }

  /** Para o loop e fecha todo mundo (deploy/reinício do Render). */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    if (this.endgameTimer) clearInterval(this.endgameTimer);
    this.timer = undefined;
    this.purgeTimer = undefined;
    this.endgameTimer = undefined;
    for (const session of this.sessions.values()) {
      session.closed = true;
      safeClose(session.conn, CLOSE.SHUTDOWN);
    }
    this.sessions.clear();
    for (const set of this.mapPlayers.values()) set.clear();
  }

  // ---------------------------------------------------------------- fim de jogo (v16, docs/endgame.md)

  /** O módulo vale agora? (ele e os anteriores ligados; game.endgame_active no banco) */
  private on(module: EndgameModule): boolean {
    return this.modules.has(module);
  }

  /** O banco do fim de jogo, se a v11 já foi encontrada. */
  private readyStore(): EndgameStore | undefined {
    return this.endgameReady ? this.endgame : undefined;
  }

  private diplomacy(): Diplomacy {
    return { relations: this.politics.relations, events: this.politics.events };
  }

  private factionOf(s: Session): Faction {
    return { village: s.village, akatsuki: s.akatsukiSlot !== null };
  }

  /** Quem entra em qual mapa: a vila dele e as aliadas (renegado: só o Refúgio). Sem o módulo de vilas: tudo aberto. */
  private accessOf(s: Session): MapAccess | undefined {
    if (!this.on('vilas')) return undefined;
    return { village: s.village, allies: alliesOf(s.village, this.diplomacy(), this.now()) };
  }

  /** Casa do ninja: a praça da vila dele (renegado: o Refúgio). Sem o módulo: a Vila de sempre. */
  private homeOf(village: Village | null): { map: MapId; x: number; y: number } {
    if (!this.on('vilas')) return { map: this.config.startMap, ...this.config.spawn };
    if (village === null) return { map: 'refugio', ...REFUGE.spawn };
    return { map: VILLAGE_INFO[village].map as MapId, ...this.config.spawn };
  }

  /** Passiva da vila: 1 + o bônus no que a vila dá, 1 no resto (renegado não tem; módulo desligado: nada). */
  private passiveOf(village: Village | null, kind: PassiveKind): number {
    if (!this.on('vilas') || village === null) return 1;
    const p = VILLAGE_INFO[village].passive;
    return p.kind === kind ? 1 + p.bonus : 1;
  }

  private passive(s: Session, kind: PassiveKind): number {
    return this.passiveOf(s.village, kind);
  }

  /**
   * A porta da vila do ninja que leva à sala `room` (loja, Academia): o ponto de fora, para onde a saída da sala leva.
   * undefined = não é sala compartilhada.
   */
  private backFor(s: Pick<Session, 'village'>, room: MapId): { map: string; x: number; y: number } | undefined {
    const home = this.homeOf(s.village).map;
    const door = this.layout(home).doors.find((d) => d.map === room && d.back);
    return door?.back ? { map: home, x: door.back.x, y: door.back.y } : undefined;
  }

  /** Como os outros veem o lado dele: vila, renegado, Kage, Akatsuki, recompensa (renegado) e a capa (se mostra). */
  private factionView(s: Session): FactionView {
    return {
      village: s.village,
      ...(s.village === null && s.renegadeFrom ? { renegadeFrom: s.renegadeFrom } : {}),
      ...(s.kageOf ? { kage: s.kageOf } : {}),
      ...(s.akatsukiSlot !== null ? { akatsuki: s.akatsukiSlot } : {}),
      ...(s.village === null && s.bounty >= this.config.endgame.showBountyFrom ? { bounty: s.bounty } : {}),
      ...(s.cape && s.display.cape ? { cape: s.cape } : {}),
    };
  }

  private broadcastFaction(s: Session): void {
    if (this.on('vilas')) this.broadcastMap(s.map, { type: 'player_faction', playerId: s.id, faction: this.factionView(s) });
  }

  /** Estado político que todos recebem. */
  endgameView(): EndgameView {
    const p = this.politics;
    return {
      modules: [...this.modules],
      villages: VILLAGES.map((code) => ({ code, name: VILLAGE_INFO[code].name, map: VILLAGE_INFO[code].map as MapId, passive: VILLAGE_INFO[code].passive.text })),
      kages: p.kages.map((k) => ({ ...k })),
      relations: p.relations.map((r) => ({ ...r })),
      events: p.events.map((e) => ({ ...e })),
      akatsuki: p.akatsuki.map((a) => ({ ...a, power: POWER_BY_SLOT.get(a.slot)?.name ?? '' })),
      season: p.season ? { ...p.season } : null,
      allyTravelRyo: this.config.endgame.allyTravelRyo,
      powers: POWERS.map(({ slot, code, name, text, cooldownMs, cost }) => ({ slot, code, name, text, cooldownMs, cost })),
    };
  }

  /**
   * Lado do jogador no banco, para o gateway pôr no `join` (antes do welcome: ele já nasce na vila certa).
   * undefined = sem a v11 ou o banco falhou (o mundo relê depois).
   */
  async loadEndgamePlayer(playerId: string): Promise<EndgamePlayer | undefined> {
    const store = this.readyStore();
    if (!store) return undefined;
    try {
      return await store.player(playerId);
    } catch (err) {
      this.log.warn({ playerId, err }, 'fim de jogo: falha ao ler o jogador');
      return undefined;
    }
  }

  /** Depois do welcome: estado político, "visto agora" (população ativa), convite da Akatsuki e, se faltou, o lado dele. */
  private joinEndgame(s: Session, reload: boolean): void {
    const store = this.readyStore();
    if (!store) return;
    this.sendTo(s, { type: 'endgame', ...this.endgameView() });
    const { id } = s;
    store.touch(id).catch((err: unknown) => this.log.warn({ playerId: id, err }, 'fim de jogo: falha ao marcar a entrada'));
    if (reload) void this.reloadFaction(id);
    else this.enforceAccess(s);
    if (this.on('akatsuki')) {
      store.akatsukiInviteOf(id).then((inv) => {
        const current = this.sessions.get(id);
        if (current && inv) this.sendTo(current, { type: 'akatsuki_invite', from: inv.from, slot: inv.slot, power: POWER_BY_SLOT.get(inv.slot)?.name ?? '', expiresAt: inv.expiresAt });
      }).catch((err: unknown) => this.log.warn({ playerId: id, err }, 'fim de jogo: falha ao ler o convite'));
    }
  }

  /** Relê do banco o lado do ninja e aplica (passivas, mapa, boneco). Online ou não, nunca lança. */
  private async reloadFaction(playerId: string): Promise<void> {
    const store = this.readyStore();
    if (!store) return;
    try {
      const eg = await store.player(playerId);
      const s = this.sessions.get(playerId);
      if (s && eg) this.applyFaction(s, eg);
    } catch (err) {
      this.log.warn({ playerId, err }, 'fim de jogo: falha ao reler o jogador');
    }
    this.flushKicks();
  }

  private applyFaction(s: Session, eg: EndgamePlayer): void {
    const before = JSON.stringify(this.factionView(s));
    const villageBefore = s.village;
    s.village = eg.village;
    s.renegadeFrom = eg.renegadeFrom;
    s.bounty = eg.bounty;
    s.kageOf = eg.kageOf;
    s.akatsukiSlot = eg.akatsukiSlot;
    s.cape = eg.cape;
    s.display = { ...eg.display };
    s.villageSwitches = eg.villageSwitches;
    if (s.village === null) s.powerBuff = s.akatsukiSlot === null ? undefined : s.powerBuff;
    // A bandana acompanha a vila (o renegado fica com a de onde saiu, riscada).
    const bandana = s.village ?? s.renegadeFrom;
    if (s.appearance && bandana && s.appearance.village !== bandana) {
      s.appearance = { ...s.appearance, village: bandana };
      this.broadcastMap(s.map, { type: 'player_appearance', playerId: s.id, appearance: { ...s.appearance } });
    }
    if (villageBefore !== s.village) this.applyAttributes(s, s.statPoints, s.attributes);   // passiva nova (ou nenhuma)
    if (JSON.stringify(this.factionView(s)) !== before) this.broadcastFaction(s);
    this.sendInventory(s);
    this.enforceAccess(s);
  }

  /**
   * Está num mapa em que não pode ficar (virou renegado dentro da vila, a aliança acabou, o módulo desligou)? Volta para
   * casa. Numa sala compartilhada, a porta de saída passa a levar para a vila dele.
   */
  private enforceAccess(s: Session): void {
    if (s.closed) return;
    const access = this.accessOf(s);
    const here = this.layout(s.map);
    const allowed = (m: MapLayout | undefined) => {
      if (!m) return false;
      if (!access) return !m.refuge && !m.conflict && !(m.village && m.village !== 'vila_1');
      if (m.conflict) return this.on('pvp');
      return mapAllowed(m, access);
    };
    if (s.doorBack && !allowed(this.config.maps[s.doorBack.map as MapId])) s.doorBack = this.backFor(s, s.map);
    if (here.kind === 'interior' || here.id === 'academy_interior' || s.dead) return;   // morto: o renascer já leva para casa
    if (allowed(here)) return;
    const home = s.tutorial < 4 ? { map: 'academy_interior' as MapId, ...academySpawn(s.tutorial) } : this.homeOf(s.village);
    this.stopMeditation(s, 'manual');
    s.dx = 0;
    s.dy = 0;
    this.dropInputs(s);
    this.transfer(s, home.map, home.x, home.y, 'exiled');
    this.sendTo(s, { type: 'notice', text: 'Você não pode ficar neste mapa agora: voltou para casa.', tone: 'bad' });
  }

  /** Relê o estado político e avisa todos. Kage, Akatsuki e módulos que mudaram: passivas, acessos e o boneco de cada um. */
  async refreshPolitics(): Promise<void> {
    const store = this.readyStore();
    if (!store) return;
    try {
      const p = await store.politics();
      const modulesBefore = [...this.modules].join();
      this.politics = p;
      this.modules = activeModules(p.modules);
      const modulesChanged = modulesBefore !== [...this.modules].join();
      this.broadcast({ type: 'endgame', ...this.endgameView() });
      for (const s of this.sessions.values()) {
        if (s.closed) continue;
        const before = JSON.stringify(this.factionView(s));
        s.kageOf = p.kages.find((k) => k.playerId === s.id)?.village ?? null;
        s.akatsukiSlot = p.akatsuki.find((a) => a.playerId === s.id)?.slot ?? null;
        if (modulesChanged) {
          this.applyAttributes(s, s.statPoints, s.attributes);
          this.broadcastMap(s.map, { type: 'player_faction', playerId: s.id, faction: this.factionView(s) });
        } else if (JSON.stringify(this.factionView(s)) !== before) this.broadcastFaction(s);
        this.enforceAccess(s);
      }
    } catch (err) {
      this.log.warn({ err }, 'fim de jogo: falha ao ler o estado político');
    }
    this.flushKicks();
  }

  /**
   * Manutenção (a cada config.endgame.tickMs): procura a v11 (aplicar no Neon não precisa reiniciar), liga os módulos
   * que a população alcançou, roda game.endgame_tick (mandatos, eleições, propostas, temporadas) e relê a política.
   */
  async endgameMaintenance(): Promise<void> {
    if (!this.endgame || this.endgameBusy) return;
    this.endgameBusy = true;
    try {
      const store = this.endgame;
      if (!this.endgameReady) {
        if (!(await store.available())) return;
        this.endgameReady = true;
        this.log.info({}, 'fim de jogo: migração v11 encontrada');
        await this.refreshPolitics();
        await Promise.all([...this.sessions.keys()].map((id) => this.reloadFaction(id)));
        for (const s of this.sessions.values()) this.sendTo(s, { type: 'endgame', ...this.endgameView() });
      }
      const cfg = this.config.endgame;
      const population = await store.population(cfg.populationDays);
      const rows = (await store.politics()).modules;
      for (const code of dueModules(rows, population, cfg.thresholds)) {
        if (await store.activate(code)) {
          this.broadcast({ type: 'announce', message: `🔥 O mundo cresceu! Abriram ${MODULE_NAMES[code]}.` });
          this.log.info({ module: code, population }, 'fim de jogo: módulo ativado pela população');
        }
      }
      const events = await store.tick();
      await this.refreshPolitics();
      for (const e of events) this.announceTick(e);
    } catch (err) {
      this.log.warn({ err }, 'fim de jogo: falha na manutenção');
    } finally {
      this.endgameBusy = false;
      this.flushKicks();
    }
  }

  private announceTick(e: TickEvent): void {
    const name = (id: string | null) => (id ? (this.sessions.get(id)?.username ?? this.politics.kages.find((k) => k.playerId === id)?.username) : undefined);
    const v = e.village ? villageName(e.village) : '';
    const season = typeof e.info?.season === 'number' ? e.info.season : '';
    const text = {
      kage_fim: `O mandato do Kage da ${v} acabou.`,
      eleicao_fechada: e.playerId ? `👑 ${name(e.playerId) ?? 'Um ninja'} é o novo Kage da ${v}!` : `A eleição da ${v} terminou sem vencedor: outra vai abrir.`,
      eleicao_aberta: `🗳️ A eleição para Kage da ${v} abriu (7 dias). Vote no painel da vila.`,
      temporada_aberta: `⚔️ A Temporada ${season} do PvP começou! Zona de Conflito aberta.`,
      temporada_fechada: `🏆 A Temporada ${season} do PvP acabou! As recompensas foram entregues.`,
    }[e.kind];
    if (text) this.broadcast({ type: 'announce', message: text });
    if (e.kind === 'temporada_fechada') for (const id of this.sessions.keys()) void this.reloadFaction(id);
  }

  /** Pedidos do fim de jogo que vão ao banco (painel, Kage, denúncia, ranking, Akatsuki). Um por vez, com ritmo. */
  private endgameRequest(s: Session, m: Extract<ClientMessage, { type: EndgameRequest }>, t: number): void {
    const store = this.readyStore();
    if (!store || !this.on('vilas')) return this.sendError(s, 'ENDGAME_OFF');
    if (t - s.lastPanelAt < this.config.missionRequestEveryMs) return;
    s.lastPanelAt = t;
    const { id, username } = s;
    const say = (text: string, tone: 'info' | 'good' | 'bad' = 'info') => this.notice(id, text, tone);
    const refuse = (r: { ok: false; text: string }) => say(r.text, 'bad');
    const kageVillage = s.kageOf;
    this.queueTask(s, async () => {
      switch (m.type) {
        case 'village_panel':
          return this.sendPanel(id);
        case 'kage_vote': {
          const r = await store.vote(id, m.candidate);
          if (!r.ok) return refuse(r);
          say('Voto registrado.', 'good');
          return this.sendPanel(id);
        }
        case 'kage_action': {
          const r = await store.kageAction(id, m.action, m.village);
          if (!r.ok) return refuse(r);
          await this.refreshPolitics();
          if (kageVillage) this.announceDiplomacy(kageVillage, m.village, m.action);
          return this.sendPanel(id);
        }
        case 'kage_answer': {
          const r = await store.kageAnswer(id, m.proposal, m.accept);
          if (!r.ok) return refuse(r);
          await this.refreshPolitics();
          say(m.accept ? 'Proposta aceita.' : 'Proposta recusada.', m.accept ? 'good' : 'info');
          return this.sendPanel(id);
        }
        case 'kage_exile': {
          const r = await store.exile(id, m.name, m.reason);
          if (!r.ok) return refuse(r);
          await this.becameRenegade(r.targetId, r.username, kageVillage, `expulso pelo Kage`);
          return this.sendPanel(id);
        }
        case 'report_player': {
          const r = await store.report(id, m.name, m.reason);
          if (!r.ok) return refuse(r);
          say('Denúncia enviada ao Kage da vila.', 'good');
          const kage = this.politics.kages.find((k) => k.village === s.village);
          if (kage) this.notice(kage.playerId, `📜 Nova denúncia de ${username} no painel da vila.`, 'info');
          return;
        }
        case 'kage_report': {
          const r = await store.decideReport(id, m.report, m.approve);
          if (!r.ok) return refuse(r);
          if (m.approve) await this.becameRenegade(r.targetId, undefined, kageVillage, 'denúncia aprovada pelo Kage');
          else say('Denúncia recusada.', 'info');
          return this.sendPanel(id);
        }
        case 'ranking': {
          if (!this.on('pvp')) return say('O ranking abre com a Zona de Conflito.', 'bad');
          const r = await store.ranking(id, 50);
          const current = this.sessions.get(id);
          if (current) this.sendTo(current, { type: 'ranking', ...r });
          return;
        }
        case 'akatsuki_invite': {
          const r = await store.akatsukiInvite(id, m.name, m.slot);
          if (!r.ok) return refuse(r);
          say(`Convite enviado a ${r.username} (vaga ${m.slot}).`, 'good');
          const target = this.sessions.get(r.targetId);
          if (target) {
            this.sendTo(target, {
              type: 'akatsuki_invite', from: username, slot: m.slot, power: POWER_BY_SLOT.get(m.slot)?.name ?? '', expiresAt: this.now() + 48 * 3600_000,
            });
          }
          return;
        }
        case 'akatsuki_answer': {
          if (!m.accept) {
            await store.akatsukiDecline(id);
            return say('Convite recusado.', 'info');
          }
          const r = await store.akatsukiAccept(id);
          if (!r.ok) return refuse(r);
          await this.refreshPolitics();
          await this.reloadFaction(id);
          this.broadcast({ type: 'announce', message: `☁️ ${username} entrou para a Akatsuki.` });
          return;
        }
        case 'akatsuki_expel': {
          const r = await store.akatsukiExpel(id, m.name);
          if (!r.ok) return refuse(r);
          await this.refreshPolitics();
          await this.reloadFaction(r.targetId);
          this.notice(r.targetId, 'Você foi expulso da Akatsuki (continua renegado).', 'bad');
          return say(`${r.username} saiu da Akatsuki.`, 'info');
        }
        case 'akatsuki_leave': {
          const r = await store.akatsukiLeave(id);
          if (!r.ok) return refuse(r);
          await this.refreshPolitics();
          await this.reloadFaction(id);
          return say('Você saiu da Akatsuki (continua renegado).', 'info');
        }
      }
    });
  }

  private async sendPanel(playerId: string): Promise<void> {
    const store = this.readyStore();
    const s = this.sessions.get(playerId);
    if (!store || !s) return;
    if (s.village === null) return this.notice(playerId, 'Renegado não tem vila.', 'bad');
    const village = s.village;
    const isKage = s.kageOf === village;
    const panel = await store.villagePanel(playerId, village, isKage);
    const current = this.sessions.get(playerId);
    if (current) this.sendTo(current, { type: 'village_panel', panel, isKage, passive: VILLAGE_INFO[village].passive.text });
  }

  private announceDiplomacy(from: Village, to: Village, action: KageAction): void {
    const a = villageName(from);
    const b = villageName(to);
    const text = {
      guerra: `⚔️ A ${a} declarou guerra à ${b}!`,
      fim_guerra: `🕊️ A ${a} encerrou a guerra com a ${b}.`,
      romper: `💔 A aliança entre a ${a} e a ${b} acabou.`,
      alianca: undefined,
      paz: undefined,
    }[action];
    if (text) return this.broadcast({ type: 'announce', message: text });
    // Proposta (aliança ou paz): só os dois Kages ficam sabendo.
    const kage = this.politics.kages.find((k) => k.village === to);
    if (kage) this.notice(kage.playerId, `📜 A ${a} propôs ${action === 'alianca' ? 'uma aliança' : 'a paz'}: veja no painel da vila.`, 'info');
    const mine = this.politics.kages.find((k) => k.village === from);
    if (mine) this.notice(mine.playerId, 'Proposta enviada (vale 48 h).', 'good');
  }

  /** Alguém virou renegado no banco: o lado dele muda (online, vai para o Refúgio) e todos ficam sabendo. */
  private async becameRenegade(playerId: string, username: string | undefined, from: Village | null, why: string): Promise<void> {
    await this.refreshPolitics();
    await this.reloadFaction(playerId);
    const s = this.sessions.get(playerId);
    const who = username ?? s?.username ?? 'Um ninja';
    if (s) this.notice(playerId, `Você virou renegado (${why}). Sua casa agora é o Refúgio dos Renegados.`, 'bad');
    this.broadcast({ type: 'announce', message: `🩸 ${who} virou renegado${from ? ` (${VILLAGE_INFO[from].name})` : ''}.` });
  }

  // ------------------------------------------------ Posto de Viagem

  /** O Posto de Viagem perto dele (no mesmo mapa, no alcance de conversa). */
  private travelPostNear(s: Session): string | undefined {
    return this.config.npcs.find((n) => n.role === 'travel' && n.map === s.map && distance(s, n) <= n.range)?.id;
  }

  /**
   * Destinos do Posto: a própria casa (vila ou Refúgio), a Floresta (quem tem vila), a Zona de Conflito (módulo pvp,
   * no acampamento da vila dele) e as vilas aliadas (50 ryō). Renegado: o Refúgio e a Zona.
   */
  private travelOptions(s: Session): TravelOption[] {
    const out: TravelOption[] = [];
    const home = this.homeOf(s.village);
    if (home.map !== s.map) out.push({ to: 'casa', name: s.village ? villageName(s.village) : 'Refúgio dos Renegados', cost: 0 });
    if (s.village !== null && s.map !== 'map_2') out.push({ to: 'map_2', name: 'Floresta', cost: 0 });
    if (s.map !== 'zona_conflito') {
      out.push({ to: 'zona_conflito', name: 'Zona de Conflito', cost: 0, ...(this.on('pvp') ? {} : { locked: 'Abre quando o servidor crescer.' }) });
    }
    for (const v of alliesOf(s.village, this.diplomacy(), this.now())) {
      if (VILLAGE_INFO[v].map !== s.map) out.push({ to: v, name: `${villageName(v)} (aliada)`, cost: this.config.endgame.allyTravelRyo });
    }
    return out;
  }

  /** Onde se chega em cada destino. */
  private arrival(s: Session, to: string): { map: MapId; x: number; y: number } {
    if (to === 'casa') {
      const home = this.homeOf(s.village);
      return home.map === 'refugio' ? home : { map: home.map, x: TRAVEL_POST.x + 2.5, y: TRAVEL_POST.y - 1.5 };
    }
    if (to === 'map_2') return { map: 'map_2', x: 44, y: 8 };
    if (to === 'zona_conflito') return { map: 'zona_conflito', ...conflictCamp((s.village ?? 'renegados') as CampOwner).arrive };
    return { map: VILLAGE_INFO[to as Village].map as MapId, x: TRAVEL_POST.x + 2.5, y: TRAVEL_POST.y - 1.5 };
  }

  private travel(s: Session, to: string, t: number): void {
    if (!this.on('vilas')) return this.sendError(s, 'ENDGAME_OFF');
    if (s.dead || s.tutorial < 4) return this.sendError(s, 'CANNOT_TALK');
    if (!this.travelPostNear(s)) return this.sendError(s, 'TRAVEL_TOO_FAR');
    const option = this.travelOptions(s).find((o) => o.to === to);
    if (!option) return this.sendTo(s, { type: 'notice', text: 'Esse destino não está aberto para você.', tone: 'bad' });
    if (option.locked) return this.sendTo(s, { type: 'notice', text: option.locked, tone: 'bad' });
    if (t - s.lastPanelAt < this.config.missionRequestEveryMs) return;
    s.lastPanelAt = t;
    const go = (current: Session) => {
      if (current.dead || !this.travelPostNear(current)) return;
      const at = this.arrival(current, to);
      this.stopMeditation(current, 'manual');
      current.dx = 0;
      current.dy = 0;
      this.dropInputs(current);
      current.substituteUntil = 0;
      this.transfer(current, at.map, at.x, at.y, 'travel');
      current.lastUpdate = this.now();
      current.dirty = true;
    };
    if (option.cost <= 0) return go(s);
    const store = this.readyStore();
    if (!store) return this.sendError(s, 'ENDGAME_OFF');
    const { id } = s;
    this.queueTask(s, () => store.payTravel(id, to as Village).then((r) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!r.ok) return this.sendTo(current, { type: 'notice', text: r.text, tone: 'bad' });
      current.ryo = r.ryo;
      this.sendInventory(current);
      go(current);
      return undefined;
    }));
  }

  // ------------------------------------------------ Zona de Conflito: ranking, espólio, karma, recompensa

  /** Vitória na Zona de Conflito: o banco decide ranking, espólio de guerra, karma, recompensa e caça ao Kage. */
  private pvpKill(winner: Session, loser: Session): void {
    const map = loser.map;
    const base = { winnerId: winner.id, winner: winner.username, loserId: loser.id, loser: loser.username };
    const store = this.readyStore();
    if (!store) {
      this.broadcastMap(map, { type: 'pvp_result', ...base, counted: false, winnerDelta: 0, loserDelta: 0, loot: 0, bounty: 0 });
      return;
    }
    const winnerVillage = winner.village;
    store.pvpKill(winner.id, loser.id).then((r) => this.applyPvpKill(r, base, map, winnerVillage)).catch((err: unknown) => {
      this.log.warn({ winnerId: winner.id, loserId: loser.id, err }, 'fim de jogo: falha ao gravar a vitória PvP');
    });
  }

  private async applyPvpKill(r: PvpKill, base: { winnerId: string; winner: string; loserId: string; loser: string }, map: MapId, winnerVillage: Village | null): Promise<void> {
    this.broadcastMap(map, { type: 'pvp_result', ...base, counted: r.counted, winnerDelta: r.winnerDelta, loserDelta: r.loserDelta, loot: r.lootRyo, bounty: r.bountyPaid });
    const w = this.sessions.get(base.winnerId);
    const l = this.sessions.get(base.loserId);
    if (w) {
      if (r.ryoWinner !== w.ryo) {
        w.ryo = r.ryoWinner;
        this.sendInventory(w);
      }
      if (r.lootRyo > 0) this.notice(w.id, `Espólio de guerra: +${r.lootRyo} ryō.`, 'good');
      if (r.bountyPaid > 0) this.notice(w.id, `Recompensa pela cabeça de ${base.loser}: +${r.bountyPaid} ryō.`, 'good');
      if (w.bounty !== r.winnerBounty) {
        w.bounty = r.winnerBounty;
        this.broadcastFaction(w);
      }
    }
    if (l && l.bounty !== r.loserBounty) {
      l.bounty = r.loserBounty;
      this.broadcastFaction(l);
    }
    if (r.kageHunted) {
      this.broadcast({ type: 'announce', message: `☁️ ${base.winner}, da Akatsuki, derrotou o Kage da ${VILLAGE_INFO[r.kageHunted].name}!` });
    }
    if (r.becameRenegade) await this.becameRenegade(base.winnerId, base.winner, winnerVillage, 'karma');
    else if (r.bountyPaid >= 1000 || r.kageHunted) await this.reloadFaction(base.winnerId);
  }

  // ------------------------------------------------ capas e o que mostrar no boneco

  /** Capa (item null = tirar): do inventário, ou o manto do cargo. O banco confere quem pode usar. */
  private equipCape(s: Session, item: string | null): void {
    if (item !== null && ITEM_BY_CODE.get(item)?.kind !== 'cape') return this.sendError(s, 'NOT_A_CAPE');
    if (item !== null && !ROLE_CAPES[item] && !((s.items[item] ?? 0) > 0)) return this.sendError(s, 'ITEM_NOT_OWNED');
    if (item === 'manto_kage' && !s.kageOf) return this.sendTo(s, { type: 'notice', text: 'O Manto do Kage é só do Kage.', tone: 'bad' });
    if (item === 'manto_akatsuki' && s.akatsukiSlot === null) return this.sendTo(s, { type: 'notice', text: 'O Manto da Akatsuki é só dos membros.', tone: 'bad' });
    const finish = (current: Session, cape: string | null) => {
      const before = JSON.stringify(this.factionView(current));
      current.cape = cape;
      this.sendInventory(current);
      if (JSON.stringify(this.factionView(current)) !== before) this.broadcastFaction(current);
    };
    if (!this.endgame) return finish(s, item);                 // sem banco: só em memória
    const store = this.readyStore();
    if (!store) return this.sendError(s, 'ENDGAME_OFF');
    const { id } = s;
    this.queueTask(s, () => store.equipCape(id, item).then((r) => {
      const current = this.sessions.get(id);
      if (!current) return;
      if (!r.ok) return this.sendTo(current, { type: 'notice', text: r.text, tone: 'bad' });
      finish(current, r.cape);
      return undefined;
    }));
  }

  /** Mostrar ou esconder capa, arma e pergaminho (⚙️): só o que os outros veem. */
  private setDisplay(s: Session, display: Display): void {
    const gearBefore = JSON.stringify(this.gear(s));
    const factionBefore = JSON.stringify(this.factionView(s));
    s.display = { ...display };
    if (JSON.stringify(this.gear(s)) !== gearBefore) this.broadcastGear(s);
    if (JSON.stringify(this.factionView(s)) !== factionBefore) this.broadcastFaction(s);
    const store = this.readyStore();
    if (!store) return;
    const { id } = s;
    store.setDisplay(id, display).catch((err: unknown) => this.log.warn({ playerId: id, err }, 'fim de jogo: falha ao gravar o que mostrar'));
  }

  // ------------------------------------------------ poderes da Akatsuki

  /**
   * Poder da vaga (akatsuki.ts). Ordem: membro? vivo? fora da zona segura? recarregou? tem chakra? acha alguém? Só então
   * cobra, avisa todos (`power`, para a animação) e aplica, com as hitboxes dos jutsus.
   */
  private power(s: Session, t: number, targetId?: string, dir?: [number, number]): void {
    const fail = (reason: PowerFailReason) => this.sendTo(s, { type: 'power_failed', reason });
    const def = s.akatsukiSlot !== null && this.on('akatsuki') ? POWER_BY_SLOT.get(s.akatsukiSlot) : undefined;
    if (!def) return fail('NOT_MEMBER');
    this.stopMeditation(s, 'cast');
    if (s.dead) return fail('DEAD');
    if (t < s.stunnedUntil) return fail('STUNNED');
    if (this.inSafeZone(s)) return fail('SAFE_ZONE');
    if ((s.cooldowns.power ?? 0) > t) return fail('COOLDOWN');
    if (s.chakra < def.cost) return fail('NO_CHAKRA');
    const targets = this.targetsFor(s);
    const focused = targetId !== undefined ? targets.find((x) => x.id === targetId) : undefined;
    const dmg = (base: number) => scaledDamage(base, damageMultiplier(s.stats, 'ninjutsu'));
    const layout = this.layout(s.map);
    let tx: number | undefined;
    let ty: number | undefined;

    // Mira: o focado (no alcance) ou o mais perto; sem ninguém, para onde ele olha (ou o joystick).
    const aimAt = (range: number) => (focused && distance(s, focused) <= range ? focused : nearest(s, targets, range));
    if (dir && (dir[0] !== 0 || dir[1] !== 0)) [s.fx, s.fy] = unit(dir[0], dir[1]);

    switch (def.code) {
      case 'pull': {
        const caught = targets.filter((x) => isInCircle(s, def.radius!, x));
        if (caught.length === 0) return fail('NO_TARGET');
        this.spendPower(s, def, t);
        for (const x of caught) {
          this.pullTo(x, s, 1.2, t);
          this.applyStatus(x, 'stunned', def.ms!, t);
        }
        break;
      }
      case 'drain':
      case 'lifesteal':
        this.spendPower(s, def, t);
        s.powerBuff = { kind: def.code, until: t + def.ms!, amount: def.amount! };
        break;
      case 'blast': {
        const aim = aimAt(def.range!);
        if (aim) this.faceTo(s, aim);
        this.spendPower(s, def, t);
        this.launch(s, s.fx, s.fy, { power: 'blast', speed: 12, range: def.range!, damage: dmg(def.damage!), radius: def.radius!, volley: new Set() });
        break;
      }
      case 'strings': {
        const aim = aimAt(def.range!);
        if (aim) this.faceTo(s, aim);
        const end = rayEnd(layout, s.x, s.y, s.fx, s.fy, def.range!);
        const first = firstOnLine(s, end, targets, HIT_RADIUS);
        if (!first) return fail('NO_TARGET');
        this.spendPower(s, def, t);
        tx = round2(first.at.x);
        ty = round2(first.at.y);
        this.applyStatus(first.target, 'rooted', def.ms!, t);
        this.pullTo(first.target, s, Math.max(1.2, distance(s, first.target) - def.count!), t);
        break;
      }
      case 'crows': {
        const caught = targets.filter((x) => isInCircle(s, def.radius!, x));
        if (caught.length === 0) return fail('NO_TARGET');
        this.spendPower(s, def, t);
        for (const x of caught) this.applyStatus(x, 'stunned', def.ms!, t);
        break;
      }
      case 'hearts':
        this.spendPower(s, def, t);
        s.hearts = def.count!;
        s.heartsCut = def.amount!;
        break;
      case 'roots': {
        this.spendPower(s, def, t);
        const from = { x: s.x, y: s.y };
        const to = blinkTarget(layout, s.x, s.y, s.fx, s.fy, def.range!);
        s.x = to.x;
        s.y = to.y;
        s.lastUpdate = t;
        s.dirty = true;
        s.hasteUntil = t + def.ms!;
        s.haste = def.amount!;
        this.broadcastMap(s.map, { type: 'teleport', playerId: s.id, fromX: round3(from.x), fromY: round3(from.y), x: round3(s.x), y: round3(s.y), a: s.ackSeq });
        break;
      }
      case 'paper': {
        const aim = aimAt(def.range!);
        if (aim) this.faceTo(s, aim);
        this.spendPower(s, def, t);
        const volley = new Set<string>();
        const n = def.count!;
        for (let k = 0; k < n; k++) {
          const [ux, uy] = rotate(s.fx, s.fy, -def.arcDeg! / 2 + (def.arcDeg! * k) / (n - 1));
          this.launch(s, ux, uy, { power: 'paper', speed: 15, range: def.range!, damage: dmg(def.damage!), radius: 0, volley });
        }
        break;
      }
      case 'mask':
        this.spendPower(s, def, t);
        s.intangibleUntil = t + def.ms!;
        break;
    }
    this.broadcastMap(s.map, {
      type: 'power', playerId: s.id, power: def.code, x: round2(s.x), y: round2(s.y), fx: round2(s.fx), fy: round2(s.fy),
      ...(tx !== undefined ? { tx, ty } : {}), ...(def.ms ? { ms: def.ms } : {}),
    });
    this.sendStats(s, t);
  }

  private spendPower(s: Session, def: PowerDef, t: number): void {
    s.chakra -= def.cost;
    s.cooldowns.power = t + def.cooldownMs;
  }

  /** Puxa um alvo até `gap` casas do dono (parando antes da parede). Ninja puxado: o dono dele refaz daqui. */
  private pullTo(x: Target, owner: Session, gap: number, t: number): void {
    const who = x.kind === 'monster' ? x.monster : x.session;
    const d = distance(owner, who);
    if (d <= gap) return;
    const [ux, uy] = unit(owner.x - who.x, owner.y - who.y);
    const to = rayEnd(this.layout(owner.map), who.x, who.y, ux, uy, d - gap);
    const from = { x: who.x, y: who.y };
    who.x = q3(to.x);
    who.y = q3(to.y);
    if (x.kind === 'monster') {
      this.broadcastMap(owner.map, { type: 'monsters_moved', m: [[x.id, who.x, who.y]] });
      return;
    }
    const v = x.session;
    this.dropInputs(v);
    v.lastUpdate = t;
    this.broadcastMap(v.map, { type: 'teleport', playerId: v.id, fromX: round3(from.x), fromY: round3(from.y), x: round3(v.x), y: round3(v.y), a: v.ackSeq });
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

/** Professores das etapas da Academia: a dica muda com o passo do jogador. */
export function tutorLine(npcId: string, step: number): string {
  if (npcId === 'tutor_dummies') {
    return step === 0
      ? 'Etapa 1, Taijutsu: destrua 3 bonecos usando SÓ o Ataque Básico (🗡️). Chegue perto: o golpe é corpo a corpo.'
      : 'Muito bem! Você já passou desta etapa.';
  }
  if (npcId === 'tutor_meditation') {
    return step <= 1
      ? 'Etapa 2, Controle: este campo drena o seu chakra. Fique parado e toque em 🧘 Meditar até a barra azul encher.'
      : 'Seu chakra está em ordem. Siga em frente.';
  }
  if (npcId === 'tutor_jutsu') {
    return step <= 2
      ? 'Etapa 3, Jutsus: incline o joystick para o vão e use o 💨 Teleporte Curto para saltar por cima. Do outro lado, arme a 🪵 Substituição e deixe a armadilha te atacar!'
      : 'Ótimo. Na Sala de Armas, a Professora Mei espera você.';
  }
  if (npcId === 'tutor_weapons') {
    return step <= 3
      ? 'Etapa 4, Armas: abra a mochila 🎒, equipe a Kunai de Treino e acerte o boneco com o 🗡️ Ataque Básico.'
      : 'Você concluiu a Academia! A saída fica embaixo; no nível 11, fale com o Diretor.';
  }
  return 'Continue treinando.';
}

/**
 * Teleporte Curto: anda em passos de 0,05 casa na direção (dx, dy) até `range`, parando no
 * último ponto livre (nunca entra nem atravessa parede; não sai do mapa). Vão no chão (`pit`):
 * salta por cima, mas nunca para dentro dele (cai no último ponto livre antes, se não der).
 */
export function blinkTarget(layout: MapLayout, x: number, y: number, dx: number, dy: number, range: number): Point {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const solid = layout.walls.some((w) => w.k === 'pit') ? layout.walls.filter((w) => w.k !== 'pit') : layout.walls;
  let best = { x, y };
  for (let d = 0.05; d <= range + 1e-9; d += 0.05) {
    const nx = q3(x + ux * d), ny = q3(y + uy * d);
    if (nx < 0 || ny < 0 || nx > layout.width || ny > layout.height || blocked(nx, ny, solid)) break;
    if (solid === layout.walls || !blocked(nx, ny, layout.walls)) best = { x: nx, y: ny };
  }
  return best;
}

/**
 * Até onde uma LINHA vai de (x, y) na direção (dx, dy), no máximo `range` casas, sem entrar em
 * parede nem sair do mapa: o último ponto livre, a cada 0,05 casa (Relâmpago, Sombra, projéteis).
 * Vão no chão (`pit`): o que voa passa por cima; com `pitsBlock` (avanço do Taijutsu, a pé) para antes.
 */
export function rayEnd(layout: MapLayout, x: number, y: number, dx: number, dy: number, range: number, pitsBlock = false): Point {
  const [ux, uy] = unit(dx, dy);
  const solid = !pitsBlock && layout.walls.some((w) => w.k === 'pit') ? layout.walls.filter((w) => w.k !== 'pit') : layout.walls;
  let best = { x, y };
  const n = Math.ceil(range / 0.05 - 1e-9);
  for (let i = 1; i <= n; i++) {
    const d = Math.min(range, i * 0.05);
    const nx = q3(x + ux * d), ny = q3(y + uy * d);
    if (nx < 0 || ny < 0 || nx > layout.width || ny > layout.height || blocked(nx, ny, solid)) break;
    best = { x: nx, y: ny };
  }
  return best;
}

/** Substituição: um ponto livre logo ATRÁS de `anchor` (do lado oposto ao jogador). */
export function behind(layout: MapLayout, from: Point, anchor: Point): Point | undefined {
  const d = distance(from, anchor);
  const ux = d > 0.01 ? (anchor.x - from.x) / d : 0, uy = d > 0.01 ? (anchor.y - from.y) / d : 1;
  for (const dist of [1, 0.75, 1.3, 1.7, 2.2]) {
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.57, -1.57]) {
      const c = Math.cos(turn), sn = Math.sin(turn);
      const vx = ux * c - uy * sn, vy = ux * sn + uy * c;
      const p = { x: q3(anchor.x + vx * dist), y: q3(anchor.y + vy * dist) };
      if (p.x >= 0 && p.y >= 0 && p.x <= layout.width && p.y <= layout.height && !blocked(p.x, p.y, layout.walls)) return p;
    }
  }
  return undefined;
}

/** O que voa (para o cliente escolher o desenho): o jutsu, a arma lançada ou o poder da Akatsuki. */
function projectileKind(p: Projectile): { skill: Skill } | { weapon: string } | { power: PowerKind } {
  if (p.skill) return { skill: p.skill };
  if (p.power) return { power: p.power };
  return { weapon: p.weapon ?? '' };
}

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
