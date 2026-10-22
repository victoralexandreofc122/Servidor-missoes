/*
 * Nível, atributos e os números que saem deles. Funções PURAS (sem banco, sem rede):
 * o servidor usa para calcular vida, chakra, velocidade e dano; os testes usam direto.
 * O cliente só recebe o resultado pronto (nunca calcula).
 */

/** Os 6 atributos que o jogador upa com pontos (v8: "Chakra" junta o antigo Chakra Máximo e o Regen Chakra). */
export const ATTRIBUTES = ['vitality', 'chakra', 'agility', 'taijutsu', 'ninjutsu', 'weapons'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export const NO_ATTRIBUTES: Readonly<Attributes> = { vitality: 0, chakra: 0, agility: 0, taijutsu: 0, ninjutsu: 0, weapons: 0 };

/** Coluna de cada atributo em game.players (lista fechada: nunca vem do cliente). */
export const ATTRIBUTE_COLUMNS: Readonly<Record<Attribute, string>> = {
  vitality: 'attr_vitality',
  chakra: 'attr_chakra',
  agility: 'attr_agility',
  taijutsu: 'attr_taijutsu',
  ninjutsu: 'attr_ninjutsu',
  weapons: 'attr_weapons',
};

export interface AttributeRules {
  /**
   * Rendimento decrescente (soft cap), SEM teto de pontos: o ponto investido quando já há
   * `n` pontos no atributo vale `perPoint / (1 + n × softCap)`. Com 0,05: o 1º ponto vale
   * 100%, o 10º vale 69% e o 50º vale 29% (Vitalidade: +10, +6,9 e +2,9 de vida).
   */
  softCap: number;
  /** Quanto o 1º ponto de cada atributo vale (os seguintes rendem menos, pelo soft cap). */
  perPoint: Attributes;
  /** Chakra também acelera a meditação: chakra/s do 1º ponto (com o mesmo soft cap). */
  chakraRegenPerPoint: number;
  /** Agilidade também acelera o Ataque Básico: cada ponto (efetivo) corta esta fração da recarga (0,04 = 4%). */
  agilityAttackSpeed: number;
  /** A recarga do ataque nunca fica abaixo desta fração da base (0,6 = 60%). */
  minAttackCooldownFactor: number;
  /** Bônus máximo de velocidade (casas/s): o movimento com predição e a colisão contam com passos curtos. */
  maxSpeedBonus: number;
  /** Ryō para redefinir os atributos (botão "Redefinir Atributos"). O admin redefine de graça. */
  resetCostRyo: number;
}

export interface BaseStats {
  maxHp: number;
  maxChakra: number;
  /** Chakra por segundo meditando (o chakra só regenera meditando). */
  meditationChakraPerSec: number;
  walkSpeed: number;
  runSpeed: number;
  /** Recarga do Ataque Básico sem Agilidade (ms). */
  attackCooldownMs: number;
}

/** O que o servidor usa no jogo (e o cliente mostra na tela de status). */
export interface DerivedStats {
  maxHp: number;
  maxChakra: number;
  meditationChakraPerSec: number;
  walkSpeed: number;
  runSpeed: number;
  /** Dano de TAIJUTSU (corpo a corpo: Ataque Básico e a habilidade Taijutsu 👊): 1 + Taijutsu (1,15 = +15%). */
  physicalMultiplier: number;
  /** Dano de NINJUTSU (jutsus elementais: Fogo, Água...): 1 + Ninjutsu. */
  jutsuMultiplier: number;
  /** Dano de ARMAS (Kunai equipada e jutsus da classe Armas): 1 + Armas. */
  weaponMultiplier: number;
  /** Recarga do Ataque Básico já com a Agilidade (ms). */
  attackCooldownMs: number;
}

/** Ganho REAL de um ponto quando já há `invested` pontos no atributo: base / (1 + invested × softCap). */
export function pointGain(base: number, invested: number, softCap: number): number {
  return base / (1 + Math.max(0, invested) * softCap);
}

/**
 * "Pontos efetivos" de `points` pontos investidos: a soma do rendimento de cada um
 * (1 + 1/1,05 + 1/1,10 + ...). Multiplicado pelo valor do 1º ponto, dá o bônus total.
 */
export function effectivePoints(points: number, softCap: number): number {
  let sum = 0;
  for (let n = 0; n < points; n++) sum += 1 / (1 + n * softCap);
  return sum;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function derivedStats(base: BaseStats, rules: AttributeRules, a: Attributes): DerivedStats {
  const p = rules.perPoint;
  const e = (points: number) => effectivePoints(points, rules.softCap);
  const chakra = e(a.chakra);
  const agility = e(a.agility);
  const speedBonus = Math.min(rules.maxSpeedBonus, agility * p.agility);
  return {
    maxHp: Math.round(base.maxHp + e(a.vitality) * p.vitality),
    maxChakra: Math.round(base.maxChakra + chakra * p.chakra),
    meditationChakraPerSec: round2(base.meditationChakraPerSec + chakra * rules.chakraRegenPerPoint),
    walkSpeed: round2(base.walkSpeed + speedBonus),
    runSpeed: round2(base.runSpeed + speedBonus),
    physicalMultiplier: round3(1 + e(a.taijutsu) * p.taijutsu),
    jutsuMultiplier: round3(1 + e(a.ninjutsu) * p.ninjutsu),
    weaponMultiplier: round3(1 + e(a.weapons) * p.weapons),
    attackCooldownMs: Math.round(base.attackCooldownMs * Math.max(rules.minAttackCooldownFactor, 1 - agility * rules.agilityAttackSpeed)),
  };
}

/** Quanto o PRÓXIMO ponto de cada atributo vale (já com o soft cap). O cliente só mostra. */
export function nextPointGains(rules: AttributeRules, a: Attributes): Attributes {
  const out = { ...NO_ATTRIBUTES };
  for (const k of ATTRIBUTES) out[k] = round3(pointGain(rules.perPoint[k], a[k], rules.softCap));
  return out;
}

/** Qual atributo escala o dano: corpo a corpo = Taijutsu; elemental = Ninjutsu; armas = Armas. */
export type DamageScaling = 'taijutsu' | 'ninjutsu' | 'weapons';
export function damageMultiplier(stats: DerivedStats, scaling: DamageScaling): number {
  return scaling === 'taijutsu' ? stats.physicalMultiplier : scaling === 'weapons' ? stats.weaponMultiplier : stats.jutsuMultiplier;
}

/** Dano final: arredondado para inteiro (número flutuante limpo na tela). */
export const scaledDamage = (damage: number, multiplier: number) => Math.round(damage * multiplier);

/**
 * Curva de XP (v7): do nível N para o N+1 são 100·N + 25·N·(N-1). Nível máximo 60.
 * O nível L começa em 50·L·(L-1) + 25·(L-2)·(L-1)·L/3 de XP total (nível 11: 13.750;
 * 40: 572.000; 60: 1.888.000). MESMA conta de game.level_start / game.level_for_xp (v7).
 */
export const MAX_LEVEL = 60;

export function levelStart(level: number): number {
  return 50 * level * (level - 1) + (25 * (level - 2) * (level - 1) * level) / 3;
}

export function levelForXp(totalXp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && levelStart(l + 1) <= totalXp) l += 1;
  return l;
}

/** XP "dentro do nível" (zera a cada nível) e quanto falta para o próximo. */
export function levelProgress(totalXp: number, level: number = levelForXp(totalXp)) {
  if (level >= MAX_LEVEL) return { level, xpInLevel: 0, xpToNext: 0 };
  return { level, xpInLevel: totalXp - levelStart(level), xpToNext: levelStart(level + 1) - levelStart(level) };
}
