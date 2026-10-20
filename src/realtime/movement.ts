/*
 * A função de movimento do jogador: a MESMA conta roda no servidor (autoridade) e no
 * cliente (predição, public/movement.js). O teste test/movement.test.ts confere que as
 * duas dão exatamente o mesmo resultado; mexeu aqui, mexa lá.
 *
 * Regras:
 *  - direção (dx, dy) do joystick; vetor maior que 1 (diagonal) é normalizado;
 *  - anda `dist` casas, sem sair do mapa;
 *  - paredes (casas da vila) bloqueiam: eixo X e depois Y, então o jogador "desliza" na parede;
 *  - borda com saída (crossExit): empurrando para fora, dentro do portão, passa para o mapa vizinho;
 *  - posição sempre com 3 casas decimais (milésimo de casa): o cliente refaz a conta a partir da posição que o
 *    servidor manda (também com 3 casas) e chega no mesmo número.
 * Math.sqrt e não Math.hypot: o hypot pode variar no último dígito entre navegadores.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Raio do jogador para a colisão (casas). */
export const PLAYER_RADIUS = 0.3;

export const q3 = (n: number): number => Math.round(n * 1000) / 1000;

const clamp = (n: number, min: number, max: number) => (n < min ? min : n > max ? max : n);

export function blocked(x: number, y: number, walls: readonly Box[]): boolean {
  for (const b of walls) {
    if (x > b.x - PLAYER_RADIUS && x < b.x + b.w + PLAYER_RADIUS && y > b.y - PLAYER_RADIUS && y < b.y + b.h + PLAYER_RADIUS) return true;
  }
  return false;
}

/** Um passo de movimento. Devolve a posição nova [x, y]. */
export function stepMove(
  x: number, y: number, dx: number, dy: number, dist: number,
  width: number, height: number, walls: readonly Box[],
): [number, number] {
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

/** O mínimo de um mapa que a movimentação precisa (o layout completo está em maps.ts). */
export interface MoveMap {
  width: number;
  height: number;
  walls: readonly Box[];
  exits: readonly { edge: 'east' | 'west' | 'north' | 'south'; from: number; to: number; map: string; shift: number }[];
}

/**
 * Atravessar a borda. Só vale para quem ESTÁ na borda (posição já calculada, encostada no
 * limite do mapa) e empurra PARA FORA, dentro do trecho da saída. Chega na borda oposta do
 * mapa vizinho; se lá estiver bloqueado, não atravessa. Paredes não se atravessam: para
 * encostar na borda o jogador já passou pela colisão (stepMove), então só passa pelo portão.
 */
export function crossExit(
  maps: Readonly<Record<string, MoveMap>>, mapId: string, x: number, y: number, dx: number, dy: number,
): [string, number, number] | null {
  const m = maps[mapId];
  if (!m) return null;
  for (const e of m.exits) {
    let along: number;
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
export function moveStep(
  maps: Readonly<Record<string, MoveMap>>, mapId: string, x: number, y: number, dx: number, dy: number, dist: number,
): [string, number, number] {
  const m = maps[mapId];
  if (!m) return [mapId, x, y];
  const [nx, ny] = stepMove(x, y, dx, dy, dist, m.width, m.height, m.walls);
  return crossExit(maps, mapId, nx, ny, dx, dy) ?? [mapId, nx, ny];
}
