/*
 * v62 (migração v37): Loot dos chefes e raridade. Os chefes (Rei Lodo, os Titãs; o Diretor Corrupto quando existir)
 * rolam o loot para cada ninja que tirou pelo menos 5% da vida deles. Uma rolagem por ninja, da raridade mais rara para
 * a mais comum:
 *
 *   🟡 Lendário 0,05%   passivas únicas e fortes
 *   🟣 Épico    0,5%    passivas úteis
 *   🔵 Raro     3%      resistência ou atributo maior
 *   🟢 Comum    10%     atributo básico
 *
 * As relíquias valem SÓ DE TER na mochila (não ocupam espaço do equipamento); várias iguais não somam. O servidor
 * confere a mochila (relicOn) nos ganchos do combate.
 *
 * NOMES: provisórios e descritivos. A regra do Victor (09/11/2026) pede 3 opções por item antes de aplicar nome: as
 * propostas estão em docs/fase3-propostas.md.
 */

export type Rarity = 'comum' | 'raro' | 'epico' | 'lendario';

export const RARITY: Readonly<Record<Rarity, { chance: number; icon: string; name: string; color: string }>> = {
  lendario: { chance: 0.0005, icon: '🟡', name: 'Lendário', color: '#ffd23f' },
  epico: { chance: 0.005, icon: '🟣', name: 'Épico', color: '#b57bff' },
  raro: { chance: 0.03, icon: '🔵', name: 'Raro', color: '#4aa8ff' },
  comum: { chance: 0.1, icon: '🟢', name: 'Comum', color: '#6fd17a' },
};
/** Da mais rara para a mais comum (a ordem da rolagem). */
export const RARITY_ORDER: readonly Rarity[] = ['lendario', 'epico', 'raro', 'comum'];

export interface Relic { code: string; rarity: Rarity; name: string; effect: string }

export const RELICS: readonly Relic[] = [
  { code: 'reliquia_c_vida', rarity: 'comum', name: 'Relíquia Comum de Vida', effect: '+8% de vida máxima.' },
  { code: 'reliquia_c_chakra', rarity: 'comum', name: 'Relíquia Comum de Chakra', effect: '+8% de chakra máximo.' },
  { code: 'reliquia_c_golpe', rarity: 'comum', name: 'Relíquia Comum de Golpe', effect: '+5% de dano no Ataque Básico.' },
  { code: 'reliquia_r_firmeza', rarity: 'raro', name: 'Relíquia Rara de Firmeza', effect: 'Controles que você sofre duram 15% menos.' },
  { code: 'reliquia_r_couraca', rarity: 'raro', name: 'Relíquia Rara de Couraça', effect: '-8% de dano recebido.' },
  { code: 'reliquia_r_vigor', rarity: 'raro', name: 'Relíquia Rara de Vigor', effect: '+15% de vida máxima.' },
  { code: 'reliquia_e_sangue', rarity: 'epico', name: 'Relíquia Épica do Sangue', effect: 'O Ataque Básico devolve 5% do dano como vida.' },
  { code: 'reliquia_e_ultimo', rarity: 'epico', name: 'Relíquia Épica do Último Fôlego', effect: 'Abaixo de 30% de vida: escudo de 20% da vida (1 vez por minuto).' },
  { code: 'reliquia_e_fluxo', rarity: 'epico', name: 'Relíquia Épica do Fluxo', effect: 'Jutsus gastam 10% menos chakra.' },
  { code: 'reliquia_l_renascer', rarity: 'lendario', name: 'Relíquia Lendária do Renascer', effect: 'Se morrer, renasce na hora com 30% da vida (uma vez por Era).' },
  { code: 'reliquia_l_brasa', rarity: 'lendario', name: 'Relíquia Lendária da Brasa', effect: 'Todo Ataque Básico queima o alvo, mesmo sem a classe Fogo.' },
];
export const RELIC_BY_CODE: ReadonlyMap<string, Relic> = new Map(RELICS.map((r) => [r.code, r]));

/** Números das passivas das relíquias. */
export const RELIC = {
  hpPct: 0.08,
  chakraPct: 0.08,
  basicPct: 0.05,
  ccCut: 0.15,
  damageCut: 0.08,
  bigHpPct: 0.15,
  lifesteal: 0.05,
  lastBreath: { below: 0.3, shieldPct: 0.2, cooldownMs: 60_000 },
  chakraCost: 0.9,
  revivePct: 0.3,
  burnMs: 2_000,
} as const;

/** Uma rolagem: a raridade que saiu (ou null). `r` é um número aleatório de 0 a 1. */
export function rollRarity(r: number): Rarity | null {
  let acc = 0;
  for (const rarity of RARITY_ORDER) {
    acc += RARITY[rarity].chance;
    if (r < acc) return rarity;
  }
  return null;
}

/** A relíquia da raridade (sorteio igual entre as daquela raridade). `r` de 0 a 1. */
export function pickRelic(rarity: Rarity, r: number): Relic {
  const list = RELICS.filter((x) => x.rarity === rarity);
  return list[Math.min(list.length - 1, Math.floor(r * list.length))]!;
}

/** Tem a relíquia na mochila? */
export const relicOn = (items: Readonly<Record<string, number>>, code: string) => (items[code] ?? 0) > 0;
