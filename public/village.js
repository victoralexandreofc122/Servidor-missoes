// Vila de pedra no centro do mapa. Só VISUAL (o servidor não tem paredes): chão de pedra num
// círculo em volta do centro e algumas casas (blocos marrons). Funções puras, testadas no Node.

/**
 * Casas: canto (dx, dy) em casas a partir do centro da vila, largura w e altura h.
 * Nenhuma cobre o ponto de renascimento, o Mestre, as estradas (linha/coluna do centro)
 * nem sai do círculo de pedra.
 */
export const HOUSES = [
  { dx: -8, dy: -7, w: 4, h: 3 },
  { dx: 3, dy: -8, w: 4, h: 3 },
  { dx: -8, dy: 3, w: 4, h: 3 },
  { dx: 4, dy: 3, w: 3, h: 3 },
  { dx: -4, dy: -4, w: 2, h: 2 },
  { dx: 5, dy: -3, w: 3, h: 2 },
];

/** A casa (x, y) é chão de pedra? Mede do centro da casa até o centro da vila. */
export function isVillage(x, y, village) {
  if (!village) return false;
  return Math.hypot(x + 0.5 - village.x, y + 0.5 - village.y) <= village.radius;
}

/** Casas em coordenadas do mapa (casas inteiras). */
export function housesOf(village) {
  if (!village) return [];
  const cx = Math.floor(village.x);
  const cy = Math.floor(village.y);
  return HOUSES.map((h) => ({ x: cx + h.dx, y: cy + h.dy, w: h.w, h: h.h }));
}

/** A casa (x, y) fica embaixo de alguma casa da vila? */
export function houseAt(x, y, houses) {
  return houses.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
}
