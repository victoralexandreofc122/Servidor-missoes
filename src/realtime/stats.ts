/*
 * Nível, atributos e os números que saem deles. Funções PURAS (sem banco, sem rede):
 * o servidor usa para calcular vida, chakra, velocidade e dano; os testes usam direto.
 * O cliente só recebe o resultado pronto (nunca calcula).
 */

/** Os 6 atributos que o jogador upa com pontos. */
export const ATTRIBUTES = ['vitality', 'chakraMax', 'chakraRegen', 'agility', 'taijutsu', 'ninjutsu'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export const NO_ATTRIBUTES: Readonly<Attributes> = { vitality: 0, chakraMax: 0, chakraRegen: 0, agility: 0, taijutsu: 0, ninjutsu: 0 };

/** Coluna de cada atributo em game.players (lista fechada: nunca vem do cliente). */
export const ATTRIBUTE_COLUMNS: Readonly<Record<Attribute, string>> = {
  vitality: 'attr_vitality',
  chakraMax: 'attr_chakra_max',
  chakraRegen: 'attr_chakra_regen',
  agility: 'attr_agility',
  taijutsu: 'attr_taijutsu',
  ninjutsu: 'attr_ninjutsu',
};

export interface AttributeRules {
  /** Pontos no máximo em cada atributo (o banco também limita: ck_players_attributes). */
  maxPoints: number;
  /** Quanto cada ponto vale. */
  perPoint: Attributes;
}

export interface BaseStats {
  maxHp: number;
  maxChakra: number;
  /** Chakra por segundo meditando (o chakra só regenera meditando). */
  meditationChakraPerSec: number;
  walkSpeed: number;
  runSpeed: number;
}

/** O que o servidor usa no jogo (e o cliente mostra na tela de status). */
export interface DerivedStats {
  maxHp: number;
  maxChakra: number;
  meditationChakraPerSec: number;
  walkSpeed: number;
  runSpeed: number;
  /** Dano FÍSICO (Ataque Básico): 1 + Taijutsu (1,15 = +15%). */
  physicalMultiplier: number;
  /** Dano de JUTSU (as 7 habilidades): 1 + Ninjutsu. */
  jutsuMultiplier: number;
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
  };
}

/** Dano final: arredondado para inteiro (número flutuante limpo na tela). */
export const scaledDamage = (damage: number, multiplier: number) => Math.round(damage * multiplier);

/**
 * Meta de XP: do nível N para o N+1 são N x STEP. O nível L começa em STEP/2 x L x (L-1)
 * de XP total. MESMA conta da função game.level_for_xp (migração v5).
 */
export const LEVEL_XP_STEP = 100;
export const MAX_LEVEL = 99;

export function levelStart(level: number): number {
  return (LEVEL_XP_STEP / 2) * level * (level - 1);
}

export function levelForXp(totalXp: number): number {
  let l = Math.max(1, Math.floor((1 + Math.sqrt(1 + (Math.max(0, totalXp) * 8) / LEVEL_XP_STEP)) / 2));
  while (levelStart(l + 1) <= totalXp) l += 1;
  while (l > 1 && levelStart(l) > totalXp) l -= 1;
  return Math.min(l, MAX_LEVEL);
}

/** XP "dentro do nível" (zera a cada nível) e quanto falta para o próximo. */
export function levelProgress(totalXp: number, level: number = levelForXp(totalXp)) {
  if (level >= MAX_LEVEL) return { level, xpInLevel: 0, xpToNext: 0 };
  return { level, xpInLevel: totalXp - levelStart(level), xpToNext: level * LEVEL_XP_STEP };
}
