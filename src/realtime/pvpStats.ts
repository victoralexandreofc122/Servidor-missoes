import { CLASS_INFO, JUTSU_BY_CODE, type ClassCode } from './jutsus.js';
import { EFFECTS, type EffectCode } from './effects.js';
import { ITEM_BY_CODE } from './items.js';

/*
 * Números do PvP para o balanceamento (v19, docs/netcode.md, "Justiça e balanceamento"):
 *
 *   por classe   vitórias, derrotas e o dano que a classe tira de outros ninjas (a classe é a Primária de quem bateu)
 *   por golpe    dano, acertos e abates de cada jutsu, do Ataque Básico, das armas lançadas, dos poderes da Akatsuki e
 *                dos efeitos (queimadura)
 *
 * Em memória, desde que o servidor ligou: arena, Zona de Conflito e qualquer outro PvP. A Zona de Conflito também fica no
 * banco (game.pvp_matches), e `PVP_CLASS_SQL` soma os últimos N dias por classe (só leitura, sem migração).
 * O admin vê os dois no painel ou com /admin pvp [dias].
 */

export type PvpPlace = 'arena' | 'conflito' | 'aberto';
export interface ClassTally { wins: number; losses: number; damage: number }
export interface MoveTally { damage: number; hits: number; kills: number }

/** Quem bateu sem classe ainda (antes da Missão de Genin). */
export const NO_CLASS = 'sem_classe';

/** Nome do golpe para mostrar: o código do jutsu, "attack", "arma:<item>", "poder:<tipo>" ou "efeito:<efeito>". */
export function moveName(label: string): string {
  if (label === 'attack') return 'Ataque Básico';
  const [kind, code = ''] = label.split(':');
  if (kind === 'arma') return ITEM_BY_CODE.get(code)?.name ?? code;
  if (kind === 'poder') return POWER_NAMES[code] ?? `Poder (${code})`;
  if (kind === 'efeito') return EFFECTS[code as EffectCode]?.name ?? code;
  return JUTSU_BY_CODE.get(label as never)?.name ?? label;
}
const POWER_NAMES: Record<string, string> = { blast: 'Argila Viva', paper: 'Chuva de Papel' };

export const className = (code: string): string => CLASS_INFO[code as ClassCode]?.name ?? 'Sem classe';

export class PvpStats {
  readonly classes = new Map<string, ClassTally>();
  readonly moves = new Map<string, MoveTally>();
  readonly fights: Record<PvpPlace, number> = { arena: 0, conflito: 0, aberto: 0 };

  constructor(readonly since: number) {}

  private cls(code: string): ClassTally {
    let c = this.classes.get(code);
    if (!c) this.classes.set(code, (c = { wins: 0, losses: 0, damage: 0 }));
    return c;
  }

  private move(label: string): MoveTally {
    let m = this.moves.get(label);
    if (!m) this.moves.set(label, (m = { damage: 0, hits: 0, kills: 0 }));
    return m;
  }

  /** Um golpe de ninja em ninja (o dano que de fato saiu, depois do escudo). */
  hit(label: string, attackerClass: string, amount: number): void {
    if (amount <= 0) return;
    const m = this.move(label);
    m.damage += amount;
    m.hits += 1;
    this.cls(attackerClass).damage += amount;
  }

  /** Um ninja derrubou outro: a vitória e a derrota por classe, e o abate para o golpe que derrubou. */
  kill(label: string | undefined, winnerClass: string, loserClass: string, place: PvpPlace): void {
    this.fights[place] += 1;
    this.cls(winnerClass).wins += 1;
    this.cls(loserClass).losses += 1;
    if (label) this.move(label).kills += 1;
  }

  /** O que o painel do admin mostra (ordenado: classes por vitórias, golpes por dano). */
  report(now: number): PvpReport {
    const classes = [...this.classes].map(([code, c]) => ({ code, name: className(code), ...c, winRate: rate(c.wins, c.losses) }))
      .sort((a, b) => b.wins - a.wins || b.damage - a.damage);
    const moves = [...this.moves].map(([label, m]) => ({ label, name: moveName(label), ...m, perHit: m.hits ? Math.round(m.damage / m.hits) : 0 }))
      .sort((a, b) => b.damage - a.damage);
    return { minutes: Math.max(0, Math.floor((now - this.since) / 60_000)), fights: { ...this.fights }, classes, moves };
  }
}

export interface PvpReport {
  /** Minutos desde que o servidor ligou. */
  minutes: number;
  fights: Record<PvpPlace, number>;
  classes: { code: string; name: string; wins: number; losses: number; damage: number; winRate: number | null }[];
  moves: { label: string; name: string; damage: number; hits: number; kills: number; perHit: number }[];
}

/** Zona de Conflito no banco: vitórias e derrotas por classe Primária nos últimos N dias. */
export interface PvpClassRow { code: string; name: string; wins: number; losses: number; winRate: number | null }

/** % de vitórias (null sem lutas). */
export const rate = (wins: number, losses: number): number | null => (wins + losses ? Math.round((wins / (wins + losses)) * 100) : null);

/**
 * Só leitura: cada luta da Zona de Conflito conta 1 vitória para a classe de quem venceu e 1 derrota para a de quem
 * perdeu. Quem ainda não tem classe fica em "sem_classe".
 */
export const PVP_CLASS_SQL = `
  WITH m AS (SELECT winner_id, loser_id FROM game.pvp_matches WHERE at > now() - make_interval(days => $1::int)),
  side AS (
    SELECT winner_id AS player_id, 1 AS win, 0 AS loss FROM m
    UNION ALL
    SELECT loser_id, 0, 1 FROM m
  )
  SELECT COALESCE(c.primary_class, '${NO_CLASS}') AS code, sum(side.win)::int AS wins, sum(side.loss)::int AS losses
    FROM side LEFT JOIN game.player_classes c ON c.player_id = side.player_id
   GROUP BY 1
   ORDER BY wins DESC, losses`;

export const toClassRows = (rows: { code: string; wins: number; losses: number }[]): PvpClassRow[] =>
  rows.map((r) => ({ code: r.code, name: className(r.code), wins: r.wins, losses: r.losses, winRate: rate(r.wins, r.losses) }));

/** Texto curto (chat do admin). */
export function reportText(r: PvpReport, db: { days: number; rows: PvpClassRow[] } | null): string {
  const pct = (v: number | null) => (v === null ? '-' : `${v}%`);
  const total = r.fights.arena + r.fights.conflito + r.fights.aberto;
  const lines = [`PvP nos últimos ${r.minutes} min (desde que o servidor ligou): ${total} lutas (arena ${r.fights.arena}, Zona de Conflito ${r.fights.conflito}).`];
  lines.push(r.classes.length
    ? `Por classe: ${r.classes.map((c) => `${c.name} ${c.wins}V/${c.losses}D (${pct(c.winRate)}), ${c.damage} de dano`).join(' · ')}`
    : 'Por classe: nenhuma luta ainda.');
  if (r.moves.length) lines.push(`Por golpe: ${r.moves.slice(0, 8).map((m) => `${m.name} ${m.damage} (${m.hits} acertos, ${m.perHit} por acerto, ${m.kills} abates)`).join(' · ')}`);
  if (db) {
    lines.push(db.rows.length
      ? `Zona de Conflito, últimos ${db.days} dias (banco): ${db.rows.map((c) => `${c.name} ${c.wins}V/${c.losses}D (${pct(c.winRate)})`).join(' · ')}`
      : `Zona de Conflito, últimos ${db.days} dias (banco): nenhuma luta.`);
  }
  return lines.join('\n');
}
