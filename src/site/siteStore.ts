import type { Db } from '../db.js';
import type { Village } from '../realtime/appearance.js';
import type { EndgameStore } from '../realtime/endgameStore.js';
import { VILLAGE_INFO } from '../realtime/villages.js';

/*
 * O que o site do jogo (Floot) lê do banco: rankings, ranks, vilas, eleição do Kage e perfis. Só leitura, menos o
 * voto, que passa pela MESMA função do jogo (game.kage_vote, via EndgameStore.vote): as regras são as do banco.
 * Admin nunca entra em ranking. Precisa da v11 (fim de jogo); sem ela o site mostra só o que existe.
 */

export const SITE_SQL = {
  activeModules: `SELECT code FROM game.endgame_modules WHERE game.endgame_active(code)`,
  population: `SELECT game.active_population($1) AS n`,
  villages: `
    SELECT v.code, v.name,
           (SELECT count(*) FROM game.players p WHERE p.village = v.code AND NOT p.is_admin AND p.appearance IS NOT NULL)::int AS members
      FROM game.villages v ORDER BY v.sort_order`,
  kages: `
    SELECT k.village, p.username, k.since, k.term_ends_at FROM game.village_kages k JOIN game.players p ON p.id = k.player_id
     WHERE k.term_ends_at > now()`,
  openElections: `SELECT id, village, opens_at, closes_at FROM game.kage_elections WHERE closed_at IS NULL ORDER BY village`,
  /** Candidatos de cada eleição aberta, com os votos que já têm (o mesmo critério do fechamento: candidato da vila). */
  candidates: `
    SELECT e.id AS election_id, p.id, p.username, p.level, count(v.voter_id)::int AS votes
      FROM game.kage_elections e
      JOIN game.players p ON p.village = e.village
      JOIN game.hokage_candidates c ON c.player_id = p.id
      LEFT JOIN game.kage_votes v ON v.election_id = e.id AND v.candidate_id = p.id
     WHERE e.closed_at IS NULL
     GROUP BY e.id, p.id, p.username, p.level, c.applied_at
     ORDER BY e.id, c.applied_at`,
  history: `
    SELECT e.village, e.closed_at, w.username AS winner,
           (SELECT count(*) FROM game.kage_votes v WHERE v.election_id = e.id)::int AS votes
      FROM game.kage_elections e LEFT JOIN game.players w ON w.id = e.winner_id
     WHERE e.closed_at IS NOT NULL ORDER BY e.closed_at DESC LIMIT $1`,
  relations: `SELECT village_a, village_b, state FROM game.village_relations`,
  season: `SELECT id, starts_at, ends_at FROM game.pvp_seasons WHERE closed_at IS NULL`,
  seasonTop: `
    SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position,
           p.username, p.village, p.level, k.name AS rank, p.renegade_at IS NOT NULL AS renegade, r.mmr, r.wins, r.losses
      FROM game.pvp_season_ratings r JOIN game.players p ON p.id = r.player_id JOIN game.ranks k ON k.id = p.current_rank_id
     WHERE r.season_id = $1 AND NOT p.is_admin ORDER BY position LIMIT $2`,
  globalTop: `
    SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position,
           p.username, p.village, p.level, k.name AS rank, p.renegade_at IS NOT NULL AS renegade, r.mmr, r.wins, r.losses
      FROM game.pvp_ratings r JOIN game.players p ON p.id = r.player_id JOIN game.ranks k ON k.id = p.current_rank_id
     WHERE NOT p.is_admin ORDER BY position LIMIT $1`,
  /** Ranks ninja: quem tem personagem criado, do rank mais alto ao mais baixo, depois nível e XP. */
  ranksTop: `
    SELECT row_number() OVER (ORDER BY k.tier DESC, p.level DESC, p.total_xp DESC, p.username)::int AS position,
           p.username, k.code AS rank_code, k.name AS rank, p.level, p.village, p.renegade_at IS NOT NULL AS renegade
      FROM game.players p JOIN game.ranks k ON k.id = p.current_rank_id
     WHERE NOT p.is_admin AND p.appearance IS NOT NULL ORDER BY position LIMIT $1`,
  ranksCount: `
    SELECT k.code, k.name, count(p.id)::int AS players
      FROM game.ranks k LEFT JOIN game.players p ON p.current_rank_id = k.id AND NOT p.is_admin AND p.appearance IS NOT NULL
     GROUP BY k.id, k.code, k.name, k.tier ORDER BY k.tier`,
  profile: `
    SELECT p.id, p.username, p.level, p.total_xp, k.code AS rank_code, k.name AS rank, k.tier, p.village,
           p.renegade_at IS NOT NULL AS renegade, p.created_at, p.last_seen_at, p.is_admin,
           p.created_at > now() - interval '7 days' AS account_new,
           game.kage_village_of(p.id) AS kage_of, game.akatsuki_slot_of(p.id) AS akatsuki_slot,
           g.mmr, g.wins, g.losses
      FROM game.players p JOIN game.ranks k ON k.id = p.current_rank_id
      LEFT JOIN game.pvp_ratings g ON g.player_id = p.id`,
  seasonOf: `SELECT mmr, wins, losses FROM game.pvp_season_ratings WHERE season_id = $1 AND player_id = $2`,
  titles: `SELECT t.name FROM game.player_titles pt JOIN game.titles t ON t.id = pt.title_id WHERE pt.player_id = $1 ORDER BY t.name`,
  myVote: `SELECT v.candidate_id FROM game.kage_votes v WHERE v.election_id = $1 AND v.voter_id = $2`,
} as const;

const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const villageName = (code: string | null) => (code && code in VILLAGE_INFO ? VILLAGE_INFO[code as Village].name : null);

export interface SiteCandidate { id: string; username: string; level: number; votes: number }
export interface SiteElection { id: number; village: string; opensAt: string; closesAt: string; totalVotes: number; candidates: SiteCandidate[] }

export interface SiteProfile {
  username: string;
  level: number;
  rank: { code: string; name: string };
  village: { code: string; name: string } | null;
  renegade: boolean;
  kageOf: { code: string; name: string } | null;
  akatsuki: boolean;
  pvp: { mmr: number; wins: number; losses: number } | null;
  season: { mmr: number; wins: number; losses: number } | null;
  titles: string[];
  since: string | null;
  lastSeen: string | null;
}

export interface SiteMe {
  profile: SiteProfile;
  isAdmin: boolean;
  election: (SiteElection & { myVote: string | null }) | null;
  /** Pode votar agora? Quando não pode, o porquê (as mesmas regras de game.kage_vote). */
  vote: { allowed: boolean; reason: string | null };
}

type ProfileRow = {
  id: string; username: string; level: number; total_xp: string; rank_code: string; rank: string; tier: number; village: string | null;
  renegade: boolean; created_at: string; last_seen_at: string | null; is_admin: boolean; account_new: boolean;
  kage_of: string | null; akatsuki_slot: number | null; mmr: number | null; wins: number | null; losses: number | null;
};

export interface SiteStore {
  overview(): Promise<{ modules: { code: string; on: boolean }[]; population: number; villages: object[]; season: object | null; relations: object[] }>;
  elections(): Promise<{ open: SiteElection[]; history: { village: string; villageName: string | null; closedAt: string | null; winner: string | null; votes: number }[] }>;
  pvpRanking(scope: 'season' | 'global', limit: number): Promise<{ season: object | null; rows: object[] }>;
  ranks(limit: number): Promise<{ distribution: object[]; rows: object[] }>;
  profile(username: string): Promise<SiteProfile | undefined>;
  me(playerId: string): Promise<SiteMe | undefined>;
  vote(playerId: string, candidateId: string): Promise<{ ok: true } | { ok: false; text: string }>;
}

export function makeSiteStore(db: Db, endgame: EndgameStore): SiteStore {
  async function season() {
    const s = (await db.query<{ id: number; starts_at: string; ends_at: string }>(SITE_SQL.season)).rows[0];
    return s ? { id: s.id, startsAt: iso(s.starts_at)!, endsAt: iso(s.ends_at)! } : null;
  }

  async function openElections(): Promise<SiteElection[]> {
    const [elections, candidates] = await Promise.all([
      db.query<{ id: string; village: string; opens_at: string; closes_at: string }>(SITE_SQL.openElections),
      db.query<{ election_id: string; id: string; username: string; level: number; votes: number }>(SITE_SQL.candidates),
    ]);
    return elections.rows.map((e) => {
      const list = candidates.rows.filter((c) => c.election_id === e.id).map((c) => ({ id: c.id, username: c.username, level: c.level, votes: c.votes }));
      return {
        id: Number(e.id), village: e.village, opensAt: iso(e.opens_at)!, closesAt: iso(e.closes_at)!,
        totalVotes: list.reduce((sum, c) => sum + c.votes, 0), candidates: list,
      };
    });
  }

  async function profileWhere(where: string, value: string): Promise<(SiteProfile & { row: ProfileRow }) | undefined> {
    const row = (await db.query<ProfileRow>(`${SITE_SQL.profile} WHERE ${where}`, [value])).rows[0];
    if (!row) return undefined;
    const s = await season();
    const [seasonRow, titles] = await Promise.all([
      s ? db.query<{ mmr: number; wins: number; losses: number }>(SITE_SQL.seasonOf, [s.id, row.id]) : null,
      db.query<{ name: string }>(SITE_SQL.titles, [row.id]),
    ]);
    const sr = seasonRow?.rows[0];
    const named = (code: string | null) => (code ? { code, name: villageName(code) ?? code } : null);
    return {
      row,
      username: row.username,
      level: row.level,
      rank: { code: row.rank_code, name: row.rank },
      village: named(row.village),
      renegade: row.renegade,
      kageOf: named(row.kage_of),
      akatsuki: row.akatsuki_slot !== null,
      pvp: row.mmr === null ? null : { mmr: row.mmr, wins: row.wins ?? 0, losses: row.losses ?? 0 },
      season: sr ? { mmr: sr.mmr, wins: sr.wins, losses: sr.losses } : null,
      titles: titles.rows.map((t) => t.name),
      since: iso(row.created_at),
      lastSeen: iso(row.last_seen_at),
    };
  }

  const strip = <T extends { row: unknown }>(p: T): Omit<T, 'row'> => {
    const { row: _row, ...rest } = p;
    return rest;
  };

  return {
    async overview() {
      const [modules, population, villages, kages, s, relations] = await Promise.all([
        db.query<{ code: string }>(SITE_SQL.activeModules),
        db.query<{ n: number }>(SITE_SQL.population, [7]),
        db.query<{ code: string; name: string; members: number }>(SITE_SQL.villages),
        db.query<{ village: string; username: string; since: string; term_ends_at: string }>(SITE_SQL.kages),
        season(),
        db.query<{ village_a: string; village_b: string; state: string }>(SITE_SQL.relations),
      ]);
      const active = new Set(modules.rows.map((m) => m.code));
      return {
        modules: ['vilas', 'pvp', 'renegados', 'akatsuki'].map((code) => ({ code, on: active.has(code) })),
        population: population.rows[0]?.n ?? 0,
        villages: villages.rows.map((v) => {
          const k = kages.rows.find((x) => x.village === v.code);
          const info = VILLAGE_INFO[v.code as Village];
          return {
            code: v.code, name: v.name, members: v.members, passive: info?.passive.text ?? null,
            kage: k ? { username: k.username, since: iso(k.since), termEndsAt: iso(k.term_ends_at) } : null,
          };
        }),
        season: s,
        relations: relations.rows.map((r) => ({ a: r.village_a, b: r.village_b, state: r.state })),
      };
    },

    async elections() {
      const [open, history] = await Promise.all([
        openElections(),
        db.query<{ village: string; closed_at: string | null; winner: string | null; votes: number }>(SITE_SQL.history, [20]),
      ]);
      return {
        open,
        history: history.rows.map((h) => ({ village: h.village, villageName: villageName(h.village), closedAt: iso(h.closed_at), winner: h.winner, votes: h.votes })),
      };
    },

    async pvpRanking(scope, limit) {
      const s = await season();
      if (scope === 'season' && !s) return { season: null, rows: [] };
      const rows = scope === 'season'
        ? (await db.query(SITE_SQL.seasonTop, [s!.id, limit])).rows
        : (await db.query(SITE_SQL.globalTop, [limit])).rows;
      return { season: s, rows };
    },

    async ranks(limit) {
      const [distribution, rows] = await Promise.all([db.query(SITE_SQL.ranksCount), db.query(SITE_SQL.ranksTop, [limit])]);
      return { distribution: distribution.rows, rows: rows.rows };
    },

    async profile(username) {
      const p = await profileWhere('lower(p.username) = lower($1) AND NOT p.is_admin', username);
      return p ? strip(p) : undefined;
    },

    async me(playerId) {
      const p = await profileWhere('p.id = $1', playerId);
      if (!p) return undefined;
      const { row } = p;
      const election = row.village ? (await openElections()).find((e) => e.village === row.village) ?? null : null;
      const myVote = election ? (await db.query<{ candidate_id: string }>(SITE_SQL.myVote, [election.id, playerId])).rows[0]?.candidate_id ?? null : null;
      const reason = !row.village ? 'Renegado não tem vila: não vota.'
        : !election ? 'A sua vila não tem eleição aberta agora.'
        : myVote ? 'Você já votou nesta eleição.'
        : row.tier < 20 ? 'Só Genin ou acima votam.'
        : row.account_new ? 'A conta precisa ter mais de 7 dias para votar.'
        : election.candidates.length === 0 ? 'Ainda não há candidatos.'
        : null;
      return {
        profile: strip(p),
        isAdmin: row.is_admin,
        election: election ? { ...election, myVote } : null,
        vote: { allowed: reason === null, reason },
      };
    },

    async vote(playerId, candidateId) {
      const r = await endgame.vote(playerId, candidateId);
      return r.ok ? { ok: true } : { ok: false, text: r.text };
    },
  };
}
