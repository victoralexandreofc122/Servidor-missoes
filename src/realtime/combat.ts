/*
 * Geometria e regras puras do combate (sem rede, sem estado global): fáceis de testar.
 * Distâncias em casas (tiles). Ângulos em graus.
 */

export interface Point {
  x: number;
  y: number;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// ------------------------------------------------------------------ hitboxes
//
// Formas de acerto (o SERVIDOR decide quem foi atingido; o cliente só desenha):
//   arco    Ataque Básico: o corte em volta do corpo
//   cone    Água: leque largo saindo do jogador
//   círculo Fogo (explosão), Ilusão (em volta do jogador), Taijutsu (na frente, depois do avanço), Cura
//   linha   Relâmpago, Sombra e os projéteis (Fogo, Kunais): pega quem a linha encosta

/** "Corpo" de um alvo para as linhas: o tiro pega quem passa a até meia casa dele. */
export const HIT_RADIUS = 0.5;
/** Arco: a ponta do setor fica meia casa ATRÁS do jogador (quem está colado do lado também apanha). */
export const ARC_BACK = 0.5;
/** Taijutsu: o centro do golpe fica 0,75 casa na frente de onde o avanço parou. */
export const STRIKE_AHEAD = 0.75;

/** Direção (fx, fy) normalizada; parado/sem direção: para baixo (0, 1). */
export function unit(fx: number, fy: number): [number, number] {
  const len = Math.hypot(fx, fy);
  return len > 1e-9 ? [fx / len, fy / len] : [0, 1];
}

/** Direção girada `deg` graus (positivo = sentido horário na tela, onde y cresce para baixo). */
export function rotate(fx: number, fy: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [fx * c - fy * s, fx * s + fy * c];
}

/** O ponto `dist` casas à frente de `origin` na direção (fx, fy). */
export function ahead(origin: Point, fx: number, fy: number, dist: number): Point {
  const [ux, uy] = unit(fx, fy);
  return { x: origin.x + ux * dist, y: origin.y + uy * dist };
}

/** Círculo: `target` a até `radius` casas de `center` (a borda conta). */
export function isInCircle(center: Point, radius: number, target: Point): boolean {
  return distance(center, target) <= radius + 1e-9;
}

/** Setor (fatia de pizza) com a ponta em `apex`: base do cone e do arco. */
function inSector(apex: Point, fx: number, fy: number, target: Point, radius: number, angleDeg: number): boolean {
  const dx = target.x - apex.x;
  const dy = target.y - apex.y;
  const d = Math.hypot(dx, dy);
  if (d > radius + 1e-9) return false;
  if (d < 0.3) return true;
  const [ux, uy] = unit(fx, fy);
  return (dx * ux + dy * uy) / d >= Math.cos(((angleDeg / 2) * Math.PI) / 180) - 1e-9;
}

/**
 * Cone (Água): `target` está no leque de `range` casas e `coneDeg` graus que sai de `origin`
 * na direção (fx, fy)? Quem está "em cima" do jogador (menos de 0,3 casa) conta como dentro.
 * Atrás do jogador, nunca.
 */
export function isInCone(origin: Point, fx: number, fy: number, target: Point, range: number, coneDeg: number): boolean {
  return inSector(origin, fx, fy, target, range, coneDeg);
}

/**
 * Arco (Ataque Básico): o corte corpo a corpo, de `radius` casas e `arcDeg` graus na direção
 * (fx, fy). É um setor com a ponta recuada `ARC_BACK` para trás do jogador: o golpe passa em
 * volta do corpo, então quem está colado do lado também apanha. O alcance conta do jogador.
 */
export function isInArc(origin: Point, fx: number, fy: number, target: Point, radius: number, arcDeg: number): boolean {
  if (distance(origin, target) > radius + 1e-9) return false;
  const [ux, uy] = unit(fx, fy);
  const apex = { x: origin.x - ux * ARC_BACK, y: origin.y - uy * ARC_BACK };
  return inSector(apex, ux, uy, target, radius + ARC_BACK, arcDeg);
}

/** Onde, de 0 (em `a`) a 1 (em `b`), fica o ponto do segmento a→b mais perto de `p`. */
function along(a: Point, b: Point, p: Point): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
}

/** Linha (segmento a→b) x círculo: a linha passa a até `radius` casas de `center`? */
export function lineIntersects(a: Point, b: Point, center: Point, radius: number): boolean {
  const k = along(a, b, center);
  return Math.hypot(a.x + (b.x - a.x) * k - center.x, a.y + (b.y - a.y) * k - center.y) <= radius + 1e-9;
}

/**
 * O PRIMEIRO alvo que a linha a→b encontra (o mais perto de `a` ao longo dela), com o ponto da
 * linha onde bateu (`at`) e quanto da linha andou até lá (`k`, de 0 a 1).
 */
export function firstOnLine<T extends Point>(a: Point, b: Point, candidates: Iterable<T>, radius = HIT_RADIUS): { target: T; at: Point; k: number } | undefined {
  let best: { target: T; at: Point; k: number } | undefined;
  for (const c of candidates) {
    if (!lineIntersects(a, b, c, radius)) continue;
    const k = along(a, b, c);
    if (best && k >= best.k) continue;
    best = { target: c, at: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, k };
  }
  return best;
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

/** Um ponto do rastro de um ninja: onde ele estava no instante `t` (ms do relógio do servidor). */
export interface TrailPoint extends Point {
  t: number;
}

/**
 * Compensação de lag: onde o ninja estava no instante `when`, pelo rastro (um ponto por tick, do mais antigo para o
 * mais novo). Entre dois pontos, na reta; antes do rastro, o ponto mais antigo; depois dele (ou sem rastro), `current`.
 */
export function pointAt(trail: readonly TrailPoint[], when: number, current: Point): Point {
  const last = trail[trail.length - 1];
  if (!last || when >= last.t) return { x: current.x, y: current.y };
  const first = trail[0]!;
  if (when <= first.t) return { x: first.x, y: first.y };
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i - 1]!;
    if (when >= a.t) {
      const b = trail[i]!;
      const f = (when - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: first.x, y: first.y };
}
