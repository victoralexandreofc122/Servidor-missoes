import type { Queryable } from '../db.js';

/** Nome do jogador para o mapa. Uma consulta por conexão, nunca por passo. */
export const FIND_PLAYER_SQL = 'SELECT id, username FROM game.players WHERE id = $1';

export function makeFindPlayer(db: Queryable) {
  return async (playerId: string) => {
    const { rows } = await db.query<{ id: string; username: string }>(FIND_PLAYER_SQL, [playerId]);
    return rows[0];
  };
}
