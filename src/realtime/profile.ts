import type { Queryable } from '../db.js';
import type { Appearance, Skill } from './protocol.js';
import { ATTRIBUTE_COLUMNS, type Attribute, type Attributes } from './stats.js';

/*
 * Ficha do jogador no banco: gastar pontos de atributo e salvar os kits.
 * O nome da coluna sai de uma lista fechada (ATTRIBUTE_COLUMNS), nunca do cliente.
 * As regras finais são do banco (migração v5): pontos livres + gastos = nível - 1,
 * cada atributo de 0 a 10, kits com até 4 habilidades sem repetir.
 */

const ATTRS_RETURNING = `stat_points, attr_vitality, attr_chakra_max, attr_chakra_regen, attr_agility, attr_taijutsu, attr_ninjutsu, attr_weapons`;

interface AttrRow {
  stat_points: number;
  attr_vitality: number;
  attr_chakra_max: number;
  attr_chakra_regen: number;
  attr_agility: number;
  attr_taijutsu: number;
  attr_ninjutsu: number;
  attr_weapons: number;
}

const toAttributes = (r: AttrRow): Attributes => ({
  vitality: r.attr_vitality,
  chakraMax: r.attr_chakra_max,
  chakraRegen: r.attr_chakra_regen,
  agility: r.attr_agility,
  taijutsu: r.attr_taijutsu,
  ninjutsu: r.attr_ninjutsu,
  weapons: r.attr_weapons,
});

export function spendPointSql(attribute: Attribute): string {
  const col = ATTRIBUTE_COLUMNS[attribute];
  // stat_points > 0 e col < máximo: dois toques ao mesmo tempo não gastam o mesmo ponto
  // (o UPDATE trava a linha e o segundo vê o valor novo).
  return `
    UPDATE game.players
       SET stat_points = stat_points - 1, ${col} = ${col} + 1
     WHERE id = $1 AND stat_points > 0 AND ${col} < $2
    RETURNING ${ATTRS_RETURNING}`;
}

export const PROFILE_SQL = {
  attributes: `SELECT ${ATTRS_RETURNING} FROM game.players WHERE id = $1`,
  saveLoadout: `UPDATE game.players SET kit_a = $2::text[], kit_b = $3::text[] WHERE id = $1`,
  saveAppearance: `UPDATE game.players SET appearance = $2::jsonb WHERE id = $1`,
  /** Checagem de boot: a migração v6 foi aplicada? */
  bootCheckV6: `SELECT appearance FROM game.players LIMIT 0`,
  /** Checagem de boot: a migração v5 foi aplicada? (LIMIT 0: não lê linha.) */
  bootCheck: `SELECT level, stat_points, attr_taijutsu, attr_ninjutsu, kit_a, kit_b FROM game.players LIMIT 0`,
} as const;

export type SpendResult =
  | { ok: true; statPoints: number; attributes: Attributes }
  | { ok: false; reason: 'NO_POINTS' | 'MAXED' };

export interface Profile {
  spendPoint(playerId: string, attribute: Attribute): Promise<SpendResult>;
  saveLoadout(playerId: string, kitA: readonly Skill[], kitB: readonly Skill[]): Promise<void>;
  saveAppearance(playerId: string, appearance: Appearance): Promise<void>;
}

export function makeProfile(db: Queryable, maxPoints: number): Profile {
  return {
    async spendPoint(playerId, attribute) {
      const row = (await db.query<AttrRow>(spendPointSql(attribute), [playerId, maxPoints])).rows[0];
      if (row) return { ok: true, statPoints: row.stat_points, attributes: toAttributes(row) };
      const now = (await db.query<AttrRow>(PROFILE_SQL.attributes, [playerId])).rows[0];
      return { ok: false, reason: !now || now.stat_points <= 0 ? 'NO_POINTS' : 'MAXED' };
    },
    async saveLoadout(playerId, kitA, kitB) {
      await db.query(PROFILE_SQL.saveLoadout, [playerId, kitA, kitB]);
    },
    async saveAppearance(playerId, appearance) {
      // Só as 5 cores, já validadas pelo Zod; o banco confere de novo (ck_players_appearance).
      await db.query(PROFILE_SQL.saveAppearance, [playerId, JSON.stringify(appearance)]);
    },
  };
}
