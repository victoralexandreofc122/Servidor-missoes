/*
 * Geometria e regras puras do combate (sem rede, sem estado global): fáceis de testar.
 * Distâncias em casas (tiles). Ângulos em graus.
 */

export interface Point {
  x: number;
  y: number;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * O ponto `target` está no cone que sai de `origin` na direção (fx, fy)?
 * Quem está "em cima" do jogador (menos de 0,3 casa) conta como dentro.
 */
export function inCone(origin: Point, fx: number, fy: number, target: Point, range: number, coneDeg: number): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d < 0.3) return true;
  const facing = Math.hypot(fx, fy) || 1;
  const cos = (dx * fx + dy * fy) / (d * facing);
  return cos >= Math.cos(((coneDeg / 2) * Math.PI) / 180);
}

/** O mais perto de `origin` dentro de `range` (ou undefined). */
export function nearest<T extends Point>(origin: Point, candidates: Iterable<T>, range: number, accept: (c: T) => boolean = () => true): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    if (!accept(c)) continue;
    const d = distance(origin, c);
    if (d <= range && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Escudo de Pedra: reduz o dano pela fração `reduction` (0,5 = metade), arredondando para cima. */
export function shieldedDamage(amount: number, reduction: number): number {
  return Math.ceil(amount * (1 - reduction));
}

/**
 * Ponto aleatório (inteiro) num anel em volta de `center`, entre `inner` e `outer` casas,
 * com distribuição uniforme na área. `random` devolve [0, 1).
 */
export function randomInRing(center: Point, inner: number, outer: number, random: () => number): Point {
  const angle = random() * Math.PI * 2;
  const r = Math.sqrt(inner * inner + random() * (outer * outer - inner * inner));
  return { x: Math.round(center.x + Math.cos(angle) * r), y: Math.round(center.y + Math.sin(angle) * r) };
}

/** Os 8 vizinhos de uma casa (passo de 1 casa, inclusive diagonais). */
export const STEPS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
