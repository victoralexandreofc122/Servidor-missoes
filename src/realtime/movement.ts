/*
 * A função de movimento do jogador: a MESMA conta roda no servidor (autoridade) e no
 * cliente (predição, public/movement.js). O teste test/movement.test.ts confere que as
 * duas dão exatamente o mesmo resultado; mexeu aqui, mexa lá.
 *
 * Regras:
 *  - direção (dx, dy) do joystick; vetor maior que 1 (diagonal) é normalizado;
 *  - anda `dist` casas, sem sair do mapa;
 *  - paredes (casas da vila) bloqueiam: eixo X e depois Y, então o jogador "desliza" na parede;
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
