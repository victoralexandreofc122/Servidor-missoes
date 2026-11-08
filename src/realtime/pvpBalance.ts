/*
 * Tabela de equilíbrio do PvP (v28, plano do duelo em `concepts_brief.md`). Vale só nas ÁREAS DE PvP (arena das
 * vilas, Zona de Conflito e, depois, o Vale dos Guardiões) e só quando um jogador acerta outro: contra monstros nada
 * muda. Funções PURAS: o servidor e o simulador usam as mesmas.
 */
import type { DerivedStats, DamageScaling } from './stats.js';

/** Versão da tabela: vai em cada registro de PvP, para saber com quais números a luta aconteceu. */
export const PVP_BALANCE_VERSION = '2026-11-02.1';

/** Curva de tier achatada (multiplica o dano do TIER 1): o tier 4 bate 45% a mais, não 180%. */
export const PVP_TIER_POWER = [1, 1.15, 1.3, 1.45] as const;
/** Bônus do nível de uso no PvP (níveis 1 a 4), no lugar dos +10% por nível de fora. */
export const PVP_USE_BONUS = [0, 0.05, 0.1, 0.15] as const;
/** Escudo do jutsu Pedra no PvP (fração do golpe que some), tiers 1 a 4. Fora do PvP: 0,5 a 0,8. */
export const PVP_SHIELD = [0.5, 0.55, 0.6, 0.65] as const;
/**
 * Custo e recarga x isto nas áreas de PvP: Taijutsu e Armas são baratos e rápidos demais para o 1x1; o Relâmpago
 * (atordoa e paralisa) sai a cada 2x o tempo, para o controle caber no orçamento e o atordoamento sempre pegar
 * (decisão do Victor, 02/11/2026).
 */
export const PVP_COST_COOLDOWN: Readonly<Partial<Record<string, number>>> = { taijutsu: 4, weapons: 2.5, lightning: 2 };

/** O golpe, como saiu do `cast()`: o necessário para recalcular o dano em quem ele acertar. */
export interface HitInfo {
  /** Dano do TIER 1 da mecânica (`BASE_SKILLS`), sem o tier de hoje. */
  base: number;
  /** Tier do jutsu (1 a 4). */
  tier: number;
  /** Nível de uso (1 a 4). */
  useLevel: number;
  /** Dano da arma somado (jutsus de Armas); 0 nos outros. */
  weapon: number;
  scaling: DamageScaling;
  /** Passiva da vila de quem lançou e clima, já multiplicados (1 = nenhum). */
  passive: number;
  sky: number;
  /** Fogo: queimadura por pulso do tier 1, e a duração. */
  burn?: { base: number; ms: number };
}

export interface DamageScale {
  jutsu: number;
  basic: number;
}

const idx = (n: number, len: number) => Math.max(0, Math.min(len - 1, Math.round(n) - 1));

/** Multiplicador do jutsu no PvP: curva achatada x bônus de uso (sem atributos, passiva nem clima). */
export function pvpSkillPower(tier: number, useLevel: number): number {
  return PVP_TIER_POWER[idx(tier, 4)]! * (1 + PVP_USE_BONUS[idx(useLevel, 4)]!);
}

function attributeMult(stats: Pick<DerivedStats, 'physicalMultiplier' | 'jutsuMultiplier' | 'weaponMultiplier'>, s: DamageScaling): number {
  return s === 'taijutsu' ? stats.physicalMultiplier : s === 'weapons' ? stats.weaponMultiplier : stats.jutsuMultiplier;
}

/**
 * Dano de um acerto de jogador em jogador:
 * `(base x curva[tier] x jutsu + arma x basic) x atributo x (1 + bônusUso) x passiva x clima`, arredondado uma vez.
 * O combo do molhado (x1,3) entra depois, por alvo, em quem chama.
 */
export function pvpHitDamage(hit: HitInfo, attacker: Pick<DerivedStats, 'physicalMultiplier' | 'jutsuMultiplier' | 'weaponMultiplier'>, scale: DamageScale): number {
  const raw = (hit.base * PVP_TIER_POWER[idx(hit.tier, 4)]! * scale.jutsu + hit.weapon * scale.basic)
    * attributeMult(attacker, hit.scaling) * (1 + PVP_USE_BONUS[idx(hit.useLevel, 4)]!) * hit.passive * hit.sky;
  return Math.round(raw);
}

/** Queimadura por pulso no PvP: a queimadura do tier 1 com os mesmos multiplicadores do golpe (cai junto com o dano). */
export function pvpBurnPerTick(hit: HitInfo, attacker: Pick<DerivedStats, 'physicalMultiplier' | 'jutsuMultiplier' | 'weaponMultiplier'>, scale: DamageScale): number {
  if (!hit.burn) return 0;
  return Math.max(1, Math.round(hit.burn.base * PVP_TIER_POWER[idx(hit.tier, 4)]! * scale.jutsu
    * attributeMult(attacker, hit.scaling) * (1 + PVP_USE_BONUS[idx(hit.useLevel, 4)]!) * hit.passive * hit.sky));
}

/** Cura no PvP: curva achatada e bônus de uso do PvP, sem o fator de dano. */
export function pvpHeal(baseHeal: number, tier: number, useLevel: number, passive: number): number {
  return baseHeal * pvpSkillPower(tier, useLevel) * passive;
}

/** Custo e recarga de um jutsu numa área de PvP. */
export function pvpCostCooldown(mechanic: string, cost: number, cooldownMs: number): { cost: number; cooldownMs: number } {
  const f = PVP_COST_COOLDOWN[mechanic] ?? 1;
  return { cost: Math.round(cost * f), cooldownMs: Math.round(cooldownMs * f) };
}

// ---------------------------------------------------------------- orçamento de controle (passo 1e)
/**
 * Orçamento único de controle por jogador, quando quem causa é OUTRO JOGADOR: soma o "tempo sem poder agir" de
 * atordoar, prender, sono e os choques da paralisia; o silêncio pesa a metade. Dois controles ao mesmo tempo contam o
 * de maior peso naquele instante (não a soma). No máximo 1,5 s (com peso) por aplicação e 2,5 s em qualquer trecho de
 * 15 s; se sobra menos de 0,2 s, o controle novo não pega. Controle de monstro segue o `controlDr` de hoje.
 */
export const CC_BUDGET = { perApplyMs: 1500, windowMs: 15_000, maxMs: 2500, minMs: 200 } as const;
export type CcKind = 'stunned' | 'rooted' | 'sono' | 'shock' | 'silencio';
export const CC_WEIGHT: Readonly<Record<CcKind, number>> = { stunned: 1, rooted: 1, sono: 1, shock: 1, silencio: 0.5 };

export interface CcEntry {
  kind: CcKind;
  startedAt: number;
  until: number;
  weight: number;
  sourceId: string | null;
}

/** Tempo com peso já gasto a partir de `from` (entradas que ainda vão acabar contam inteiras). */
export function ccUsed(log: readonly CcEntry[], from: number): number {
  const spans = log.filter((e) => e.until > from).map((e) => ({ a: Math.max(e.startedAt, from), b: e.until, w: e.weight }));
  if (spans.length === 0) return 0;
  const cuts = [...new Set(spans.flatMap((s) => [s.a, s.b]))].sort((x, y) => x - y);
  let total = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    let w = 0;
    for (const s of spans) if (s.a <= a && s.b >= b) w = Math.max(w, s.w);
    total += w * (b - a);
  }
  return total;
}

/**
 * Quanto do controle pedido (`wantMs`, tempo real) pega agora. Devolve 0 quando o orçamento não deixa.
 * Não muda o registro: quem chama grava a entrada se o resultado for maior que 0.
 */
export function ccAllow(log: readonly CcEntry[], t: number, kind: CcKind, wantMs: number): number {
  const w = CC_WEIGHT[kind];
  const from = t - CC_BUDGET.windowMs;
  const before = ccUsed(log, from);
  let d = Math.min(wantMs, CC_BUDGET.perApplyMs / w);
  const fits = (ms: number) => ccUsed([...log, { kind, startedAt: t, until: t + ms, weight: w, sourceId: null }], from) <= CC_BUDGET.maxMs;
  if (!fits(d)) {
    let lo = 0, hi = Math.ceil(d);                            // busca em ms inteiros
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid; }
    d = fits(hi) ? hi : lo;
  }
  const added = ccUsed([...log, { kind, startedAt: t, until: t + d, weight: w, sourceId: null }], from) - before;
  if (d < wantMs && added < CC_BUDGET.minMs) return 0;
  return d <= 0 ? 0 : d;
}

// ---------------------------------------------------------------- rede de segurança (passo 1f)
/**
 * Rede de segurança: o dano que um ninja recebe de UM outro ninja, em qualquer trecho de 2 s, fica limitado a 50% da
 * vida máxima. Conta o dano depois do escudo e dos Cinco Corações; o que passar é cortado.
 */
export const SAFETY_NET = { windowMs: 2000, maxShare: 0.5 } as const;
export interface NetHit { t: number; dmg: number }

/** Quanto do golpe passa (e quanto é cortado), dado o que esse atacante já tirou nos últimos 2 s. */
export function safetyNet(history: readonly NetHit[], t: number, maxHp: number, dmg: number): { allowed: number; cut: number } {
  const recent = history.filter((h) => h.t > t - SAFETY_NET.windowMs).reduce((s, h) => s + h.dmg, 0);
  const room = Math.max(0, Math.floor(maxHp * SAFETY_NET.maxShare) - recent);
  const allowed = Math.min(Math.max(0, dmg), room);
  return { allowed, cut: Math.max(0, dmg - allowed) };
}
