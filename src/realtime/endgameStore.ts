import { withTransaction, type Db, type Queryable } from '../db.js';
import type { Village } from './appearance.js';
import type { EndgameModule, ModuleRow } from './endgame.js';
import { refuse, type StoreResult } from './ninjaStore.js';
import type { RelationRow, WorldEvent } from './villages.js';

/*
 * Fim de jogo no banco (migração v11, docs/endgame.md): vilas, Kage, diplomacia, ranking PvP, renegados, Akatsuki e
 * capas. As REGRAS ficam nas funções game.* (com travas de linha); aqui só se chama e se lê. Recusa por regra
 * conhecida vira texto público, como no resto (ninjaStore.refuse).
 *
 * A v11 é opcional: sem ela, `available()` dá false e o mundo não chama nada daqui (os módulos ficam desligados).
 */

export interface Display {
  cape: boolean;
  weapon: boolean;
  scroll: boolean;
}
export const SHOW_ALL: Display = { cape: true, weapon: true, scroll: true };

/** O que o mundo precisa do jogador no fim de jogo (lido ao conectar e depois de cada mudança). */
export interface EndgamePlayer {
  village: Village | null;
  renegadeFrom: Village | null;
  bounty: number;
  kageOf: Village | null;
  akatsukiSlot: number | null;
  cape: string | null;
  display: Display;
  villageSwitches: number;
}

/** Estado político do servidor (cache do mundo; relido a cada mudança e na manutenção). */
export interface Politics {
  modules: ModuleRow[];
  kages: { village: Village; playerId: string; username: string; termEndsAt: number }[];
  relations: RelationRow[];
  events: WorldEvent[];
  elections: { id: number; village: Village; closesAt: number }[];
  akatsuki: { slot: number; playerId: string; username: string }[];
  season: { id: number; startsAt: number; endsAt: number } | null;
}

/** O que aparece no painel da vila. Propostas e denúncias só vêm para o Kage. */
export interface VillagePanel {
  village: Village;
  election: { closesAt: number; candidates: { id: string; username: string; level: number }[]; myVote: string | null } | null;
  proposals: { id: number; kind: 'alianca' | 'paz'; from: Village; to: Village; expiresAt: number }[];
  reports: { id: number; reporter: string; target: string; targetId: string; reason: string; createdAt: number }[];
  log: { action: string; kage: string | null; targetVillage: Village | null; target: string | null; reason: string | null; at: number }[];
}

export interface RankRow { position: number; playerId: string; username: string; village: Village | null; mmr: number; wins: number; losses: number }
export interface Ranking {
  season: { id: number; startsAt: number; endsAt: number } | null;
  top: RankRow[];
  global: RankRow[];
  me: { mmr: number; wins: number; losses: number; seasonMmr: number | null; seasonWins: number; seasonLosses: number; position: number | null };
}

/** Tudo que uma vitória na Zona de Conflito mudou (game.pvp_kill). */
export interface PvpKill {
  counted: boolean;
  winnerDelta: number;
  loserDelta: number;
  winnerMmr: number | null;
  loserMmr: number | null;
  lootRyo: number;
  becameRenegade: boolean;
  bountyPaid: number;
  winnerBounty: number;
  loserBounty: number;
  kageHunted: Village | null;
  ryoWinner: number;
}

export interface TickEvent { kind: string; village: Village | null; playerId: string | null; info: Record<string, unknown> | null }

export type KageAction = 'guerra' | 'fim_guerra' | 'alianca' | 'paz' | 'romper';

export interface EndgameStore {
  /** A v11 foi aplicada? */
  available(): Promise<boolean>;
  /** Entrou no jogo agora (população ativa). */
  touch(playerId: string): Promise<void>;
  population(days: number): Promise<number>;
  activate(code: EndgameModule): Promise<boolean>;
  politics(): Promise<Politics>;
  player(playerId: string): Promise<EndgamePlayer | undefined>;
  /** Manutenção: eleições, mandatos, propostas, temporadas, capas. */
  tick(): Promise<TickEvent[]>;
  chooseVillage(playerId: string, village: Village): Promise<StoreResult<{ village: Village }>>;
  villagePanel(playerId: string, village: Village, isKage: boolean): Promise<VillagePanel>;
  vote(voter: string, candidate: string): Promise<StoreResult<object>>;
  kageAction(kage: string, action: KageAction, target: Village): Promise<StoreResult<object>>;
  kageAnswer(kage: string, proposal: number, accept: boolean): Promise<StoreResult<{ kind: string }>>;
  exile(kage: string, targetName: string, reason: string): Promise<StoreResult<{ targetId: string; username: string }>>;
  report(reporter: string, targetName: string, reason: string): Promise<StoreResult<object>>;
  decideReport(kage: string, report: number, approve: boolean): Promise<StoreResult<{ targetId: string }>>;
  pvpKill(winner: string, loser: string): Promise<PvpKill>;
  ranking(playerId: string, limit: number): Promise<Ranking>;
  akatsukiInvite(leader: string, targetName: string, slot: number): Promise<StoreResult<{ targetId: string; username: string }>>;
  akatsukiAccept(playerId: string): Promise<StoreResult<{ slot: number }>>;
  akatsukiDecline(playerId: string): Promise<void>;
  akatsukiExpel(leader: string, targetName: string): Promise<StoreResult<{ targetId: string; username: string }>>;
  akatsukiLeave(playerId: string): Promise<StoreResult<object>>;
  akatsukiInviteOf(playerId: string): Promise<{ slot: number; from: string; expiresAt: number } | null>;
  equipCape(playerId: string, cape: string | null): Promise<StoreResult<{ cape: string | null }>>;
  /** Posto de Viagem para vila aliada: cobra (o banco confere a aliança) e devolve o ryō que sobrou. */
  payTravel(playerId: string, village: Village): Promise<StoreResult<{ ryo: number }>>;
  setDisplay(playerId: string, display: Display): Promise<void>;
}

export const ENDGAME_SQL = {
  available: `SELECT to_regclass('game.endgame_modules') IS NOT NULL AS ok`,
  touch: `UPDATE game.players SET last_seen_at = now() WHERE id = $1`,
  population: `SELECT game.active_population($1) AS n`,
  activate: `SELECT game.endgame_activate($1) AS activated`,
  modules: `SELECT code, mode, activated_at FROM game.endgame_modules`,
  kages: `SELECT k.village, k.player_id, p.username, k.term_ends_at FROM game.village_kages k JOIN game.players p ON p.id = k.player_id WHERE k.term_ends_at > now()`,
  relations: `SELECT village_a, village_b, state, declared_by FROM game.village_relations`,
  events: `SELECT kind, village_a, village_b, starts_at, ends_at FROM game.world_events WHERE ends_at > now()`,
  elections: `SELECT id, village, closes_at FROM game.kage_elections WHERE closed_at IS NULL`,
  akatsuki: `SELECT a.slot, a.player_id, p.username FROM game.akatsuki_members a JOIN game.players p ON p.id = a.player_id ORDER BY a.slot`,
  season: `SELECT id, starts_at, ends_at FROM game.pvp_seasons WHERE closed_at IS NULL`,
  player: `
    SELECT p.village, p.renegade_from, p.bounty_ryo, p.equipped_cape, p.display, p.village_switches,
           game.kage_village_of(p.id) AS kage_of, game.akatsuki_slot_of(p.id) AS akatsuki_slot
      FROM game.players p WHERE p.id = $1`,
  tick: `SELECT kind, village, player_id, info FROM game.endgame_tick(now())`,
  chooseVillage: `SELECT game.choose_village($1, $2) AS village`,
  election: `
    SELECT e.id, e.closes_at,
           (SELECT v.candidate_id FROM game.kage_votes v WHERE v.election_id = e.id AND v.voter_id = $2) AS my_vote
      FROM game.kage_elections e WHERE e.village = $1 AND e.closed_at IS NULL`,
  candidates: `
    SELECT p.id, p.username, p.level FROM game.hokage_candidates c JOIN game.players p ON p.id = c.player_id
     WHERE p.village = $1 ORDER BY c.applied_at`,
  proposals: `
    SELECT id, kind, from_village, to_village, expires_at FROM game.diplomacy_proposals
     WHERE answered_at IS NULL AND expires_at > now() AND (from_village = $1 OR to_village = $1) ORDER BY id`,
  reports: `
    SELECT r.id, a.username AS reporter, t.username AS target, r.target_id, r.reason, r.created_at
      FROM game.village_reports r JOIN game.players a ON a.id = r.reporter_id JOIN game.players t ON t.id = r.target_id
     WHERE r.village = $1 AND r.decided_at IS NULL ORDER BY r.id`,
  log: `
    SELECT k.action, kp.username AS kage, k.target_village, tp.username AS target, k.reason, k.at
      FROM game.kage_actions k LEFT JOIN game.players kp ON kp.id = k.kage_id LEFT JOIN game.players tp ON tp.id = k.target_player
     WHERE k.village = $1 ORDER BY k.id DESC LIMIT 10`,
  vote: `SELECT game.kage_vote($1, $2)`,
  war: `SELECT game.kage_declare_war($1, $2)`,
  endWar: `SELECT game.kage_end_war($1, $2)`,
  propose: `SELECT game.kage_propose($1, $2, $3) AS id`,
  breakAlliance: `SELECT game.kage_break_alliance($1, $2)`,
  answer: `SELECT game.kage_answer($1, $2, $3) AS kind`,
  findPlayer: `SELECT id, username FROM game.players WHERE lower(username) = lower($1)`,
  exile: `SELECT game.kage_exile($1, $2, $3)`,
  report: `SELECT game.report_player($1, $2, $3) AS id`,
  decideReport: `SELECT game.kage_decide_report($1, $2, $3) AS target_id`,
  pvpKill: `SELECT * FROM game.pvp_kill($1, $2)`,
  seasonTop: `
    SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position, r.player_id, p.username, p.village, r.mmr, r.wins, r.losses
      FROM game.pvp_season_ratings r JOIN game.players p ON p.id = r.player_id
     WHERE r.season_id = $1 AND NOT p.is_admin ORDER BY position LIMIT $2`,
  globalTop: `
    SELECT row_number() OVER (ORDER BY r.mmr DESC, r.wins DESC, r.player_id)::int AS position, r.player_id, p.username, p.village, r.mmr, r.wins, r.losses
      FROM game.pvp_ratings r JOIN game.players p ON p.id = r.player_id
     WHERE NOT p.is_admin ORDER BY position LIMIT $1`,
  myRating: `
    SELECT g.mmr, g.wins, g.losses, s.mmr AS season_mmr, s.wins AS season_wins, s.losses AS season_losses,
           (SELECT count(*) + 1 FROM game.pvp_season_ratings o JOIN game.players op ON op.id = o.player_id
             WHERE o.season_id = $2 AND NOT op.is_admin AND o.mmr > s.mmr)::int AS position
      FROM (SELECT $1::uuid AS id) me
      LEFT JOIN game.pvp_ratings g ON g.player_id = me.id
      LEFT JOIN game.pvp_season_ratings s ON s.player_id = me.id AND s.season_id = $2`,
  akatsukiInvite: `SELECT game.akatsuki_invite($1, $2, $3)`,
  akatsukiAccept: `SELECT game.akatsuki_accept($1) AS slot`,
  akatsukiDecline: `SELECT game.akatsuki_decline($1)`,
  akatsukiExpel: `SELECT game.akatsuki_expel($1, $2)`,
  akatsukiLeave: `SELECT game.akatsuki_leave($1)`,
  akatsukiInviteOf: `
    SELECT i.slot, p.username AS from_name, i.expires_at FROM game.akatsuki_invites i JOIN game.players p ON p.id = i.invited_by
     WHERE i.player_id = $1 AND i.expires_at > now()`,
  equipCape: `SELECT game.equip_cape($1, $2) AS cape`,
  setDisplay: `UPDATE game.players SET display = $2::jsonb WHERE id = $1`,
  payTravel: `SELECT game.pay_travel($1, $2) AS ryo`,
} as const;

const ms = (d: string | Date | null) => (d === null ? 0 : new Date(d).getTime());

async function findByName(q: Queryable, name: string): Promise<{ id: string; username: string } | undefined> {
  return (await q.query<{ id: string; username: string }>(ENDGAME_SQL.findPlayer, [name])).rows[0];
}

const NOT_FOUND = { ok: false as const, text: 'Jogador não encontrado.' };

export function makeEndgameStore(db: Db): EndgameStore {
  const call = async <T>(fn: () => Promise<T>): Promise<StoreResult<T>> => {
    try {
      return { ok: true, ...(await fn()) } as StoreResult<T>;
    } catch (err) {
      return refuse(err);
    }
  };

  return {
    async available() {
      return (await db.query<{ ok: boolean }>(ENDGAME_SQL.available)).rows[0]?.ok === true;
    },
    async touch(playerId) {
      await db.query(ENDGAME_SQL.touch, [playerId]);
    },
    async population(days) {
      return (await db.query<{ n: number }>(ENDGAME_SQL.population, [days])).rows[0]?.n ?? 0;
    },
    async activate(code) {
      return (await db.query<{ activated: boolean }>(ENDGAME_SQL.activate, [code])).rows[0]?.activated === true;
    },
    async politics() {
      const [modules, kages, relations, events, elections, akatsuki, season] = await Promise.all([
        db.query<{ code: EndgameModule; mode: ModuleRow['mode']; activated_at: string | null }>(ENDGAME_SQL.modules),
        db.query<{ village: Village; player_id: string; username: string; term_ends_at: string }>(ENDGAME_SQL.kages),
        db.query<{ village_a: Village; village_b: Village; state: 'guerra' | 'alianca'; declared_by: Village }>(ENDGAME_SQL.relations),
        db.query<{ kind: 'guerra' | 'tregua'; village_a: Village | null; village_b: Village | null; starts_at: string; ends_at: string }>(ENDGAME_SQL.events),
        db.query<{ id: string; village: Village; closes_at: string }>(ENDGAME_SQL.elections),
        db.query<{ slot: number; player_id: string; username: string }>(ENDGAME_SQL.akatsuki),
        db.query<{ id: number; starts_at: string; ends_at: string }>(ENDGAME_SQL.season),
      ]);
      const s = season.rows[0];
      return {
        modules: modules.rows.map((r) => ({ code: r.code, mode: r.mode, activatedAt: r.activated_at === null ? null : String(r.activated_at) })),
        kages: kages.rows.map((r) => ({ village: r.village, playerId: r.player_id, username: r.username, termEndsAt: ms(r.term_ends_at) })),
        relations: relations.rows.map((r) => ({ a: r.village_a, b: r.village_b, state: r.state, declaredBy: r.declared_by })),
        events: events.rows.map((r) => ({ kind: r.kind, a: r.village_a, b: r.village_b, startsAt: ms(r.starts_at), endsAt: ms(r.ends_at) })),
        elections: elections.rows.map((r) => ({ id: Number(r.id), village: r.village, closesAt: ms(r.closes_at) })),
        akatsuki: akatsuki.rows.map((r) => ({ slot: r.slot, playerId: r.player_id, username: r.username })),
        season: s ? { id: s.id, startsAt: ms(s.starts_at), endsAt: ms(s.ends_at) } : null,
      };
    },
    async player(playerId) {
      const r = (await db.query<{
        village: Village | null; renegade_from: Village | null; bounty_ryo: string; equipped_cape: string | null; display: Display;
        village_switches: number; kage_of: Village | null; akatsuki_slot: number | null;
      }>(ENDGAME_SQL.player, [playerId])).rows[0];
      if (!r) return undefined;
      return {
        village: r.village, renegadeFrom: r.renegade_from, bounty: Number(r.bounty_ryo), kageOf: r.kage_of, akatsukiSlot: r.akatsuki_slot,
        cape: r.equipped_cape, display: { ...SHOW_ALL, ...(r.display ?? {}) }, villageSwitches: r.village_switches,
      };
    },
    async tick() {
      const rows = (await db.query<{ kind: string; village: Village | null; player_id: string | null; info: Record<string, unknown> | null }>(ENDGAME_SQL.tick)).rows;
      return rows.map((r) => ({ kind: r.kind, village: r.village, playerId: r.player_id, info: r.info }));
    },
    chooseVillage(playerId, village) {
      return call(async () => ({ village: (await db.query<{ village: Village }>(ENDGAME_SQL.chooseVillage, [playerId, village])).rows[0]!.village }));
    },
    async villagePanel(playerId, village, isKage) {
      const [election, candidates, proposals, reports, log] = await Promise.all([
        db.query<{ id: string; closes_at: string; my_vote: string | null }>(ENDGAME_SQL.election, [village, playerId]),
        db.query<{ id: string; username: string; level: number }>(ENDGAME_SQL.candidates, [village]),
        isKage ? db.query<{ id: string; kind: 'alianca' | 'paz'; from_village: Village; to_village: Village; expires_at: string }>(ENDGAME_SQL.proposals, [village]) : null,
        isKage ? db.query<{ id: string; reporter: string; target: string; target_id: string; reason: string; created_at: string }>(ENDGAME_SQL.reports, [village]) : null,
        db.query<{ action: string; kage: string | null; target_village: Village | null; target: string | null; reason: string | null; at: string }>(ENDGAME_SQL.log, [village]),
      ]);
      const e = election.rows[0];
      return {
        village,
        election: e ? { closesAt: ms(e.closes_at), candidates: candidates.rows.map((c) => ({ ...c })), myVote: e.my_vote } : null,
        proposals: (proposals?.rows ?? []).map((p) => ({ id: Number(p.id), kind: p.kind, from: p.from_village, to: p.to_village, expiresAt: ms(p.expires_at) })),
        reports: (reports?.rows ?? []).map((r) => ({
          id: Number(r.id), reporter: r.reporter, target: r.target, targetId: r.target_id, reason: r.reason, createdAt: ms(r.created_at),
        })),
        log: log.rows.map((l) => ({ action: l.action, kage: l.kage, targetVillage: l.target_village, target: l.target, reason: l.reason, at: ms(l.at) })),
      };
    },
    vote(voter, candidate) {
      return call(async () => { await db.query(ENDGAME_SQL.vote, [voter, candidate]); return {}; });
    },
    kageAction(kage, action, target) {
      return call(async () => {
        if (action === 'guerra') await db.query(ENDGAME_SQL.war, [kage, target]);
        else if (action === 'fim_guerra') await db.query(ENDGAME_SQL.endWar, [kage, target]);
        else if (action === 'romper') await db.query(ENDGAME_SQL.breakAlliance, [kage, target]);
        else await db.query(ENDGAME_SQL.propose, [kage, target, action]);
        return {};
      });
    },
    kageAnswer(kage, proposal, accept) {
      return call(async () => ({ kind: (await db.query<{ kind: string }>(ENDGAME_SQL.answer, [kage, proposal, accept])).rows[0]!.kind }));
    },
    async exile(kage, targetName, reason) {
      const t = await findByName(db, targetName);
      if (!t) return NOT_FOUND;
      return call(async () => { await db.query(ENDGAME_SQL.exile, [kage, t.id, reason]); return { targetId: t.id, username: t.username }; });
    },
    async report(reporter, targetName, reason) {
      const t = await findByName(db, targetName);
      if (!t) return NOT_FOUND;
      return call(async () => { await db.query(ENDGAME_SQL.report, [reporter, t.id, reason]); return {}; });
    },
    decideReport(kage, report, approve) {
      return call(async () => ({ targetId: (await db.query<{ target_id: string }>(ENDGAME_SQL.decideReport, [kage, report, approve])).rows[0]!.target_id }));
    },
    async pvpKill(winner, loser) {
      const r = (await withTransaction(db, (tx) => tx.query<{
        counted: boolean; winner_delta: number; loser_delta: number; winner_mmr: number | null; loser_mmr: number | null; loot_ryo: number;
        became_renegade: boolean; bounty_paid: string; winner_bounty: string; loser_bounty: string; kage_hunted: Village | null; ryo_winner: string;
      }>(ENDGAME_SQL.pvpKill, [winner, loser]))).rows[0]!;
      return {
        counted: r.counted, winnerDelta: r.winner_delta, loserDelta: r.loser_delta, winnerMmr: r.winner_mmr, loserMmr: r.loser_mmr, lootRyo: r.loot_ryo,
        becameRenegade: r.became_renegade, bountyPaid: Number(r.bounty_paid), winnerBounty: Number(r.winner_bounty), loserBounty: Number(r.loser_bounty),
        kageHunted: r.kage_hunted, ryoWinner: Number(r.ryo_winner),
      };
    },
    async ranking(playerId, limit) {
      const s = (await db.query<{ id: number; starts_at: string; ends_at: string }>(ENDGAME_SQL.season)).rows[0];
      const seasonId = s?.id ?? 0;
      type Row = { position: number; player_id: string; username: string; village: Village | null; mmr: number; wins: number; losses: number };
      const toRow = (r: Row): RankRow => ({ position: r.position, playerId: r.player_id, username: r.username, village: r.village, mmr: r.mmr, wins: r.wins, losses: r.losses });
      const [top, global, me] = await Promise.all([
        s ? db.query<Row>(ENDGAME_SQL.seasonTop, [seasonId, limit]) : null,
        db.query<Row>(ENDGAME_SQL.globalTop, [limit]),
        db.query<{ mmr: number | null; wins: number | null; losses: number | null; season_mmr: number | null; season_wins: number | null; season_losses: number | null; position: number | null }>(
          ENDGAME_SQL.myRating, [playerId, seasonId]),
      ]);
      const m = me.rows[0];
      return {
        season: s ? { id: s.id, startsAt: ms(s.starts_at), endsAt: ms(s.ends_at) } : null,
        top: (top?.rows ?? []).map(toRow),
        global: global.rows.map(toRow),
        me: {
          mmr: m?.mmr ?? 1000, wins: m?.wins ?? 0, losses: m?.losses ?? 0, seasonMmr: m?.season_mmr ?? null,
          seasonWins: m?.season_wins ?? 0, seasonLosses: m?.season_losses ?? 0, position: m?.season_mmr == null ? null : m.position,
        },
      };
    },
    async akatsukiInvite(leader, targetName, slot) {
      const t = await findByName(db, targetName);
      if (!t) return NOT_FOUND;
      return call(async () => { await db.query(ENDGAME_SQL.akatsukiInvite, [leader, t.id, slot]); return { targetId: t.id, username: t.username }; });
    },
    akatsukiAccept(playerId) {
      return call(async () => ({ slot: (await db.query<{ slot: number }>(ENDGAME_SQL.akatsukiAccept, [playerId])).rows[0]!.slot }));
    },
    async akatsukiDecline(playerId) {
      await db.query(ENDGAME_SQL.akatsukiDecline, [playerId]);
    },
    async akatsukiExpel(leader, targetName) {
      const t = await findByName(db, targetName);
      if (!t) return NOT_FOUND;
      return call(async () => { await db.query(ENDGAME_SQL.akatsukiExpel, [leader, t.id]); return { targetId: t.id, username: t.username }; });
    },
    akatsukiLeave(playerId) {
      return call(async () => { await db.query(ENDGAME_SQL.akatsukiLeave, [playerId]); return {}; });
    },
    async akatsukiInviteOf(playerId) {
      const r = (await db.query<{ slot: number; from_name: string; expires_at: string }>(ENDGAME_SQL.akatsukiInviteOf, [playerId])).rows[0];
      return r ? { slot: r.slot, from: r.from_name, expiresAt: ms(r.expires_at) } : null;
    },
    equipCape(playerId, cape) {
      return call(async () => ({ cape: (await db.query<{ cape: string | null }>(ENDGAME_SQL.equipCape, [playerId, cape])).rows[0]!.cape }));
    },
    async setDisplay(playerId, display) {
      await db.query(ENDGAME_SQL.setDisplay, [playerId, JSON.stringify(display)]);
    },
    payTravel(playerId, village) {
      return call(async () => ({ ryo: Number((await db.query<{ ryo: string }>(ENDGAME_SQL.payTravel, [playerId, village])).rows[0]!.ryo) }));
    },
  };
}
