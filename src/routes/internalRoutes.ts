import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';
import type { PlayerRequest } from '../http.js';
import { makeAddProgress } from '../missions/handlers/addProgress.js';

export interface InternalRoutesDeps {
  db: Db;
  requireServiceToken: (request: Pick<PlayerRequest, 'headers'>) => Promise<void>;
}

/**
 * Rotas internas (servidor de jogo -> API). Ficam numa instância Fastify própria,
 * escutando numa porta privada, e ainda exigem token de serviço.
 */
export function registerInternalRoutes(app: FastifyInstance, deps: InternalRoutesDeps): void {
  app.addHook('onRequest', deps.requireServiceToken);   // vale para TODAS as rotas desta instância

  app.patch('/internal/missions/:id/progress', makeAddProgress(deps));
}
