import { SignJWT } from 'jose';
import type { JwtOptions } from './authenticate.js';

/** Validade do token de jogador: 7 dias. */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TokenIssuer = (playerId: string) => Promise<{ token: string; expiresAt: Date }>;

/**
 * Emite o JWT que o `authenticate` aceita: HS256, mesmo segredo, `sub` = player_id,
 * `exp` obrigatório e, se configurados, os mesmos `iss`/`aud`. As duas pontas usam
 * o mesmo JwtOptions, então não há como divergirem.
 */
export function makeTokenIssuer(options: JwtOptions, ttlSeconds: number = TOKEN_TTL_SECONDS): TokenIssuer {
  if (options.secret.length < 32) {
    throw new Error('JWT_SECRET precisa de pelo menos 32 caracteres');
  }
  const key = new TextEncoder().encode(options.secret);

  return async function issueToken(playerId: string) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + ttlSeconds;
    let jwt = new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(playerId)
      .setIssuedAt(now)
      .setExpirationTime(exp);
    if (options.issuer) jwt = jwt.setIssuer(options.issuer);
    if (options.audience) jwt = jwt.setAudience(options.audience);
    return { token: await jwt.sign(key), expiresAt: new Date(exp * 1000) };
  };
}
