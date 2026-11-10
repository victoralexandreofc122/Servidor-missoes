/*
 * v40 (Fase 2, entrega 1; migração v27): eras (temporadas de 60 dias) e a fase de pontos do Torneio da Temporada.
 *
 * As regras valem no BANCO (game.jounin_result confere a janela do Torneio e quem pode jogar). As funções puras daqui são
 * as MESMAS contas, para o servidor decidir antes de montar a partida e para os testes das regras.
 */
import type { Queryable } from '../db.js';
import type { BracketMatch, GroupRow, PendingMatch } from './tournament.js';

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

export type JouninStage = 'pontos' | 'grupos' | 'chaves' | 'encerrado';
export interface SeasonView {
  id: number; startsAt: Date; endsAt: Date; jounin: { startsAt: Date; endsAt: Date } | null;
  /** v43 (migração v28): a etapa do Torneio. Sem a v28 no banco: sempre 'pontos' e `finalReady` falso. */
  stage: JouninStage; finalReady: boolean;
}
export interface GroupTableRow extends GroupRow { username: string; pending: number; advanced: boolean }
export interface BracketRow extends BracketMatch { aName: string | null; bName: string | null; aRounds: number; bRounds: number; reason: string | null }
export interface EraRow { position: number; playerId: string; username: string; village: string }
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

  // ---- v43 (migração v28): fase final
  /** Fecha a fase de pontos e monta os grupos (cabeças de chave em cobrinha). */
  startGroups(now: Date): Promise<number>;
  groupTable(seasonId: number, village: string): Promise<GroupTableRow[]>;
  /** Fecha os grupos (jogo que não aconteceu = derrota dos dois) e passa a etapa para as chaves. */
  closeGroups(now: Date): Promise<number>;
  bracket(seasonId: number, village: string): Promise<BracketRow[]>;
  /** Grava a chave inicial de uma vila (não regrava o que já existe). */
  saveBracket(seasonId: number, village: string, matches: readonly BracketMatch[]): Promise<void>;
  /** Jogos que ainda podem acontecer na etapa atual (grupo sem resultado; chave com os dois definidos) e os finalistas. */
  finalState(seasonId: number): Promise<{ pending: PendingMatch[]; finalists: Map<string, string> }>;
  /** Resultado de um jogo da fase final. false = não havia jogo pendente entre os dois nessa etapa (nada gravado). */
  finalResult(stage: 'grupos' | 'chaves', winnerId: string, loserId: string, winnerRounds: number, loserRounds: number, reason: string, now: Date): Promise<boolean>;
  /** Encerra o Torneio: registro da era, patente Jounin e prêmio de consolação. */
  finish(players: readonly string[], positions: readonly number[], now: Date): Promise<{ jounin: number; consoled: number }>;
  era(seasonId: number): Promise<EraRow[]>;
  /** Ryō e patente de agora (depois do encerramento, para atualizar quem está online). */
  fresh(ids: readonly string[]): Promise<{ id: string; ryo: number; rank: { code: string; name: string }; canBeSensei: boolean }[]>;
}

export const SEASON_SQL = {
  available: `SELECT to_regclass('game.jounin_matches') IS NOT NULL AS ok`,
  // to_jsonb: a coluna jounin_stage só existe depois da v28; sem ela, a etapa é 'pontos'
  current: `SELECT s.id, s.starts_at, s.ends_at, s.jounin_starts_at, s.jounin_ends_at, COALESCE(to_jsonb(s) ->> 'jounin_stage', 'pontos') AS stage,
                   to_regclass('game.tournament_brackets') IS NOT NULL AS final_ready
              FROM game.seasons s WHERE s.closed_at IS NULL`,
  startGroups: `SELECT game.tournament_start_groups($1) AS id`,
  groupTable: `SELECT group_no, "position", player_id, username, seed, wins, losses, rounds_for, rounds_against, pending, advanced FROM game.tournament_group_table($1, $2)`,
  closeGroups: `SELECT game.tournament_close_groups($1) AS id`,
  bracket: `SELECT b.round, b.slot, b.rounds, b.a_id, b.b_id, b.winner_id, b.a_rounds, b.b_rounds, b.reason, pa.username AS a_name, pb.username AS b_name
              FROM game.tournament_brackets b LEFT JOIN game.players pa ON pa.id = b.a_id LEFT JOIN game.players pb ON pb.id = b.b_id
             WHERE b.season_id = $1 AND b.village = $2 ORDER BY b.round, b.slot`,
  saveBracket: `INSERT INTO game.tournament_brackets (season_id, village, round, slot, rounds, a_id, b_id, winner_id, reason, played_at)
                SELECT $1, $2, x.round, x.slot, x.rounds, x.a, x.b, x.w, CASE WHEN x.w IS NOT NULL THEN 'bye' END, CASE WHEN x.w IS NOT NULL THEN now() END
                  FROM unnest($3::int[], $4::int[], $5::int[], $6::uuid[], $7::uuid[], $8::uuid[]) AS x(round, slot, rounds, a, b, w)
                ON CONFLICT (season_id, village, round, slot) DO NOTHING`,
  pendingGroups: `SELECT a_id AS a, b_id AS b FROM game.tournament_group_matches WHERE season_id = $1 AND played_at IS NULL`,
  pendingBracket: `SELECT a_id AS a, b_id AS b FROM game.tournament_brackets WHERE season_id = $1 AND winner_id IS NULL AND a_id IS NOT NULL AND b_id IS NOT NULL`,
  finalists: `SELECT player_id, village FROM game.tournament_groups WHERE season_id = $1`,
  groupResult: `SELECT game.tournament_group_result($1, $2, $3, $4, $5, $6)`,
  bracketResult: `SELECT game.tournament_bracket_result($1, $2, $3, $4, $5, $6)`,
  finish: `SELECT jounin, consoled FROM game.jounin_finish($1::uuid[], $2::int[], $3)`,
  era: `SELECT e.position, e.player_id, p.username, e.village FROM game.jounin_era e JOIN game.players p ON p.id = e.player_id WHERE e.season_id = $1 ORDER BY e.village, e.position`,
  fresh: `SELECT p.id, p.ryo, r.code, r.name, r.can_be_sensei FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = ANY($1::uuid[])`,
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
      const r = (await db.query<{ id: number; starts_at: Date; ends_at: Date; jounin_starts_at: Date | null; jounin_ends_at: Date | null; stage: JouninStage; final_ready: boolean }>(SEASON_SQL.current)).rows[0];
      if (!r) return undefined;
      return { id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, jounin: r.jounin_starts_at && r.jounin_ends_at ? { startsAt: r.jounin_starts_at, endsAt: r.jounin_ends_at } : null,
        stage: r.stage, finalReady: r.final_ready };
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
    async startGroups(now) {
      return (await db.query<{ id: number }>(SEASON_SQL.startGroups, [now])).rows[0]!.id;
    },
    async groupTable(seasonId, village) {
      const { rows } = await db.query<{ group_no: number; position: number; player_id: string; username: string; seed: number; wins: number; losses: number;
        rounds_for: number; rounds_against: number; pending: number; advanced: boolean }>(SEASON_SQL.groupTable, [seasonId, village]);
      return rows.map((r) => ({ groupNo: r.group_no, position: r.position, playerId: r.player_id, username: r.username, seed: r.seed, wins: r.wins, losses: r.losses,
        roundsFor: r.rounds_for, roundsAgainst: r.rounds_against, pending: r.pending, advanced: r.advanced }));
    },
    async closeGroups(now) {
      return (await db.query<{ id: number }>(SEASON_SQL.closeGroups, [now])).rows[0]!.id;
    },
    async bracket(seasonId, village) {
      const { rows } = await db.query<{ round: number; slot: number; rounds: number; a_id: string | null; b_id: string | null; winner_id: string | null;
        a_rounds: number; b_rounds: number; reason: string | null; a_name: string | null; b_name: string | null }>(SEASON_SQL.bracket, [seasonId, village]);
      return rows.map((r) => ({ round: r.round, slot: r.slot, rounds: r.rounds, a: r.a_id, b: r.b_id, winner: r.winner_id, aName: r.a_name, bName: r.b_name,
        aRounds: r.a_rounds, bRounds: r.b_rounds, reason: r.reason, ...(r.reason === 'bye' ? { bye: true } : {}) }));
    },
    async saveBracket(seasonId, village, matches) {
      if (matches.length === 0) return;
      await db.query(SEASON_SQL.saveBracket, [seasonId, village, matches.map((m) => m.round), matches.map((m) => m.slot), matches.map((m) => m.rounds),
        matches.map((m) => m.a), matches.map((m) => m.b), matches.map((m) => m.winner)]);
    },
    async finalState(seasonId) {
      const [g, b, f] = await Promise.all([
        db.query<PendingMatch>(SEASON_SQL.pendingGroups, [seasonId]), db.query<PendingMatch>(SEASON_SQL.pendingBracket, [seasonId]),
        db.query<{ player_id: string; village: string }>(SEASON_SQL.finalists, [seasonId]),
      ]);
      return { pending: [...g.rows, ...b.rows], finalists: new Map(f.rows.map((r) => [r.player_id, r.village])) };
    },
    async finalResult(stage, winnerId, loserId, winnerRounds, loserRounds, reason, now) {
      try {
        await db.query(stage === 'grupos' ? SEASON_SQL.groupResult : SEASON_SQL.bracketResult, [winnerId, loserId, winnerRounds, loserRounds, reason, now]);
        return true;
      } catch (err) {
        if (['rule_tournament_no_match', 'rule_tournament_stage'].includes((err as { constraint?: string })?.constraint ?? '')) return false;
        throw err;
      }
    },
    async finish(players, positions, now) {
      const r = (await db.query<{ jounin: number; consoled: number }>(SEASON_SQL.finish, [players, positions, now])).rows[0]!;
      return { jounin: r.jounin, consoled: r.consoled };
    },
    async era(seasonId) {
      const { rows } = await db.query<{ position: number; player_id: string; username: string; village: string }>(SEASON_SQL.era, [seasonId]);
      return rows.map((r) => ({ position: r.position, playerId: r.player_id, username: r.username, village: r.village }));
    },
    async fresh(ids) {
      if (ids.length === 0) return [];
      const { rows } = await db.query<{ id: string; ryo: string; code: string; name: string; can_be_sensei: boolean }>(SEASON_SQL.fresh, [ids]);
      return rows.map((r) => ({ id: r.id, ryo: Number(r.ryo), rank: { code: r.code, name: r.name }, canBeSensei: r.can_be_sensei }));
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
