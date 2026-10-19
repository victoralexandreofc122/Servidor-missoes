import type { Db } from '../../db.js';
import { translateError } from '../../errors/errorTranslator.js';
import { parseOrThrow, requirePlayerId, type PlayerRequest, type ReplyLike } from '../../http.js';
import { CreateMissionBody } from '../schemas.js';
import { SQL } from '../sql.js';

/** POST /missions — o sensei é sempre quem está logado (JWT.sub). */
export function makeCreateMission(deps: { db: Db }) {
  return async function createMission(request: PlayerRequest, reply: ReplyLike) {
    try {
      const senseiId = requirePlayerId(request);
      const body = parseOrThrow(CreateMissionBody, request.body);

      const { rows } = await deps.db.query(SQL.createMission, [
        senseiId,
        body.trainee_id,
        body.mission_type,
        body.difficulty,
        body.target_code,
        body.target_quantity,
        body.expires_in_minutes ?? null,
      ]);
      return reply.code(201).send({ mission: rows[0] });
    } catch (err) {
      throw translateError(err);
    }
  };
}
