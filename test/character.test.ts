import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Módulo do cliente (JavaScript puro): importado direto de public/.
const { DEFAULT_LOOK, dirFrom, drawCharacter, PRESETS, safeLook, shade } = await import(new URL('../public/character.js', import.meta.url).href);

/** Contexto de canvas falso: conta as operações de desenho. */
function fakeCtx() {
  const ops: string[] = [];
  const fills = new Set<string>();
  return {
    ops, fills,
    set fillStyle(v: string) { fills.add(v); },
    fillRect() { ops.push('rect'); },
    beginPath() {},
    arc() { ops.push('arc'); },
    fill() {},
  };
}

describe('paperdoll (cliente)', () => {
  it('leve: no máximo ~20 retângulos e 1 círculo por boneco, em qualquer direção, andando ou parado', () => {
    for (const dir of [0, 1, 2, 3]) {
      for (const moving of [false, true]) {
        const g = fakeCtx();
        drawCharacter(g, 100, 100, 40, DEFAULT_LOOK, dir, 1.2, moving);
        assert.ok(g.ops.filter((o) => o === 'rect').length <= 20, `dir ${dir}: ${g.ops.length} operações`);
        assert.equal(g.ops.filter((o) => o === 'arc').length, 1);
      }
    }
  });

  it('cada parte usa a cor do jogador (pele, cabelo, camisa, calça, capa)', () => {
    const look = { skin: '#111111', hair: '#222222', shirt: '#333333', pants: '#444444', cape: '#555555' };
    const g = fakeCtx();
    drawCharacter(g, 100, 100, 40, look, 3, 0, false);   // de costas: a capa aparece por cima
    for (const c of Object.values(look)) assert.ok(g.fills.has(c), c);
  });

  it('andando: a fase muda o desenho (pernas/braços balançam); parado: a fase não importa', () => {
    const snap = (phase: number, moving: boolean) => {
      const calls: number[][] = [];
      const g = { set fillStyle(_v: string) {}, fillRect: (...a: number[]) => calls.push(a), beginPath() {}, arc() {}, fill() {} };
      drawCharacter(g, 100, 100, 40, DEFAULT_LOOK, 2, phase, moving);
      return JSON.stringify(calls);
    };
    assert.notEqual(snap(0.5, true), snap(2.5, true));
    assert.equal(snap(0.5, false), snap(2.5, false));
  });

  it('cor estranha vinda da rede nunca chega ao canvas (cai na cor padrão)', () => {
    assert.deepEqual(safeLook({ skin: 'url(x)', hair: '#ABCDEF', shirt: 'red', pants: null, cape: '#123' }),
      { skin: DEFAULT_LOOK.skin, hair: '#ABCDEF', shirt: DEFAULT_LOOK.shirt, pants: DEFAULT_LOOK.pants, cape: DEFAULT_LOOK.cape });
    assert.deepEqual(safeLook(undefined), DEFAULT_LOOK);
  });

  it('direção igual à do servidor; sombra escurece a cor; paletas prontas válidas', () => {
    assert.deepEqual([dirFrom(0, 1), dirFrom(-1, 0), dirFrom(1, 0), dirFrom(0, -1)], [0, 1, 2, 3]);
    assert.equal(shade('#ffffff', 0.5), '#808080');
    for (const p of PRESETS) assert.deepEqual(safeLook(p), p);
  });
});
