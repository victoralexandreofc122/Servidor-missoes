import type { Db } from '../db.js';
import type { Village } from './appearance.js';

/*
 * Modo rankeado no banco (migração v15, db/schema_v15_rankeado.sql). As REGRAS (Elo, fator do novato, limite por
 * dupla, admin fora, recompensas) ficam nas funções game.ranked_result e game.close_ranked_season; aqui só se chama e
 * se lê. A v15 é opcional: sem ela, `available()` dá false, as partidas acontecem igual e só não contam pontos.
 */

export interface RankedRound { winner: 'a' | 'b'; ms: number; damageA: number; damageB: number }

export interface RankedMatchInput {
  winnerId: string;
  loserId: string;
  winnerRounds: number;
  loserRounds: number;
  reason: 'rounds' | 'forfeit';
  durationMs: number;
  balanceVersion: string;
  rounds: RankedRound[];
}

export interface RankedResult {
  counted: boolean;
  winnerDelta: number;
  loserDelta: number;
  winnerMmr: number;
  loserMmr: number;
  /** Ryō da partida (30 para quem vence, 10 para quem perde, só quando contou). */
  winnerRyo: number;
  loserRyo: number;
}

export interface RankedRow { position: number; playerId: string; username: string; village: Village | null; level: number; mmr: number; wins: number; losses: number }

export interface RankedBoard {
  season: { id: number; endsAt: number } | null;
  top: RankedRow[];
  /** A linha de quem pediu (na temporada), mesmo fora do top. */
  me: RankedRow | null;
  /** Pontos gerais (de todas as temporadas) e o recorde. */
  overall: { mmr: number; best: number; wins: number; losses: number } | null;
}

export interface RankedStore {
  available(): Promise<boolean>;
  result(m: RankedMatchInput): Promise<RankedResult>;
  board(playerId: string, limit: number): Promise<RankedBoard>;
  /** Fecha a temporada vencida (ou à força); devolve o número da que fechou, ou null. */
  closeSeason(now: Date, force?: boolean): Promise<number | null>;
  /** v55 (migração v33): o rankeado 3v3 está no banco? */
  available3?(): Promise<boolean>;
  /** v55: grava uma partida 3v3 (Elo K = 24 com a média do time). */
  result3?(winners: readonly string[], losers: readonly string[], winnerRounds: number, loserRounds: number, reason: string, durationMs: number):
    Promise<{ counted: boolean; winnerDelta: number; loserDelta: number }>;
}

export const RANKED_SQL = {
  available: `SELECT to_regclass('game.ranked_matches') IS NOT NULL AS ok`,
  result: `SELECT counted, winner_delta, loser_delta, winner_mmr, loser_mmr, winner_ryo, loser_ryo FROM game.ranked_result($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
  season: `SELECT id, ends_at FROM game.ranked_seasons WHERE closed_at IS NULL`,
  top: `
    SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position, r.player_id, p.username, p.village,
           p.level, r.mmr, r.wins, r.losses
      FROM game.ranked_season_ratings r JOIN game.players p ON p.id = r.player_id
     WHERE r.season_id = $1 AND NOT p.is_admin
     ORDER BY position
     LIMIT $2`,
  me: `
    SELECT x.* FROM (
      SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position, r.player_id, p.username, p.village,
             p.level, r.mmr, r.wins, r.losses
        FROM game.ranked_season_ratings r JOIN game.players p ON p.id = r.player_id
       WHERE r.season_id = $1 AND (NOT p.is_admin OR p.id = $2)
    ) x WHERE x.player_id = $2`,
  overall: `SELECT mmr, best_mmr, wins, losses FROM game.ranked_ratings WHERE player_id = $1`,
  close: `SELECT game.close_ranked_season($1, $2) AS id`,
} as const;

interface Row { position: number; player_id: string; username: string; village: Village | null; level: number; mmr: number; wins: number; losses: number }
const toRow = (r: Row): RankedRow => ({
  position: r.position, playerId: r.player_id, username: r.username, village: r.village, level: r.level, mmr: r.mmr, wins: r.wins, losses: r.losses,
});

export function makeRankedStore(db: Db): RankedStore {
  return {
    async available() {
      return (await db.query<{ ok: boolean }>(RANKED_SQL.available)).rows[0]?.ok === true;
    },
    async result(m) {
      const r = (await db.query<{ counted: boolean; winner_delta: number; loser_delta: number; winner_mmr: number; loser_mmr: number; winner_ryo: number; loser_ryo: number }>(RANKED_SQL.result, [
        m.winnerId, m.loserId, m.winnerRounds, m.loserRounds, m.reason, Math.round(m.durationMs), m.balanceVersion, JSON.stringify(m.rounds),
      ])).rows[0]!;
      return {
        counted: r.counted, winnerDelta: r.winner_delta, loserDelta: r.loser_delta, winnerMmr: r.winner_mmr, loserMmr: r.loser_mmr,
        winnerRyo: r.winner_ryo, loserRyo: r.loser_ryo,
      };
    },
    async board(playerId, limit) {
      const s = (await db.query<{ id: number; ends_at: string }>(RANKED_SQL.season)).rows[0];
      const overall = (await db.query<{ mmr: number; best_mmr: number; wins: number; losses: number }>(RANKED_SQL.overall, [playerId])).rows[0];
      if (!s) return { season: null, top: [], me: null, overall: overall ? { mmr: overall.mmr, best: overall.best_mmr, wins: overall.wins, losses: overall.losses } : null };
      const [top, me] = await Promise.all([
        db.query<Row>(RANKED_SQL.top, [s.id, limit]),
        db.query<Row>(RANKED_SQL.me, [s.id, playerId]),
      ]);
      return {
        season: { id: s.id, endsAt: new Date(s.ends_at).getTime() },
        top: top.rows.map(toRow),
        me: me.rows[0] ? toRow(me.rows[0]) : null,
        overall: overall ? { mmr: overall.mmr, best: overall.best_mmr, wins: overall.wins, losses: overall.losses } : null,
      };
    },
    async available3() {
      return (await db.query<{ ok: boolean }>(`SELECT to_regclass('game.ranked3_matches') IS NOT NULL AS ok`)).rows[0]?.ok === true;
    },
    async result3(winners, losers, wr, lr, reason, durationMs) {
      const r = (await db.query<{ counted: boolean; winner_delta: number; loser_delta: number }>(
        'SELECT counted, winner_delta, loser_delta FROM game.ranked3_result($1::uuid[], $2::uuid[], $3, $4, $5, $6)',
        [[...winners], [...losers], wr, lr, reason, Math.round(durationMs)])).rows[0]!;
      return { counted: r.counted, winnerDelta: r.winner_delta, loserDelta: r.loser_delta };
    },
    async closeSeason(now, force = false) {
      return (await db.query<{ id: number | null }>(RANKED_SQL.close, [now, force])).rows[0]?.id ?? null;
    },
  };
}
