// A função de movimento do jogador: CÓPIA FIEL de src/realtime/movement.ts (servidor).
// O cliente usa para prever o próprio movimento na hora; o servidor usa como autoridade.
// test/movement.test.ts confere que as duas dão exatamente o mesmo resultado.

export const PLAYER_RADIUS = 0.3;

export const q3 = (n) => Math.round(n * 1000) / 1000;

const clamp = (n, min, max) => (n < min ? min : n > max ? max : n);

export function blocked(x, y, walls) {
  for (const b of walls) {
    if (x > b.x - PLAYER_RADIUS && x < b.x + b.w + PLAYER_RADIUS && y > b.y - PLAYER_RADIUS && y < b.y + b.h + PLAYER_RADIUS) return true;
  }
  return false;
}

/** Um passo de movimento. Devolve a posição nova [x, y]. */
export function stepMove(x, y, dx, dy, dist, width, height, walls) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0 || dist <= 0) return [x, y];
  const k = len > 1 ? dist / len : dist;
  const stuck = blocked(x, y, walls);   // já dentro de uma parede (não deveria): deixa sair
  let nx = q3(clamp(x + dx * k, 0, width));
  if (!stuck && blocked(nx, y, walls)) nx = x;
  let ny = q3(clamp(y + dy * k, 0, height));
  if (!stuck && blocked(nx, ny, walls)) ny = y;
  return [nx, ny];
}

/**
 * Atravessar a borda (cópia de crossExit do servidor). Só quem ESTÁ na borda e empurra para
 * fora, dentro do trecho da saída; chega na borda oposta do vizinho (se não estiver bloqueado).
 */
export function crossExit(maps, mapId, x, y, dx, dy) {
  const m = maps[mapId];
  if (!m) return null;
  for (const e of m.exits) {
    let along;
    if (e.edge === 'east' && dx > 0 && x >= m.width) along = y;
    else if (e.edge === 'west' && dx < 0 && x <= 0) along = y;
    else if (e.edge === 'south' && dy > 0 && y >= m.height) along = x;
    else if (e.edge === 'north' && dy < 0 && y <= 0) along = x;
    else continue;
    if (along < e.from || along > e.to) continue;
    const dest = maps[e.map];
    if (!dest) continue;
    const a = q3(along + e.shift);
    const [nx, ny] = e.edge === 'east' ? [0, a] : e.edge === 'west' ? [dest.width, a] : e.edge === 'south' ? [a, 0] : [a, dest.height];
    if (blocked(nx, ny, dest.walls)) continue;
    return [e.map, nx, ny];
  }
  return null;
}

/** Um passo num mundo de vários mapas: anda no mapa atual e, se for o caso, atravessa a borda. */
export function moveStep(maps, mapId, x, y, dx, dy, dist) {
  const m = maps[mapId];
  if (!m) return [mapId, x, y];
  const [nx, ny] = stepMove(x, y, dx, dy, dist, m.width, m.height, m.walls);
  return crossExit(maps, mapId, nx, ny, dx, dy) ?? [mapId, nx, ny];
}

/**
 * Reconciliação: parte da posição OFICIAL do servidor (mapa + posição, já com tudo até o
 * `ack`) e refaz as entradas que ele ainda não confirmou, inclusive trocas de mapa.
 */
export function replay(maps, mapId, x, y, pending, distOf) {
  let m = mapId, px = x, py = y;
  for (const input of pending) [m, px, py] = moveStep(maps, m, px, py, input.dx, input.dy, distOf(input));
  return [m, px, py];
}
