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
 * Reconciliação: parte da posição OFICIAL do servidor (que já aplicou tudo até o `ack`)
 * e refaz as entradas que ele ainda não confirmou. Resultado = onde o jogador deve estar agora.
 */
export function replay(x, y, pending, distOf, width, height, walls) {
  let px = x, py = y;
  for (const input of pending) [px, py] = stepMove(px, py, input.dx, input.dy, distOf(input), width, height, walls);
  return [px, py];
}
