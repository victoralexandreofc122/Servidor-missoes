import { withTransaction, type Db, type Queryable } from '../db.js';
import { CONSTRAINT_ERRORS } from '../errors/errorTranslator.js';
import { ITEM_BY_CODE } from './items.js';
import { JUTSU_BY_CODE } from './jutsus.js';
import type { Inventory } from './ninjaStore.js';
import type { Attributes } from './stats.js';

/*
 * Modo Administrador (God Mode): comandos no chat que começam com "/admin".
 *
 *   /admin level <nome> <nível>                  define o nível (1 a 60)
 *   /admin spawn <monstro> <quantidade>          invoca monstros em volta do admin (1 a 20)
 *   /admin givejutsu <nome> <jutsu> <nível>      ensina o jutsu ou sobe o nível dele (1 a 4)
 *   /admin giveitem <nome> <item> <quantidade>   põe itens no inventário (1 a 999)
 *   /admin resetstats <nome>                     devolve os pontos de atributo (sem custo)
 *
 * Restrito: o servidor só aceita de quem entrou com players.is_admin = true, e CADA função do
 * banco (game.admin_*, migração v8) confere is_admin de novo e grava a auditoria
 * (game.admin_audit_log) na mesma transação. Recusas também ficam na auditoria.
 * Nada de admin dispara conquista, título, rank, anúncio, XP de abate ou missão: o nível vem
 * pela flag local game.admin_action e os monstros invocados não dão recompensa nenhuma.
 * Quem não é admin e digita "/admin" recebe só "Comando desconhecido" (e o servidor registra no log).
 */

export const ADMIN_LIMITS = { maxLevel: 60, maxSpawn: 20, maxJutsuLevel: 4, maxItems: 999 } as const;

export type AdminCommand =
  | { cmd: 'level'; username: string; level: number }
  | { cmd: 'spawn'; monster: string; quantity: number }
  | { cmd: 'givejutsu'; username: string; jutsu: string; level: number }
  | { cmd: 'giveitem'; username: string; item: string; quantity: number }
  | { cmd: 'resetstats'; username: string }
  | { cmd: 'help' };

export type ParsedAdmin = { ok: true; command: AdminCommand } | { ok: false; command: string; text: string };

export const ADMIN_HELP = 'Admin: /admin level <nome> <nível> · spawn <monstro> <qtd> · givejutsu <nome> <jutsu> <nível> · giveitem <nome> <item> <qtd> · resetstats <nome>';

const USERNAME = /^[A-Za-z0-9_]{3,24}$/;
const INT = /^\d{1,7}$/;
const CODE = /^[a-z][a-z0-9_]{0,31}$/;

/** "/admin ..." (sem diferenciar maiúsculas no "/admin")? */
export const isAdminCommand = (text: string) => /^\/admin(\s|$)/i.test(text);

/** Lê o comando. Não sabe quem pediu: só confere formato, faixa e códigos conhecidos. */
export function parseAdminCommand(text: string, monsterTypes: readonly string[]): ParsedAdmin {
  const parts = text.trim().split(/\s+/).slice(1);
  const cmd = (parts[0] ?? 'help').toLowerCase();
  const args = parts.slice(1);
  const bad = (usage: string): ParsedAdmin => ({ ok: false, command: cmd, text: `Uso: /admin ${usage}` });
  const int = (s: string | undefined, min: number, max: number) => (s && INT.test(s) && Number(s) >= min && Number(s) <= max ? Number(s) : undefined);
  const user = (s: string | undefined) => (s && USERNAME.test(s) ? s : undefined);

  switch (cmd) {
    case 'help':
      return { ok: true, command: { cmd: 'help' } };
    case 'level': {
      const username = user(args[0]);
      const level = int(args[1], 1, ADMIN_LIMITS.maxLevel);
      if (args.length !== 2 || !username || level === undefined) return bad(`level <nome> <nível 1 a ${ADMIN_LIMITS.maxLevel}>`);
      return { ok: true, command: { cmd, username, level } };
    }
    case 'spawn': {
      const monster = (args[0] ?? '').toLowerCase();
      const quantity = int(args[1] ?? '1', 1, ADMIN_LIMITS.maxSpawn);
      if (args.length < 1 || args.length > 2 || !monsterTypes.includes(monster) || quantity === undefined) {
        return bad(`spawn <${monsterTypes.join('|')}> <quantidade 1 a ${ADMIN_LIMITS.maxSpawn}>`);
      }
      return { ok: true, command: { cmd, monster, quantity } };
    }
    case 'givejutsu': {
      const username = user(args[0]);
      const jutsu = (args[1] ?? '').toLowerCase();
      const level = int(args[2] ?? '1', 1, ADMIN_LIMITS.maxJutsuLevel);
      if (args.length < 2 || args.length > 3 || !username || !CODE.test(jutsu) || !JUTSU_BY_CODE.has(jutsu as never) || level === undefined) {
        return bad('givejutsu <nome> <jutsu, ex.: fire_2> <nível 1 a 4>');
      }
      return { ok: true, command: { cmd, username, jutsu, level } };
    }
    case 'giveitem': {
      const username = user(args[0]);
      const item = (args[1] ?? '').toLowerCase();
      const quantity = int(args[2] ?? '1', 1, ADMIN_LIMITS.maxItems);
      if (args.length < 2 || args.length > 3 || !username || !CODE.test(item) || !ITEM_BY_CODE.has(item) || quantity === undefined) {
        return bad(`giveitem <nome> <item, ex.: kunai> <quantidade 1 a ${ADMIN_LIMITS.maxItems}>`);
      }
      return { ok: true, command: { cmd, username, item, quantity } };
    }
    case 'resetstats': {
      const username = user(args[0]);
      if (args.length !== 1 || !username) return bad('resetstats <nome>');
      return { ok: true, command: { cmd, username } };
    }
    default:
      return { ok: false, command: 'unknown', text: ADMIN_HELP };
  }
}

/** Ficha do alvo depois do comando (para atualizar a sessão dele, se estiver online). */
export interface AdminPlayerState {
  totalXp: number;
  level: number;
  statPoints: number;
  attributes: Attributes;
}

export type AdminOutcome<T> = ({ ok: true } & T) | { ok: false; text: string };

export interface AdminStore {
  /** Jogador pelo nome (sem diferenciar maiúsculas). */
  findPlayer(username: string): Promise<{ id: string; username: string } | undefined>;
  setLevel(adminId: string, targetId: string, level: number): Promise<AdminOutcome<AdminPlayerState>>;
  giveJutsu(adminId: string, targetId: string, jutsu: string, level: number): Promise<AdminOutcome<{ uses: number }>>;
  giveItem(adminId: string, targetId: string, item: string, quantity: number): Promise<AdminOutcome<{ items: Inventory }>>;
  resetStats(adminId: string, targetId: string): Promise<AdminOutcome<AdminPlayerState>>;
  /** Auditoria de um comando que não passa por função do banco (spawn) ou que foi recusado. */
  log(adminId: string, command: string, targetId: string | null, args: Record<string, unknown>, ok: boolean, detail: string | null): Promise<void>;
}

const STATE = `total_xp, level, stat_points, attr_vitality, attr_chakra, attr_agility, attr_taijutsu, attr_ninjutsu, attr_weapons`;

export const ADMIN_SQL = {
  findPlayer: `SELECT id, username FROM game.players WHERE lower(username) = lower($1)`,
  state: `SELECT ${STATE} FROM game.players WHERE id = $1`,
  setLevel: `SELECT game.admin_set_level($1, $2, $3)`,
  giveJutsu: `SELECT game.admin_give_jutsu($1, $2, $3, $4) AS uses`,
  giveItem: `SELECT game.admin_give_item($1, $2, $3, $4) AS quantity`,
  resetStats: `SELECT game.admin_reset_stats($1, $2)`,
  inventory: `SELECT COALESCE((SELECT json_object_agg(item_code, quantity) FROM game.player_items WHERE player_id = $1), '{}'::json) AS items`,
  log: `SELECT game.admin_log($1, $2, $3, $4::jsonb, $5, $6)`,
} as const;

interface StateRow {
  total_xp: string;
  level: number;
  stat_points: number;
  attr_vitality: number;
  attr_chakra: number;
  attr_agility: number;
  attr_taijutsu: number;
  attr_ninjutsu: number;
  attr_weapons: number;
}

const toState = (r: StateRow): AdminPlayerState => ({
  totalXp: Number(r.total_xp), level: r.level, statPoints: r.stat_points,
  attributes: {
    vitality: r.attr_vitality, chakra: r.attr_chakra, agility: r.attr_agility,
    taijutsu: r.attr_taijutsu, ninjutsu: r.attr_ninjutsu, weapons: r.attr_weapons,
  },
});

export function makeAdminStore(db: Db): AdminStore {
  const log: AdminStore['log'] = async (adminId, command, targetId, args, ok, detail) => {
    await db.query(ADMIN_SQL.log, [adminId, command, targetId, JSON.stringify(args), ok, detail]);
  };

  /** Roda o comando numa transação; recusa por regra conhecida vira texto e fica na auditoria. */
  async function run<T>(adminId: string, command: string, targetId: string, args: Record<string, unknown>,
    fn: (tx: Queryable) => Promise<T>): Promise<AdminOutcome<T>> {
    try {
      return { ok: true, ...(await withTransaction(db, fn)) };
    } catch (err) {
      const e = (typeof err === 'object' && err !== null ? err : {}) as { constraint?: string; code?: string };
      const known = (e.constraint ? CONSTRAINT_ERRORS[e.constraint]?.message : undefined)
        ?? (e.code === '23503' ? 'Jogador, jutsu ou item inexistente.' : undefined);
      if (!known) throw err;
      // A transação voltou atrás; a recusa fica na auditoria (inclusive admin revogado depois do login).
      await log(adminId, command, targetId, args, false, known).catch(() => undefined);
      return { ok: false, text: known };
    }
  }

  return {
    async findPlayer(username) {
      return (await db.query<{ id: string; username: string }>(ADMIN_SQL.findPlayer, [username])).rows[0];
    },
    setLevel(adminId, targetId, level) {
      return run(adminId, 'level', targetId, { level }, async (tx) => {
        await tx.query(ADMIN_SQL.setLevel, [adminId, targetId, level]);
        return toState((await tx.query<StateRow>(ADMIN_SQL.state, [targetId])).rows[0]!);
      });
    },
    giveJutsu(adminId, targetId, jutsu, level) {
      return run(adminId, 'givejutsu', targetId, { jutsu, level }, async (tx) => ({
        uses: (await tx.query<{ uses: number }>(ADMIN_SQL.giveJutsu, [adminId, targetId, jutsu, level])).rows[0]!.uses,
      }));
    },
    giveItem(adminId, targetId, item, quantity) {
      return run(adminId, 'giveitem', targetId, { item, qty: quantity }, async (tx) => {
        await tx.query(ADMIN_SQL.giveItem, [adminId, targetId, item, quantity]);
        return { items: (await tx.query<{ items: Inventory }>(ADMIN_SQL.inventory, [targetId])).rows[0]?.items ?? {} };
      });
    },
    resetStats(adminId, targetId) {
      return run(adminId, 'resetstats', targetId, {}, async (tx) => {
        await tx.query(ADMIN_SQL.resetStats, [adminId, targetId]);
        return toState((await tx.query<StateRow>(ADMIN_SQL.state, [targetId])).rows[0]!);
      });
    },
    log,
  };
}
