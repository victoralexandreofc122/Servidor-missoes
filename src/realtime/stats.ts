/*
 * Nível, atributos e os números que saem deles. Funções PURAS (sem banco, sem rede):
 * o servidor usa para calcular vida, chakra, velocidade e dano; os testes usam direto.
 * O cliente só recebe o resultado pronto (nunca calcula).
 */

/** Os 7 atributos que o jogador upa com pontos (v7: + Armas). */
export const ATTRIBUTES = ['vitality', 'chakraMax', 'chakraRegen', 'agility', 'taijutsu', 'ninjutsu', 'weapons'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export const NO_ATTRIBUTES: Readonly<Attributes> = { vitality: 0, chakraMax: 0, chakraRegen: 0, agility: 0, taijutsu: 0, ninjutsu: 0, weapons: 0 };

/** Coluna de cada atributo em game.players (lista fechada: nunca vem do cliente). */
export const ATTRIBUTE_COLUMNS: Readonly<Record<Attribute, string>> = {
  vitality: 'attr_vitality',
  chakraMax: 'attr_chakra_max',
  chakraRegen: 'attr_chakra_regen',
  agility: 'attr_agility',
  taijutsu: 'attr_taijutsu',
  ninjutsu: 'attr_ninjutsu',
  weapons: 'attr_weapons',
};

export interface AttributeRules {
  /** Pontos no máximo em cada atributo (o banco também limita: ck_players_attributes). */
  maxPoints: number;
  /** Quanto cada ponto vale. */
  perPoint: Attributes;
  /** Agilidade também acelera o Ataque Básico: cada ponto corta esta fração da recarga (0,04 = 4%). */
  agilityAttackSpeed: number;
  /** A recarga do ataque nunca fica abaixo desta fração da base (0,6 = 60%). */
  minAttackCooldownFactor: number;
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

export function derivedStats(base: BaseStats, rules: AttributeRules, a: Attributes): DerivedStats {
  const p = rules.perPoint;
  return {
    maxHp: base.maxHp + a.vitality * p.vitality,
    maxChakra: base.maxChakra + a.chakraMax * p.chakraMax,
    meditationChakraPerSec: base.meditationChakraPerSec + a.chakraRegen * p.chakraRegen,
    walkSpeed: base.walkSpeed + a.agility * p.agility,
    runSpeed: base.runSpeed + a.agility * p.agility,
    physicalMultiplier: Math.round((1 + a.taijutsu * p.taijutsu) * 1000) / 1000,
    jutsuMultiplier: Math.round((1 + a.ninjutsu * p.ninjutsu) * 1000) / 1000,
    weaponMultiplier: Math.round((1 + a.weapons * p.weapons) * 1000) / 1000,
    attackCooldownMs: Math.round(base.attackCooldownMs * Math.max(rules.minAttackCooldownFactor, 1 - a.agility * rules.agilityAttackSpeed)),
  };
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
