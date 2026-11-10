/*
 * v44 (migração v29): bônus de XP ligado pelo admin. Vale para o XP de derrotar monstros.
 *
 * Alvos: 'global' (todo mundo), 'mapa' (monstro derrotado naquele mapa), 'monstro' (aquele tipo de monstro) e 'vila'
 * (ninjas daquela aldeia, em qualquer lugar). Bônus de alvos diferentes SOMAM (+50% global e +50% do mapa = +100%).
 */
import type { Queryable } from '../db.js';

export type XpBonusScope = 'global' | 'mapa' | 'monstro' | 'vila';
export interface XpBonus { scope: XpBonusScope; target: string; percent: number; endsAt: number }

export const XP_BONUS_LIMITS = { minPercent: 1, maxPercent: 500, minMinutes: 1, maxMinutes: 7 * 24 * 60, defaultMinutes: 60 } as const;

/** Os bônus que valem agora para este abate. */
export function bonusesFor(list: readonly XpBonus[], ctx: { map: string; monster: string; village: string | null }, now: number): XpBonus[] {
  return list.filter((b) => b.endsAt > now && (b.scope === 'global' || (b.scope === 'mapa' && b.target === ctx.map)
    || (b.scope === 'monstro' && b.target === ctx.monster) || (b.scope === 'vila' && b.target === ctx.village)));
}

/** O XP com o bônus (soma das porcentagens, arredondado; nunca menos que o XP base). */
export function xpWithBonus(xp: number, list: readonly XpBonus[], ctx: { map: string; monster: string; village: string | null }, now: number): number {
  const percent = bonusesFor(list, ctx, now).reduce((sum, b) => sum + b.percent, 0);
  return percent > 0 ? Math.max(xp, Math.round(xp * (1 + percent / 100))) : xp;
}

export interface XpBonusStore {
  available(): Promise<boolean>;
  active(): Promise<XpBonus[]>;
  set(adminId: string, scope: XpBonusScope, target: string, percent: number, minutes: number): Promise<void>;
  /** Remove o bônus de um alvo, ou todos (`scope` 'tudo'). Devolve quantos saíram. */
  remove(adminId: string, scope: XpBonusScope | 'tudo', target: string): Promise<number>;
}

export const XP_BONUS_SQL = {
  available: `SELECT to_regclass('game.xp_bonuses') IS NOT NULL AS ok`,
  active: `SELECT scope, target, percent, ends_at FROM game.xp_bonuses WHERE removed_at IS NULL AND ends_at > now() ORDER BY scope, target`,
  set: `SELECT game.admin_xp_bonus($1, $2, $3, $4, $5)`,
  remove: `SELECT game.admin_xp_bonus_remove($1, $2, $3) AS n`,
} as const;

export function makeXpBonusStore(db: Queryable): XpBonusStore {
  return {
    async available() { return (await db.query<{ ok: boolean }>(XP_BONUS_SQL.available)).rows[0]?.ok === true; },
    async active() {
      const { rows } = await db.query<{ scope: XpBonusScope; target: string; percent: number; ends_at: Date }>(XP_BONUS_SQL.active);
      return rows.map((r) => ({ scope: r.scope, target: r.target, percent: r.percent, endsAt: new Date(r.ends_at).getTime() }));
    },
    async set(adminId, scope, target, percent, minutes) { await db.query(XP_BONUS_SQL.set, [adminId, scope, target, percent, minutes]); },
    async remove(adminId, scope, target) { return (await db.query<{ n: number }>(XP_BONUS_SQL.remove, [adminId, scope, target])).rows[0]?.n ?? 0; },
  };
}
