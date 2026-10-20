/*
 * Itens: armas (equipáveis, somam dano ao Ataque Básico) e pergaminhos de classe (gastos
 * na Extração). Fonte única: a migração v7 tem a mesma lista em game.items (o teste confere).
 * Preço em ryō; `shop` = loja que vende (null = não está à venda: só recompensa).
 */
import { CLASSES, CLASS_INFO, type ClassCode } from './jutsus.js';

export type ShopKind = 'weapons' | 'clothes' | 'scrolls';

export interface ItemDef {
  code: string;
  name: string;
  kind: 'weapon' | 'scroll';
  icon: string;
  /** Arma: dano somado ao Ataque Básico (escala com o atributo Armas). */
  damage?: number;
  /** Pergaminho: de qual classe. */
  class?: ClassCode;
  price: number | null;
  shop: ShopKind | null;
}

export const ITEMS: readonly ItemDef[] = [
  { code: 'kunai_training', name: 'Kunai de Treino', kind: 'weapon', icon: '🗡️', damage: 10, price: null, shop: null },
  { code: 'kunai', name: 'Kunai', kind: 'weapon', icon: '🔪', damage: 14, price: 300, shop: 'weapons' },
  { code: 'fuma_shuriken', name: 'Shuriken Gigante', kind: 'weapon', icon: '✴️', damage: 22, price: 1200, shop: 'weapons' },
  ...CLASSES.map((c): ItemDef => ({
    code: `scroll_${c}`, name: `Pergaminho de ${CLASS_INFO[c].name}`, kind: 'scroll', icon: '📜', class: c, price: 150, shop: 'scrolls',
  })),
];

export const ITEM_BY_CODE: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.code, i]));
export const ITEM_CODES = ITEMS.map((i) => i.code) as unknown as readonly [string, ...string[]];
export const scrollOf = (c: ClassCode) => `scroll_${c}`;

/** Ryō que cada monstro deixa (o servidor sorteia entre min e max). */
export const KILL_RYO = { min: 5, max: 15 } as const;
/** Chance de um monstro deixar 1 pergaminho da classe do jogador (Genin ou acima). */
export const SCROLL_DROP_CHANCE = 0.04;
