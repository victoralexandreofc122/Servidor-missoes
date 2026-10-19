import type { ReplyLike } from '../http.js';
import { translateError } from './errorTranslator.js';

export interface LoggerLike {
  error(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
}

/** Usado pelo setErrorHandler do Fastify. Loga o erro original, responde só o público. */
export function sendError(err: unknown, reply: ReplyLike, log: LoggerLike): unknown {
  const appError = translateError(err);
  const cause = appError.cause as { constraint?: string; code?: string } | undefined;
  if (appError.status >= 500) {
    log.error({ err: appError.cause ?? appError }, 'erro interno');
  } else {
    // Log interno pode ter o nome da constraint; a resposta, não.
    log.info({ code: appError.code, constraint: cause?.constraint, sqlstate: cause?.code }, 'requisição recusada');
  }
  return reply.code(appError.status).send({ error: appError.toJSON() });
}
