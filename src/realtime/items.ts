/*
 * Itens: armas (equipáveis, somam dano ao Ataque Básico) e pergaminhos de classe (gastos
 * na Extração). Fonte única: as migrações v7 e v8 têm a mesma lista em game.items (o teste confere).
 * Preço em ryō; `shop` = loja que vende (null = não está à venda: só recompensa).
 *
 * Visual (v8, paperdoll): `hold` diz ONDE o item aparece no boneco quando equipado:
 *   hand = na mão (kunais e espadas curtas), só se a outra mão não estiver ocupada
 *          (escudo ou item de duas mãos);
 *   back = nas costas, atrás do tronco e à frente da capa (espadas longas, a Shuriken Gigante
 *          e o pergaminho de jutsu levado nas costas).
 *
 * Capas (v16, migração v11): camada própria do boneco, por cima das costas. A Capa de Viagem e a da Vila são vendidas na
 * Alfaiataria; os mantos vêm do cargo (Kage), da Akatsuki ou da temporada PvP (o banco confere quem pode usar).
 */
import { CLASSES, CLASS_INFO, type ClassCode } from './jutsus.js';

export type ShopKind = 'weapons' | 'clothes' | 'scrolls';

export interface ItemDef {
  code: string;
  name: string;
  kind: 'weapon' | 'scroll' | 'cape';
  icon: string;
  /** Arma: dano somado ao Ataque Básico (escala com o atributo Armas). */
  damage?: number;
  /** Pergaminho: de qual classe. */
  class?: ClassCode;
  price: number | null;
  shop: ShopKind | null;
  /** Onde aparece no boneco quando equipado. */
  hold: 'hand' | 'back';
  /** Ocupa as duas mãos (nenhuma arma de mão aparece junto). */
  twoHanded?: boolean;
  /** Arma de ARREMESSO: troca o Ataque Básico por um lançamento dela (veja ThrowStats). */
  throw?: ThrowStats;
  /** Jeito do golpe com esta arma (sem isto: o Ataque Básico de config.ts, arco de 90° e 1,6 casa). */
  swing?: SwingStats;
}

/**
 * Golpe com a arma (design 7.5): cada arma muda o JEITO de lutar, não só o dano. A kunai é rápida e estreita;
 * a espada curta, equilibrada; a espada longa, lenta, larga e com mais alcance.
 */
export interface SwingStats {
  /** Recarga = a do Ataque Básico (com a Agilidade) x este fator. */
  cooldownFactor: number;
  /** Abertura do arco (graus) e alcance (casas). */
  arcDeg: number;
  range: number;
}

/**
 * Arremesso (Shuriken Gigante): o Ataque Básico vira um projétil que atravessa todos no caminho, com a
 * hitbox mais grossa que a de um projétil comum, e recarga bem mais lenta.
 */
export interface ThrowStats {
  /** Alcance (casas) e velocidade (casas/s). */
  range: number;
  speed: number;
  /** Meia largura da linha que acerta (casas). Kunai e Fogo: 0,5. */
  hitRadius: number;
  /** Recarga = a do Ataque Básico (com a Agilidade) x este fator. */
  cooldownFactor: number;
  /** Dano = (Ataque Básico + a arma) x este fator. */
  damageFactor: number;
}

export const ITEMS: readonly ItemDef[] = [
  {
    code: 'kunai_training', name: 'Kunai de Treino', kind: 'weapon', icon: '🗡️', damage: 10, price: null, shop: null, hold: 'hand',
    swing: { cooldownFactor: 0.85, arcDeg: 70, range: 1.5 },
  },
  {
    code: 'kunai', name: 'Kunai', kind: 'weapon', icon: '🔪', damage: 14, price: 300, shop: 'weapons', hold: 'hand',
    swing: { cooldownFactor: 0.85, arcDeg: 70, range: 1.5 },
  },
  {
    code: 'tanto', name: 'Espada Curta', kind: 'weapon', icon: '🗡', damage: 18, price: 600, shop: 'weapons', hold: 'hand',
    swing: { cooldownFactor: 0.9, arcDeg: 90, range: 1.6 },
  },
  {
    code: 'fuma_shuriken', name: 'Shuriken Gigante', kind: 'weapon', icon: '✴️', damage: 22, price: 1200, shop: 'weapons', hold: 'back', twoHanded: true,
    throw: { range: 6, speed: 9, hitRadius: 0.8, cooldownFactor: 5, damageFactor: 2.5 },
  },
  {
    code: 'katana', name: 'Espada Longa', kind: 'weapon', icon: '⚔️', damage: 28, price: 2000, shop: 'weapons', hold: 'back', twoHanded: true,
    swing: { cooldownFactor: 1.15, arcDeg: 140, range: 2 },
  },
  ...CLASSES.map((c): ItemDef => ({
    code: `scroll_${c}`, name: `Pergaminho de ${CLASS_INFO[c].name}`, kind: 'scroll', icon: '📜', class: c, price: 150, shop: 'scrolls', hold: 'back',
  })),
  { code: 'capa_viagem', name: 'Capa de Viagem', kind: 'cape', icon: '🧥', price: 400, shop: 'clothes', hold: 'back' },
  { code: 'capa_vila', name: 'Capa da Vila', kind: 'cape', icon: '🧣', price: 900, shop: 'clothes', hold: 'back' },
  { code: 'manto_kage', name: 'Manto do Kage', kind: 'cape', icon: '👘', price: null, shop: null, hold: 'back' },
  { code: 'manto_akatsuki', name: 'Manto da Akatsuki', kind: 'cape', icon: '☁️', price: null, shop: null, hold: 'back' },
  { code: 'manto_campeao', name: 'Manto do Campeão', kind: 'cape', icon: '🏆', price: null, shop: null, hold: 'back' },
];

/** Mantos que vêm do cargo (não ficam no inventário): o banco confere se a pessoa ainda pode usar. */
export const ROLE_CAPES: Readonly<Record<string, 'kage' | 'akatsuki'>> = { manto_kage: 'kage', manto_akatsuki: 'akatsuki' };

export const ITEM_BY_CODE: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.code, i]));
export const ITEM_CODES = ITEMS.map((i) => i.code) as unknown as readonly [string, ...string[]];
export const scrollOf = (c: ClassCode) => `scroll_${c}`;

/** Ryō que cada monstro deixa (o servidor sorteia entre min e max). */
export const KILL_RYO = { min: 5, max: 15 } as const;
/** Chance de um monstro deixar 1 pergaminho da classe do jogador (Genin ou acima). */
export const SCROLL_DROP_CHANCE = 0.04;

/**
 * O que aparece no boneco (todos veem): arma na mão, item nas costas e o pergaminho nas costas.
 * Arma de mão só aparece com a outra mão livre (sem escudo e sem item de duas mãos).
 */
export interface Gear {
  hand: string | null;
  back: string | null;
  scroll: string | null;
}

export function gearOf(weapon: string | null, scroll: string | null): Gear {
  const w = weapon ? ITEM_BY_CODE.get(weapon) : undefined;
  const s = scroll ? ITEM_BY_CODE.get(scroll) : undefined;
  return {
    hand: w && w.kind === 'weapon' && w.hold === 'hand' && !w.twoHanded ? w.code : null,
    back: w && w.kind === 'weapon' && w.hold === 'back' ? w.code : null,
    scroll: s && s.kind === 'scroll' ? s.code : null,
  };
}
