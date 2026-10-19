/**
 * SQL do cadastro e do login. Os dados públicos do jogador nunca incluem
 * password_hash nem e-mail. total_xp é bigint e chega como string (igual ao resgate).
 */
const PUBLIC_PLAYER = `
  p.id, p.username, r.code AS rank_code, r.name AS rank_name, p.total_xp, p.created_at`;

export const AUTH_SQL = {
  /**
   * POST /auth/register. Um comando só: o índice único (ux_players_email /
   * ux_players_username) decide quem chegou primeiro, sem SELECT prévio com corrida.
   */
  register: `
    WITH p AS (
      INSERT INTO game.players (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, current_rank_id, total_xp, created_at
    )
    SELECT ${PUBLIC_PLAYER}
      FROM p
      JOIN game.ranks r ON r.id = p.current_rank_id`,

  /** POST /auth/login por e-mail (usa ux_players_email). */
  loginByEmail: `
    SELECT ${PUBLIC_PLAYER}, p.password_hash
      FROM game.players p
      JOIN game.ranks r ON r.id = p.current_rank_id
     WHERE p.email = $1`,

  /** POST /auth/login por nome (usa ux_players_username, em lower(username)). */
  loginByUsername: `
    SELECT ${PUBLIC_PLAYER}, p.password_hash
      FROM game.players p
      JOIN game.ranks r ON r.id = p.current_rank_id
     WHERE lower(p.username) = lower($1)`,

  /** Checagem de boot: a migração v3 foi aplicada? (LIMIT 0: não lê nenhuma linha.) */
  bootCheck: `SELECT email, password_hash FROM game.players LIMIT 0`,
} as const;

export interface PlayerRow {
  id: string;
  username: string;
  rank_code: string;
  rank_name: string;
  total_xp: string;
  created_at: Date;
}

/** Formato público do jogador nas respostas de /auth. */
export function publicPlayer(row: PlayerRow) {
  return {
    id: row.id,
    username: row.username,
    rank: { code: row.rank_code, name: row.rank_name },
    total_xp: row.total_xp,
    created_at: row.created_at,
  };
}
