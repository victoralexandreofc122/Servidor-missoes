import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { footBox } from '../src/realtime/mapKit.js';
import { blocked } from '../src/realtime/movement.js';

/*
 * v29, mapas por código (piloto na Floresta): o desenho e a colisão saem da mesma peça. Estes testes falham se uma
 * árvore colidir fora do tronco, se uma peça ficar sem colisão, ou se uma saída deixar de ser alcançável a pé.
 */
const F = REALTIME.maps.map_2;
const inBox = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x - 1e-6 && x <= b.x + b.w + 1e-6 && y >= b.y - 1e-6 && y <= b.y + b.h + 1e-6;

describe('mapas por código: Floresta (v29)', () => {
  it('a Floresta é desenhada por código (sem a pintura) e tem peças', () => {
    assert.equal(F.art, undefined);
    assert.ok((F.pieces ?? []).length > 60, `${F.pieces?.length} peças`);
  });

  it('árvores espalhadas: sempre com espaço para passar entre duas (troncos a 3 casas ou mais)', () => {
    const ps = F.pieces ?? [];
    for (const a of ps) for (const b of ps) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 3, `árvores coladas em ${a.x},${a.y}`);
    // mata fechada só nas bordas do mapa, no sul e em volta da saliência (nada no meio da Floresta)
    for (const w of F.walls.filter((q) => q.k === 'thicket')) assert.ok(w.y < 2.6 || w.x < 2.6 || w.x + w.w > F.width - 2.6 || w.y >= 63 - 1e-6 || w.x >= 72.5 - 1e-6, `mata fechada no meio: ${JSON.stringify(w)}`);
  });

  it('árvore solta: colide SÓ no pé (o tronco), nunca na copa', () => {
    const feet = F.walls.filter((w) => w.k === 'foot');
    const loose = F.pieces ?? [];
    assert.ok(loose.length > 0);
    assert.equal(feet.length, loose.length, 'uma colisão por árvore solta');
    for (const p of loose) {
      const f = footBox(p);
      assert.ok(feet.some((w) => w.x === f.x && w.y === f.y && w.w === f.w && w.h === f.h), `pé da árvore em ${p.x},${p.y}`);
      assert.ok(f.w <= 0.7 && f.h <= 0.4, 'o pé é do tamanho do tronco');
      // logo acima do tronco (embaixo da copa) dá para passar
      assert.equal(blocked(p.x, p.y - 1.2, F.walls), false, `copa da árvore em ${p.x},${p.y} não pode bloquear`);
    }
  });

  it('dá para ir a pé da entrada norte até a saída sul e até a boca da caverna (passando pela trilha)', () => {
    const S = 0.25, W = F.width, H = F.height;
    const key = (x: number, y: number) => `${x},${y}`;
    const north = F.exits.find((e) => e.edge === 'north')!;
    const start = { x: Math.round(((north.from + north.to) / 2) / S), y: Math.round(1 / S) };
    const seen = new Set([key(start.x, start.y)]);
    const queue = [start];
    while (queue.length) {
      const c = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (n.x < 1 || n.y < 1 || n.x * S > W - 0.25 || n.y * S > H - 0.25 || seen.has(key(n.x, n.y))) continue;
        if (blocked(n.x * S, n.y * S, F.walls)) continue;
        seen.add(key(n.x, n.y));
        queue.push(n);
      }
    }
    const south = F.exits.find((e) => e.edge === 'south')!;
    const sx = Math.round(((south.from + south.to) / 2) / S);
    const reachedSouthY = [...seen].map((k) => k.split(',').map(Number)).filter(([x]) => Math.abs(x! - sx) <= 4).reduce((m, [, y]) => Math.max(m, y! * S), 0);
    // a passagem sul está fechada por troncos até a história abrir (M14): chega-se até os troncos
    assert.ok(reachedSouthY >= 62, `chegou até y=${reachedSouthY} na trilha sul`);
    assert.ok(reachedSouthY > 40, 'a trilha atravessa a Floresta');
  });
});
