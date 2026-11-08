import { withTransaction, type Db, type Queryable } from '../db.js';
import { CONSTRAINT_ERRORS } from '../errors/errorTranslator.js';
import { ITEM_BY_CODE } from './items.js';
import { JUTSU_BY_CODE } from './jutsus.js';
import type { Inventory } from './ninjaStore.js';
import type { Attributes } from './stats.js';
import type { Village } from './appearance.js';
import { ENDGAME_MODULES, type EndgameModule } from './endgame.js';
import { VILLAGE_INFO, villageByName } from './villages.js';
import { DAY_PHASES, WEATHERS, type DayPhase, type Weather } from './weather.js';
import { EFFECT_CODES, type EffectCode } from './effects.js';
import { PVP_CLASS_SQL } from './pvpStats.js';

/*
 * Modo Administrador (God Mode): o painel 🛡️ (só para admin, v19) ou comandos no chat que começam com "/admin". O painel
 * monta o mesmo texto e manda `{ type: "admin", command }`; o servidor lê os dois do mesmo jeito.
 *
 * Os comandos são em português (v19). Os nomes antigos continuam valendo (level, spawn, givejutsu, giveitem, giveryo,
 * resetstats, endgame, help, on/off).
 *
 *   /admin ajuda                                 lista os comandos
 *   /admin nivel <nome> <nível>                  define o nível (1 a 60)
 *   /admin invocar <monstro> [quantidade]        invoca monstros em volta do admin (1 a 20)
 *   /admin darjutsu <nome> <jutsu> [nível]       ensina o jutsu ou sobe o nível dele (1 a 4)
 *   /admin daritem <nome> <item> [quantidade]    põe itens no inventário (1 a 999)
 *   /admin ryo <nome> <quantidade>               dá ryō ao jogador (1 a 1.000.000; "darryo" também vale; migração v12)
 *   /admin zerarpontos <nome>                    devolve os pontos de atributo (sem custo)
 *   /admin pvp [dias]                            números do PvP: por classe e por golpe (desde que o servidor ligou) e a
 *                                                Zona de Conflito no banco (últimos N dias, padrão 7; pvpStats.ts)
 *   /admin ir <mapa> [x y]                       leva o próprio admin a um mapa (inclusive os lacrados), para testar
 *   /admin clima <normal|quente|chuva|neblina> [minutos]   muda o clima agora (para todos; padrão: 10 min)
 *   /admin hora <amanhecer|dia|entardecer|noite>           pula o ciclo para o começo dessa fase (para todos)
 *   /admin efeito <nome> <efeito|limpar> [segundos]        põe um efeito (molhado, queimadura, sono...) num ninja online, para
 *                                                          testar (effects.ts); "limpar" tira todos
 *
 * Fim de jogo (v16, migração v11; docs/endgame.md, seção 6):
 *   /admin fimdejogo <vilas|pvp|renegados|akatsuki> <ligar|desligar|auto>   liga, desliga ou devolve ao automático
 *   /admin vila <nome> <chama|mare|rocha|vento>             muda a vila de alguém
 *   /admin kage <vila> <nome>                                     põe alguém como Kage (mandato de 28 dias)
 *   /admin eleicao <vila>                                         fecha a eleição da vila agora
 *   /admin evento <guerra|tregua> <vila|todas> [vila] <horas>     evento global (guerra ou trégua forçada)
 *   /admin renegado <nome> <sim|nao>                              torna renegado ou desfaz (a ÚNICA forma de desfazer)
 *   /admin akatsuki <lider|remover> <nome>                        escolhe o líder ou tira alguém
 *   /admin temporada fechar                                       fecha a temporada PvP agora
 * Nenhum deles mexe no MMR nem no ranking (o banco deixa as contas de admin fora do ranking e das recompensas).
 *
 * Restrito: o servidor só aceita de quem entrou com players.is_admin = true, e CADA função do
 * banco (game.admin_*, migração v8) confere is_admin de novo e grava a auditoria
 * (game.admin_audit_log) na mesma transação. Recusas também ficam na auditoria.
 * Nada de admin dispara conquista, título, rank, anúncio, XP de abate ou missão: o nível vem
 * pela flag local game.admin_action e os monstros invocados não dão recompensa nenhuma.
 * Quem não é admin e digita "/admin" recebe só "Comando desconhecido" (e o servidor registra no log).
 */

export const ADMIN_LIMITS = { maxLevel: 60, maxSpawn: 20, maxJutsuLevel: 4, maxItems: 999, maxRyo: 1_000_000 } as const;

export type AdminCommand =
  | { cmd: 'level'; username: string; level: number }
  | { cmd: 'spawn'; monster: string; quantity: number }
  | { cmd: 'givejutsu'; username: string; jutsu: string; level: number }
  | { cmd: 'giveitem'; username: string; item: string; quantity: number }
  | { cmd: 'giveryo'; username: string; amount: number }
  | { cmd: 'resetstats'; username: string }
  | { cmd: 'help' }
  | { cmd: 'ir'; map: string; x?: number; y?: number }
  | { cmd: 'clima'; weather: Weather; minutes: number }
  | { cmd: 'hora'; phase: DayPhase }
  | { cmd: 'efeito'; username: string; effect: EffectCode | 'limpar'; seconds: number }
  | { cmd: 'pvp'; days: number }
  | EndgameAdminCommand;

/** Comandos do fim de jogo (v11). */
export type EndgameAdminCommand =
  | { cmd: 'endgame'; module: EndgameModule; mode: 'on' | 'off' | 'auto' }
  | { cmd: 'vila'; username: string; village: Village }
  | { cmd: 'kage'; village: Village; username: string }
  | { cmd: 'eleicao'; village: Village }
  | { cmd: 'evento'; kind: 'guerra' | 'tregua'; a: Village | null; b: Village | null; hours: number }
  | { cmd: 'renegado'; username: string; on: boolean }
  | { cmd: 'akatsuki'; action: 'lider' | 'remover'; username: string }
  | { cmd: 'temporada' };

export const ENDGAME_ADMIN = new Set(['endgame', 'vila', 'kage', 'eleicao', 'evento', 'renegado', 'akatsuki', 'temporada']);
export const isEndgameAdmin = (c: AdminCommand): c is EndgameAdminCommand => ENDGAME_ADMIN.has(c.cmd);

export type ParsedAdmin = { ok: true; command: AdminCommand } | { ok: false; command: string; text: string };

export const ADMIN_HELP = 'Admin (ou o painel 🛡️): /admin nivel <nome> <nível> · invocar <monstro> [qtd] · darjutsu <nome> <jutsu> [nível] · daritem <nome> <item> [qtd] · ryo <nome> <qtd>'
  + ' · zerarpontos <nome> · pvp [dias] · ir <mapa> [x y] · clima <normal|quente|chuva|neblina> [min] · hora <amanhecer|dia|entardecer|noite> · efeito <nome> <efeito|limpar> [seg]'
  + ' · fimdejogo <módulo> <ligar|desligar|auto> · vila <nome> <vila> · kage <vila> <nome> · eleicao <vila> · evento <guerra|tregua> <vila|todas> [vila] <horas>'
  + ' · renegado <nome> <sim|nao> · akatsuki <lider|remover> <nome> · temporada fechar';

/** Os nomes antigos (em inglês) e as variações que também valem: apontam para o nome em português. */
export const ADMIN_ALIASES: Readonly<Record<string, string>> = {
  help: 'ajuda', level: 'nivel', spawn: 'invocar', givejutsu: 'darjutsu', giveitem: 'daritem', giveryo: 'ryo', darryo: 'ryo',
  resetstats: 'zerarpontos', endgame: 'fimdejogo',
};

/** Nome na auditoria (game.admin_audit_log) de cada comando em português. */
const AUDIT_NAMES: Readonly<Record<string, string>> = {
  ajuda: 'help', nivel: 'level', invocar: 'spawn', darjutsu: 'givejutsu', daritem: 'giveitem', ryo: 'giveryo', zerarpontos: 'resetstats',
  fimdejogo: 'endgame',
};

/** Ligar ou desligar (fimdejogo, renegado): aceita o português e o on/off de antes. */
const SWITCH: Readonly<Record<string, 'on' | 'off' | 'auto'>> = { ligar: 'on', on: 'on', sim: 'on', desligar: 'off', off: 'off', nao: 'off', auto: 'auto' };
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Dias que o /admin pvp soma no banco (padrão 7). */
export const PVP_DAYS = { default: 7, max: 90 } as const;
const VILLAGE_NAMES = Object.values(VILLAGE_INFO).map((v) => v.slug).join('|');

const USERNAME = /^[A-Za-z0-9_]{3,24}$/;
const INT = /^\d{1,7}$/;
const CODE = /^[a-z][a-z0-9_]{0,31}$/;

/** "/admin ..." (sem diferenciar maiúsculas no "/admin")? */
export const isAdminCommand = (text: string) => /^\/admin(\s|$)/i.test(text);

/** Lê o comando. Não sabe quem pediu: só confere formato, faixa e códigos conhecidos. */
export function parseAdminCommand(text: string, monsterTypes: readonly string[], mapIds: readonly string[] = []): ParsedAdmin {
  const parts = text.trim().split(/\s+/).slice(1);
  const typed = plain(parts[0] ?? 'ajuda');
  const cmd = ADMIN_ALIASES[typed] ?? typed;
  const args = parts.slice(1);
  // A auditoria guarda o nome interno (o mesmo de antes da v19), para o histórico não mudar de nome.
  const bad = (usage: string): ParsedAdmin => ({ ok: false, command: AUDIT_NAMES[cmd] ?? cmd, text: `Uso: /admin ${usage}` });
  const int = (s: string | undefined, min: number, max: number) => (s && INT.test(s) && Number(s) >= min && Number(s) <= max ? Number(s) : undefined);
  const user = (s: string | undefined) => (s && USERNAME.test(s) ? s : undefined);

  switch (cmd) {
    case 'ajuda':
      return { ok: true, command: { cmd: 'help' } };
    case 'nivel': {
      const username = user(args[0]);
      const level = int(args[1], 1, ADMIN_LIMITS.maxLevel);
      if (args.length !== 2 || !username || level === undefined) return bad(`nivel <nome> <nível 1 a ${ADMIN_LIMITS.maxLevel}>`);
      return { ok: true, command: { cmd: 'level', username, level } };
    }
    case 'invocar': {
      const monster = (args[0] ?? '').toLowerCase();
      const quantity = int(args[1] ?? '1', 1, ADMIN_LIMITS.maxSpawn);
      if (args.length < 1 || args.length > 2 || !monsterTypes.includes(monster) || quantity === undefined) {
        return bad(`invocar <${monsterTypes.join('|')}> [quantidade 1 a ${ADMIN_LIMITS.maxSpawn}]`);
      }
      return { ok: true, command: { cmd: 'spawn', monster, quantity } };
    }
    case 'pvp': {
      const days = int(args[0] ?? String(PVP_DAYS.default), 1, PVP_DAYS.max);
      if (args.length > 1 || days === undefined) return bad(`pvp [dias 1 a ${PVP_DAYS.max}]`);
      return { ok: true, command: { cmd, days } };
    }
    case 'ir': {
      const map = (args[0] ?? '').toLowerCase();
      const coord = (s: string | undefined) => (s && /^\d{1,3}(\.\d)?$/.test(s) ? Number(s) : undefined);
      const x = coord(args[1]), y = coord(args[2]);
      if (!mapIds.includes(map) || (args.length !== 1 && args.length !== 3) || (args.length === 3 && (x === undefined || y === undefined))) {
        return bad(`ir <${mapIds.join('|')}> [x y]`);
      }
      return { ok: true, command: x !== undefined && y !== undefined ? { cmd, map, x, y } : { cmd, map } };
    }
    case 'clima': {
      const weather = (args[0] ?? '').toLowerCase() as Weather;
      const minutes = int(args[1] ?? '10', 1, 120);
      if (args.length < 1 || args.length > 2 || !WEATHERS.includes(weather) || minutes === undefined) return bad(`clima <${WEATHERS.join('|')}> [minutos 1 a 120]`);
      return { ok: true, command: { cmd, weather, minutes } };
    }
    case 'hora': {
      const phase = (args[0] ?? '').toLowerCase() as DayPhase;
      if (args.length !== 1 || !DAY_PHASES.includes(phase)) return bad(`hora <${DAY_PHASES.join('|')}>`);
      return { ok: true, command: { cmd, phase } };
    }
    case 'efeito': {
      const username = user(args[0]);
      const effect = (args[1] ?? '').toLowerCase();
      const seconds = int(args[2] ?? '0', 0, 120);
      const known = effect === 'limpar' || (EFFECT_CODES as readonly string[]).includes(effect);
      if (args.length < 2 || args.length > 3 || !username || !known || seconds === undefined) {
        return bad(`efeito <nome> <${EFFECT_CODES.join('|')}|limpar> [segundos 1 a 120]`);
      }
      return { ok: true, command: { cmd, username, effect: effect as EffectCode | 'limpar', seconds } };
    }
    case 'darjutsu': {
      const username = user(args[0]);
      const jutsu = (args[1] ?? '').toLowerCase();
      const level = int(args[2] ?? '1', 1, ADMIN_LIMITS.maxJutsuLevel);
      if (args.length < 2 || args.length > 3 || !username || !CODE.test(jutsu) || !JUTSU_BY_CODE.has(jutsu as never) || level === undefined) {
        return bad('darjutsu <nome> <jutsu, ex.: fire_2> [nível 1 a 4]');
      }
      return { ok: true, command: { cmd: 'givejutsu', username, jutsu, level } };
    }
    case 'daritem': {
      const username = user(args[0]);
      const item = (args[1] ?? '').toLowerCase();
      const quantity = int(args[2] ?? '1', 1, ADMIN_LIMITS.maxItems);
      if (args.length < 2 || args.length > 3 || !username || !CODE.test(item) || !ITEM_BY_CODE.has(item) || quantity === undefined) {
        return bad(`daritem <nome> <item, ex.: kunai> [quantidade 1 a ${ADMIN_LIMITS.maxItems}]`);
      }
      return { ok: true, command: { cmd: 'giveitem', username, item, quantity } };
    }
    case 'ryo': {
      const username = user(args[0]);
      const amount = int(args[1], 1, ADMIN_LIMITS.maxRyo);
      if (args.length !== 2 || !username || amount === undefined) return bad('ryo <nome> <quantidade 1 a 1000000>');
      return { ok: true, command: { cmd: 'giveryo', username, amount } };
    }
    case 'zerarpontos': {
      const username = user(args[0]);
      if (args.length !== 1 || !username) return bad('zerarpontos <nome>');
      return { ok: true, command: { cmd: 'resetstats', username } };
    }
    case 'fimdejogo': {
      const module = plain(args[0] ?? '') as EndgameModule;
      const mode = SWITCH[plain(args[1] ?? '')];
      if (args.length !== 2 || !ENDGAME_MODULES.includes(module) || !mode) {
        return bad(`fimdejogo <${ENDGAME_MODULES.join('|')}> <ligar|desligar|auto>`);
      }
      return { ok: true, command: { cmd: 'endgame', module, mode } };
    }
    case 'vila': {
      const username = user(args[0]);
      const village = villageByName(args[1] ?? '');
      if (args.length !== 2 || !username || !village) return bad(`vila <nome> <${VILLAGE_NAMES}>`);
      return { ok: true, command: { cmd, username, village } };
    }
    case 'kage': {
      const village = villageByName(args[0] ?? '');
      const username = user(args[1]);
      if (args.length !== 2 || !username || !village) return bad(`kage <${VILLAGE_NAMES}> <nome>`);
      return { ok: true, command: { cmd, village, username } };
    }
    case 'eleicao': {
      const village = villageByName(args[0] ?? '');
      if (args.length !== 1 || !village) return bad(`eleicao <${VILLAGE_NAMES}>`);
      return { ok: true, command: { cmd, village } };
    }
    case 'evento': {
      const kind = (args[0] ?? '').toLowerCase();
      const hours = int(args[args.length - 1], 1, 720);
      const places = args.slice(1, -1).map((a) => a.toLowerCase());
      const usage = bad('evento guerra <vila> <vila> <horas 1 a 720> · evento tregua <todas | vila vila> <horas>');
      if (hours === undefined || (kind !== 'guerra' && kind !== 'tregua')) return usage;
      if (kind === 'tregua' && places.length === 1 && places[0] === 'todas') return { ok: true, command: { cmd, kind, a: null, b: null, hours } };
      const [a, b] = places.map((p) => villageByName(p));
      if (places.length !== 2 || !a || !b || a === b) return usage;
      return { ok: true, command: { cmd, kind, a, b, hours } };
    }
    case 'renegado': {
      const username = user(args[0]);
      const on = SWITCH[plain(args[1] ?? '')];
      if (args.length !== 2 || !username || (on !== 'on' && on !== 'off')) return bad('renegado <nome> <sim|nao>');
      return { ok: true, command: { cmd, username, on: on === 'on' } };
    }
    case 'akatsuki': {
      const action = (args[0] ?? '').toLowerCase();
      const username = user(args[1]);
      if (args.length !== 2 || !username || (action !== 'lider' && action !== 'remover')) return bad('akatsuki <lider|remover> <nome>');
      return { ok: true, command: { cmd, action, username } };
    }
    case 'temporada': {
      if (args.length !== 1 || args[0]!.toLowerCase() !== 'fechar') return bad('temporada fechar');
      return { ok: true, command: { cmd } };
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
  /** Dá ryō (v12). Devolve o saldo novo do alvo. */
  giveRyo(adminId: string, targetId: string, amount: number): Promise<AdminOutcome<{ ryo: number }>>;
  resetStats(adminId: string, targetId: string): Promise<AdminOutcome<AdminPlayerState>>;
  /** Auditoria de um comando que não passa por função do banco (spawn) ou que foi recusado. */
  log(adminId: string, command: string, targetId: string | null, args: Record<string, unknown>, ok: boolean, detail: string | null): Promise<void>;
  /**
   * Fim de jogo (v11): cada um chama a função game.admin_* (confere is_admin e grava a auditoria na mesma transação).
   * `target` = o jogador já encontrado pelo nome (os que não têm alvo recebem null).
   */
  endgame?(adminId: string, c: EndgameAdminCommand, targetId: string | null): Promise<AdminOutcome<{ result: string | null }>>;
  /** Zona de Conflito: vitórias e derrotas por classe Primária nos últimos `days` dias (só leitura; pvpStats.ts). */
  pvpByClass?(days: number): Promise<{ code: string; wins: number; losses: number }[]>;
}

const STATE = `total_xp, level, stat_points, attr_vitality, attr_chakra, attr_agility, attr_taijutsu, attr_ninjutsu, attr_weapons`;

export const ADMIN_SQL = {
  findPlayer: `SELECT id, username FROM game.players WHERE lower(username) = lower($1)`,
  state: `SELECT ${STATE} FROM game.players WHERE id = $1`,
  setLevel: `SELECT game.admin_set_level($1, $2, $3)`,
  giveJutsu: `SELECT game.admin_give_jutsu($1, $2, $3, $4) AS uses`,
  giveItem: `SELECT game.admin_give_item($1, $2, $3, $4) AS quantity`,
  giveRyo: `SELECT game.admin_give_ryo($1, $2, $3)::text AS ryo`,
  resetStats: `SELECT game.admin_reset_stats($1, $2)`,
  inventory: `SELECT COALESCE((SELECT json_object_agg(item_code, quantity) FROM game.player_items WHERE player_id = $1), '{}'::json) AS items`,
  log: `SELECT game.admin_log($1, $2, $3, $4::jsonb, $5, $6)`,
  endgameMode: `SELECT game.admin_endgame_mode($1, $2, $3)::text AS result`,
  setVillage: `SELECT game.admin_set_village($1, $2, $3)::text AS result`,
  setKage: `SELECT game.admin_set_kage($1, $2, $3)::text AS result`,
  closeElection: `SELECT game.admin_close_election($1, $2)::text AS result`,
  worldEvent: `SELECT game.admin_world_event($1, $2, $3, $4, $5)::text AS result`,
  renegade: `SELECT game.admin_renegade($1, $2, $3)::text AS result`,
  akatsukiLeader: `SELECT game.admin_akatsuki_leader($1, $2)::text AS result`,
  akatsukiRemove: `SELECT game.admin_akatsuki_remove($1, $2)::text AS result`,
  closeSeason: `SELECT game.admin_close_season($1)::text AS result`,
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
  async function run<T>(adminId: string, command: string, targetId: string | null, args: Record<string, unknown>,
    fn: (tx: Queryable) => Promise<T>): Promise<AdminOutcome<T>> {
    try {
      return { ok: true, ...(await withTransaction(db, fn)) };
    } catch (err) {
      const e = (typeof err === 'object' && err !== null ? err : {}) as { constraint?: string; code?: string };
      const known = (e.constraint ? CONSTRAINT_ERRORS[e.constraint]?.message : undefined)
        ?? (e.code === '23503' ? 'Jogador, jutsu ou item inexistente.' : undefined)
        ?? (e.code === '42883' ? 'Rode a migração v11 (fim de jogo) no Neon primeiro.' : undefined);
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
    giveRyo(adminId, targetId, amount) {
      return run(adminId, 'giveryo', targetId, { amount }, async (tx) => ({
        ryo: Number((await tx.query<{ ryo: string }>(ADMIN_SQL.giveRyo, [adminId, targetId, amount])).rows[0]!.ryo),
      }));
    },
    resetStats(adminId, targetId) {
      return run(adminId, 'resetstats', targetId, {}, async (tx) => {
        await tx.query(ADMIN_SQL.resetStats, [adminId, targetId]);
        return toState((await tx.query<StateRow>(ADMIN_SQL.state, [targetId])).rows[0]!);
      });
    },
    log,
    async pvpByClass(days) {
      return (await db.query<{ code: string; wins: number; losses: number }>(PVP_CLASS_SQL, [days])).rows;
    },
    endgame(adminId, c, targetId) {
      const { cmd, ...args } = c;
      const [sql, params]: [string, unknown[]] = (() => {
        switch (c.cmd) {
          case 'endgame': return [ADMIN_SQL.endgameMode, [adminId, c.module, c.mode]];
          case 'vila': return [ADMIN_SQL.setVillage, [adminId, targetId, c.village]];
          case 'kage': return [ADMIN_SQL.setKage, [adminId, c.village, targetId]];
          case 'eleicao': return [ADMIN_SQL.closeElection, [adminId, c.village]];
          case 'evento': return [ADMIN_SQL.worldEvent, [adminId, c.kind, c.a, c.b, c.hours]];
          case 'renegado': return [ADMIN_SQL.renegade, [adminId, targetId, c.on]];
          case 'akatsuki': return [c.action === 'lider' ? ADMIN_SQL.akatsukiLeader : ADMIN_SQL.akatsukiRemove, [adminId, targetId]];
          case 'temporada': return [ADMIN_SQL.closeSeason, [adminId]];
        }
      })();
      return run(adminId, cmd, targetId, args, async (tx) => ({ result: (await tx.query<{ result: string | null }>(sql, params)).rows[0]?.result ?? null }));
    },
  };
}
