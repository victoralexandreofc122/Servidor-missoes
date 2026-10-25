/*
 * IA dos monstros (v18, docs/netcode.md, PvE): uma máquina de estados LEVE.
 *
 *   parado    anda à toa dentro da zona de caça (1 casa por ~1 s). Alguém entra no raio de aggro, ou bate nele: persegue.
 *   persegue  vai atrás do alvo (quem mais bateu nele; senão o mais perto) e bate quando encosta. A direção é
 *             recalculada a cada `thinkMs` (não a cada tick); o passo desvia de parede (reto, ±45°, ±90°).
 *   volta     o alvo fugiu além da corda, morreu, saiu do mapa ou entrou em zona segura: volta para a zona sem ouvir
 *             ninguém e, chegando, recupera a vida toda (não dá para puxar o monstro para longe e matá-lo de graça).
 *
 * Boneco de treino (stationary) e monstro sem `ai` não perseguem. Atordoado, preso ou dormindo não anda.
 * Funções puras aqui; o mundo (gameWorld.ts) decide o alvo e manda as posições.
 */
import type { Point } from './combat.js';
import type { Box } from './movement.js';

export type MonsterMind = 'idle' | 'chase' | 'return';

/** O ponto da zona mais perto de `p` (o próprio `p`, se já estiver dentro). A zona vai de x até x + w (sem incluir). */
export function closestInBox(box: Box, p: Point): Point {
  return {
    x: Math.min(Math.max(p.x, box.x), box.x + box.w - 0.01),
    y: Math.min(Math.max(p.y, box.y), box.y + box.h - 0.01),
  };
}

/** Quanto falta para entrar na zona (0 = dentro). */
export function distanceToBox(box: Box, p: Point): number {
  const c = closestInBox(box, p);
  return Math.hypot(c.x - p.x, c.y - p.y);
}

const TRY_DEG = [0, 45, -45, 90, -90];

/**
 * Um passo de `len` casas a partir de `from` na direção (ux, uy), desviando do que não está livre: tenta reto, depois
 * ±45° e ±90°. null = preso (fica parado e pensa de novo no próximo `thinkMs`).
 */
export function steer(from: Point, ux: number, uy: number, len: number, free: (x: number, y: number) => boolean): Point | null {
  for (const deg of TRY_DEG) {
    const r = (deg * Math.PI) / 180;
    const dx = ux * Math.cos(r) - uy * Math.sin(r);
    const dy = ux * Math.sin(r) + uy * Math.cos(r);
    const x = from.x + dx * len;
    const y = from.y + dy * len;
    if (free(x, y)) return { x, y };
  }
  return null;
}
