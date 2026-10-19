import { withTransaction, type Db } from '../../db.js';
import { translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, requirePlayerId, type PlayerRequest, type ReplyLike } from '../../http.js';
import { EvaluateBody, IdParams } from '../schemas.js';
import { SQL } from '../sql.js';

/**
 * POST /missions/:id/evaluate — evaluated_by é SEMPRE o JWT.sub.
 * Quem pode avaliar (sensei original ou substituto Chunin+) é decidido pelo banco.
 */
export function makeEvaluateMission(deps: { db: Db }) {
  return async function evaluateMission(request: PlayerRequest, reply: ReplyLike) {
    try {
      const evaluatorId = requirePlayerId(request);
      const { id } = parseOrThrow(IdParams, request.params);
      const body = parseOrThrow(EvaluateBody, request.body);

      const result = await withTransaction(deps.db, async (tx) => {
        const evaluation = (
          await tx.query<{ id: string }>(SQL.insertEvaluation, [id, evaluatorId, body.approved, body.score, body.feedback ?? null])
        ).rows[0]!;
        const scroll = (await tx.query(SQL.scrollOfEvaluation, [evaluation.id])).rows[0] ?? null;
        return { evaluation, scroll };
      });
      return reply.code(201).send(result);
    } catch (err) {
      throw translateError(err);
    }
  };
}
