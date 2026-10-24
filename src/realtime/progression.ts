import type { Queryable } from '../db.js';
import type { Progression } from './gameWorld.js';

/*
 * XP e ryō do combate no banco (game.players.total_xp e ryo).
 *
 * Um comando só, atômico: soma o XP e o ryō na MESMA linha (o UPDATE trava a linha: duas
 * mortes de monstro ao mesmo tempo não se perdem).
 *
 * v7: o XP NÃO promove mais ninguém. Genin vem da Missão de Genin (nível 11, na Academia),
 * Chunin do Exame Chunin (nível 40, avaliado por um Chunin+) e a candidatura a Kage do
 * nível 60. `promoted` continua no resultado (sempre false aqui) para o cliente antigo.
 *
 * Nível: o trigger trg_players_level_from_xp recalcula o nível (curva até 60) e dá +1 ponto de
 * atributo por nível na mesma linha, quando total_xp muda. Este SQL só devolve o resultado.
 */
export const GRANT_XP_SQL = `
  WITH old AS (
    SELECT id, level FROM game.players WHERE id = $1 FOR UPDATE
  ), updated AS (
    UPDATE game.players p
       SET total_xp = p.total_xp + $2, ryo = p.ryo + $3
      FROM old
     WHERE p.id = old.id
     RETURNING p.total_xp, p.current_rank_id, p.level, p.stat_points, p.ryo, old.level AS old_level
  )
  SELECT u.total_xp, k.code AS rank_code, k.name AS rank_name, false AS promoted,
         u.level, u.stat_points, u.ryo, (u.level - u.old_level) AS levels_gained
    FROM updated u
    JOIN game.ranks k ON k.id = u.current_rank_id`;

export interface GrantRow {
  total_xp: string;
  rank_code: string;
  rank_name: string;
  promoted: boolean;
  level: number;
  stat_points: number;
  ryo: string;
  levels_gained: number;
}

export function grantResult(row: GrantRow) {
  return {
    totalXp: Number(row.total_xp),
    rank: { code: row.rank_code, name: row.rank_name },
    promoted: row.promoted,
    level: row.level,
    statPoints: row.stat_points,
    levelsGained: row.levels_gained,
    ryo: Number(row.ryo),
  };
}

export function makeProgression(db: Queryable): Progression {
  return {
    async grantXp(playerId, amount, ryo = 0) {
      const { rows } = await db.query<GrantRow>(GRANT_XP_SQL, [playerId, amount, ryo]);
      const row = rows[0];
      if (!row) return undefined;   // jogador não existe mais
      return grantResult(row);
    },
  };
}
