import { z } from 'zod';

/*
 * Protocolo do WebSocket: JSON simples, um objeto por mensagem, sempre com `type`.
 *
 * Cliente -> servidor
 *   { "type": "move", "dx": 0.5, "dy": -0.5 }   direção do joystick, de -1 a 1 (0,0 = parar)
 *   { "type": "cast", "skill": "fire" }         habilidade (por enquanto só validada, sem efeito)
 *   { "type": "chat", "message": "Olá!" }
 *
 * Servidor -> cliente
 *   welcome        { type, you, players, world }   ao conectar (players = os OUTROS online)
 *   player_joined  { type, player }                outro jogador entrou
 *   player_moved   { type, playerId, x, y }        alguém andou (a cada tick; inclui você, para corrigir a previsão)
 *   player_left    { type, playerId }              outro jogador saiu
 *   chat           { type, playerId, username, message }   para todos, inclusive quem enviou
 *   error          { type, code, message }         só para quem enviou
 */

/** Direção de -1 a 1 em cada eixo; vetor maior que 1 (diagonal) é normalizado pelo servidor. */
const axis = z.number().finite().min(-1).max(1);

/** Fogo, Água, Taijutsu, Ilusão, Sombra, Pedra, Cura. */
export const SKILLS = ['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal'] as const;
export type Skill = (typeof SKILLS)[number];

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), dx: axis, dy: axis }),
  z.object({ type: z.literal('cast'), skill: z.enum(SKILLS) }),
  z.object({ type: z.literal('chat'), message: z.string() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface PlayerView {
  id: string;
  username: string;
  x: number;
  y: number;
}

/** O que o cliente precisa saber do mundo para desenhar e prever o próprio movimento. */
export interface WorldInfo {
  width: number;
  height: number;
  speed: number;
  tickMs: number;
}

export type ServerMessage =
  | { type: 'welcome'; you: PlayerView; players: PlayerView[]; world: WorldInfo }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'player_moved'; playerId: string; x: number; y: number }
  | { type: 'player_left'; playerId: string }
  | { type: 'chat'; playerId: string; username: string; message: string }
  | { type: 'error'; code: RealtimeErrorCode; message: string };

export const REALTIME_ERRORS = {
  INVALID_MESSAGE: 'Mensagem inválida. Use {"type":"move","dx":..,"dy":..}, {"type":"cast","skill":".."} ou {"type":"chat","message":".."}.',
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
