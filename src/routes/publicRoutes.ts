import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';
import type { PlayerRequest } from '../http.js';
import { makeCreateMission } from '../missions/handlers/createMission.js';
import { makeEvaluateMission } from '../missions/handlers/evaluateMission.js';
import { makeRedeemScroll } from '../missions/handlers/redeemScroll.js';
import { makeSubmitMission } from '../missions/handlers/submitMission.js';
import type { RateLimitHook } from '../plugins/rateLimit.js';

export interface PublicRoutesDeps {
  db: Db;
  authenticate: (request: PlayerRequest) => Promise<void>;
}

/**
 * Rotas do cliente do jogo. Todas exigem JWT de jogador.
 * `sensitiveRateLimit` (opcional) vai como onRequest das rotas que criam conteúdo
 * ou concedem progresso: criar missão e avaliar.
 */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDeps, sensitiveRateLimit?: RateLimitHook): void {
  const auth = { preHandler: deps.authenticate };
  const sensitive = sensitiveRateLimit ? { ...auth, onRequest: sensitiveRateLimit } : auth;

  app.post('/missions', sensitive, makeCreateMission(deps));
  app.post('/missions/:id/submit', auth, makeSubmitMission(deps));
  app.post('/missions/:id/evaluate', sensitive, makeEvaluateMission(deps));
  app.post('/scrolls/:id/redeem', auth, makeRedeemScroll(deps));
}
