import { withTransaction, type Db, type Queryable } from '../db.js';
import { CONSTRAINT_ERRORS } from '../errors/errorTranslator.js';
import type { Appearance, Skill } from './protocol.js';
import { DEFAULT_APPEARANCE } from './appearance.js';
import { ATTRIBUTE_COLUMNS, type Attribute, type Attributes } from './stats.js';

/*
 * Ficha do jogador no banco: gastar pontos de atributo, redefinir os atributos e salvar os kits.
 * O nome da coluna sai de uma lista fechada (ATTRIBUTE_COLUMNS), nunca do cliente.
 * As regras finais são do banco (migrações v5 e v8): pontos livres + gastos = nível - 1,
 * atributo nunca negativo (sem teto desde a v8: o soft cap é do servidor), kits com até 4
 * habilidades sem repetir; redefinir cobra o custo em ryō na mesma linha travada.
 */

const ATTRS_RETURNING = `stat_points, attr_vitality, attr_chakra, attr_agility, attr_taijutsu, attr_ninjutsu, attr_weapons`;

interface AttrRow {
  stat_points: number;
  attr_vitality: number;
  attr_chakra: number;
  attr_agility: number;
  attr_taijutsu: number;
  attr_ninjutsu: number;
  attr_weapons: number;
}

const toAttributes = (r: AttrRow): Attributes => ({
  vitality: r.attr_vitality,
  chakra: r.attr_chakra,
  taijutsu: r.attr_taijutsu + (r.attr_agility ?? 0),   // v53: a Agilidade virou Taijutsu
  ninjutsu: r.attr_ninjutsu,
  weapons: r.attr_weapons,
});

export function spendPointSql(attribute: Attribute): string {
  const col = ATTRIBUTE_COLUMNS[attribute];
  // stat_points > 0: dois toques ao mesmo tempo não gastam o mesmo ponto
  // (o UPDATE trava a linha e o segundo vê o valor novo).
  return `
    UPDATE game.players
       SET stat_points = stat_points - 1, ${col} = ${col} + 1
     WHERE id = $1 AND stat_points > 0
    RETURNING ${ATTRS_RETURNING}`;
}

export const PROFILE_SQL = {
  attributes: `SELECT ${ATTRS_RETURNING} FROM game.players WHERE id = $1`,
  /** Redefinir: o banco confere ryō e pontos investidos, devolve tudo e cobra (v8). */
  resetAttributes: `SELECT game.reset_attributes($1, $2)`,
  afterReset: `SELECT ${ATTRS_RETURNING}, ryo FROM game.players WHERE id = $1`,
  /** Checagem de boot: a migração v8 foi aplicada? */
  bootCheckV8: `SELECT attr_chakra, is_admin, equipped_scroll FROM game.players LIMIT 0`,
  saveLoadout: `UPDATE game.players SET kit_a = $2::text[], kit_b = $3::text[] WHERE id = $1`,
  saveAppearance: `UPDATE game.players SET appearance = $2::jsonb WHERE id = $1`,
  /** Checagem de boot: a migração v6 foi aplicada? */
  bootCheckV6: `SELECT appearance FROM game.players LIMIT 0`,
  /** Checagem de boot: a migração v9 foi aplicada? (o banco aceita o visual novo, de sprites) */
  bootCheckV9: `SELECT game.valid_appearance($1::jsonb) AS ok`,
  /** Checagem de boot: a migração v5 foi aplicada? (LIMIT 0: não lê linha.) */
  bootCheck: `SELECT level, stat_points, attr_taijutsu, attr_ninjutsu, kit_a, kit_b FROM game.players LIMIT 0`,
} as const;

/** Erro de subida quando falta a migração v9 (o banco ainda recusaria o visual novo). */
export const MISSING_V9 = 'MISSING_V9';

/** Falha a subida se o banco ainda não aceita o visual novo (v9): o Render mantém a versão anterior. */
export async function bootCheckV9(db: Queryable): Promise<void> {
  const row = (await db.query<{ ok: boolean | null }>(PROFILE_SQL.bootCheckV9, [JSON.stringify(DEFAULT_APPEARANCE)])).rows[0];
  if (row?.ok !== true) {
    throw Object.assign(new Error('game.valid_appearance ainda não aceita o visual v9 (sprites)'), { code: MISSING_V9 });
  }
}

export type SpendResult =
  | { ok: true; statPoints: number; attributes: Attributes }
  | { ok: false; reason: 'NO_POINTS' };

export type ResetResult =
  | { ok: true; statPoints: number; attributes: Attributes; ryo: number }
  | { ok: false; text: string };

export interface Profile {
  spendPoint(playerId: string, attribute: Attribute): Promise<SpendResult>;
  /** Devolve todos os pontos investidos e cobra `cost` ryō (o custo é do servidor, nunca do cliente). */
  resetAttributes(playerId: string, cost: number): Promise<ResetResult>;
  saveLoadout(playerId: string, kitA: readonly Skill[], kitB: readonly Skill[]): Promise<void>;
  saveAppearance(playerId: string, appearance: Appearance): Promise<void>;
}

export function makeProfile(db: Db): Profile {
  return {
    async spendPoint(playerId, attribute) {
      const row = (await db.query<AttrRow>(spendPointSql(attribute), [playerId])).rows[0];
      if (row) return { ok: true, statPoints: row.stat_points, attributes: toAttributes(row) };
      return { ok: false, reason: 'NO_POINTS' };
    },
    async resetAttributes(playerId, cost) {
      try {
        return await withTransaction(db, async (tx) => {
          await tx.query(PROFILE_SQL.resetAttributes, [playerId, cost]);
          const row = (await tx.query<AttrRow & { ryo: string }>(PROFILE_SQL.afterReset, [playerId])).rows[0]!;
          return { ok: true as const, statPoints: row.stat_points, attributes: toAttributes(row), ryo: Number(row.ryo) };
        });
      } catch (err) {
        const e = (typeof err === 'object' && err !== null ? err : {}) as { constraint?: string };
        const known = e.constraint ? CONSTRAINT_ERRORS[e.constraint] : undefined;
        if (known) return { ok: false, text: known.message };
        throw err;
      }
    },
    async saveLoadout(playerId, kitA, kitB) {
      await db.query(PROFILE_SQL.saveLoadout, [playerId, kitA, kitB]);
    },
    async saveAppearance(playerId, appearance) {
      // Visual novo (nomes de paleta), já validado pelo Zod; o banco confere de novo (ck_players_appearance).
      await db.query(PROFILE_SQL.saveAppearance, [playerId, JSON.stringify(appearance)]);
    },
  };
}
