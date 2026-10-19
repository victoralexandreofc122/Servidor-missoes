import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';

/*
 * Rate limit em memória (Map), sem dependência nova.
 * TODO: trocar por @fastify/rate-limit (com store Redis) quando hospedar em 2+ instâncias:
 *       este Map é POR PROCESSO; com 2 processos, cada um conta separado e o limite real dobra.
 * Atenção: a chave usa request.ip. Com trustProxy=true e SEM proxy na frente, o cliente
 *       escolhe o próprio IP via X-Forwarded-For e fura o limite (ajuste TRUST_PROXY).
 */

export interface RateLimitOptions {
  max: number;
  timeWindowMs: number;
  /** Relógio injetável (testes). Padrão: Date.now. */
  now?: () => number;
  /** Intervalo da limpeza de entradas vencidas. Padrão: 60 s. */
  cleanupIntervalMs?: number;
  /** Rotas (padrão do Fastify, ex. '/health') que não contam no limite. */
  skipRoutes?: readonly string[];
}

interface LimitedRequest {
  ip: string;
  routeOptions?: { url?: string | undefined };
}

interface LimitedReply {
  code(statusCode: number): LimitedReply;
  header(name: string, value: string): LimitedReply;
  send(payload?: unknown): unknown;
}

export interface RateLimitHook {
  (request: LimitedRequest, reply: LimitedReply): Promise<unknown>;
  /** Remove entradas vencidas; devolve quantas removeu. */
  cleanup(): number;
  size(): number;
  close(): void;
}

/** Rota inexistente usa chave fixa: URLs aleatórias não podem encher o Map. */
const UNMATCHED_ROUTE = '(sem-rota)';

export function makeRateLimit(options: RateLimitOptions): RateLimitHook {
  const { max, timeWindowMs } = options;
  if (!(max > 0) || !(timeWindowMs > 0)) throw new Error('rate limit: max e timeWindowMs precisam ser positivos');
  const now = options.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const skip = new Set(options.skipRoutes ?? []);

  const hook = (async (request: LimitedRequest, reply: LimitedReply) => {
    const route = request.routeOptions?.url;
    if (route !== undefined && skip.has(route)) return undefined;
    const key = `${request.ip}:${route ?? UNMATCHED_ROUTE}`;
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + timeWindowMs };   // janela nova
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      const error = new AppError(SERVER_ERRORS.rate_limited);
      return reply.code(429).header('Retry-After', String(retryAfter)).send({ error: error.toJSON() });
    }
    return undefined;
  }) as RateLimitHook;

  hook.cleanup = () => {
    const t = now();
    let removed = 0;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= t) {
        hits.delete(key);
        removed += 1;
      }
    }
    return removed;
  };
  hook.size = () => hits.size;

  const timer = setInterval(hook.cleanup, options.cleanupIntervalMs ?? 60_000);
  timer.unref();                                          // não segura o processo vivo
  hook.close = () => clearInterval(timer);

  return hook;
}
