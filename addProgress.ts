import type { Db } from '../../db.js';
import { AppError } from '../../errors/AppError.js';
import { SERVER_ERRORS, translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, type PlayerRequest, type ReplyLike } from '../../http.js';
import { IdParams, ProgressBody } from '../schemas.js';
import { SQL } from '../sql.js';

/**
 * PATCH /internal/missions/:id/progress — só serviço interno (token de serviço).
 * Quem conta abates e coletas é o servidor de jogo, nunca o cliente.
 */
export function makeAddProgress(deps: { db: Db }) {
  return async function addProgress(request: Pick<PlayerRequest, 'params' | 'body'>, reply: ReplyLike) {
    // TODO (idempotência, fase do game loop): hoje LEAST(progress + amount, target) aceita
    // "coletar o 21º de 20" sem erro, MAS conta duas vezes se o servidor reenviar o mesmo
    // evento (retry, lag, bug de contagem). Na fase do game loop, migrar para uma tabela
    // progress_events(event_id UUID UNIQUE, mission_id, amount, created_at) com
    // INSERT ... ON CONFLICT DO NOTHING, e o addProgress passa a receber event_id
    // obrigatório. Não implementar agora.
    try {
      const { id } = parseOrThrow(IdParams, request.params);
      const { amount } = parseOrThrow(ProgressBody, request.body);

      const { rows } = await deps.db.query(SQL.addProgress, [id, amount]);
      if (!rows[0]) throw new AppError(SERVER_ERRORS.mission_not_found);
      return reply.code(200).send({ mission: rows[0] });
    } catch (err) {
      throw translateError(err);
    }
  };
}
