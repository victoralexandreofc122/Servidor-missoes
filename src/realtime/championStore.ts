/*
 * v55 (migração v33): Torneio dos Heróis e Torneio dos Vilões (docs/endgame-visao.md, seção 6). As regras ficam no BANCO
 * (game.champion_slot: quem pode entrar; game.champion_result: grava, avança na chave e coroa o campeão); aqui só se chama.
 *
 *  - Heróis: Jounin (ou ANBU) da vila, menos o Kage; um torneio por vila; o campeão ganha o título "Herói da <vila>".
 *  - Vilões: os renegados (o Maior Vilão ainda não existe no jogo); um torneio só; título "Vilão Mais Forte da Era".
 *  - Abrem junto com a Fase Final do Torneio da Temporada (calendar.ts): 1 dia de inscrições, até 5 dias de chave,
 *    melhor de 3, nas mesmas arenas (semifinal e final sozinhas na arena principal).
 */
import type { Queryable } from '../db.js';
import type { BracketMatch } from './tournament.js';

export type ChampionKind = 'herois' | 'viloes';
export const CHAMPION_KINDS: readonly ChampionKind[] = ['herois', 'viloes'];
export const CHAMPION_NAME: Readonly<Record<ChampionKind, string>> = { herois: 'Torneio dos Heróis', viloes: 'Torneio dos Vilões' };

export interface ChampionTournament { kind: ChampionKind; village: string; bracketAt: Date | null; closedAt: Date | null; championId: string | null; entries: number }
export interface ChampionPending { kind: ChampionKind; village: string; a: string; b: string; round: number; rounds: number }
export type ChampionJoin = { ok: true; village: string } | { ok: false; code: 'not_eligible' | 'closed' };

export interface ChampionStore {
  /** A migração v33 já rodou? */
  available(): Promise<boolean>;
  /** Por qual torneio o ninja pode jogar ("vila" do torneio dos Heróis; '' nos Vilões); null = não pode. */
  slot(playerId: string, kind: ChampionKind): Promise<string | null>;
  join(playerId: string, kind: ChampionKind, now: Date): Promise<ChampionJoin>;
  tournaments(seasonId: number): Promise<ChampionTournament[]>;
  /** Os inscritos, na ordem de cabeça de chave (nível maior primeiro; empate: quem entrou antes). */
  entries(seasonId: number, kind: ChampionKind, village: string): Promise<string[]>;
  /** Grava a chave inicial e fecha as inscrições daquele torneio. */
  saveBracket(seasonId: number, kind: ChampionKind, village: string, matches: readonly BracketMatch[], now: Date): Promise<void>;
  pending(seasonId: number): Promise<ChampionPending[]>;
  /** Resultado de um jogo. Devolve o campeão quando foi a final; null se a chave continua; undefined se não havia jogo. */
  result(kind: ChampionKind, winnerId: string, loserId: string, winnerRounds: number, loserRounds: number, reason: string, now: Date): Promise<string | null | undefined>;
  /** Coroa direto (um inscrito só). */
  crown(seasonId: number, kind: ChampionKind, village: string, playerId: string, now: Date): Promise<void>;
  /** Os campeões desta Era (nome do campeão por torneio). */
  champions(seasonId: number): Promise<{ kind: ChampionKind; village: string; username: string }[]>;
}

export const CHAMPION_SQL = {
  available: `SELECT to_regclass('game.champion_brackets') IS NOT NULL AS ok`,
  slot: `SELECT game.champion_slot($1, $2) AS village`,
  join: `SELECT game.champion_join($1, $2, $3) AS village`,
  tournaments: `SELECT t.kind, t.village, t.bracket_at, t.closed_at, t.champion_id,
                       (SELECT count(*)::int FROM game.champion_entries e WHERE e.season_id = t.season_id AND e.kind = t.kind AND e.village = t.village) AS entries
                  FROM game.champion_tournaments t WHERE t.season_id = $1 ORDER BY t.kind, t.village`,
  entries: `SELECT e.player_id FROM game.champion_entries e JOIN game.players p ON p.id = e.player_id
             WHERE e.season_id = $1 AND e.kind = $2 AND e.village = $3 ORDER BY p.level DESC, e.joined_at, e.player_id`,
  saveBracket: `INSERT INTO game.champion_brackets (season_id, kind, village, round, slot, rounds, a_id, b_id, winner_id, reason, played_at)
                SELECT $1, $2, $3, x.round, x.slot, x.rounds, x.a, x.b, x.w, CASE WHEN x.w IS NOT NULL THEN 'bye' END, CASE WHEN x.w IS NOT NULL THEN $10::timestamptz END
                  FROM unnest($4::int[], $5::int[], $6::int[], $7::uuid[], $8::uuid[], $9::uuid[]) AS x(round, slot, rounds, a, b, w)
                ON CONFLICT (season_id, kind, village, round, slot) DO NOTHING`,
  closeSignup: `UPDATE game.champion_tournaments SET bracket_at = $4 WHERE season_id = $1 AND kind = $2 AND village = $3 AND bracket_at IS NULL`,
  pending: `SELECT kind, village, a_id AS a, b_id AS b, round, rounds FROM game.champion_brackets
             WHERE season_id = $1 AND winner_id IS NULL AND a_id IS NOT NULL AND b_id IS NOT NULL ORDER BY kind, village, round, slot`,
  result: `SELECT game.champion_result($1, $2, $3, $4, $5, $6, $7) AS champion`,
  crown: `SELECT game.champion_crown($1, $2, $3, $4, $5)`,
  champions: `SELECT t.kind, t.village, p.username FROM game.champion_tournaments t JOIN game.players p ON p.id = t.champion_id WHERE t.season_id = $1`,
} as const;

export function makeChampionStore(db: Queryable): ChampionStore {
  return {
    async available() {
      return (await db.query<{ ok: boolean }>(CHAMPION_SQL.available)).rows[0]?.ok === true;
    },
    async slot(playerId, kind) {
      return (await db.query<{ village: string | null }>(CHAMPION_SQL.slot, [playerId, kind])).rows[0]?.village ?? null;
    },
    async join(playerId, kind, now) {
      try {
        return { ok: true, village: (await db.query<{ village: string }>(CHAMPION_SQL.join, [playerId, kind, now])).rows[0]!.village };
      } catch (err) {
        const c = (err as { constraint?: string })?.constraint;
        if (c === 'rule_champion_not_eligible') return { ok: false, code: 'not_eligible' };
        if (c === 'rule_champion_closed') return { ok: false, code: 'closed' };
        throw err;
      }
    },
    async tournaments(seasonId) {
      const { rows } = await db.query<{ kind: ChampionKind; village: string; bracket_at: Date | null; closed_at: Date | null; champion_id: string | null; entries: number }>(CHAMPION_SQL.tournaments, [seasonId]);
      return rows.map((r) => ({ kind: r.kind, village: r.village, bracketAt: r.bracket_at, closedAt: r.closed_at, championId: r.champion_id, entries: r.entries }));
    },
    async entries(seasonId, kind, village) {
      return (await db.query<{ player_id: string }>(CHAMPION_SQL.entries, [seasonId, kind, village])).rows.map((r) => r.player_id);
    },
    async saveBracket(seasonId, kind, village, matches, now) {
      if (matches.length > 0) {
        await db.query(CHAMPION_SQL.saveBracket, [seasonId, kind, village, matches.map((m) => m.round), matches.map((m) => m.slot), matches.map((m) => m.rounds),
          matches.map((m) => m.a), matches.map((m) => m.b), matches.map((m) => m.winner), now]);
      }
      await db.query(CHAMPION_SQL.closeSignup, [seasonId, kind, village, now]);
    },
    async pending(seasonId) {
      return (await db.query<ChampionPending>(CHAMPION_SQL.pending, [seasonId])).rows;
    },
    async result(kind, winnerId, loserId, winnerRounds, loserRounds, reason, now) {
      try {
        return (await db.query<{ champion: string | null }>(CHAMPION_SQL.result, [kind, winnerId, loserId, winnerRounds, loserRounds, reason, now])).rows[0]?.champion ?? null;
      } catch (err) {
        if ((err as { constraint?: string })?.constraint === 'rule_champion_no_match') return undefined;
        throw err;
      }
    },
    async crown(seasonId, kind, village, playerId, now) {
      await db.query(CHAMPION_SQL.crown, [seasonId, kind, village, playerId, now]);
    },
    async champions(seasonId) {
      return (await db.query<{ kind: ChampionKind; village: string; username: string }>(CHAMPION_SQL.champions, [seasonId])).rows;
    },
  };
}
