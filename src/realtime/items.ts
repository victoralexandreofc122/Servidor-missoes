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
 *
 * Sapatos (v18, migração v12): equipamento dos pés, camada própria do boneco ("sapato" nos sprites). Todo ninja começa
 * com a Sandália Ninja calçada; sem sapato, o pé fica descalço. `look` diz o desenho (sandália ou bota) e as 3 cores
 * (public/sprites.js tem a mesma tabela; o teste confere).
 */
import { CLASSES, CLASS_INFO, type ClassCode } from './jutsus.js';

export type ShopKind = 'weapons' | 'clothes' | 'scrolls';

export interface ItemDef {
  code: string;
  name: string;
  kind: 'weapon' | 'scroll' | 'cape' | 'shoes' | 'accessory' | 'consumable';
  icon: string;
  /** Arma: dano somado ao Ataque Básico (escala com o atributo Armas). */
  damage?: number;
  /** Pergaminho: de qual classe. */
  class?: ClassCode;
  price: number | null;
  shop: ShopKind | null;
  /** Onde aparece no boneco quando equipado. */
  hold: 'hand' | 'back' | 'feet' | 'body';
  /** Acessório (casaco): a cor (nome da rampa de roupa dos sprites). Fica por cima da roupa equipada. */
  coat?: string;
  /** Sapato: o desenho no boneco e as cores (nomes das rampas de roupa dos sprites). */
  look?: ShoeLook;
  /** Ocupa as duas mãos (nenhuma arma de mão aparece junto). */
  twoHanded?: boolean;
  /** Arma de ARREMESSO: troca o Ataque Básico por um lançamento dela (veja ThrowStats). */
  throw?: ThrowStats;
  /** Jeito do golpe com esta arma (sem isto: o Ataque Básico de config.ts, arco de 90° e 1,6 casa). */
  swing?: SwingStats;
}

/** Desenho de um sapato: o item da camada "sapato" dos sprites e as cores 1, 2 e 3. */
export interface ShoeLook {
  sprite: 'sandalia' | 'bota';
  colors: readonly [string, string, string];
}

/**
 * Golpe com a arma (design 7.5): cada arma muda o JEITO de lutar, não só o dano. A kunai é rápida e estreita;
 * a espada curta, equilibrada; a espada longa, lenta, larga e com mais alcance.
 */
export interface SwingStats {
  /** Recarga = a do Ataque Básico (com o Taijutsu) x este fator. */
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
  /** Recarga = a do Ataque Básico (com o Taijutsu) x este fator. */
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
  // v53 (migração v32): a Shuriken de mão, consumível. Qualquer classe usa: o botão ✴️ lança uma (Ataque Básico à
  // distância, escala com Armas) e gasta uma do inventário. Vende na loja de armas (10 ryō cada, de 10 em 10) e cai dos monstros.
  { code: 'shuriken', name: 'Shuriken', kind: 'consumable', icon: '✴️', price: 10, shop: 'weapons', hold: 'hand' },
  // v34 (migração v24): um pergaminho só, que serve para a Extração de qualquer classe sua. Os de classe ficam no catálogo, sem venda
  // (a v24 somou todos no pergaminho novo).
  { code: 'scroll_liso', name: 'Pergaminho', kind: 'scroll', icon: '📜', price: 150, shop: 'scrolls', hold: 'back' },
  ...CLASSES.map((c): ItemDef => ({
    code: `scroll_${c}`, name: `Pergaminho de ${CLASS_INFO[c].name} (antigo)`, kind: 'scroll', icon: '📜', class: c, price: null, shop: null, hold: 'back',
  })),
  { code: 'capa_viagem', name: 'Capa de Viagem', kind: 'cape', icon: '🧥', price: 400, shop: 'clothes', hold: 'back' },
  { code: 'capa_vila', name: 'Capa da Vila', kind: 'cape', icon: '🧣', price: 900, shop: 'clothes', hold: 'back' },
  { code: 'manto_kage', name: 'Manto do Kage', kind: 'cape', icon: '👘', price: null, shop: null, hold: 'back' },
  { code: 'manto_akatsuki', name: 'Manto Cinza', kind: 'cape', icon: '🌑', price: null, shop: null, hold: 'back' },
  { code: 'manto_campeao', name: 'Manto do Campeão', kind: 'cape', icon: '🏆', price: null, shop: null, hold: 'back' },
  {
    code: 'sandalia_ninja', name: 'Sandália Ninja', kind: 'shoes', icon: '🩴', price: 80, shop: 'clothes', hold: 'feet',
    look: { sprite: 'sandalia', colors: ['azul_marinho', 'creme', 'preto'] },
  },
  {
    code: 'sandalia_couro', name: 'Sandália de Couro', kind: 'shoes', icon: '🩴', price: 250, shop: 'clothes', hold: 'feet',
    look: { sprite: 'sandalia', colors: ['marrom', 'creme', 'preto'] },
  },
  {
    code: 'botas_viagem', name: 'Botas de Viagem', kind: 'shoes', icon: '🥾', price: 500, shop: 'clothes', hold: 'feet',
    look: { sprite: 'bota', colors: ['marrom', 'creme', 'preto'] },
  },
  {
    code: 'botas_ninja', name: 'Botas Ninja', kind: 'shoes', icon: '👢', price: 900, shop: 'clothes', hold: 'feet',
    look: { sprite: 'bota', colors: ['preto', 'preto', 'cinza'] },
  },
  // Acessórios (migração v14): o casaco com capuz, por cima da roupa equipada (camisa e calça ou o conjunto da vila).
  { code: 'casaco_petroleo', name: 'Casaco com Capuz (petróleo)', kind: 'accessory', icon: '🧥', price: 1200, shop: 'clothes', hold: 'body', coat: 'petroleo' },
  { code: 'casaco_preto', name: 'Casaco com Capuz (preto)', kind: 'accessory', icon: '🧥', price: 1200, shop: 'clothes', hold: 'body', coat: 'preto' },
  { code: 'casaco_vinho', name: 'Casaco com Capuz (vinho)', kind: 'accessory', icon: '🧥', price: 1200, shop: 'clothes', hold: 'body', coat: 'vinho' },
  { code: 'casaco_verde', name: 'Casaco com Capuz (verde)', kind: 'accessory', icon: '🧥', price: 1200, shop: 'clothes', hold: 'body', coat: 'verde_escuro' },
];

/** O sapato com que todo ninja começa (a migração v12 dá e calça). */
export const STARTER_SHOES = 'sandalia_ninja';

/** Mantos que vêm do cargo (não ficam no inventário): o banco confere se a pessoa ainda pode usar. */
export const ROLE_CAPES: Readonly<Record<string, 'kage' | 'akatsuki'>> = { manto_kage: 'kage', manto_akatsuki: 'akatsuki' };

export const ITEM_BY_CODE: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.code, i]));
export const ITEM_CODES = ITEMS.map((i) => i.code) as unknown as readonly [string, ...string[]];
/** v34: o pergaminho único da Extração (qualquer classe). */
export const SCROLL = 'scroll_liso';

/** Ryō que cada monstro deixa (o servidor sorteia entre min e max). */
export const KILL_RYO = { min: 5, max: 15 } as const;
/** Chance de um monstro deixar 1 pergaminho da classe do jogador (Genin ou acima). */
export const SCROLL_DROP_CHANCE = 0.04;

/** v53: a Shuriken de mão (consumível): o código, o arremesso e o dano base (antes do damageScale.basic e do atributo Armas). */
export const SHURIKEN = 'shuriken';
export const SHURIKEN_THROW: ThrowStats = { range: 6, speed: 14, hitRadius: 0.5, cooldownFactor: 1.2, damageFactor: 1 };
export const SHURIKEN_DAMAGE = 16;
/** Monstro derrotado deixa 1 a 2 Shurikens com esta chance (qualquer rank). */
export const SHURIKEN_DROP = { chance: 0.15, min: 1, max: 2 } as const;

/**
 * O que aparece no boneco (todos veem): arma na mão, item nas costas, o pergaminho nas costas e o sapato (null = descalço).
 * Arma de mão só aparece com a outra mão livre (sem escudo e sem item de duas mãos).
 */
export interface Gear {
  hand: string | null;
  back: string | null;
  scroll: string | null;
  feet: string | null;
  /** Acessório por cima da roupa (o casaco). */
  body: string | null;
}

export function gearOf(weapon: string | null, scroll: string | null, shoes: string | null = null, accessory: string | null = null): Gear {
  const w = weapon ? ITEM_BY_CODE.get(weapon) : undefined;
  const s = scroll ? ITEM_BY_CODE.get(scroll) : undefined;
  const f = shoes ? ITEM_BY_CODE.get(shoes) : undefined;
  const a = accessory ? ITEM_BY_CODE.get(accessory) : undefined;
  return {
    hand: w && w.kind === 'weapon' && w.hold === 'hand' && !w.twoHanded ? w.code : null,
    back: w && w.kind === 'weapon' && w.hold === 'back' ? w.code : null,
    scroll: s && s.kind === 'scroll' ? s.code : null,
    feet: f && f.kind === 'shoes' ? f.code : null,
    body: a && a.kind === 'accessory' ? a.code : null,
  };
}
