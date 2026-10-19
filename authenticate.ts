import { jwtVerify, type JWTPayload, type JWTVerifyOptions } from 'jose';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';
import type { PlayerRequest } from '../http.js';

export interface JwtOptions {
  secret: string;
  issuer?: string;
  audience?: string;
}

/** Assinatura do verificador. Em produção é o jwtVerify do jose; nos testes, pode ser trocado. */
export type JwtVerifier = (token: string, key: Uint8Array, options: JWTVerifyOptions) => Promise<{ payload: JWTPayload }>;

/** Folga para diferença de relógio entre quem emite o token e este servidor. */
export const CLOCK_TOLERANCE_SECONDS = 5;

const PlayerId = z.string().uuid();

/**
 * Hook preHandler das rotas de jogador. Valida o JWT (HS256, com exp obrigatório)
 * e coloca `request.player.id = sub`. Qualquer falha vira 401 genérico.
 */
export function makeAuthenticate(options: JwtOptions, verify: JwtVerifier = jwtVerify) {
  // HS256 com segredo curto cai em brute-force offline: quem captura um JWT testa
  // segredos até a assinatura bater. 32 caracteres garantem >= 256 bits de chave
  // (todo caractere vira pelo menos 1 byte em UTF-8).
  if (options.secret.length < 32) {
    throw new Error('JWT_SECRET precisa de pelo menos 32 caracteres');
  }
  const key = new TextEncoder().encode(options.secret);

  return async function authenticate(request: PlayerRequest): Promise<void> {
    // RFC 7235: o nome do esquema ("Bearer") não diferencia maiúsculas.
    const header = request.headers.authorization;
    const lower = typeof header === 'string' ? header.toLowerCase() : '';
    const token = lower.startsWith('bearer ') && typeof header === 'string' ? header.slice(7).trim() : '';
    if (!token) throw new AppError(SERVER_ERRORS.unauthenticated);

    let sub: unknown;
    try {
      const { payload } = await verify(token, key, {
        algorithms: ['HS256'],          // trava o algoritmo: "none" ou troca de algoritmo são recusados
        requiredClaims: ['exp', 'sub'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        ...(options.issuer ? { issuer: options.issuer } : {}),
        ...(options.audience ? { audience: options.audience } : {}),
      });
      sub = payload.sub;
    } catch (err) {
      // Qualquer falha na verificação (erro do jose ou não) é "não autenticado", nunca 500.
      // O erro original segue em `cause`, só para o log interno.
      throw new AppError(SERVER_ERRORS.unauthenticated, { cause: err });
    }

    const playerId = PlayerId.safeParse(sub);
    if (!playerId.success) throw new AppError(SERVER_ERRORS.unauthenticated);
    request.player = { id: playerId.data };
  };
}
