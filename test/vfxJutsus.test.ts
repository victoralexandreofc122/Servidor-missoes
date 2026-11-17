import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FOGO_SPRITE_FRAMES, JUTSU_SPRITES, JUTSU_SPRITE_FRAMES, loadPublicFiles } from '../src/web/staticFiles.js';

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
      const fogo = name.startsWith('fire_');   // v73: as folhas do Fogo têm quadros maiores (o leque, o raio, o chão)
      assert.ok(w <= (fogo ? 170 : 96) && h <= (fogo ? 170 : 96), `${name}: ${w}x${h} (reduzido para a escala do jogo)`);
      assert.ok(f.casas > 0 && f.casas <= (fogo ? 9 : 6), `${name}: ${f.casas} casas`);
      if (f.eixoPx) assert.ok(f.arte !== undefined && f.eixoPx > 0, `${name}: eixo sem direção`);
      assert.ok(['glow', 'screen', 'lighter', 'normal'].includes(f.blend), `${name}: mistura`);
      if (f.ancora) assert.ok(f.ancora[0] >= 0 && f.ancora[0] <= w && f.ancora[1] >= 0 && f.ancora[1] <= h, `${name}: âncora`);
    }
  });

  it('o servidor serve o código e todos os quadros (lista fechada)', () => {
    const routes = new Set(loadPublicFiles().map((f) => f.route));
    for (const r of ['/vfxJutsus.js', '/vfxFogo.js', '/fogoAnim.js']) assert.ok(routes.has(r), r);
    for (const n of JUTSU_SPRITE_FRAMES) assert.ok(routes.has(`/assets/vfx/${n}.png`), n);
  });

  it('sem os quadros carregados, nada toca (o jogo cai no desenho antigo)', () => {
    const fx = new J.JutsuSprites();
    assert.equal(J.jutsuSpritesReady('fogo'), false);
    assert.equal(fx.show('fogo_01', 0, 0, 0, 100), false);
    assert.equal(fx.launch(1, 'fogo_02', 0, 0, 1, 0, 10, 5, 0), false);
  });
});

describe('v73: as animações desenhadas dos 10 jutsus de Fogo (fogoAnim.js)', () => {
  const SKILLS = ['fire_2', 'fire_ryuka', 'fire_haiseki', 'fire_lamina', 'fire_marca', 'fire_3', 'fire_hotan', 'fire_chao', 'fire_cometa', 'fire_rugido'];
  it('cada jutsu tem os quadros da folha (6; o Cometa Rasteiro veio sem o 5) e a Revoada tem a brasa, a explosão e a fumaça soltas', () => {
    for (const s of SKILLS) {
      const n = FOGO_SPRITE_FRAMES.filter((f) => /^\w+_0\d$/.test(f) && f.startsWith(`${s}_0`)).length;
      assert.equal(n, s === 'fire_cometa' ? 5 : 6, s);
    }
    for (const f of ['fire_2_04b', 'fire_2_05b', 'fire_2_06b']) assert.ok(FOGO_SPRITE_FRAMES.includes(f), f);
  });
  it('os jutsus são os do servidor (pelo nome da folha)', () => {
    const src = readFileSync(new URL('../src/realtime/jutsus.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/realtime/jutsusMecanicas.ts', import.meta.url), 'utf8')
      + readFileSync(new URL('../src/realtime/jutsusFase25.ts', import.meta.url), 'utf8');
    for (const s of SKILLS) assert.match(src, new RegExp(`\\b${s}: \\{ name:`), s);
  });
  it('sem os quadros carregados, as funções não desenham (o jogo usa o efeito antigo)', async () => {
    const F = await import(new URL('../public/fogoAnim.js', import.meta.url).href);
    const fx = new J.JutsuSprites();
    const msg = { skill: 'fire_ryuka', playerId: 'a', x: 0, y: 0, fx: 1, fy: 0 };
    assert.equal(F.fogoCast(fx, msg, {}, { tx: 8, ty: 0 }, 0, () => null), false);
    assert.equal(F.fogoProjectileFrame({ skill: 'fire_2' }), null);
    assert.equal(F.fogoGround(fx, { skill: 'fire_chao', kind: 'fogo', x: 0, y: 0, r: 2.5, ms: 4000 }, 0), false);
    assert.equal(fx.list.length, 0);
  });
  it('o servidor avisa o jogo quando a Marca pega alguém (só visual)', () => {
    const src = readFileSync(new URL('../src/realtime/gameWorld.ts', import.meta.url), 'utf8');
    assert.match(src, /combo: 'marca', ms: cfg\.brandMs/);
  });
});
