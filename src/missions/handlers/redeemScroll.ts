import { withTransaction, type Db } from '../../db.js';
import { AppError } from '../../errors/AppError.js';
import { SERVER_ERRORS, translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, requirePlayerId, type PlayerRequest, type ReplyLike } from '../../http.js';
import { IdParams } from '../schemas.js';
import { SQL } from '../sql.js';

/**
 * POST /scrolls/:id/redeem — o aprendiz entrega o pergaminho na Sala de Missões.
 * XP e título são creditados pelo banco; a resposta só relata o que foi creditado.
 */
export function makeRedeemScroll(deps: { db: Db }) {
  return async function redeemScroll(request: PlayerRequest, reply: ReplyLike) {
    try {
      const playerId = requirePlayerId(request);
      const { id: scrollId } = parseOrThrow(IdParams, request.params);

      // Uma ida ao banco: pergaminho -> missão -> aprendiz. Autorização ANTES do resgate.
      const scroll = (await deps.db.query<{ trainee_id: string; mission_id: string }>(SQL.scrollTrainee, [scrollId])).rows[0];
      if (!scroll) throw new AppError(SERVER_ERRORS.scroll_not_found);
      if (scroll.trainee_id !== playerId) throw new AppError(SERVER_ERRORS.rule_not_trainee);

      const result = await withTransaction(deps.db, async (tx) => {
        const redemption = (await tx.query<{ id: string }>(SQL.insertRedemption, [scrollId])).rows[0]!;
        const reward = (await tx.query(SQL.redemptionReward, [scroll.mission_id, redemption.id])).rows[0];
        return { redemption, reward };
      });
      return reply.code(201).send(result);
    } catch (err) {
      throw translateError(err);
    }
  };
}
