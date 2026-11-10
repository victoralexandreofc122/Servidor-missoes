/*
 * v40 (Fase 2, entrega 1; migração v27): eras (temporadas de 60 dias) e a fase de pontos do Torneio da Temporada.
 *
 * As regras valem no BANCO (game.jounin_result confere a janela do Torneio e quem pode jogar). As funções puras daqui são
 * as MESMAS contas, para o servidor decidir antes de montar a partida e para os testes das regras.
 */
import type { Queryable } from '../db.js';

/** Regras do Torneio da Temporada (docs/endgame-visao.md, seção 5). */
export const JOUNIN_RULES = {
  minLevel: 40,
  win: 30, loss: -10,
  winRyo: 100, lossRyo: 30,
  minMatches: 15,
  /** 1 vaga a cada 50 ativos da vila; mínimo 10, máximo 60. */
  activePerSlot: 50, minSlots: 10, maxSlots: 60,
  /** A fase final leva 2x as vagas. */
  finalistsPerSlot: 2,
  /** O mesmo par conta no máximo 3 partidas em 24 h (a trava do rankeado). */
  pairPerDay: 3,
} as const;

/** Vagas de Jounin de uma vila com `active` jogadores ativos. */
export function jouninSlots(active: number): number {
  const n = Math.floor(Math.max(0, Number.isFinite(active) ? active : 0) / JOUNIN_RULES.activePerSlot);
  return Math.min(JOUNIN_RULES.maxSlots, Math.max(JOUNIN_RULES.minSlots, n));
}

/** Quantos vão para a fase final (grupos e eliminatória). */
export const jouninFinalists = (slots: number): number => slots * JOUNIN_RULES.finalistsPerSlot;

/** Os pontos depois de uma partida contada: +30 na vitória; -10 na derrota, nunca abaixo de 0. */
export function jouninPointsAfter(points: number, won: boolean): number {
  return won ? points + JOUNIN_RULES.win : Math.max(0, points + JOUNIN_RULES.loss);
}

export interface JouninStanding { points: number; wins: number; losses: number; updatedAt: number; playerId: string }
/**
 * Classificação de uma vila: só quem jogou 15 partidas ou mais; ordem por pontos, vitórias e quem chegou primeiro.
 * Devolve os classificados em ordem, com `finalist` para os primeiros 2x as vagas.
 */
export function jouninRanking<T extends JouninStanding>(rows: readonly T[], slots: number): (T & { position: number; finalist: boolean })[] {
  const cut = jouninFinalists(slots);
  return rows.filter((r) => r.wins + r.losses >= JOUNIN_RULES.minMatches)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.updatedAt - b.updatedAt || a.playerId.localeCompare(b.playerId))
    .map((r, i) => ({ ...r, position: i + 1, finalist: i < cut }));
}

export interface JouninResult {
  counted: boolean;
  winnerDelta: number; loserDelta: number;
  winnerPoints: number; loserPoints: number;
  winnerRyo: number; loserRyo: number;
  seasonId: number;
}
export type JouninOutcome = { ok: true; result: JouninResult } | { ok: false; code: 'closed' | 'not_eligible' };

export interface SeasonView { id: number; startsAt: Date; endsAt: Date; jounin: { startsAt: Date; endsAt: Date } | null }
export interface JouninRow { position: number | null; playerId: string; username: string; points: number; wins: number; losses: number; qualified: boolean; finalist: boolean }

export interface SeasonStore {
  /** A migração v27 já rodou? (Sem ela, o Torneio fica desligado e o resto do jogo segue.) */
  available(): Promise<boolean>;
  current(): Promise<SeasonView | undefined>;
  /** Abre a fase de pontos na era aberta e congela as vagas de cada vila. */
  openJounin(startsAt: Date, endsAt: Date): Promise<number>;
  /** Fecha a fase de pontos agora (admin). Devolve a era, ou null se não havia Torneio aberto. */
  closeJounin(now: Date): Promise<number | null>;
  eligible(playerId: string): Promise<boolean>;
  /** Os pontos de um jogador na era (sem linha ainda: zeros). */
  mine(seasonId: number, playerId: string): Promise<{ points: number; wins: number; losses: number }>;
  /** Registra uma partida do Torneio. Fora da janela ou jogador inelegível: recusado, nada gravado. */
  result(winnerId: string, loserId: string, reason: string, durationMs: number, now?: Date): Promise<JouninOutcome>;
  slots(seasonId: number): Promise<Record<string, { active: number; slots: number }>>;
  standings(seasonId: number, village: string): Promise<JouninRow[]>;
}

export const SEASON_SQL = {
  available: `SELECT to_regclass('game.jounin_matches') IS NOT NULL AS ok`,
  current: `SELECT id, starts_at, ends_at, jounin_starts_at, jounin_ends_at FROM game.seasons WHERE closed_at IS NULL`,
  open: `SELECT game.jounin_open($1, $2) AS id`,
  close: `UPDATE game.seasons SET jounin_ends_at = $1 WHERE closed_at IS NULL AND jounin_starts_at < $1 AND jounin_ends_at > $1 RETURNING id`,
  eligible: `SELECT game.jounin_eligible($1) AS ok`,
  mine: `SELECT points, wins, losses FROM game.jounin_points WHERE season_id = $1 AND player_id = $2`,
  result: `SELECT counted, winner_delta, loser_delta, winner_points, loser_points, winner_ryo, loser_ryo, season_id FROM game.jounin_result($1, $2, $3, $4, $5)`,
  slots: `SELECT village, active_players, slots FROM game.jounin_slots WHERE season_id = $1`,
  standings: `SELECT "position", player_id, username, points, wins, losses, qualified, finalist FROM game.jounin_standings($1, $2)`,
} as const;

const RULE_CODE: Record<string, 'closed' | 'not_eligible'> = { rule_jounin_closed: 'closed', rule_jounin_not_eligible: 'not_eligible', rule_jounin_players: 'not_eligible' };

export function makeSeasonStore(db: Queryable): SeasonStore {
  return {
    async available() {
      return (await db.query<{ ok: boolean }>(SEASON_SQL.available)).rows[0]?.ok === true;
    },
    async current() {
      const r = (await db.query<{ id: number; starts_at: Date; ends_at: Date; jounin_starts_at: Date | null; jounin_ends_at: Date | null }>(SEASON_SQL.current)).rows[0];
      if (!r) return undefined;
      return { id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, jounin: r.jounin_starts_at && r.jounin_ends_at ? { startsAt: r.jounin_starts_at, endsAt: r.jounin_ends_at } : null };
    },
    async openJounin(startsAt, endsAt) {
      return (await db.query<{ id: number }>(SEASON_SQL.open, [startsAt, endsAt])).rows[0]!.id;
    },
    async closeJounin(now) {
      return (await db.query<{ id: number }>(SEASON_SQL.close, [now])).rows[0]?.id ?? null;
    },
    async mine(seasonId, playerId) {
      return (await db.query<{ points: number; wins: number; losses: number }>(SEASON_SQL.mine, [seasonId, playerId])).rows[0] ?? { points: 0, wins: 0, losses: 0 };
    },
    async eligible(playerId) {
      return (await db.query<{ ok: boolean }>(SEASON_SQL.eligible, [playerId])).rows[0]?.ok === true;
    },
    async result(winnerId, loserId, reason, durationMs, now = new Date()) {
      try {
        const r = (await db.query<{ counted: boolean; winner_delta: number; loser_delta: number; winner_points: number; loser_points: number;
          winner_ryo: number; loser_ryo: number; season_id: number }>(SEASON_SQL.result, [winnerId, loserId, reason, Math.round(durationMs), now])).rows[0]!;
        return { ok: true, result: { counted: r.counted, winnerDelta: r.winner_delta, loserDelta: r.loser_delta, winnerPoints: r.winner_points,
          loserPoints: r.loser_points, winnerRyo: r.winner_ryo, loserRyo: r.loser_ryo, seasonId: r.season_id } };
      } catch (err) {
        const code = RULE_CODE[(err as { constraint?: string })?.constraint ?? ''];
        if (code) return { ok: false, code };
        throw err;
      }
    },
    async slots(seasonId) {
      const { rows } = await db.query<{ village: string; active_players: number; slots: number }>(SEASON_SQL.slots, [seasonId]);
      return Object.fromEntries(rows.map((r) => [r.village, { active: r.active_players, slots: r.slots }]));
    },
    async standings(seasonId, village) {
      const { rows } = await db.query<{ position: number | null; player_id: string; username: string; points: number; wins: number; losses: number;
        qualified: boolean; finalist: boolean }>(SEASON_SQL.standings, [seasonId, village]);
      return rows.map((r) => ({ position: r.position, playerId: r.player_id, username: r.username, points: r.points, wins: r.wins, losses: r.losses, qualified: r.qualified, finalist: r.finalist }));
    },
  };
}
