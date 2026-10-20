// Mapas no cliente: o que desenhar em cada casa e como "costurar" os mapas vizinhos.
//
// Os layouts vêm do servidor (welcome.world.maps). Para a troca de mapa não parecer um
// teleporte, além da borda de uma saída o cliente desenha o PEDAÇO DO MAPA VIZINHO que fica
// do outro lado (chão e paredes), no lugar certo: chegando no portão leste da Vila já se vê a
// trilha da Floresta e, depois de atravessar, a Vila continua visível atrás.
// Funções puras (sem DOM), testadas no Node.

/**
 * Mapas visíveis a partir de `mapId`: ele mesmo (deslocamento 0) e cada vizinho de saída,
 * com o deslocamento (ox, oy) do canto dele em coordenadas do mapa atual.
 * Casa (x, y) do mapa atual = casa (x - ox, y - oy) do vizinho.
 */
export function placements(maps, mapId) {
  const cur = maps && maps[mapId];
  if (!cur) return [];
  const out = [{ map: cur, ox: 0, oy: 0 }];
  for (const e of cur.exits || []) {
    const dest = maps[e.map];
    if (!dest) continue;
    if (e.edge === 'east') out.push({ map: dest, ox: cur.width, oy: -e.shift });
    else if (e.edge === 'west') out.push({ map: dest, ox: -dest.width, oy: -e.shift });
    else if (e.edge === 'south') out.push({ map: dest, ox: -e.shift, oy: cur.height });
    else out.push({ map: dest, ox: -e.shift, oy: -dest.height });
  }
  return out;
}

const inside = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/**
 * Chão da casa inteira (x, y), em coordenadas do mapa atual:
 *  'stone' (Vila), 'grass' (Floresta), 'path' (estrada de terra) ou 'void' (fora do mundo:
 *  desenhado como mata fechada). `places` = placements(maps, mapId), calculado uma vez.
 */
export function groundAt(places, x, y) {
  for (const p of places) {
    const lx = x - p.ox, ly = y - p.oy;
    if (lx < 0 || ly < 0 || lx >= p.map.width || ly >= p.map.height) continue;
    if ((p.map.paths || []).some((b) => inside(b, lx, ly))) return 'path';
    return p.map.kind === 'village' ? 'stone' : 'grass';
  }
  return 'void';
}

/** Paredes de todos os mapas visíveis, já deslocadas para coordenadas do mapa atual. */
export function visibleWalls(places) {
  const out = [];
  for (const p of places) for (const w of p.map.walls) out.push({ x: w.x + p.ox, y: w.y + p.oy, w: w.w, h: w.h, k: w.k });
  return out;
}

/** Nome do mapa para o aviso na tela ("Floresta"). */
export function mapName(maps, mapId) {
  return (maps && maps[mapId] && maps[mapId].name) || '';
}
