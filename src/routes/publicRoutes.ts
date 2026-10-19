import type { FastifyInstance } from 'fastify';
import { makeLogin } from '../auth/handlers/login.js';
import { makeRegister } from '../auth/handlers/register.js';
import type { TokenIssuer } from '../auth/issueToken.js';
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
  issueToken: TokenIssuer;
}

export interface RouteLimits {
  /** Rotas que criam conteúdo ou concedem progresso: criar missão e avaliar. */
  sensitive?: RateLimitHook;
  /** Cadastro e login: contra força bruta de senha e criação de contas em massa. */
  auth?: RateLimitHook;
}

/**
 * Rotas do cliente do jogo.
 * - /auth/*: SEM `authenticate` (quem chama ainda não tem token), com o limite de auth.
 * - demais: exigem JWT de jogador (preHandler `authenticate`).
 */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDeps, limits: RouteLimits = {}): void {
  const open = limits.auth ? { onRequest: limits.auth } : {};
  app.post('/auth/register', open, makeRegister(deps));
  app.post('/auth/login', open, makeLogin(deps));

  const auth = { preHandler: deps.authenticate };
  const sensitive = limits.sensitive ? { ...auth, onRequest: limits.sensitive } : auth;
  app.post('/missions', sensitive, makeCreateMission(deps));
  app.post('/missions/:id/submit', auth, makeSubmitMission(deps));
  app.post('/missions/:id/evaluate', sensitive, makeEvaluateMission(deps));
  app.post('/scrolls/:id/redeem', auth, makeRedeemScroll(deps));
}
