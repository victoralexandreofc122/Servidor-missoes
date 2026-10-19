import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { baseFastifyOptions, configureInternalApp, configurePublicApp, DEFAULT_SETTINGS, type AppSettings } from './appSetup.js';
import type { InternalRoutesDeps } from './routes/internalRoutes.js';
import type { PublicRoutesDeps } from './routes/publicRoutes.js';

/** API pública: o que o cliente do jogo enxerga. trustProxy vem de settings (padrão true). */
export function buildPublicApp(deps: PublicRoutesDeps, settings: AppSettings = DEFAULT_SETTINGS, options: FastifyServerOptions = {}): FastifyInstance {
  return configurePublicApp(Fastify({ ...baseFastifyOptions('public', settings), ...options }), deps, settings);
}

/** API interna: outra instância, outra porta. Nunca publique esta porta. */
export function buildInternalApp(deps: InternalRoutesDeps, settings: AppSettings = DEFAULT_SETTINGS, options: FastifyServerOptions = {}): FastifyInstance {
  return configureInternalApp(Fastify({ ...baseFastifyOptions('internal', settings), ...options }), deps, settings);
}
