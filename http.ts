import { z } from 'zod';
import { AppError } from './errors/AppError.js';
import { SERVER_ERRORS } from './errors/errorTranslator.js';

export interface AuthenticatedPlayer {
  id: string;
}

/**
 * O que um handler usa da requisição. FastifyRequest satisfaz esta interface,
 * e um objeto simples também, o que permite testar o handler sem subir o servidor.
 */
export interface PlayerRequest {
  params: unknown;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  player?: AuthenticatedPlayer;
}

export interface ReplyLike {
  code(statusCode: number): ReplyLike;
  send(payload?: unknown): unknown;
}

/** player_id do JWT, já validado pelo `authenticate`. Nunca vem do corpo. */
export function requirePlayerId(request: PlayerRequest): string {
  if (!request.player) throw new AppError(SERVER_ERRORS.unauthenticated);
  return request.player.id;
}

/**
 * Mensagens de validação em português (as do Zod são em inglês e vão para o
 * jogador em `details`). Mensagem definida no próprio schema tem prioridade.
 */
export const ptErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'campo obrigatório' : `tipo inválido: esperado ${issue.expected}` };
    case z.ZodIssueCode.too_small:
      return { message: issue.type === 'string' ? `mínimo de ${issue.minimum} caractere(s)` : `valor mínimo é ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `máximo de ${issue.maximum} caractere(s)` : `valor máximo é ${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      return { message: 'formato inválido' };
    case z.ZodIssueCode.not_multiple_of:
      return { message: 'valor inválido' };
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_literal:
    case z.ZodIssueCode.invalid_union:
      return { message: 'valor não aceito' };
    default:
      return { message: ctx.defaultError === 'Required' ? 'campo obrigatório' : 'valor inválido' };
  }
};

export function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data, { errorMap: ptErrorMap });
  if (!parsed.success) {
    throw new AppError(SERVER_ERRORS.invalid_input, {
      details: parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(corpo)', problem: i.message })),
    });
  }
  return parsed.data;
}
