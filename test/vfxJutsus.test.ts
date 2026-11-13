import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JUTSU_SPRITES, JUTSU_SPRITE_FRAMES, loadPublicFiles } from '../src/web/staticFiles.js';

/* v56: os sprites desenhados pelo Victor (Teleporte, Substituição, Fogo, Sopro, Névoa e Linha), 3 quadros cada. */
const J = await import(new URL('../public/vfxJutsus.js', import.meta.url).href);

const pngSize = (name: string) => {
  const png = readFileSync(new URL(`../public/assets/vfx/${name}.png`, import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${name}: PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)] as const;
};

describe('v56: sprites dos jutsus (vfxJutsus.js)', () => {
  it('os 6 jutsus têm os 3 quadros, e a lista do código bate com a do servidor', () => {
    assert.equal(JUTSU_SPRITES.length, 6);
    assert.deepEqual(Object.keys(J.FRAMES).sort(), [...JUTSU_SPRITE_FRAMES].sort());
  });

  it('cada quadro é um PNG pequeno (escala do jogo), com tamanho em casas e âncora dentro da imagem', () => {
    for (const [name, f] of Object.entries<any>(J.FRAMES)) {
      const [w, h] = pngSize(name);
      assert.ok(w <= 96 && h <= 96, `${name}: ${w}x${h} (reduzido para a escala do jogo)`);
      assert.ok(f.casas > 0 && f.casas <= 6, `${name}: ${f.casas} casas`);
      assert.ok(['glow', 'screen', 'lighter', 'normal'].includes(f.blend), `${name}: mistura`);
      if (f.ancora) assert.ok(f.ancora[0] >= 0 && f.ancora[0] <= w && f.ancora[1] >= 0 && f.ancora[1] <= h, `${name}: âncora`);
    }
  });

  it('o servidor serve o código e os 18 quadros (lista fechada)', () => {
    const routes = new Set(loadPublicFiles().map((f) => f.route));
    assert.ok(routes.has('/vfxJutsus.js'));
    for (const n of JUTSU_SPRITE_FRAMES) assert.ok(routes.has(`/assets/vfx/${n}.png`), n);
  });

  it('sem os quadros carregados, nada toca (o jogo cai no desenho antigo)', () => {
    const fx = new J.JutsuSprites();
    assert.equal(J.jutsuSpritesReady('fogo'), false);
    assert.equal(fx.show('fogo_01', 0, 0, 0, 100), false);
    assert.equal(fx.launch(1, 'fogo_02', 0, 0, 1, 0, 10, 5, 0), false);
  });
});
