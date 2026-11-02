/*
 * Tabela de equilíbrio do PvP (v28, plano do duelo em `concepts_brief.md`). Vale só nas ÁREAS DE PvP (arena das
 * vilas, Zona de Conflito e, depois, o Vale das Estátuas) e só quando um jogador acerta outro: contra monstros nada
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
/** Custo e recarga x isto nas áreas de PvP: Taijutsu e Armas são baratos e rápidos demais para o 1x1. */
export const PVP_COST_COOLDOWN: Readonly<Partial<Record<string, number>>> = { taijutsu: 4, weapons: 2.5 };

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
