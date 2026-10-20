import { z } from 'zod';
import { ATTRIBUTES, type Attributes, type DerivedStats } from './stats.js';
import type { MapId, MapLayout } from './maps.js';

/*
 * Protocolo do WebSocket: JSON simples, um objeto por mensagem, sempre com `type`.
 *
 * Cliente -> servidor (o cliente só PEDE; dano, acerto, morte e XP são decididos no servidor)
 *   { "type": "input", "seq": 41, "inputs": [[1, 0], [1, 0]] }   joystick com PREDIÇÃO: cada par é 1 tick
 *                                               (50 ms) de direção; seq = número da 1ª entrada
 *   { "type": "move", "dx": 0.5, "dy": -0.5 }   direção "segurada" (teste manual/Hoppscotch; 0,0 = parar)
 *   { "type": "cast", "skill": "fire", "targetId": "m12" }   habilidade; targetId (opcional) = alvo focado
 *   { "type": "meditate", "active": true }      começar/parar de meditar (chakra 3x mais rápido)
 *   { "type": "respawn" }                       renascer (só depois de 5 s morto)
 *   { "type": "talk", "npcId": "sensei" }       falar com o NPC Mestre (precisa estar perto)
 *   { "type": "missions" }                      pedir a missão atual (abrir a Sala de Missões)
 *   { "type": "attack", "targetId": "m12" }     ataque básico (sem chakra); targetId opcional
 *   { "type": "run", "active": true }           correr (8) ou andar (5); o servidor aplica
 *   { "type": "switch_kit", "kit": "B" }        trocar de kit (só vale depois que o servidor confirma)
 *   { "type": "set_loadout", "kitA": [..], "kitB": [..] }   até 4 habilidades por kit
 *   { "type": "spend_point", "attribute": "vitality" }      gastar 1 ponto de atributo
 *   { "type": "set_appearance", "appearance": { skin, hair, shirt, pants, cape } }   cores "#rrggbb"
 *   { "type": "create_mission", "traineeId", "difficulty", "quantity" }   sensei (Chunin+) cria missão
 *   { "type": "deliver_mission", "senseiId" }   aprendiz entrega a missão ao sensei (perto dele)
 *   { "type": "evaluate_mission", "missionId", "approved", "score" }      sensei avalia
 *   { "type": "chat", "message": "Olá!" }
 *
 * Servidor -> cliente
 *   welcome           { you, players, monsters, world }    ao conectar (players = os OUTROS do MESMO mapa;
 *                                                          world.map = mapa atual, world.maps = todos os layouts)
 *   map_changed       { map, x, y, a, players, monsters, reason }   o próprio jogador trocou de mapa
 *                                                          (borda ou renascer): só o que há no mapa novo
 *   player_joined / player_left                            alguém entrou/saiu DESTE mapa (ou do jogo)
 *
 * Tudo que é de posição, combate e chat vai só para quem está no MESMO mapa (economiza banda e
 * ninguém vê monstro do outro lado do mundo). `announce` vai para todos.
 *   player_moved      { playerId, x, y, d, a }             d = direção (0 baixo, 1 esquerda, 2 direita, 3 cima);
 *                                                          a = última entrada aplicada (o dono reconcilia)
 *   player_appearance { playerId, appearance }             visual novo (cores do paperdoll)
 *   stats             { hp, maxHp, chakra, maxChakra, shield }   só para o próprio jogador
 *   player_hp         { playerId, hp, maxHp }              vida dos outros (barrinha sobre o boneco)
 *   cast              { playerId, skill, x, y, fx, fy }    habilidade aceita (todos veem a animação)
 *   cast_failed       { skill, reason }                    só para quem tentou (SAFE_ZONE = na praça segura)
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
 *   mission           { mission, reason }                  missão atual (null = nenhuma), só para o dono
 *   npc_say           { npcId, text }                      fala do NPC, só para quem conversou
 *   mission_reward    { rewards, totalXp, rank, promoted } pergaminho entregue (já gravado no banco)
 *   progress          { level, xpInLevel, xpToNext, statPoints, attributes, derived }   ficha (só o dono)
 *   kit               { active, kits }                     kit ativo e loadout (só o dono)
 *   attack / attack_failed                                 ataque básico (todos veem a animação)
 *   evaluation_request { missionId, trainee, mission }     para o sensei: aprendiz entregou
 *   sensei_options    { difficulties, quantities }         opções de missão (só para Chunin+)
 *   notice            { text, tone }                       aviso curto na tela (só para um jogador)
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
const uuid = z.string().uuid();
/** Cor "#rrggbb" (o <input type="color"> manda assim); gravada sempre em minúsculas. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((c) => c.toLowerCase());

/** Visual do personagem (paperdoll): só cores, 5 partes. Nada além disso entra no banco. */
export const AppearanceSchema = z.object({ skin: hexColor, hair: hexColor, shirt: hexColor, pants: hexColor, cape: hexColor }).strict();
export type Appearance = z.infer<typeof AppearanceSchema>;
export const APPEARANCE_PARTS = ['skin', 'hair', 'shirt', 'pants', 'cape'] as const;

/** Direção do boneco: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
export type Dir = 0 | 1 | 2 | 3;
const skillList = z.array(z.enum(SKILLS)).max(4).refine((l) => new Set(l).size === l.length, 'habilidade repetida no kit');

export type KitName = 'A' | 'B';
export type Kits = Record<KitName, Skill[]>;

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), dx: axis, dy: axis }),
  z.object({ type: z.literal('input'), seq: z.number().int().min(1).max(2_000_000_000), inputs: z.array(z.tuple([axis, axis])).min(1).max(10) }),
  z.object({ type: z.literal('cast'), skill: z.enum(SKILLS), targetId: monsterId.optional() }),
  z.object({ type: z.literal('meditate'), active: z.boolean() }),
  z.object({ type: z.literal('respawn') }),
  z.object({ type: z.literal('talk'), npcId: z.string().regex(/^[a-z]{1,16}$/) }),
  z.object({ type: z.literal('missions') }),
  z.object({ type: z.literal('attack'), targetId: monsterId.optional() }),
  z.object({ type: z.literal('run'), active: z.boolean() }),
  z.object({ type: z.literal('switch_kit'), kit: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('set_loadout'), kitA: skillList, kitB: skillList }),
  z.object({ type: z.literal('spend_point'), attribute: z.enum(ATTRIBUTES) }),
  z.object({ type: z.literal('set_appearance'), appearance: AppearanceSchema }),
  z.object({ type: z.literal('create_mission'), traineeId: uuid, difficulty: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/), quantity: z.number().int() }),
  z.object({ type: z.literal('deliver_mission'), senseiId: uuid }),
  z.object({ type: z.literal('evaluate_mission'), missionId: uuid, approved: z.boolean(), score: z.number().int().min(1).max(5) }),
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
  rank: RankView;
  level: number;
  /** Cores do boneco (padrão se o jogador ainda não criou o personagem). */
  appearance: Appearance;
  dir: Dir;
}

export interface SelfView extends PlayerView {
  chakra: number;
  maxChakra: number;
  shield: boolean;
  xp: number;
  speed: number;
  running: boolean;
  /** Rank permite ser sensei (Chunin+): o cliente mostra "Criar Missão". O banco confere de novo. */
  canBeSensei: boolean;
  /** false = ainda não passou pelo Criador de Personagem (o cliente abre a tela de criação). */
  appearanceSet: boolean;
}

/** Ficha do jogador: nível, XP do nível (zera a cada nível), pontos e o que os atributos dão. */
export interface ProgressView {
  level: number;
  xpInLevel: number;
  xpToNext: number;
  totalXp: number;
  statPoints: number;
  attributes: Attributes;
  maxPoints: number;
  derived: DerivedStats;
}

export interface KitView {
  active: KitName;
  kits: Kits;
}

export interface MonsterView {
  id: string;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/** NPC parado no mapa. `range` = distância máxima para conversar (casas). */
export interface NpcView {
  id: string;
  name: string;
  /** Mapa onde ele fica (o cliente só desenha os do mapa atual). */
  map: MapId;
  x: number;
  y: number;
  range: number;
}

/** Missão de sensei como o jogador vê (Sala de Missões). */
export interface MissionView {
  id: string;
  /** active = em andamento; submitted = esperando o sensei avaliar; approved = pergaminho para entregar. */
  status: 'active' | 'submitted' | 'approved';
  senseiName: string;
  /** Id do sensei: o aprendiz entrega tocando NESTE jogador. */
  senseiId: string;
  /** Missão do NPC Mestre (e não de um sensei jogador). */
  fromNpc: boolean;
  type: { code: string; name: string };
  /** code = tipo do monstro (DEFEAT_MONSTER) ou do conteúdo; quantity = meta. */
  target: { code: string; quantity: number };
  progress: number;
  reward: { xp: number; title: string | null };
  expiresAt: string | null;
  /** Objetivo completo ou pergaminho aprovado: é só voltar ao Mestre. */
  ready: boolean;
}

export interface MissionRewardView {
  senseiName: string;
  xp: number;
  title: string | null;
  titleNew: boolean;
}

/** Por que a missão foi (re)enviada: o cliente escolhe o aviso. */
export type MissionReason = 'sync' | 'assigned' | 'progress' | 'ready' | 'completed';

/** O que o cliente precisa saber do mundo para desenhar, prever o movimento e montar os botões. */
export interface WorldInfo {
  width: number;
  height: number;
  speed: number;
  runSpeed: number;
  tickMs: number;
  spawn: { x: number; y: number };
  respawnMs: number;
  /** range = alcance máximo (Fogo: raio da área); ausente = habilidade em si mesmo. */
  skills: Record<Skill, { cost: number; cooldownMs: number; range?: number }>;
  meditationRegenMultiplier: number;
  npcs: NpcView[];
  basicAttack: { range: number; cooldownMs: number };
  /** Mapa onde o jogador está agora e o layout de TODOS os mapas (paredes, saídas, chão). */
  map: MapId;
  maps: Record<MapId, MapLayout>;
  attributePerPoint: Attributes;
  promotion: { fromRank: string; toRank: string; xp: number };
}

export type CastFailReason = 'NO_CHAKRA' | 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'FULL_HP' | 'ALREADY_ACTIVE' | 'DEAD' | 'NOT_EQUIPPED' | 'SAFE_ZONE';
/** Por que a meditação acabou. */
export type MeditationEnd = 'manual' | 'moved' | 'cast' | 'damaged' | 'died';
export type MonsterStatus = 'stunned' | 'rooted';

export type ServerMessage =
  | { type: 'welcome'; you: SelfView; players: PlayerView[]; monsters: MonsterView[]; world: WorldInfo; progress: ProgressView; kit: KitView }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'map_changed'; map: MapId; x: number; y: number; a: number; players: PlayerView[]; monsters: MonsterView[]; reason: 'walk' | 'respawn' }
  | { type: 'player_moved'; playerId: string; x: number; y: number; d: Dir; a: number }
  | { type: 'player_appearance'; playerId: string; appearance: Appearance }
  | { type: 'player_left'; playerId: string }
  | { type: 'chat'; playerId: string; username: string; message: string }
  | { type: 'stats'; hp: number; maxHp: number; chakra: number; maxChakra: number; shield: boolean; speed: number; running: boolean }
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
  | { type: 'mission'; mission: MissionView | null; reason: MissionReason }
  | { type: 'npc_say'; npcId: string; text: string }
  | { type: 'mission_reward'; rewards: MissionRewardView[]; totalXp: number; rank: RankView; promoted: boolean }
  | { type: 'progress' } & ProgressView
  | { type: 'kit' } & KitView
  | { type: 'attack'; playerId: string; x: number; y: number; fx: number; fy: number }
  | { type: 'attack_failed'; reason: 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'DEAD' | 'SAFE_ZONE' }
  | { type: 'player_rank'; playerId: string; rank: RankView; level: number }
  | { type: 'evaluation_request'; missionId: string; trainee: { id: string; username: string }; mission: MissionView }
  | { type: 'sensei_options'; difficulties: SenseiDifficulty[]; quantities: number[] }
  | { type: 'notice'; text: string; tone: 'info' | 'good' | 'bad' }
  | { type: 'error'; code: RealtimeErrorCode; message: string };

export interface SenseiDifficulty {
  code: string;
  name: string;
  xp: number;
  title: string | null;
}

export const REALTIME_ERRORS = {
  INVALID_MESSAGE: 'Mensagem inválida. Use {"type":"input","seq":1,"inputs":[[1,0]]}, {"type":"move","dx":..,"dy":..}, {"type":"cast","skill":".."}, {"type":"meditate","active":true}, {"type":"respawn"}, {"type":"talk","npcId":"sensei"}, {"type":"missions"}, {"type":"attack"}, {"type":"run","active":true}, {"type":"switch_kit","kit":"B"}, {"type":"spend_point","attribute":".."} ou {"type":"chat","message":".."}.',
  RESPAWN_NOT_READY: 'Ainda não dá para renascer.',
  CANNOT_MEDITATE: 'Não dá para meditar agora.',
  UNKNOWN_NPC: 'Esse NPC não existe.',
  NPC_TOO_FAR: 'Chegue mais perto para conversar.',
  CANNOT_TALK: 'Não dá para conversar agora.',
  MISSIONS_UNAVAILABLE: 'A Sala de Missões não está disponível agora. Tente de novo.',
  NO_POINTS: 'Você não tem pontos de atributo. Suba de nível para ganhar mais.',
  ATTRIBUTE_MAXED: 'Esse atributo já está no máximo.',
  PROFILE_UNAVAILABLE: 'Não foi possível salvar agora. Tente de novo.',
  PROFILE_BUSY: 'Calma! Ainda salvando os pedidos anteriores.',
  PLAYER_NOT_FOUND: 'Esse jogador não está mais online.',
  PLAYER_TOO_FAR: 'Chegue mais perto desse jogador.',
  INVALID_MISSION_OPTION: 'Opção de missão inválida.',
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
