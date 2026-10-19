import type { Queryable } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';
import { SQL } from './sql.js';

/**
 * Autorização: só o aprendiz da missão pode entregá-la ao sensei ou entregar o
 * pergaminho. O banco não sabe quem está chamando, então isso é papel do servidor.
 *
 * Não há corrida entre esta leitura e o comando seguinte: trainee_id faz parte
 * dos termos imutáveis da missão (rule_mission_terms_immutable).
 *
 * @throws AppError 404 MISSION_NOT_FOUND | 403 NOT_MISSION_TRAINEE (rule_not_trainee)
 */
export async function assertMissionTrainee(db: Queryable, missionId: string, playerId: string): Promise<void> {
  const { rows } = await db.query<{ trainee_id: string }>(SQL.missionTrainee, [missionId]);
  const mission = rows[0];
  if (!mission) throw new AppError(SERVER_ERRORS.mission_not_found);
  if (mission.trainee_id !== playerId) throw new AppError(SERVER_ERRORS.rule_not_trainee);
}
