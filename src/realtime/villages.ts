/*
 * As quatro aldeias (Chama Eterna, Maré Oculta, Rocha Antiga e Vento Cortante; antes Folha, Névoa, Nuvem e Areia; a Pedra saiu na v13) e a política entre elas (docs/endgame.md, módulos 1 a 4). Funções PURAS: o servidor usa e o cliente
 * tem a MESMA conta em public/politics.js (test/endgame.test.ts confere as duas).
 *
 * O banco é a autoridade de quem é de qual vila, de quem é Kage, das guerras e alianças (migração v11); aqui só se
 * calcula, com o estado que o servidor leu do banco, o que vale AGORA: a relação entre duas vilas (com os eventos
 * globais por cima), quem pode bater em quem na Zona de Conflito e quem entra em qual mapa.
 */
import type { Village } from './appearance.js';

/** A passiva de cada vila: um bônus de +10% num tipo de coisa. */
export type PassiveKind = 'heal' | 'speed' | 'jutsu' | 'weapons';

export interface VillageInfo {
  /** Nome que aparece no jogo (mudar aqui e em game.villages). v30 (Fase 1, Herança do Fogo): os nomes das 4 aldeias. */
  name: string;
  /** Apelido do comando de admin (/admin vila kaito chama). */
  slug: string;
  /** Nome de antes da Fase 1 (o comando de admin ainda aceita). */
  oldName: string;
  /** Mapa da vila. */
  map: string;
  passive: { kind: PassiveKind; bonus: number; text: string };
}

export const VILLAGE_INFO: Readonly<Record<Village, VillageInfo>> = {
  vila_1: { name: 'Chama Eterna', slug: 'chama', oldName: 'folha', map: 'map_1', passive: { kind: 'heal', bonus: 0.1, text: '+10% de cura' } },
  vila_3: { name: 'Maré Oculta', slug: 'mare', oldName: 'nevoa', map: 'vila_nevoa', passive: { kind: 'speed', bonus: 0.1, text: '+10% de velocidade' } },
  vila_4: { name: 'Rocha Antiga', slug: 'rocha', oldName: 'nuvem', map: 'vila_nuvem', passive: { kind: 'jutsu', bonus: 0.1, text: '+10% de dano dos jutsus' } },
  vila_5: { name: 'Vento Cortante', slug: 'vento', oldName: 'areia', map: 'vila_areia', passive: { kind: 'weapons', bonus: 0.1, text: '+10% de dano com armas' } },
};

/** Aldeia pelo nome do comando de admin ("chama", "mare", "rocha", "vento"; os nomes antigos também valem). */
export function villageByName(name: string): Village | undefined {
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const key = plain(name);
  return (Object.keys(VILLAGE_INFO) as Village[]).find((v) => {
    const i = VILLAGE_INFO[v];
    return key === i.slug || key === i.oldName || key === plain(i.name);
  });
}

/** "Aldeia da Chama Eterna". */
export const villageFullName = (v: Village) => `Aldeia da ${VILLAGE_INFO[v].name}`;

/** Estado entre duas vilas agora. `tregua` = trégua forçada por evento; `mesma` = a mesma vila. */
export type Relation = 'mesma' | 'neutro' | 'guerra' | 'alianca' | 'tregua';

export interface RelationRow { a: Village; b: Village; state: 'guerra' | 'alianca'; declaredBy: Village }
/** Evento global: guerra forçada entre duas vilas, ou trégua (a e b nulos = entre todas). Instantes em ms. */
export interface WorldEvent { kind: 'guerra' | 'tregua'; a: Village | null; b: Village | null; startsAt: number; endsAt: number }

export interface Diplomacy {
  relations: readonly RelationRow[];
  events: readonly WorldEvent[];
}

export const NO_DIPLOMACY: Diplomacy = { relations: [], events: [] };

const pair = (a: Village, b: Village): [Village, Village] => (a < b ? [a, b] : [b, a]);

/** A mesma conta de game.village_relation: eventos valem por cima do que os Kages decidiram. */
export function relationOf(a: Village | null, b: Village | null, d: Diplomacy, now: number): Relation {
  if (!a || !b) return 'neutro';
  if (a === b) return 'mesma';
  const [x, y] = pair(a, b);
  const live = (e: WorldEvent) => now >= e.startsAt && now < e.endsAt;
  if (d.events.some((e) => e.kind === 'tregua' && live(e) && (e.a === null || (e.a === x && e.b === y)))) return 'tregua';
  if (d.events.some((e) => e.kind === 'guerra' && live(e) && e.a === x && e.b === y)) return 'guerra';
  return d.relations.find((r) => r.a === x && r.b === y)?.state ?? 'neutro';
}

/** Lado de um ninja na política: a vila (null = renegado) e se é da Akatsuki. */
export interface Faction {
  village: Village | null;
  akatsuki: boolean;
}

/**
 * Na Zona de Conflito, `att` pode machucar `vic`? PvP livre, menos:
 *  - membro da Akatsuki não bate em membro da Akatsuki;
 *  - vilas aliadas não se batem, e na trégua forçada vila não bate em vila;
 *  - renegado (sem vila) é inimigo de todos, e todos dele.
 * A própria vila pode (mas conta no karma, no banco).
 */
export function conflictHostile(att: Faction, vic: Faction, d: Diplomacy, now: number): boolean {
  if (att.akatsuki && vic.akatsuki) return false;
  if (!att.village || !vic.village) return true;
  const rel = relationOf(att.village, vic.village, d, now);
  return rel !== 'alianca' && rel !== 'tregua';
}

/** Vilas aliadas de `v` agora (entram na vila dela e ela na delas). */
export function alliesOf(v: Village | null, d: Diplomacy, now: number): Village[] {
  if (!v) return [];
  return (Object.keys(VILLAGE_INFO) as Village[]).filter((o) => o !== v && relationOf(v, o, d, now) === 'alianca');
}

/** Fator de preço nas lojas para quem é da vila (a mesma conta de game.village_price_factor). */
export function priceFactor(v: Village | null, d: Diplomacy, now: number): number {
  if (!v) return 1;
  const others = (Object.keys(VILLAGE_INFO) as Village[]).filter((o) => o !== v);
  const war = others.some((o) => relationOf(v, o, d, now) === 'guerra');
  const ally = others.some((o) => relationOf(v, o, d, now) === 'alianca');
  return (war ? 1.1 : 1) * (ally ? 0.95 : 1);
}

/** O que trava a entrada num mapa para ESTE ninja (vilas ligadas). */
export interface MapAccess {
  village: Village | null;
  allies: readonly Village[];
}

/**
 * Pode entrar no mapa? Vila: só quem é dela ou de vila aliada. Refúgio: só renegado. O resto: todos.
 * Sem `access` (módulo de vilas desligado), tudo aberto.
 */
export function mapAllowed(layout: { village?: string; refuge?: boolean } | undefined, access: MapAccess | undefined): boolean {
  if (!layout || !access) return true;
  if (layout.refuge) return access.village === null;
  if (layout.village) return layout.village === access.village || access.allies.includes(layout.village as Village);
  return true;
}
