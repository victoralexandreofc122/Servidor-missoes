import type { Db } from '../../db.js';
import { translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, type PlayerRequest, type ReplyLike } from '../../http.js';
import { hashPassword } from '../password.js';
import { RegisterBody } from '../schemas.js';
import { AUTH_SQL, publicPlayer, type PlayerRow } from '../sql.js';

/**
 * POST /auth/register — cria o jogador com e-mail e senha.
 * Sem JWT (quem se cadastra ainda não tem token). A senha só existe em memória
 * até virar hash; nem ela nem o hash voltam na resposta.
 */
export function makeRegister(deps: { db: Db }) {
  return async function register(request: PlayerRequest, reply: ReplyLike) {
    try {
      const body = parseOrThrow(RegisterBody, request.body);
      const passwordHash = await hashPassword(body.password);

      const { rows } = await deps.db.query<PlayerRow>(AUTH_SQL.register, [body.username, body.email, passwordHash]);
      return reply.code(201).send({ player: publicPlayer(rows[0]!) });
    } catch (err) {
      // e-mail ou nome já usados chegam aqui como 23505 e viram EMAIL_TAKEN / USERNAME_TAKEN
      throw translateError(err);
    }
  };
}
