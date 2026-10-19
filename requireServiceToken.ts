import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';
import type { PlayerRequest } from '../http.js';

export const SERVICE_TOKEN_HEADER = 'x-service-token';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Hook preHandler das rotas /internal. Só serviços do backend (servidor de jogo)
 * têm este token; JWT de jogador não serve aqui.
 * Compara em tempo constante (digests de mesmo tamanho) para não vazar o token por timing.
 */
export function makeRequireServiceToken(serviceToken: string) {
  if (serviceToken.length < 32) throw new Error('SERVICE_TOKEN precisa de pelo menos 32 caracteres');
  const expected = digest(serviceToken);

  return async function requireServiceToken(request: Pick<PlayerRequest, 'headers'>): Promise<void> {
    const received = request.headers[SERVICE_TOKEN_HEADER];
    if (typeof received !== 'string' || received.length === 0 || !timingSafeEqual(digest(received), expected)) {
      throw new AppError(SERVER_ERRORS.service_unauthorized);
    }
  };
}
