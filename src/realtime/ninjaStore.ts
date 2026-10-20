import { withTransaction, type Db, type Queryable } from '../db.js';
import { CONSTRAINT_ERRORS } from '../errors/errorTranslator.js';
import type { ClassCode } from './jutsus.js';
import type { RankView } from './protocol.js';

/*
 * Progressão do ninja no banco (migração v7): uso de jutsus, tutorial da Academia, classes,
 * Extração (gacha), loja, arma equipada e candidatura a Hokage.
 *
 * As REGRAS ficam no banco (funções game.* da v7, com travas de linha): o servidor só chama.
 * O cliente nunca manda preço, chance, sorteio, uso ou nível: o sorteio da Extração sai do
 * servidor (crypto) e o banco confere classe, nível e pergaminhos antes de gastar.
 * Recusa por regra conhecida vira texto público (o nome da regra nunca sai para o jogador).
 */

export type Inventory = Record<string, number>;
export interface Classes {
  primary: ClassCode | null;
  secondary: ClassCode | null;
}

export type StoreResult<T> = ({ ok: true } & T) | { ok: false; text: string };

export interface TutorialResult {
  step: number;
  totalXp: number;
  level: number;
  statPoints: number;
  ryo: number;
  items: Inventory;
}

export interface ExtractResult {
  outcome: 'success' | 'failed' | 'no_scrolls' | 'all_learned';
  jutsu: string | null;
  consumed: number;
  scrollsLeft: number;
}

export interface NinjaStore {
  /** Soma os usos contados pelo servidor (lote). O nível do jutsu é calculado pelo banco. */
  flushUsage(playerId: string, uses: readonly [string, number][]): Promise<void>;
  /** Avança o tutorial UM passo (de `to - 1` para `to`). null = não avançou (já estava lá). */
  advanceTutorial(playerId: string, to: number): Promise<TutorialResult | null>;
  becomeGenin(playerId: string, cls: ClassCode): Promise<StoreResult<{ rank: RankView; canBeSensei: boolean; classes: Classes; items: Inventory }>>;
  chooseSecondary(playerId: string, cls: ClassCode): Promise<StoreResult<{ classes: Classes }>>;
  /** roll e pick: sorteios do SERVIDOR, de 0 a 1. */
  extract(playerId: string, cls: ClassCode, level: number, roll: number, pick: number): Promise<StoreResult<ExtractResult & { items: Inventory }>>;
  buy(playerId: string, item: string, qty: number): Promise<StoreResult<{ ryo: number; items: Inventory }>>;
  equip(playerId: string, item: string | null): Promise<StoreResult<{ equipped: string | null }>>;
  applyHokage(playerId: string): Promise<StoreResult<{ already: boolean }>>;
  /** Item ganho em combate (pergaminho que caiu do monstro). */
  addItem(playerId: string, item: string, qty: number): Promise<Inventory>;
  /** Rank atual (depois do Exame Chunin aprovado). */
  rankOf(playerId: string): Promise<{ rank: RankView; canBeSensei: boolean } | undefined>;
}

const INVENTORY = `COALESCE((SELECT json_object_agg(item_code, quantity) FROM game.player_items WHERE player_id = $1), '{}'::json)`;

export const NINJA_SQL = {
  flushUsage: `
    UPDATE game.player_jutsus pj
       SET usage_count = pj.usage_count + u.n
      FROM unnest($2::text[], $3::int[]) AS u(code, n)
     WHERE pj.player_id = $1 AND pj.jutsu_code = u.code AND u.n > 0`,
  advanceTutorial: `SELECT game.advance_tutorial($1, $2) AS advanced`,
  afterTutorial: `SELECT tutorial_step, total_xp, level, stat_points, ryo, ${INVENTORY} AS items FROM game.players WHERE id = $1`,
  becomeGenin: `SELECT game.become_genin($1, $2)`,
  chooseSecondary: `SELECT game.choose_secondary_class($1, $2)`,
  classes: `SELECT primary_class, secondary_class FROM game.player_classes WHERE player_id = $1`,
  rank: `SELECT r.code, r.name, r.can_be_sensei FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1`,
  extract: `SELECT outcome, jutsu_code, consumed, scrolls_left FROM game.extract_jutsu($1, $2, $3, $4, $5)`,
  buy: `SELECT game.buy_item($1, $2, $3) AS ryo`,
  equip: `UPDATE game.players SET equipped_weapon = $2 WHERE id = $1 RETURNING equipped_weapon`,
  hokage: `INSERT INTO game.hokage_candidates (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING RETURNING player_id`,
  addItem: `
    INSERT INTO game.player_items (player_id, item_code, quantity) VALUES ($1, $2, $3)
    ON CONFLICT (player_id, item_code) DO UPDATE SET quantity = game.player_items.quantity + EXCLUDED.quantity`,
  inventory: `SELECT ${INVENTORY} AS items`,
  /** Checagem de boot: a migração v7 foi aplicada? (LIMIT 0: não lê linha.) */
  bootCheck: `SELECT tutorial_step, ryo, equipped_weapon, attr_weapons FROM game.players LIMIT 0`,
} as const;

interface PgError {
  code?: string;
  constraint?: string;
}

/** Regra conhecida do banco vira recusa com texto; o resto sobe (erro do servidor). */
function refuse(err: unknown): { ok: false; text: string } {
  const e = (typeof err === 'object' && err !== null ? err : {}) as PgError;
  const known = e.constraint ? CONSTRAINT_ERRORS[e.constraint] : undefined;
  if (known) return { ok: false, text: known.message };
  if (e.code === '23505') return { ok: false, text: 'Isso já foi feito.' };
  throw err;
}

const inventoryOf = async (q: Queryable, playerId: string): Promise<Inventory> =>
  ((await q.query<{ items: Inventory }>(NINJA_SQL.inventory, [playerId])).rows[0]?.items ?? {});

const classesOf = async (q: Queryable, playerId: string): Promise<Classes> => {
  const row = (await q.query<{ primary_class: ClassCode; secondary_class: ClassCode | null }>(NINJA_SQL.classes, [playerId])).rows[0];
  return { primary: row?.primary_class ?? null, secondary: row?.secondary_class ?? null };
};

export function makeNinjaStore(db: Db): NinjaStore {
  return {
    async flushUsage(playerId, uses) {
      if (uses.length === 0) return;
      await db.query(NINJA_SQL.flushUsage, [playerId, uses.map(([c]) => c), uses.map(([, n]) => n)]);
    },

    async advanceTutorial(playerId, to) {
      const advanced = (await db.query<{ advanced: boolean }>(NINJA_SQL.advanceTutorial, [playerId, to])).rows[0]?.advanced;
      if (!advanced) return null;
      const r = (await db.query<{ tutorial_step: number; total_xp: string; level: number; stat_points: number; ryo: string; items: Inventory }>(
        NINJA_SQL.afterTutorial, [playerId])).rows[0];
      if (!r) return null;
      return { step: r.tutorial_step, totalXp: Number(r.total_xp), level: r.level, statPoints: r.stat_points, ryo: Number(r.ryo), items: r.items };
    },

    async becomeGenin(playerId, cls) {
      try {
        return await withTransaction(db, async (tx) => {
          await tx.query(NINJA_SQL.becomeGenin, [playerId, cls]);
          const rank = (await tx.query<{ code: string; name: string; can_be_sensei: boolean }>(NINJA_SQL.rank, [playerId])).rows[0]!;
          return {
            ok: true as const, rank: { code: rank.code, name: rank.name }, canBeSensei: rank.can_be_sensei,
            classes: await classesOf(tx, playerId), items: await inventoryOf(tx, playerId),
          };
        });
      } catch (err) {
        return refuse(err);
      }
    },

    async chooseSecondary(playerId, cls) {
      try {
        await db.query(NINJA_SQL.chooseSecondary, [playerId, cls]);
        return { ok: true, classes: await classesOf(db, playerId) };
      } catch (err) {
        return refuse(err);
      }
    },

    async extract(playerId, cls, level, roll, pick) {
      try {
        return await withTransaction(db, async (tx) => {
          const r = (await tx.query<{ outcome: ExtractResult['outcome']; jutsu_code: string | null; consumed: number; scrolls_left: number }>(
            NINJA_SQL.extract, [playerId, cls, level, roll, pick])).rows[0]!;
          return {
            ok: true as const, outcome: r.outcome, jutsu: r.jutsu_code, consumed: r.consumed, scrollsLeft: r.scrolls_left,
            items: await inventoryOf(tx, playerId),
          };
        });
      } catch (err) {
        return refuse(err);
      }
    },

    async buy(playerId, item, qty) {
      try {
        return await withTransaction(db, async (tx) => {
          const ryo = Number((await tx.query<{ ryo: string }>(NINJA_SQL.buy, [playerId, item, qty])).rows[0]!.ryo);
          return { ok: true as const, ryo, items: await inventoryOf(tx, playerId) };
        });
      } catch (err) {
        return refuse(err);
      }
    },

    async equip(playerId, item) {
      try {
        const row = (await db.query<{ equipped_weapon: string | null }>(NINJA_SQL.equip, [playerId, item])).rows[0];
        if (!row) return { ok: false, text: 'Jogador não encontrado.' };
        return { ok: true, equipped: row.equipped_weapon };
      } catch (err) {
        return refuse(err);
      }
    },

    async applyHokage(playerId) {
      try {
        const inserted = (await db.query(NINJA_SQL.hokage, [playerId])).rows.length > 0;
        return { ok: true, already: !inserted };
      } catch (err) {
        return refuse(err);
      }
    },

    async addItem(playerId, item, qty) {
      await db.query(NINJA_SQL.addItem, [playerId, item, qty]);
      return inventoryOf(db, playerId);
    },

    async rankOf(playerId) {
      const r = (await db.query<{ code: string; name: string; can_be_sensei: boolean }>(NINJA_SQL.rank, [playerId])).rows[0];
      return r ? { rank: { code: r.code, name: r.name }, canBeSensei: r.can_be_sensei } : undefined;
    },
  };
}
