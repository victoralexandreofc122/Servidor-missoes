import type { Queryable } from '../db.js';
import type { CombatConfig } from './config.js';
import type { Progression } from './gameWorld.js';

/*
 * XP do combate no banco (game.players.total_xp) e promoção automática de rank.
 *
 * Um comando só, atômico: soma o XP e, se o jogador ainda é do rank `fromRank` (Academia)
 * e passou do limite (100), troca para `toRank` (Genin) na MESMA linha. A troca de rank
 * dispara o trigger do schema que grava o histórico em player_rank_changes.
 * Duas mortes de monstro ao mesmo tempo não se perdem: o UPDATE trava a linha.
 *
 * Ranks acima de Genin continuam vindo de outros sistemas (missões de sensei etc.).
 */
export const GRANT_XP_SQL = `
  WITH ranks AS (
    SELECT (SELECT id FROM game.ranks WHERE code = $3) AS from_id,
           (SELECT id FROM game.ranks WHERE code = $4) AS to_id
  ), old AS (
    -- FOR UPDATE: trava a linha ANTES de ler o rank antigo. Com duas mortes simultâneas,
    -- a segunda espera e lê o rank já promovido: só UMA vê "promoted" (um aviso só).
    SELECT id, current_rank_id FROM game.players WHERE id = $1 FOR UPDATE
  ), updated AS (
    UPDATE game.players p
       SET total_xp = p.total_xp + $2,
           current_rank_id = CASE
             WHEN p.current_rank_id = r.from_id AND r.to_id IS NOT NULL AND p.total_xp + $2 >= $5 THEN r.to_id
             ELSE p.current_rank_id
           END
      FROM old, ranks r
     WHERE p.id = old.id
     RETURNING p.total_xp, p.current_rank_id, old.current_rank_id AS old_rank_id
  )
  SELECT u.total_xp, k.code AS rank_code, k.name AS rank_name,
         (u.current_rank_id IS DISTINCT FROM u.old_rank_id) AS promoted
    FROM updated u
    JOIN game.ranks k ON k.id = u.current_rank_id`;

interface GrantRow {
  total_xp: string;
  rank_code: string;
  rank_name: string;
  promoted: boolean;
}

export function makeProgression(db: Queryable, promotion: CombatConfig['promotion']): Progression {
  return {
    async grantXp(playerId, amount) {
      const { rows } = await db.query<GrantRow>(GRANT_XP_SQL, [playerId, amount, promotion.fromRank, promotion.toRank, promotion.xp]);
      const row = rows[0];
      if (!row) return undefined;   // jogador não existe mais
      return { totalXp: Number(row.total_xp), rank: { code: row.rank_code, name: row.rank_name }, promoted: row.promoted };
    },
  };
}
