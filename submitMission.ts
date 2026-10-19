import type { Db } from '../../db.js';
import { AppError } from '../../errors/AppError.js';
import { CONSTRAINT_ERRORS, translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, requirePlayerId, type PlayerRequest, type ReplyLike } from '../../http.js';
import { assertMissionTrainee } from '../assertMissionTrainee.js';
import { IdParams } from '../schemas.js';
import { SQL } from '../sql.js';

/** POST /missions/:id/submit — o aprendiz volta ao sensei. */
export function makeSubmitMission(deps: { db: Db }) {
  return async function submitMission(request: PlayerRequest, reply: ReplyLike) {
    try {
      const playerId = requirePlayerId(request);
      const { id } = parseOrThrow(IdParams, request.params);

      await assertMissionTrainee(deps.db, id, playerId);   // autorização ANTES de mexer na missão

      const { rows } = await deps.db.query(SQL.submitMission, [id]);
      if (rows.length === 0) {
        // A missão existe (o assert acabou de ler) mas não está 'active': já entregue
        // (duplo clique), aprovada, concluída, cancelada ou expirada. Mesmo erro que o
        // trigger dava para essas transições: 409, não 404.
        throw new AppError(CONSTRAINT_ERRORS.rule_mission_transition!);
      }
      return reply.code(200).send({ mission: rows[0] });
    } catch (err) {
      throw translateError(err);
    }
  };
}
