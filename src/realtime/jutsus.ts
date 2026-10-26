/*
 * Classes e jutsus do Multiverso Ninja: o CATÁLOGO (fonte única). O servidor usa para o
 * combate; a migração v7 tem a mesma lista em game.classes / game.jutsus (o teste confere).
 *
 *  - 9 classes. Cada uma tem 4 jutsus, um por TIER (1 a 4). O tier 1 de cada classe tem o
 *    mesmo código da classe ('fire', 'water'...: os 7 jutsus que já existiam continuam iguais);
 *    os outros são '<classe>_2', '_3', '_4'.
 *  - 2 jutsus da Academia (tier 0, sem classe): Teleporte Curto e Substituição.
 *  - Cada jutsu tem uma MECÂNICA (a regra de combate em gameWorld.ts). Os tiers maiores usam a
 *    mesma mecânica do tier 1 da classe, com números maiores.
 *  - Nível do jutsu por USO (contado só pelo servidor): 100 usos = Nv 2, 500 = Nv 3, 2000 = Nv 4.
 */
import type { SkillConfig } from './config.js';

export const CLASSES = ['heal', 'shadow', 'illusion', 'stone', 'fire', 'water', 'taijutsu', 'weapons', 'lightning'] as const;
export type ClassCode = (typeof CLASSES)[number];

export const CLASS_INFO: Readonly<Record<ClassCode, { name: string; icon: string; desc: string }>> = {
  heal: { name: 'Cura', icon: '✚', desc: 'Fecha feridas e mantém o grupo de pé.' },
  shadow: { name: 'Sombra', icon: '🌑', desc: 'Uma linha de sombra prende no chão o primeiro inimigo que toca.' },
  illusion: { name: 'Ilusão', icon: '🌀', desc: 'Engana a mente: todos em volta de você ficam atordoados. Do Labirinto Mental em diante, depois ficam em silêncio (sem jutsu).' },
  stone: { name: 'Pedra', icon: '⛰', desc: 'Pele de rocha: o próximo golpe perde força.' },
  fire: { name: 'Fogo', icon: '🔥', desc: 'Bola de fogo de longo alcance que explode no primeiro inimigo, queimando quem está perto.' },
  water: { name: 'Água', icon: '💧', desc: 'Jatos em cone que empurram e deixam o inimigo molhado (o Relâmpago num alvo molhado bate mais forte).' },
  taijutsu: { name: 'Taijutsu', icon: '👊', desc: 'Avança até o inimigo e golpeia: socos e chutes devastadores.' },
  weapons: { name: 'Armas', icon: '🗡️', desc: 'Kunais em leque: o atributo Armas aumenta o dano.' },
  lightning: { name: 'Relâmpago', icon: '⚡', desc: 'Raio em linha reta que paralisa o primeiro inimigo por um instante. Num alvo molhado: combo, 30% a mais.' },
};

/** Regras de combate. Os jutsus de classe usam a do tier 1; os da Academia têm as próprias. */
export type Mechanic = ClassCode | 'teleport' | 'substitution';

export interface JutsuDef {
  code: JutsuCode;
  name: string;
  /** null = jutsu da Academia (todo mundo aprende). */
  class: ClassCode | null;
  /** 0 = Academia; 1 a 4 = tier da classe (nível de Extração que ensina). */
  tier: 0 | 1 | 2 | 3 | 4;
  mechanic: Mechanic;
}

/** Nomes originais (tier 1 a 4) de cada classe. */
const NAMES: Readonly<Record<ClassCode, readonly [string, string, string, string]>> = {
  heal: ['Cura', 'Bálsamo Verde', 'Fonte Serena', 'Toque da Vida'],
  shadow: ['Sombra', 'Teia das Sombras', 'Mãos da Noite', 'Eclipse'],
  illusion: ['Ilusão', 'Névoa Hipnótica', 'Labirinto Mental', 'Cárcere dos Sonhos'],
  stone: ['Pedra', 'Pele de Granito', 'Muralha de Rocha', 'Coração de Montanha'],
  fire: ['Fogo', 'Muralha de Chamas', 'Fênix Ardente', 'Inferno Escarlate'],
  water: ['Água', 'Onda Gêmea', 'Fúria do Oceano', 'Maré Sem Fim'],
  taijutsu: ['Taijutsu', 'Chute Ciclone', 'Cem Golpes', 'Punho do Céu'],
  weapons: ['Chuva de Kunais', 'Leque de Shurikens', 'Tempestade de Lâminas', 'Arsenal Celeste'],
  lightning: ['Faísca Rasante', 'Lança Trovão', 'Corrente Elétrica', 'Julgamento do Raio'],
};

export const ACADEMY_JUTSUS = ['teleport', 'substitution'] as const;
/** Código de jutsu: os 2 da Academia, o tier 1 de cada classe ('fire') e os tiers 2 a 4 ('fire_2'). */
export type JutsuCode = (typeof ACADEMY_JUTSUS)[number] | ClassCode | `${ClassCode}_${2 | 3 | 4}`;

export const JUTSUS: readonly JutsuDef[] = [
  { code: 'teleport', name: 'Teleporte Curto', class: null, tier: 0, mechanic: 'teleport' },
  { code: 'substitution', name: 'Substituição', class: null, tier: 0, mechanic: 'substitution' },
  ...CLASSES.flatMap((c) => NAMES[c].map((name, i): JutsuDef => ({
    code: i === 0 ? c : (`${c}_${i + 1}` as JutsuCode),
    name,
    class: c,
    tier: (i + 1) as 1 | 2 | 3 | 4,
    mechanic: c,
  }))),
];

export const JUTSU_CODES = JUTSUS.map((j) => j.code) as unknown as readonly [JutsuCode, ...JutsuCode[]];
export const JUTSU_BY_CODE: ReadonlyMap<string, JutsuDef> = new Map(JUTSUS.map((j) => [j.code, j]));

/** Os 7 jutsus de antes da v7 (quem já jogava continua com eles). */
export const LEGACY_JUTSUS = ['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal'] as const;

// ------------------------------------------------------------------ nível por uso

/** Usos para chegar a cada nível (índice = nível - 1). MESMA conta da coluna gerada player_jutsus.level. */
export const JUTSU_LEVEL_USES = [0, 100, 500, 2000] as const;
export const MAX_JUTSU_LEVEL = 4;

export function jutsuLevel(uses: number): number {
  let level = 1;
  for (let i = 1; i < JUTSU_LEVEL_USES.length; i++) if (uses >= JUTSU_LEVEL_USES[i]!) level = i + 1;
  return level;
}

/** Usos que faltam para o próximo nível (null = nível máximo). */
export function usesToNext(uses: number): number | null {
  const next = JUTSU_LEVEL_USES.find((n) => n > uses);
  return next === undefined ? null : next;
}

/** Teleporte: alcance 3, 4, 5, 6 casas nos níveis 1 a 4. */
export const teleportRange = (level: number) => 2 + Math.max(1, Math.min(4, level));
/** Substituição: recarga 30, 25, 20, 15 s nos níveis 1 a 4 (no 4, aparece atrás do alvo FOCADO). */
export const substitutionCooldownMs = (level: number) => (35 - 5 * Math.max(1, Math.min(4, level))) * 1000;
/** Jutsu de classe: +10% de efeito (dano, cura) por nível acima do 1. */
export const jutsuPower = (level: number) => 1 + 0.1 * (Math.max(1, Math.min(4, level)) - 1);

// ------------------------------------------------------------------ números de combate

/** Tier 1 de cada mecânica (os 7 antigos com os MESMOS números de antes). */
export const BASE_SKILLS: Readonly<Record<Mechanic, SkillConfig>> = {
  // Fogo, Sombra, Relâmpago e Armas são habilidades EM LINHA: só saem nas 4 direções (cima, baixo, esquerda, direita).
  // Fogo: projétil em linha reta (9 casas) na direção do inimigo, que explode no primeiro alvo (ou na parede/no fim):
  // círculo de 2. Quem a explosão pega fica queimando: 3 por segundo, por 3 s (mais forte nos tiers altos).
  fire: { cost: 20, cooldownMs: 1500, damage: 25, range: 9, radius: 2, speed: 14, burn: 3, burnMs: 3000 },
  // Água: cone de 90° e 4 casas na direção em que o jogador olha (ou no alvo focado); empurra quem acerta 1,5 casa.
  water: { cost: 15, cooldownMs: 1000, damage: 20, range: 4, coneDeg: 90, push: 1.5 },
  // Taijutsu: avança até o mais perto (alcance 2,5) e acerta um círculo de 1 casa na frente.
  taijutsu: { cost: 5, cooldownMs: 500, damage: 35, range: 2.5, radius: 1, scaling: 'taijutsu' },
  // Ilusão: atordoa todos num círculo de 3 casas em volta do jogador.
  illusion: { cost: 30, cooldownMs: 4000, radius: 3, stunMs: 3000 },
  // Sombra: linha de 4 casas; prende o primeiro que ela encosta.
  shadow: { cost: 25, cooldownMs: 6000, range: 4, rootMs: 5000 },
  stone: { cost: 15, cooldownMs: 6000, reduction: 0.5 },
  // Cura: em si mesmo ou num aliado a até 3 casas.
  heal: { cost: 30, cooldownMs: 4000, heal: 30, radius: 3 },
  // Armas: 3 kunais lado a lado (trilhas paralelas a 0,7 casa), 4 casas; cada alvo leva no máximo 1 kunai por
  // arremesso. Escala com o atributo Armas (+ a arma equipada).
  weapons: { cost: 10, cooldownMs: 1200, damage: 18, range: 4, shots: 3, laneGap: 0.7, speed: 16, scaling: 'weapons' },
  // Relâmpago: linha instantânea de 4,5 casas; o primeiro alvo leva dano alto, um choque rápido e fica paralisado 2 s
  // (anda a 70% e leva um choque de 0,25 s por segundo; mais tempo nos tiers altos).
  lightning: { cost: 20, cooldownMs: 2000, damage: 30, range: 4.5, stunMs: 400, paralysisMs: 2000 },
  // Academia: o alcance e a recarga reais vêm do NÍVEL do jutsu (teleportRange, substitutionCooldownMs).
  teleport: { cost: 10, cooldownMs: 1500, range: 3 },
  substitution: { cost: 20, cooldownMs: 30_000, durationMs: 5000 },
};

const TIER = {
  power: [1, 1.45, 2, 2.8],
  reach: [0, 0.5, 1, 1.5],
  cost: [1, 1.35, 1.7, 2.2],
  cooldown: [1, 1.15, 1.3, 1.5],
  control: [1, 1.2, 1.4, 1.7],
  shield: [0.5, 0.6, 0.7, 0.8],
} as const;

/** Números de um jutsu (tier 1 = BASE_SKILLS; tiers 2 a 4 = a mesma mecânica, mais forte). */
export function skillConfig(j: JutsuDef): SkillConfig & { mechanic: Mechanic } {
  const base = BASE_SKILLS[j.mechanic];
  if (j.tier <= 1) return { ...base, mechanic: j.mechanic };
  const t = j.tier - 1;
  const r = (n: number | undefined, k: number) => (n === undefined ? undefined : Math.round(n * k));
  const out: SkillConfig & { mechanic: Mechanic } = {
    ...base,
    mechanic: j.mechanic,
    cost: Math.round(base.cost * TIER.cost[t]!),
    cooldownMs: Math.round(base.cooldownMs * TIER.cooldown[t]!),
  };
  if (base.damage !== undefined) out.damage = r(base.damage, TIER.power[t]!)!;
  if (base.heal !== undefined) out.heal = r(base.heal, TIER.power[t]!)!;
  if (base.radius !== undefined) out.radius = base.radius + TIER.reach[t]!;
  if (base.range !== undefined) out.range = base.range + TIER.reach[t]!;
  if (base.push !== undefined) out.push = base.push + TIER.reach[t]!;
  if (base.burn !== undefined) out.burn = r(base.burn, TIER.power[t]!)!;
  if (base.paralysisMs !== undefined) out.paralysisMs = r(base.paralysisMs, TIER.control[t]!)!;
  // Ilusão: o Labirinto Mental (tier 3) e o Cárcere dos Sonhos (tier 4) também silenciam depois do atordoamento.
  if (j.mechanic === 'illusion' && j.tier >= 3) out.silenceMs = j.tier === 3 ? 3000 : 4500;
  if (base.stunMs !== undefined) out.stunMs = r(base.stunMs, TIER.control[t]!)!;
  if (base.rootMs !== undefined) out.rootMs = r(base.rootMs, TIER.control[t]!)!;
  if (base.reduction !== undefined) out.reduction = TIER.shield[t]!;
  return out;
}

/** Tabela completa: código -> números (o servidor usa; o welcome manda custo, recarga e alcance). */
export function buildSkills(): Record<JutsuCode, SkillConfig & { mechanic: Mechanic }> {
  return Object.fromEntries(JUTSUS.map((j) => [j.code, skillConfig(j)])) as Record<JutsuCode, SkillConfig & { mechanic: Mechanic }>;
}

// ------------------------------------------------------------------ Extração (gacha)

/** Nível de Extração 1 a 4: pergaminhos gastos e chance de sucesso (o BANCO usa a mesma tabela). */
export const EXTRACTION = [
  { level: 1, scrolls: 1, chance: 0.8 },
  { level: 2, scrolls: 2, chance: 0.6 },
  { level: 3, scrolls: 4, chance: 0.4 },
  { level: 4, scrolls: 8, chance: 0.2 },
] as const;

/**
 * Proteção contra azar (v10, design 7.3): cada falha seguida na mesma classe e no mesmo tier soma isto à
 * chance da próxima; acertou, zera. A MESMA conta está em game.extract_jutsu (db/schema_v10_design.sql).
 */
export const EXTRACTION_PITY_STEP = 0.1;

/** Chance da próxima Extração do tier `level` depois de `failures` falhas seguidas (0 a 1). */
export function extractionChance(level: number, failures: number): number {
  const base = EXTRACTION.find((e) => e.level === level)?.chance ?? 0;
  return Math.min(1, base + EXTRACTION_PITY_STEP * Math.max(0, failures));
}
