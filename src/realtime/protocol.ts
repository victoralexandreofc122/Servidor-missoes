import { z } from 'zod';

/*
 * Protocolo do WebSocket: JSON simples, um objeto por mensagem, sempre com `type`.
 *
 * Cliente -> servidor (o cliente só PEDE; dano, acerto, morte e XP são decididos no servidor)
 *   { "type": "move", "dx": 0.5, "dy": -0.5 }   direção do joystick, de -1 a 1 (0,0 = parar)
 *   { "type": "cast", "skill": "fire", "targetId": "m12" }   habilidade; targetId (opcional) = alvo focado
 *   { "type": "meditate", "active": true }      começar/parar de meditar (chakra 3x mais rápido)
 *   { "type": "respawn" }                       renascer (só depois de 5 s morto)
 *   { "type": "chat", "message": "Olá!" }
 *
 * Servidor -> cliente
 *   welcome           { you, players, monsters, world }    ao conectar (players = os OUTROS)
 *   player_joined / player_moved / player_left             como antes
 *   stats             { hp, maxHp, chakra, maxChakra, shield }   só para o próprio jogador
 *   player_hp         { playerId, hp, maxHp }              vida dos outros (barrinha sobre o boneco)
 *   cast              { playerId, skill, x, y, fx, fy }    habilidade aceita (todos veem a animação)
 *   cast_failed       { skill, reason }                    só para quem tentou
 *   meditation        { playerId, active, reason? }        entrou/saiu da meditação (todos veem a aura)
 *   hit               { target, id, amount, kind, hp, maxHp, shielded? }   número flutuante
 *   monsters_moved    { m: [[id, x, y], ...] }
 *   monster_spawned   { monster }
 *   monster_status    { id, status, ms }                   atordoado / preso
 *   monster_died      { id, killerId }
 *   player_died       { playerId, respawnInMs }
 *   player_respawned  { playerId, x, y, hp, maxHp }
 *   xp                { gained, totalXp, rank, promoted }  só para quem matou (depois de gravar no banco)
 *   announce          { message }                          para todos (ex.: subiu para Genin)
 *   chat / error                                           como antes
 */

/** Direção de -1 a 1 em cada eixo; vetor maior que 1 (diagonal) é normalizado pelo servidor. */
const axis = z.number().finite().min(-1).max(1);

/** Fogo, Água, Taijutsu, Ilusão, Sombra, Pedra, Cura. */
export const SKILLS = ['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal'] as const;
export type Skill = (typeof SKILLS)[number];

/** Jutsus que podem mirar no alvo focado (Taijutsu é sempre no mais perto; Pedra e Cura são em si mesmo). */
export const DIRECTED_SKILLS: ReadonlySet<Skill> = new Set<Skill>(['fire', 'water', 'illusion', 'shadow']);

/** Id de monstro como o servidor cria ("m" + número). */
const monsterId = z.string().regex(/^m\d{1,9}$/);

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), dx: axis, dy: axis }),
  z.object({ type: z.literal('cast'), skill: z.enum(SKILLS), targetId: monsterId.optional() }),
  z.object({ type: z.literal('meditate'), active: z.boolean() }),
  z.object({ type: z.literal('respawn') }),
  z.object({ type: z.literal('chat'), message: z.string() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface RankView {
  code: string;
  name: string;
}

export interface PlayerView {
  id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  meditating: boolean;
}

export interface SelfView extends PlayerView {
  chakra: number;
  maxChakra: number;
  shield: boolean;
  xp: number;
  rank: RankView;
}

export interface MonsterView {
  id: string;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/** O que o cliente precisa saber do mundo para desenhar, prever o movimento e montar os botões. */
export interface WorldInfo {
  width: number;
  height: number;
  speed: number;
  tickMs: number;
  spawn: { x: number; y: number };
  respawnMs: number;
  /** range = alcance máximo (Fogo: raio da área); ausente = habilidade em si mesmo. */
  skills: Record<Skill, { cost: number; cooldownMs: number; range?: number }>;
  meditationRegenMultiplier: number;
  promotion: { fromRank: string; toRank: string; xp: number };
}

export type CastFailReason = 'NO_CHAKRA' | 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'FULL_HP' | 'ALREADY_ACTIVE' | 'DEAD';
/** Por que a meditação acabou. */
export type MeditationEnd = 'manual' | 'moved' | 'cast' | 'damaged' | 'died';
export type MonsterStatus = 'stunned' | 'rooted';

export type ServerMessage =
  | { type: 'welcome'; you: SelfView; players: PlayerView[]; monsters: MonsterView[]; world: WorldInfo }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'player_moved'; playerId: string; x: number; y: number }
  | { type: 'player_left'; playerId: string }
  | { type: 'chat'; playerId: string; username: string; message: string }
  | { type: 'stats'; hp: number; maxHp: number; chakra: number; maxChakra: number; shield: boolean }
  | { type: 'player_hp'; playerId: string; hp: number; maxHp: number }
  | { type: 'cast'; playerId: string; skill: Skill; x: number; y: number; fx: number; fy: number }
  | { type: 'cast_failed'; skill: Skill; reason: CastFailReason }
  | { type: 'meditation'; playerId: string; active: boolean; reason?: MeditationEnd }
  | { type: 'hit'; target: 'monster' | 'player'; id: string; amount: number; kind: 'damage' | 'heal'; hp: number; maxHp: number; shielded?: boolean }
  | { type: 'monsters_moved'; m: [string, number, number][] }
  | { type: 'monster_spawned'; monster: MonsterView }
  | { type: 'monster_status'; id: string; status: MonsterStatus; ms: number }
  | { type: 'monster_died'; id: string; killerId: string }
  | { type: 'player_died'; playerId: string; respawnInMs: number }
  | { type: 'player_respawned'; playerId: string; x: number; y: number; hp: number; maxHp: number }
  | { type: 'xp'; gained: number; totalXp: number; rank: RankView; promoted: boolean }
  | { type: 'announce'; message: string }
  | { type: 'error'; code: RealtimeErrorCode; message: string };

export const REALTIME_ERRORS = {
  INVALID_MESSAGE: 'Mensagem inválida. Use {"type":"move","dx":..,"dy":..}, {"type":"cast","skill":".."}, {"type":"meditate","active":true}, {"type":"respawn"} ou {"type":"chat","message":".."}.',
  RESPAWN_NOT_READY: 'Ainda não dá para renascer.',
  CANNOT_MEDITATE: 'Não dá para meditar agora.',
  CHAT_RATE_LIMITED: 'Calma! Espere um pouco antes de mandar outra mensagem no chat.',
  CHAT_INVALID: 'Mensagem de chat vazia ou longa demais.',
} as const;
export type RealtimeErrorCode = keyof typeof REALTIME_ERRORS;

/** Códigos de fechamento (o cliente vê no evento "close"). */
export const CLOSE = {
  SHUTDOWN: { code: 1001, reason: 'servidor reiniciando' },
  FLOOD: { code: 1008, reason: 'mensagens demais' },
  REPLACED: { code: 4000, reason: 'conectado em outro lugar' },
  SLOW_CONSUMER: { code: 4001, reason: 'conexão lenta demais' },
} as const;

/**
 * Limpa o texto do chat: tira caracteres de controle e de inversão de direção, e
 * espaços nas pontas. Devolve undefined se ficar vazio ou passar do limite.
 */
export function sanitizeChat(raw: string, maxLength: number): string | undefined {
  // \p{Cc}: controles (\n, \u0000...). U+202A-202E e U+2066-2069: inversão de direção do texto,
  // usada para disfarçar mensagens. Emojis compostos (com U+200D) continuam funcionando.
  const text = raw.replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ').replace(/\s+/g, ' ').trim();
  const length = [...text].length;
  return length === 0 || length > maxLength ? undefined : text;
}
