import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';

/*
 * CORS nativo, sem dependência nova (por enquanto não dá para rodar npm install).
 * TODO: quando houver npm install (Termux ou hospedagem), trocar por @fastify/cors,
 *       mantendo a mesma lista ALLOWED_ORIGINS e a mesma resposta 403 para origem fora da lista.
 */

export const CORS_ALLOW_HEADERS = 'Authorization, Content-Type';
export const CORS_ALLOW_METHODS = 'GET, POST, PATCH, OPTIONS';

export type CorsDecision =
  | { kind: 'off' }                                   // lista vazia: CORS desligado (igual a antes)
  | { kind: 'no-origin' }                             // sem header Origin (app nativo, curl, servidor)
  | { kind: 'forbidden' }                             // origem fora da lista
  | { kind: 'allowed'; origin: string; preflight: boolean };

/** Regra pura, testável sem servidor. */
export function decideCors(origin: string | string[] | undefined, method: string, allowed: ReadonlySet<string>): CorsDecision {
  if (allowed.size === 0) return { kind: 'off' };
  if (typeof origin !== 'string' || origin === '') return { kind: 'no-origin' };
  if (!allowed.has(origin)) return { kind: 'forbidden' };
  return { kind: 'allowed', origin, preflight: method === 'OPTIONS' };
}

/**
 * Registra os hooks de CORS. Com a lista vazia NÃO registra nada: nenhum header
 * muda, comportamento idêntico ao de antes (caso do app mobile).
 * Precisa ser registrado ANTES de outros onRequest (ex.: token de serviço), para o
 * preflight, que o navegador manda sem credenciais, ser respondido primeiro.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  if (allowedOrigins.length === 0) return;

  const allowed = new Set(allowedOrigins);
  const originOf = new WeakMap<FastifyRequest, string>();

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = decideCors(request.headers.origin, request.method, allowed);
    if (decision.kind === 'forbidden') {
      throw new AppError(SERVER_ERRORS.cors_forbidden);           // 403, sem chamar o handler
    }
    if (decision.kind === 'allowed') {
      originOf.set(request, decision.origin);
      if (decision.preflight) return reply.code(204).send();      // preflight: responde aqui mesmo
    }
    return undefined;
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    // A resposta depende do Origin: caches/CDN não podem reaproveitá-la entre origens.
    reply.header('Vary', 'Origin');
    const origin = originOf.get(request);
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);        // origem exata, nunca "*"
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
      reply.header('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    }
    return payload;
  });
}
