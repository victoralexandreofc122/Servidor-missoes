import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JUTSU_BY_CODE } from '../src/realtime/jutsus.js';
import { EFFECT_CODES } from '../src/realtime/effects.js';

/* v48: desenhos próprios dos jutsus marcantes e dos efeitos no alvo (public/jutsuArt.js). Só no cliente. */
const A = await import(new URL('../public/jutsuArt.js', import.meta.url).href);
const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

/** Contexto falso: conta as chamadas de desenho (o teste só confere que desenha sem erro). */
function fakeCtx() {
  const calls: Record<string, number> = {};
  const grad = { addColorStop() {} };
  return new Proxy({ calls } as any, {
    get(t, k: string) {
      if (k === 'calls') return calls;
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k in t) return t[k];
      return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
}

describe('v48: desenhos próprios dos jutsus', () => {
  it('toda zona e todo aviso com desenho é de um jutsu que existe e tem essa forma', () => {
    for (const code of Object.keys(A.ZONE_ART)) assert.equal(JUTSU_BY_CODE.get(code)?.form, 'zona', code);
    for (const code of Object.keys(A.STRIKE_ART)) assert.ok(['aviso', 'meteoros', 'transformacao'].includes(JUTSU_BY_CODE.get(code)?.form ?? ''), code);
    for (const code of ['fire_4', 'lightning_4', 'water_4', 'water_xarope', 'shadow_4', 'illusion_templo', 'weapons_4', 'heal_3', 'stone_2', 'wind_3']) {
      assert.ok(A.ZONE_ART[code] || A.STRIKE_ART[code], `${code} sem desenho próprio`);
    }
    for (const e of A.STATUS_ART) assert.ok((EFFECT_CODES as readonly string[]).includes(e), e);
  });

  it('cada desenho roda sem erro e desenha alguma coisa; jutsu sem desenho devolve false (fica o círculo de sempre)', () => {
    for (const code of Object.keys(A.ZONE_ART)) {
      const g = fakeCtx();
      assert.equal(A.drawZoneArt(g, code, 100, 100, 60, 32, 0.5, 1234, 7), true, code);
      assert.ok((g.calls.fill ?? 0) + (g.calls.stroke ?? 0) > 0, code);
    }
    for (const code of Object.keys(A.STRIKE_ART)) {
      for (const k of [0, 0.5, 1]) assert.equal(A.drawStrikeArt(fakeCtx(), code, 100, 100, 60, 32, k, 1234, 7), true, code);
    }
    assert.equal(A.drawZoneArt(fakeCtx(), 'fire', 0, 0, 10, 32, 0, 0, 1), false);
    assert.equal(A.drawStrikeArt(fakeCtx(), 'fire', 0, 0, 10, 32, 0, 0, 1), false);
    for (const kind of ['cratera', 'queimado']) A.drawDecal(fakeCtx(), kind, 50, 50, 30, 32, 0.4, 3);
    A.drawWindDisc(fakeCtx(), 50, 50, 32, 100);
  });

  it('relâmpago: sai de um ponto e chega no outro, muda a cada quadro e é o mesmo para a mesma semente', () => {
    const a = A.boltPath(0, 0, 200, 0, 5, 1), b = A.boltPath(0, 0, 200, 0, 5, 2);
    assert.deepEqual(a[0], [0, 0]);
    assert.deepEqual(a.at(-1), [200, 0]);
    assert.ok(a.length >= 5 && a.slice(1, -1).some((p: number[]) => Math.abs(p[1]!) > 1), 'zigue-zague');
    assert.notDeepEqual(a, b);
    assert.deepEqual(a, A.boltPath(0, 0, 200, 0, 5, 1));
    const g = fakeCtx();
    A.drawBolt(g, 0, 0, 200, 0, 32, 1000, 5);
    assert.ok(g.calls.stroke >= 10, 'contorno, borda e miolo, com galhos');
  });

  it('efeitos no alvo: só desenha os que estão valendo agora; queimadura, ferida, paralisia, lentidão, silêncio, preso e atordoado', () => {
    const now = 1000;
    assert.equal(A.drawStatusArt(fakeCtx(), {}, false, false, 0, 0, 32, now, 1), 0);
    assert.equal(A.drawStatusArt(fakeCtx(), { queimadura: now - 1 }, false, false, 0, 0, 32, now, 1), 0, 'já acabou');
    assert.equal(A.drawStatusArt(fakeCtx(), { queimadura: now + 500 }, false, false, 0, 0, 32, now, 1), 1);
    assert.equal(A.drawStatusArt(fakeCtx(), { queimadura: now + 500, ferida: now + 500, paralisia: now + 500, lentidao: now + 500, silencio: now + 500, molhado: now + 9, veneno: now + 9 }, true, true, 0, 0, 32, now, 1), 9);
  });

  it('o jogo usa: zona, aviso por cima dos bonecos, cratera, raio desenhado, disco e efeitos no alvo; desligado em Config. não desenha', () => {
    const js = pub('game.js');
    for (const hook of ['drawZoneArt(ctx, z.skill', 'drawStrikeArt(ctx, z.skill', "kind: 'cratera'", "kind: 'bolt'", 'drawWindDisc(ctx', 'drawStatusArt(ctx, e.fx', 'drawArtTop(toScreenX, toScreenY, T, now)', 'drawDecals(toScreenX, toScreenY, T, now)']) {
      assert.ok(js.includes(hook), hook);
    }
    assert.match(js, /function drawArtTop\([^)]*\) \{\n  if \(particles\.quality === 'off'\) return;/);
  });
});
