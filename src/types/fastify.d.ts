import type { AuthenticatedPlayer } from '../http.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo hook `authenticate` a partir do JWT (sub). */
    player?: AuthenticatedPlayer;
  }
}
