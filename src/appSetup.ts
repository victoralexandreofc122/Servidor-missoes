import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { TrustProxySetting } from './config.js';
import { AppError } from './errors/AppError.js';
import { SERVER_ERRORS } from './errors/errorTranslator.js';
import { sendError } from './errors/sendError.js';
import { registerCors } from './plugins/cors.js';
import { makeRateLimit } from './plugins/rateLimit.js';
import { registerInternalRoutes, type InternalRoutesDeps } from './routes/internalRoutes.js';
import { registerPublicRoutes, type PublicRoutesDeps } from './routes/publicRoutes.js';
import { registerStaticFiles } from './web/staticFiles.js';

/*
 * Configuração das duas instâncias, separada de app.ts (que cria o Fastify) para
 * poder ser testada sem subir servidor. Só importa TIPOS do fastify.
 */

export interface AppSettings {
  /** ALLOWED_ORIGINS. Vazio = CORS desligado. */
  allowedOrigins: readonly string[];
  /** TRUST_PROXY. Padrão true (atrás de proxy reverso / load balancer). */
  trustProxy: TrustProxySetting;
  /** Limites por IP + rota, só na instância pública. authMax vale para /auth/register e /auth/login. */
  rateLimit: { globalMax: number; sensitiveMax: number; authMax: number; windowMs: number; now?: () => number };
}

/** Rota do health check (configure a mesma em Settings → Health Check Path no Render). */
export const HEALTH_PATH = '/health';

export const DEFAULT_SETTINGS: AppSettings = {
  allowedOrigins: [],
  trustProxy: true,
  rateLimit: { globalMax: 100, sensitiveMax: 10, authMax: 5, windowMs: 60_000 },
};

/**
 * Converte TRUST_PROXY para o formato tipado do Fastify 5. "N proxies" vira a função
 * equivalente do proxy-addr: confia nos N primeiros saltos a partir do servidor.
 */
export function toFastifyTrustProxy(value: TrustProxySetting): boolean | string | ((address: string, hop: number) => boolean) {
  if (typeof value === 'number') return (_address, hop) => hop < value;
  return value;
}

/** Opções do Fastify por instância. trustProxy vale para as DUAS. */
export function baseFastifyOptions(kind: 'public' | 'internal', settings: AppSettings): FastifyServerOptions {
  return {
    logger: true,
    bodyLimit: kind === 'public' ? 16 * 1024 : 4 * 1024,
    trustProxy: toFastifyTrustProxy(settings.trustProxy),
  };
}

/** Tratamento de erro e de rota inexistente: aplicado nas DUAS instâncias. */
export function withErrorHandling(app: FastifyInstance): FastifyInstance {
  app.setErrorHandler((err, request, reply) => sendError(err, reply, request.log));
  app.setNotFoundHandler((_request, reply) => {
    const notFound = new AppError(SERVER_ERRORS.route_not_found);
    return reply.code(notFound.status).send({ error: notFound.toJSON() });
  });
  return app;
}

/**
 * Pública. Ordem dos hooks onRequest: CORS (responde o preflight) -> limite global ->
 * limite da rota (sensível ou de auth); depois o preHandler de JWT (exceto /auth) e o handler.
 */
export function configurePublicApp(app: FastifyInstance, deps: PublicRoutesDeps, settings: AppSettings = DEFAULT_SETTINGS): FastifyInstance {
  withErrorHandling(app);
  registerCors(app, settings.allowedOrigins);

  const { globalMax, sensitiveMax, authMax, windowMs, now } = settings.rateLimit;
  const globalLimit = makeRateLimit({ max: globalMax, timeWindowMs: windowMs, skipRoutes: [HEALTH_PATH], ...(now ? { now } : {}) });
  const sensitiveLimit = makeRateLimit({ max: sensitiveMax, timeWindowMs: windowMs, ...(now ? { now } : {}) });
  const authLimit = makeRateLimit({ max: authMax, timeWindowMs: windowMs, ...(now ? { now } : {}) });
  app.addHook('onRequest', globalLimit);
  app.addHook('onClose', async () => {
    globalLimit.close();
    sensitiveLimit.close();
    authLimit.close();
  });

  // Health check do Render: responde na hora, sem banco, sem JWT, fora do rate limit.
  app.get(HEALTH_PATH, async (_request, reply) => reply.code(200).send({ status: 'ok' }));

  registerPublicRoutes(app, deps, { sensitive: sensitiveLimit, auth: authLimit });

  // Cliente web do jogo: GET / (index.html), /game.js, /targeting.js e /styles.css, da mesma origem da API.
  // Mesma origem = o navegador não precisa de CORS para /auth/login nem para o WebSocket.
  if (deps.publicFiles) registerStaticFiles(app, deps.publicFiles);
  return app;
}

/**
 * Interna: CORS primeiro (o preflight vem sem token), depois o token de serviço
 * como hook GLOBAL (onRequest). SEM rate limit: o token de serviço já protege.
 */
export function configureInternalApp(app: FastifyInstance, deps: InternalRoutesDeps, settings: AppSettings = DEFAULT_SETTINGS): FastifyInstance {
  withErrorHandling(app);
  registerCors(app, settings.allowedOrigins);
  registerInternalRoutes(app, deps);
  return app;
}
