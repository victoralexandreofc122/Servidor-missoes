import type { Queryable } from '../db.js';

/** Nome, XP e rank do jogador para o jogo. Uma consulta por conexão, nunca por passo. */
export const FIND_PLAYER_SQL = `
  SELECT p.id, p.username, p.total_xp, r.code AS rank_code, r.name AS rank_name
    FROM game.players p
    JOIN game.ranks r ON r.id = p.current_rank_id
   WHERE p.id = $1`;

interface Row {
  id: string;
  username: string;
  total_xp: string;
  rank_code: string;
  rank_name: string;
}

export function makeFindPlayer(db: Queryable) {
  return async (playerId: string) => {
    const { rows } = await db.query<Row>(FIND_PLAYER_SQL, [playerId]);
    const row = rows[0];
    if (!row) return undefined;
    return { id: row.id, username: row.username, xp: Number(row.total_xp), rank: { code: row.rank_code, name: row.rank_name } };
  };
}
