/*
 * v61/v62 (migrações v36 e v37): banco da Fase 3: Titãs e Portadores, Progressão de Mundo e Loot. Sem a migração, cada
 * parte desliga sozinha (available) e o jogo segue como antes.
 */
import type { Queryable } from '../db.js';

export interface TitanRow { titan: number; maxHp: number; hp: number; spawnedAt: number; sleepsAt: number; defeatedAt: number | null }
export interface BearerRow { titan: number; playerId: string; username: string; activeCdUntil: number }

export interface Fase3Store {
  /** v36 (Titãs) e v37 (mundo e loot) já rodaram? */
  available(): Promise<{ titans: boolean; world: boolean }>;
  titans(era: number): Promise<TitanRow[]>;
  awaken(era: number, titan: number, maxHp: number, sleepsAt: Date): Promise<TitanRow>;
  saveTitan(era: number, titan: number, hp: number): Promise<void>;
  addDamage(era: number, titan: number, rows: readonly { playerId: string; damage: number }[]): Promise<void>;
  /** Coroa o Portador (o MVP que ainda não porta outro Titã). null = ninguém. */
  crown(era: number, titan: number, titleCode: string): Promise<string | null>;
  bearers(era: number): Promise<BearerRow[]>;
  setActiveCooldown(era: number, playerId: string, until: Date): Promise<void>;
  expireTitles(era: number): Promise<number>;
  world(days: number): Promise<{ active: number; stage: number; override: number | null }>;
  setWorldOverride(adminId: string, stage: number | null): Promise<void>;
  /** Entrega a relíquia (mochila + registro). Devolve a mochila nova. */
  grantLoot(playerId: string, item: string, source: string): Promise<Record<string, number>>;
  /** Usa o Renascer nesta Era: true se ainda não tinha usado. */
  useRevive(playerId: string, era: number): Promise<boolean>;
  revivesUsed(playerId: string): Promise<number[]>;
}

const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);

export const FASE3_SQL = {
  available: `SELECT to_regclass('game.titan_bearers') IS NOT NULL AS titans, to_regclass('game.world_progression') IS NOT NULL AS world`,
  titans: `SELECT titan, max_hp, hp, spawned_at, sleeps_at, defeated_at FROM game.titan_awakenings WHERE era_id = $1 ORDER BY titan`,
  awaken: `INSERT INTO game.titan_awakenings (era_id, titan, max_hp, hp, sleeps_at) VALUES ($1, $2, $3, $3, $4)
           ON CONFLICT (era_id, titan) DO UPDATE SET era_id = EXCLUDED.era_id
           RETURNING titan, max_hp, hp, spawned_at, sleeps_at, defeated_at`,
  saveTitan: `UPDATE game.titan_awakenings SET hp = $3 WHERE era_id = $1 AND titan = $2 AND defeated_at IS NULL`,
  addDamage: `SELECT game.titan_add_damage($1, $2::smallint, $3::uuid[], $4::bigint[])`,
  crown: `SELECT game.titan_crown($1, $2::smallint, $3) AS player_id`,
  bearers: `SELECT b.titan, b.player_id, p.username, b.active_cd_until FROM game.titan_bearers b JOIN game.players p ON p.id = b.player_id WHERE b.era_id = $1`,
  setActiveCooldown: `UPDATE game.titan_bearers SET active_cd_until = $3 WHERE era_id = $1 AND player_id = $2`,
  expire: `SELECT game.titan_expire($1) AS n`,
  world: `SELECT active_players, stage, override_stage FROM game.world_progression_refresh($1)`,
  setWorldOverride: `SELECT game.world_progression_override($1, $2::smallint)`,
  grantLoot: `SELECT game.loot_grant($1, $2, $3)`,
  inventory: `SELECT COALESCE(json_object_agg(item_code, quantity), '{}'::json) AS items FROM game.player_items WHERE player_id = $1`,
  useRevive: `INSERT INTO game.loot_revives (player_id, era_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING era_id`,
  revivesUsed: `SELECT era_id FROM game.loot_revives WHERE player_id = $1`,
} as const;

type Row = { titan: number; max_hp: number; hp: number; spawned_at: Date; sleeps_at: Date; defeated_at: Date | null };
const titanRow = (r: Row): TitanRow => ({ titan: Number(r.titan), maxHp: Number(r.max_hp), hp: Number(r.hp), spawnedAt: ms(r.spawned_at), sleepsAt: ms(r.sleeps_at), defeatedAt: r.defeated_at ? ms(r.defeated_at) : null });

export function makeFase3Store(db: Queryable): Fase3Store {
  return {
    async available() {
      const r = (await db.query<{ titans: boolean; world: boolean }>(FASE3_SQL.available)).rows[0];
      return { titans: r?.titans === true, world: r?.world === true };
    },
    async titans(era) {
      return (await db.query<Row>(FASE3_SQL.titans, [era])).rows.map(titanRow);
    },
    async awaken(era, titan, maxHp, sleepsAt) {
      return titanRow((await db.query<Row>(FASE3_SQL.awaken, [era, titan, maxHp, sleepsAt])).rows[0]!);
    },
    async saveTitan(era, titan, hp) {
      await db.query(FASE3_SQL.saveTitan, [era, titan, Math.max(0, Math.round(hp))]);
    },
    async addDamage(era, titan, rows) {
      if (rows.length === 0) return;
      await db.query(FASE3_SQL.addDamage, [era, titan, rows.map((r) => r.playerId), rows.map((r) => Math.round(r.damage))]);
    },
    async crown(era, titan, titleCode) {
      return (await db.query<{ player_id: string | null }>(FASE3_SQL.crown, [era, titan, titleCode])).rows[0]?.player_id ?? null;
    },
    async bearers(era) {
      return (await db.query<{ titan: number; player_id: string; username: string; active_cd_until: Date | null }>(FASE3_SQL.bearers, [era])).rows
        .map((r) => ({ titan: Number(r.titan), playerId: r.player_id, username: r.username, activeCdUntil: ms(r.active_cd_until) }));
    },
    async setActiveCooldown(era, playerId, until) {
      await db.query(FASE3_SQL.setActiveCooldown, [era, playerId, until]);
    },
    async expireTitles(era) {
      return (await db.query<{ n: number }>(FASE3_SQL.expire, [era])).rows[0]?.n ?? 0;
    },
    async world(days) {
      const r = (await db.query<{ active_players: number; stage: number; override_stage: number | null }>(FASE3_SQL.world, [days])).rows[0];
      return { active: Number(r?.active_players ?? 0), stage: Number(r?.stage ?? 0), override: r?.override_stage === null || r?.override_stage === undefined ? null : Number(r.override_stage) };
    },
    async setWorldOverride(adminId, stage) {
      await db.query(FASE3_SQL.setWorldOverride, [adminId, stage]);
    },
    async grantLoot(playerId, item, source) {
      await db.query(FASE3_SQL.grantLoot, [playerId, item, source]);
      return (await db.query<{ items: Record<string, number> }>(FASE3_SQL.inventory, [playerId])).rows[0]?.items ?? {};
    },
    async useRevive(playerId, era) {
      return (await db.query(FASE3_SQL.useRevive, [playerId, era])).rows.length > 0;
    },
    async revivesUsed(playerId) {
      try { return (await db.query<{ era_id: number }>(FASE3_SQL.revivesUsed, [playerId])).rows.map((r) => Number(r.era_id)); }
      catch (err) { if ((err as { code?: string })?.code === '42P01') return []; throw err; }
    },
  };
}
