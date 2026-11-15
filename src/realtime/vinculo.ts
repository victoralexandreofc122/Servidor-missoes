/*
 * v60 (migração v35): Vínculo Ancestral e Estado Primal. Nomes do Victor (14/11/2026): "Vínculo Ancestral", "Estado
 * Primal" e as 8 criaturas abaixo.
 *
 * REGRA DE OURO: só no mapa aberto (PvE) e eventos de mundo. Rankeado, Torneio (as arenas e o Vale), Zona de Conflito,
 * arena das vilas e as Guerras de Aldeia (quando existirem) cancelam a criatura e o Estado Primal (gameWorld.ts,
 * vinculoAllowed).
 *
 * Aqui só ficam os dados e as contas puras (testáveis sem o mundo). O comportamento de cada criatura está no gameWorld.ts
 * (creatureTick e os ganchos de dano/controle).
 */

export const CREATURES = ['sapo', 'lobo', 'aguia', 'gato', 'lesma', 'aranha', 'tartaruga', 'tigre'] as const;
export type Creature = (typeof CREATURES)[number];
export const isCreature = (c: unknown): c is Creature => typeof c === 'string' && (CREATURES as readonly string[]).includes(c);

/** Texto da aba "Vínculo Ancestral" (o cliente recebe pronto). */
export const CREATURE_INFO: Readonly<Record<Creature, { name: string; icon: string; role: string; desc: string; primal: string }>> = {
  sapo: { name: 'Sapo', icon: '🐸', role: 'Controle', desc: 'Cospe óleo (deixa lento) e puxa os monstros para perto dele.', primal: '+50% de duração e de alcance nos seus jutsus de controle (lentidão e prender).' },
  lobo: { name: 'Lobo', icon: '🐺', role: 'Caçador', desc: 'Invoca 2 lobos que mordem o alvo que você está mirando.', primal: 'Seu Ataque Básico causa sangramento e fica 30% mais rápido.' },
  aguia: { name: 'Águia', icon: '🦅', role: 'Mobilidade', desc: 'Cura você de leve de tempos em tempos e mostra os inimigos no minimapa (raio de 30 casas).', primal: 'Seu Ataque Básico empurra o inimigo e revela o mapa inteiro por 10 s.' },
  gato: { name: 'Gato', icon: '🐈', role: 'Crítico', desc: 'Fica invisível até atacar; o golpe saindo da invisibilidade é crítico (dano alto).', primal: 'Ao levar um golpe: 50% de chance de esquiva por 5 s (recarga de 10 s).' },
  lesma: { name: 'Lesma', icon: '🐌', role: 'Suporte', desc: 'Cria poças de cura e divide com você 30% do dano que você leva.', primal: 'Você leva 50% menos dano; a cura das poças dobra.' },
  aranha: { name: 'Aranha', icon: '🕷️', role: 'Terreno', desc: 'Tece teias no chão que prendem os inimigos.', primal: 'Aura de lentidão em volta de você e chakra voltando sem meditar.' },
  tartaruga: { name: 'Tartaruga', icon: '🐢', role: 'Defesa', desc: 'Provoca os monstros (eles vão nela) e ganha escudo.', primal: 'Imune a controle (atordoar, prender, sono, silêncio...) e escudo de 30% da sua vida máxima.' },
  tigre: { name: 'Tigre', icon: '🐯', role: 'Dano Bruto', desc: 'Avança rápido até o alvo e bate forte.', primal: '+40% de dano físico e um avanço (dash) extra no botão do Estado Primal.' },
};

export const VINCULO = {
  /** Invocar gasta 40% do chakra máximo. */
  chakraPct: 0.4,
  /** Recarga da invocação (conta a partir de quando invocou). */
  cooldownMs: 120_000,
  /** Estado Primal: dura 60 s; pede afinidade 5 e a criatura em campo. */
  primalMs: 60_000,
  /** Recarga do Estado Primal (não foi dito no pedido: 5 minutos, a partir do fim). */
  primalCooldownMs: 300_000,
  primalLevel: 5,
  /** Avanço extra do Tigre no Estado Primal (casas e recarga). */
  tigerDash: { range: 4, cooldownMs: 6_000 },
  /** XP de afinidade: por golpe que a criatura acerta e por inimigo que ela derruba. */
  xpPerHit: 2,
  xpPerKill: 15,
  /** Até onde a criatura procura alvo sozinha (casas). */
  aggroRange: 9,
  /** Quanto tempo o "quem me bateu por último" vale para a criatura (ms). */
  lastAttackerMs: 8_000,
} as const;

/** XP para chegar em cada nível de afinidade (o banco tem a mesma tabela em game.vinculo_level). */
export const AFFINITY_XP = [0, 100, 300, 600, 1000] as const;

export function affinityLevel(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < AFFINITY_XP.length; i++) if (xp >= AFFINITY_XP[i]!) lvl = i + 1;
  return lvl;
}

/** Para a barra: nível, quanto já tem dentro do nível e quanto falta para o próximo (null no 5). */
export function affinityBar(xp: number): { level: number; into: number; need: number | null } {
  const level = affinityLevel(xp);
  if (level >= AFFINITY_XP.length) return { level, into: 0, need: null };
  const base = AFFINITY_XP[level - 1]!;
  return { level, into: xp - base, need: AFFINITY_XP[level]! - base };
}

/** Multiplicador da afinidade (força e vida da criatura): +12% por nível acima do 1. */
export const affinityMult = (level: number) => 1 + 0.12 * (Math.max(1, Math.min(5, level)) - 1);

/**
 * Números de cada criatura. hpPct: vida em parte da vida máxima do dono (o Victor deixou as invocações em %);
 * power: dano de cada golpe em relação ao golpe base; everyMs: de quanto em quanto tempo usa a habilidade; reach: alcance
 * do golpe; speed: casas/s andando.
 */
export const CREATURE_STATS: Readonly<Record<Creature, { hpPct: number; power: number; everyMs: number; reach: number; speed: number }>> = {
  sapo: { hpPct: 0.3, power: 0.6, everyMs: 6_000, reach: 5, speed: 3.4 },
  lobo: { hpPct: 0.22, power: 0.7, everyMs: 1_600, reach: 1.3, speed: 4.6 },
  aguia: { hpPct: 0.25, power: 0.4, everyMs: 2_400, reach: 1.5, speed: 5 },
  gato: { hpPct: 0.25, power: 1.1, everyMs: 2_200, reach: 1.3, speed: 4.4 },
  lesma: { hpPct: 0.4, power: 0.4, everyMs: 8_000, reach: 1.3, speed: 2.4 },
  aranha: { hpPct: 0.3, power: 0.6, everyMs: 7_000, reach: 4, speed: 3.6 },
  tartaruga: { hpPct: 0.6, power: 0.5, everyMs: 6_000, reach: 1.3, speed: 2.6 },
  tigre: { hpPct: 0.35, power: 2.2, everyMs: 7_000, reach: 5, speed: 4.2 },
};

/** Golpe base de uma criatura (antes da afinidade e do papel): cresce com o nível do dono. */
export const creatureBaseDamage = (ownerLevel: number) => 10 + 0.4 * Math.max(1, ownerLevel);

/** Números fixos (curas e escudos sem % da vida, decisão do Victor na v54; o escudo do Primal da Tartaruga é dele: 30%). */
export const CREATURE_NUMBERS = {
  eagleHeal: 10,               // a cada golpe/ciclo da Águia, no dono
  slugPool: { heal: 6, radius: 2.5, ms: 4_000, tickMs: 1_000 },
  slugShare: 0.3,              // parte do dano do dono que vai para a Lesma
  spiderWeb: { radius: 1.6, rootMs: 1_800, ms: 5_000 },
  frogOil: { slowMs: 3_000, pull: 2 },
  turtleShieldPct: 0.25,       // escudo da Tartaruga nela mesma (parte da vida dela)
  turtleTauntRange: 7,
  catCrit: { stealth: 2.5, chance: 0.3, mult: 1.8, revealMs: 3_000 },
  wolfPrimalBleed: { ms: 3_000, perTick: 4 },
} as const;

/** Estado Primal: os números (o que cada criatura faz está em CREATURE_INFO.primal). */
export const PRIMAL = {
  frogControl: 1.5,            // duração e alcance dos jutsus de controle
  wolfAttackSpeed: 1.3,
  eagleReveal: { push: 1.5, revealMs: 10_000 },
  catDodge: { chance: 0.5, ms: 5_000, cooldownMs: 10_000 },
  slugDamageCut: 0.5,
  slugHealMult: 2,
  spiderAura: { radius: 3, slowMs: 1_200 },
  turtleShieldPct: 0.3,
  tigerPhysical: 1.4,
} as const;

/** Os controles que o Estado Primal da Tartaruga ignora (e o do Sapo alonga, nos jutsus). */
export const CC_EFFECTS = ['sono', 'silencio', 'invertido', 'paralisia', 'lentidao', 'escuridao'] as const;

/**
 * Hierarquia de alvos da criatura (pedido do Victor), do mais importante para o menos:
 *   1. o alvo que o dono está mirando (foco)
 *   2. quem bateu no dono por último
 *   3. ninjas Renegados
 *   4. ninjas de outras vilas que não são aliadas
 *   5. chefes
 *   6. monstros comuns
 * Só entram candidatos que o dono pode machucar (no mapa aberto PvE os ninjas nunca entram: lá não há PvP). Empate no
 * mesmo degrau: o mais perto.
 */
export interface TargetCandidate {
  id: string;
  dist: number;
  focus?: boolean;
  lastAttacker?: boolean;
  renegade?: boolean;
  enemyVillage?: boolean;
  boss?: boolean;
}

export function targetRank(c: TargetCandidate): number {
  if (c.focus) return 1;
  if (c.lastAttacker) return 2;
  if (c.renegade) return 3;
  if (c.enemyVillage) return 4;
  if (c.boss) return 5;
  return 6;
}

export function pickTarget<T extends TargetCandidate>(list: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const c of list) {
    if (!best) { best = c; continue; }
    const a = targetRank(c), b = targetRank(best);
    if (a < b || (a === b && c.dist < best.dist)) best = c;
  }
  return best;
}
