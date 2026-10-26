import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardinal as serverCardinal, laneOffsets as serverLanes } from '../src/realtime/combat.js';

/*
 * Mira das habilidades em linha no cliente (public/aim.js): só nas 4 direções, a MESMA regra do servidor; prévia com o
 * caminho, as casas e o primeiro alvo; arrastar escolhe, voltar ao meio cancela.
 */
const A = await import(new URL('../public/aim.js', import.meta.url).href);

describe('mira (aim.js)', () => {
  it('cardinal e trilhas: iguais às do servidor', () => {
    for (const [dx, dy] of [[3, 1], [-0.2, -5], [-2, 2], [0, 0], [0.01, -0.02], [5, 5]] as const) {
      assert.deepEqual(A.cardinal(dx, dy), serverCardinal(dx, dy), `${dx},${dy}`);
    }
    for (const n of [1, 2, 3, 5]) assert.deepEqual(A.laneOffsets(n, 0.7), serverLanes(n, 0.7));
  });

  it('toque rápido: no focado (mesmo longe); sem foco, no inimigo mais perto no alcance; ninguém, para onde olha', () => {
    const me = { x: 10, y: 10 };
    assert.deepEqual(A.autoAim(me, { x: 30, y: 12 }, [], 4, [0, 1]), [1, 0]);
    assert.deepEqual(A.autoAim(me, null, [{ x: 10.5, y: 7 }, { x: 4, y: 10 }], 4, [0, 1]), [0, -1]);
    assert.deepEqual(A.autoAim(me, null, [{ x: 20, y: 10 }], 4, [-1, 0]), [-1, 0], 'longe demais: para onde olha');
  });

  it('arrastar: além da zona morta vira direção; voltar ao meio depois de arrastar cancela', () => {
    assert.deepEqual(A.dragAim(5, 3, false), { dragged: false, canceled: false, dir: null });
    assert.deepEqual(A.dragAim(30, -40, false), { dragged: true, canceled: false, dir: [0, -1] });
    assert.deepEqual(A.dragAim(2, 2, true), { dragged: true, canceled: true, dir: null });
    assert.deepEqual(A.dragAim(-40, 10, true), { dragged: true, canceled: false, dir: [-1, 0] });
  });

  it('prévia: para na parede, para no primeiro alvo e conta as casas; as Kunais têm 3 trilhas', () => {
    const walls = [{ x: 16, y: 0, w: 1, h: 30 }];
    const info = { range: 9, mechanic: 'fire', radius: 2 };
    const me = { x: 10.5, y: 10.5 };
    const free = A.aimPaths(me, [1, 0], info, walls, [], 40, 40);
    assert.deepEqual(free.dir, [1, 0]);
    const p = free.paths[0];
    assert.ok(p.wall && p.to.x < 16 - 0.29 && p.to.x > 15.4, `parou na parede: ${p.to.x}`);
    assert.deepEqual(A.tilesOnPath(p.from, p.to).map((c: { x: number }) => c.x), [11, 12, 13, 14, 15]);
    const hit = A.aimPaths(me, [0.9, 0.2], info, walls, [{ x: 13.5, y: 10.8 }, { x: 12, y: 13 }], 40, 40).paths[0];
    assert.deepEqual([hit.hit.x, hit.hit.y], [13.5, 10.8], 'o da linha, não o de fora');
    assert.ok(Math.abs(hit.to.x - 13.5) < 1e-9);
    const kunai = A.aimPaths(me, [0, -1], { range: 4, shots: 3, laneGap: 0.7 }, [], [], 40, 40);
    assert.deepEqual(kunai.paths.map((q: { from: { x: number } }) => Math.round(q.from.x * 100) / 100), [10.5, 9.8, 11.2]);
    for (const q of kunai.paths) assert.ok(Math.abs(q.to.y - 6.5) < 1e-9, 'todas vão 4 casas para cima');
  });
});
