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
    if (e.edge === 'east') out.push({ map: dest, ox: cur.width, oy: (-e.shift || 0) });
    else if (e.edge === 'west') out.push({ map: dest, ox: -dest.width, oy: (-e.shift || 0) });
    else if (e.edge === 'south') out.push({ map: dest, ox: (-e.shift || 0), oy: cur.height });
    else out.push({ map: dest, ox: (-e.shift || 0), oy: -dest.height });
  }
  return out;
}

const inside = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/**
 * Chão da casa inteira (x, y), em coordenadas do mapa atual. As `areas` do layout pintam por
 * cima do chão padrão (a última da lista vale): 'stone' (pedra clara: ruas e praça), 'grass',
 * 'sand', 'water', 'bridge', 'path' (terra), 'wood' (assoalho). Padrão: pedra na Vila, grama
 * escura ('darkgrass') na Floresta, assoalho nas lojas.
 * 'void' = fora do mundo (desenhado como mata fechada). `places` = placements(maps, mapId).
 */
export function groundAt(places, x, y) {
  for (const p of places) {
    const lx = x - p.ox, ly = y - p.oy;
    if (lx < 0 || ly < 0 || lx >= p.map.width || ly >= p.map.height) continue;
    const areas = p.map.areas || [];
    for (let i = areas.length - 1; i >= 0; i--) if (inside(areas[i], lx, ly)) return areas[i].g;
    return p.map.kind === 'village' ? 'stone' : p.map.kind === 'interior' ? 'wood' : 'darkgrass';
  }
  return 'void';
}

/** Enfeites (bancos, lanternas...) de todos os mapas visíveis, em coordenadas do mapa atual. */
export function visibleDeco(places) {
  const out = [];
  for (const p of places) for (const d of p.map.deco || []) out.push({ x: d.x + p.ox, y: d.y + p.oy, w: d.w, h: d.h, k: d.k });
  return out;
}

/** O ponto (posição do jogador) está numa zona segura do mapa? Mesma regra do servidor. */
export function inSafeZone(map, x, y) {
  return !!map && (map.safeZones || []).some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

/** Paredes de todos os mapas visíveis, já deslocadas para coordenadas do mapa atual. */
export function visibleWalls(places) {
  const out = [];
  for (const p of places) for (const w of p.map.walls) out.push({ x: w.x + p.ox, y: w.y + p.oy, w: w.w, h: w.h, k: w.k, s: w.s });
  return out;
}

/** Nome do mapa para o aviso na tela ("Floresta"). */
export function mapName(maps, mapId) {
  return (maps && maps[mapId] && maps[mapId].name) || '';
}
