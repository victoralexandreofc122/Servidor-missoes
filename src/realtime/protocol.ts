import { z } from 'zod';

/*
 * Protocolo do WebSocket: JSON simples, um objeto por mensagem, sempre com `type`.
 *
 * Cliente -> servidor
 *   { "type": "move", "x": 11, "y": 10 }
 *   { "type": "chat", "message": "Olá!" }
 *
 * Servidor -> cliente
 *   welcome        { type, you: PlayerView, players: PlayerView[] }   ao conectar (players = os OUTROS online)
 *   player_joined  { type, player: PlayerView }                       outro jogador entrou
 *   player_moved   { type, playerId, x, y }                           outro jogador andou (a cada tick)
 *   player_left    { type, playerId }                                 outro jogador saiu
 *   chat           { type, playerId, username, message }              para todos, inclusive quem enviou
 *   move_rejected  { type, x, y, reason }                             só para quem enviou: posição oficial
 *   error          { type, code, message }                            só para quem enviou
 */

const coordinate = z.number().int();

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), x: coordinate, y: coordinate }),
  z.object({ type: z.literal('chat'), message: z.string() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface PlayerView {
  id: string;
  username: string;
  x: number;
  y: number;
}

export type ServerMessage =
  | { type: 'welcome'; you: PlayerView; players: PlayerView[] }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'player_moved'; playerId: string; x: number; y: number }
  | { type: 'player_left'; playerId: string }
  | { type: 'chat'; playerId: string; username: string; message: string }
  | { type: 'move_rejected'; x: number; y: number; reason: 'TOO_FAST' | 'OUT_OF_BOUNDS' }
  | { type: 'error'; code: RealtimeErrorCode; message: string };

export const REALTIME_ERRORS = {
  INVALID_MESSAGE: 'Mensagem inválida. Use {"type":"move","x":..,"y":..} ou {"type":"chat","message":".."}.',
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
