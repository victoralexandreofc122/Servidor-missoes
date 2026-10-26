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
 * A casa (x, y) está na mancha da área? Área 'oval': só a elipse dentro da caixa, com a borda ondulada (sempre a mesma
 * ondulação para a mesma área), para o chão queimado ou batido não sair quadrado.
 */
function inArea(b, x, y) {
  if (!inside(b, x, y)) return false;
  if (b.shape !== 'oval') return true;
  const rx = b.w / 2, ry = b.h / 2;
  const nx = (x + 0.5 - b.x - rx) / rx, ny = (y + 0.5 - b.y - ry) / ry;
  const a = Math.atan2(ny, nx);
  const edge = 1 - 0.07 * (1 + Math.sin(a * 3 + b.x)) - 0.05 * (1 + Math.sin(a * 5 + b.y * 1.7));
  return nx * nx + ny * ny <= edge * edge;
}

/**
 * Chão da casa inteira (x, y), em coordenadas do mapa atual. As `areas` do layout pintam por
 * cima do chão padrão (a última da lista vale): 'stone' (pedra clara: ruas e praça), 'grass',
 * 'sand', 'water', 'bridge', 'path' (terra), 'wood' (assoalho), 'dirt' (terra solta), 'ash' (cinzas). Padrão: pedra
 * na Vila, grama escura ('darkgrass') na Floresta, assoalho nas lojas, terra solta na Zona e no Refúgio.
 * 'void' = fora do mundo (desenhado como mata fechada). `places` = placements(maps, mapId).
 */
export function groundAt(places, x, y) {
  for (const p of places) {
    const lx = x - p.ox, ly = y - p.oy;
    if (lx < 0 || ly < 0 || lx >= p.map.width || ly >= p.map.height) continue;
    const areas = p.map.areas || [];
    for (let i = areas.length - 1; i >= 0; i--) if (inArea(areas[i], lx, ly)) return areas[i].g;
    const k = p.map.kind;
    return k === 'village' ? 'stone' : k === 'interior' ? 'wood' : k === 'wild' ? 'dirt' : k === 'cave' ? 'cave' : 'darkgrass';
  }
  return 'void';
}

/** Tema de cores do mapa dono da casa (x, y): 'folha', 'nevoa', 'nuvem', 'areia', 'conflito', 'refugio' ou null. */
export function themeAt(places, x, y) {
  for (const p of places) {
    const lx = x - p.ox, ly = y - p.oy;
    if (lx < 0 || ly < 0 || lx >= p.map.width || ly >= p.map.height) continue;
    return p.map.theme || null;
  }
  return null;
}

/** Enfeites (bancos, lanternas...) de todos os mapas visíveis, em coordenadas do mapa atual. */
export function visibleDeco(places) {
  const out = [];
  for (const p of places) for (const d of p.map.deco || []) out.push({ ...d, x: d.x + p.ox, y: d.y + p.oy, t: p.map.theme });
  return out;
}

/** O ponto (posição do jogador) está numa zona segura do mapa? Mesma regra do servidor. */
export function inSafeZone(map, x, y) {
  return !!map && (map.safeZones || []).some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

/** A arena (área de luta, dentro da cerca) em que o ponto está, ou null. A mesma regra do servidor (maps.ts). */
export function arenaAt(map, x, y) {
  return (map && (map.arenas || []).find((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)) || null;
}

/**
 * Dois ninjas do mapa podem lutar? Só dentro da MESMA arena e os dois da vila dona dela (`look.village`).
 * Fora das arenas, nunca. O servidor confere de novo (inclusive os 5 s de quem acabou de renascer).
 */
export function arenaFoes(map, a, b) {
  if (!a || !b || a === b || a.dead || b.dead) return false;
  const arena = arenaAt(map, a.x, a.y);
  const v = (p) => (p.faction ? p.faction.village : p.look?.village);   // fim de jogo: a vila do servidor
  return !!arena && arena === arenaAt(map, b.x, b.y) && v(a) === arena.village && v(b) === arena.village;
}

/** Paredes de todos os mapas visíveis, já deslocadas para coordenadas do mapa atual. */
export function visibleWalls(places) {
  const out = [];
  for (const p of places) for (const w of p.map.walls) out.push({ x: w.x + p.ox, y: w.y + p.oy, w: w.w, h: w.h, k: w.k, s: w.s, t: p.map.theme });
  return out;
}

/** Nome do mapa para o aviso na tela ("Floresta"). */
export function mapName(maps, mapId) {
  return (maps && maps[mapId] && maps[mapId].name) || '';
}
