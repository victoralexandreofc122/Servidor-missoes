// Mira das habilidades EM LINHA (Fogo, Sombra, Relâmpago, Kunais): só nas 4 direções (cima, baixo, esquerda, direita).
// Funções PURAS (sem DOM, sem rede): o jogo usa no navegador e os testes usam no Node. Unidades: casas.
//
// Como se mira (estilo LoL / Brawl Stars): segurar o botão da habilidade e arrastar escolhe a direção (a prévia em
// ciano mostra o caminho, até onde vai e quantas casas pega); soltar lança. Arrastar e voltar para o meio do botão
// cancela. Toque rápido: o SERVIDOR escolhe a direção que passa mais perto do alvo focado. O servidor confere tudo de
// novo (alcance, parede, quem foi atingido): a prévia é só para quem está mirando.

import { blocked } from './movement.js';

/** Quanto o dedo precisa arrastar (px, na escala dos botões) para virar mira. */
export const AIM_DEAD_PX = 18;
/** Segurou mais que isto sem arrastar: a prévia aparece na direção automática (e solta nela). */
export const HOLD_MS = 200;
/** "Corpo" do alvo para as linhas: o mesmo HIT_RADIUS do servidor (combat.ts). */
export const HIT_RADIUS = 0.5;

/** Direção cardinal mais perto de (dx, dy): o eixo maior (empate: horizontal). Parado: para baixo. A MESMA do servidor. */
export function cardinal(dx, dy) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [0, 1];
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

/** Deslocamento de lado de cada trilha (Kunais): a do meio, depois as dos lados. O MESMO do servidor. */
export function laneOffsets(n, gap) {
  const out = [0];
  for (let k = 1; out.length < n; k++) {
    out.push(-gap * k);
    if (out.length < n) out.push(gap * k);
  }
  return out;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Direção do toque rápido (e da prévia antes de arrastar): a cardinal até o alvo focado (mesmo longe); sem foco, até
 * o inimigo mais perto no alcance; ninguém, para onde o boneco olha.
 */
export function autoAim(me, focus, foes, range, facing) {
  if (focus) return cardinal(focus.x - me.x, focus.y - me.y);
  let best = null, bestD = Infinity;
  for (const f of foes) {
    const d = dist(me, f);
    if (d <= range && d < bestD) { best = f; bestD = d; }
  }
  if (best) return cardinal(best.x - me.x, best.y - me.y);
  return cardinal(facing[0], facing[1]);
}

/** Até onde a linha vai de (x, y) na direção (ux, uy), no máximo `range`: o último ponto livre a cada 0,05 casa. */
function rayEnd(x, y, ux, uy, range, walls, width, height) {
  let best = { x, y };
  const n = Math.ceil(range / 0.05 - 1e-9);
  for (let i = 1; i <= n; i++) {
    const d = Math.min(range, i * 0.05);
    const nx = x + ux * d, ny = y + uy * d;
    if (nx < 0 || ny < 0 || nx > width || ny > height || blocked(nx, ny, walls)) break;
    best = { x: nx, y: ny };
  }
  return best;
}

/** O primeiro de `foes` que a linha a→b encosta (raio HIT_RADIUS), e onde. */
function firstOnLine(a, b, foes) {
  const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
  let best = null;
  for (const f of foes) {
    const k = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((f.x - a.x) * vx + (f.y - a.y) * vy) / len2));
    const px = a.x + vx * k, py = a.y + vy * k;
    if (Math.hypot(px - f.x, py - f.y) > HIT_RADIUS + 1e-9) continue;
    if (best && k >= best.k) continue;
    best = { target: f, at: { x: px, y: py }, k };
  }
  return best;
}

/**
 * Casas que a linha atravessa de `from` até `to` (sem a casa de onde sai): { x, y } de cada uma, em ordem.
 * É o "quantas casas pega" da prévia.
 */
export function tilesOnPath(from, to) {
  const out = [];
  const seen = new Set([`${Math.floor(from.x)},${Math.floor(from.y)}`]);
  const len = dist(from, to);
  const n = Math.ceil(len / 0.1);
  for (let i = 1; i <= n; i++) {
    const k = Math.min(1, (i * 0.1) / (len || 1));
    const tx = Math.floor(from.x + (to.x - from.x) * k), ty = Math.floor(from.y + (to.y - from.y) * k);
    const key = `${tx},${ty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: tx, y: ty });
  }
  return out;
}

/**
 * Os caminhos da prévia, um por trilha (as Kunais têm 3): de onde sai, até onde vai (parede ou alcance), onde iria
 * sem nada no caminho (`reach`, o alcance inteiro) e o primeiro alvo que pega (`hit`, ou null). `walls` sem os vãos
 * (o que voa passa por cima). `info` = o catálogo do welcome (range, radius, shots, laneGap).
 */
export function aimPaths(me, dir, info, walls, foes, width, height) {
  const [ux, uy] = cardinal(dir[0], dir[1]);
  const range = info.range ?? 4;
  const lanes = laneOffsets(Math.max(1, info.shots ?? 1), info.laneGap ?? 0.7);
  const out = [];
  for (const off of lanes) {
    const from = { x: me.x - uy * off, y: me.y + ux * off };
    if (off !== 0 && blocked(from.x, from.y, walls)) continue;
    const end = rayEnd(from.x, from.y, ux, uy, range, walls, width, height);
    const hit = firstOnLine(from, end, foes);
    const to = hit ? hit.at : end;
    out.push({ from, to, reach: { x: from.x + ux * range, y: from.y + uy * range }, hit: hit ? hit.target : null, wall: !hit && dist(from, end) < range - 0.06 });
  }
  return { dir: [ux, uy], paths: out };
}

/**
 * Estado da mira enquanto o dedo segura o botão: arrastou além da zona morta = direção escolhida; voltou para o meio
 * depois de ter arrastado = cancelar. Devolve { dragged, canceled, dir }.
 */
export function dragAim(dx, dy, wasDragged, deadPx = AIM_DEAD_PX) {
  if (Math.hypot(dx, dy) >= deadPx) return { dragged: true, canceled: false, dir: cardinal(dx, dy) };
  return { dragged: wasDragged, canceled: wasDragged, dir: null };
}
