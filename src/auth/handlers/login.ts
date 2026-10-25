import type { Db } from '../../db.js';
import { AppError } from '../../errors/AppError.js';
import { SERVER_ERRORS, translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, type PlayerRequest, type ReplyLike } from '../../http.js';
import type { TokenIssuer } from '../issueToken.js';
import { dummyPasswordHash, verifyPassword } from '../password.js';
import { LoginBody } from '../schemas.js';
import { AUTH_SQL, publicPlayer, type PlayerRow } from '../sql.js';

/**
 * POST /auth/login — e-mail OU nome de usuário + senha -> { token, expires_at, player }.
 *
 * Conta inexistente, conta sem senha (antiga ou anonimizada) e senha errada dão a MESMA
 * resposta (401 INVALID_CREDENTIALS) e gastam o mesmo tempo (o scrypt roda sempre):
 * quem tenta não descobre quais e-mails ou nomes têm conta.
 */
export function makeLogin(deps: { db: Db; issueToken: TokenIssuer; onFailedLogin?: (login: string) => void }) {
  return async function login(request: PlayerRequest, reply: ReplyLike) {
    try {
      const body = parseOrThrow(LoginBody, request.body);
      const { rows } = body.email !== undefined
        ? await deps.db.query<PlayerRow & { password_hash: string | null }>(AUTH_SQL.loginByEmail, [body.email])
        : await deps.db.query<PlayerRow & { password_hash: string | null }>(AUTH_SQL.loginByUsername, [body.username]);

      const row = rows[0];
      const storedHash = row?.password_hash ?? (await dummyPasswordHash());
      const passwordOk = await verifyPassword(body.password, storedHash);
      if (!row || !row.password_hash || !passwordOk) {
        deps.onFailedLogin?.(body.email ?? body.username ?? '');   // o sentinela conta chutes de senha por conta
        throw new AppError(SERVER_ERRORS.invalid_credentials);
      }

      const { token, expiresAt } = await deps.issueToken(row.id);
      return reply.code(200).send({ token, expires_at: expiresAt.toISOString(), player: publicPlayer(row) });
    } catch (err) {
      throw translateError(err);
    }
  };
}
