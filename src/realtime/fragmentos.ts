/*
 * v65 (migração v39): os fragmentos da Crônica gravados no banco (decisão do Victor, 15/11/2026). O texto de cada um fica
 * no cliente (public/lore.js); aqui ficam só onde ele está, para o SERVIDOR conferir que o ninja estava mesmo lá antes de
 * gravar e pagar (o teste test/lore.test.ts confere que as duas listas são iguais).
 *
 * Achar um fragmento pela 1ª vez paga FRAGMENT_REWARD (como um capítulo do Pergaminho do Mestre, menor). Sem a v39 no banco,
 * o jogo segue como na v64: o fragmento fica só no aparelho, sem prêmio.
 */

export interface FragmentSpot { id: string; map: string; x: number; y: number }

export const FRAGMENT_SPOTS: readonly FragmentSpot[] = [
  { id: 'FRG_01', map: 'academy_interior', x: 60, y: 6 },
  { id: 'FRG_02', map: 'academy_interior', x: 38, y: 13.5 },
  { id: 'FRG_03', map: 'map_1', x: 33, y: 25.6 },
  { id: 'FRG_04', map: 'interior_weapons', x: 12, y: 8.5 },
  { id: 'FRG_05', map: 'interior_scrolls', x: 12, y: 8 },
  { id: 'FRG_06', map: 'map_2', x: 32, y: 42.5 },
  { id: 'FRG_07', map: 'map_2', x: 20, y: 56 },
  { id: 'FRG_08', map: 'map_2', x: 80, y: 40 },
  { id: 'FRG_09', map: 'caverna_lodo', x: 28, y: 14.5 },
  { id: 'FRG_10', map: 'clareira_queimada', x: 18.5, y: 19.5 },
  { id: 'FRG_11', map: 'poco', x: 12, y: 4.5 },
  { id: 'FRG_12', map: 'zona_conflito', x: 55, y: 40 },
  { id: 'FRG_13', map: 'refugio', x: 13, y: 25 },
  { id: 'FRG_14', map: 'vila_nevoa', x: 30, y: 25.5 },
  { id: 'FRG_15', map: 'vila_nuvem', x: 30, y: 25.5 },
  { id: 'FRG_16', map: 'vila_areia', x: 22, y: 42 },
  { id: 'FRG_17', map: 'vale_estatuas', x: 4, y: 11 },
];
export const FRAGMENT_BY_ID: ReadonlyMap<string, FragmentSpot> = new Map(FRAGMENT_SPOTS.map((f) => [f.id, f]));

/** O cliente acha a 1,6 casa; o servidor aceita um pouco mais (a posição dele chega com atraso). */
export const FRAGMENT_SERVER_REACH = 2.6;

/** O prêmio do 1º achado de cada fragmento (17 x = 510 ryō e 1.020 XP na Crônica inteira). */
export const FRAGMENT_REWARD = { ryo: 30, xp: 60 } as const;

export const isFragment = (id: unknown): id is string => typeof id === 'string' && FRAGMENT_BY_ID.has(id);
