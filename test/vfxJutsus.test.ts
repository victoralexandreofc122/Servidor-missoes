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
      const fogo = /^(fire|heal|lightning)/.test(name);   // v73/v74: as folhas desenhadas têm quadros maiores (o leque, o raio, o chão)
      const lim = name === 'lightning_rede_01' ? 320 : /^lightning_4_0[3-6]$/.test(name) ? 210 : fogo ? 170 : 96;   // a Rede é a malha inteira; o Julgamento, o raio do céu
      assert.ok(w <= lim && h <= lim, `${name}: ${w}x${h} (reduzido para a escala do jogo)`);
      assert.ok(f.casas > 0 && f.casas <= (/^heal_(3|milagre)_/.test(name) ? 10 : fogo ? 9 : 6), `${name}: ${f.casas} casas`);   // zonas de raio 4
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

describe('v73/v74: as animações desenhadas dos jutsus de Fogo e de Cura (fogoAnim.js)', () => {
  const SKILLS = ['fire_2', 'fire_ryuka', 'fire_haiseki', 'fire_lamina', 'fire_marca', 'fire_3', 'fire_hotan', 'fire_chao', 'fire_cometa', 'fire_rugido',
    'fire_4', 'fire_coroa', 'fire_coluna', 'heal', 'heal_bisturi', 'heal_desintox', 'heal_palma', 'heal_agulha', 'heal_casca', 'heal_disturbio',
    'heal_2', 'heal_banho', 'heal_septica', 'heal_onda', 'heal_3', 'heal_meridianos', 'heal_milagre', 'heal_colosso', 'heal_4', 'heal_santuario',
    'lightning_corrente', 'lightning_impulso', 'lightning_shuriken', 'lightning_fluxo', 'lightning_2', 'lightning_volta', 'lightning_raio', 'lightning_correntes',
    'lightning_3', 'lightning_maos', 'lightning_rugido', 'lightning_4', 'lightning_ceu', 'lightning_armadura', 'lightning_risco'];
  // quadros por folha: 6; o Cometa veio sem o 5, a Desintoxicação com o 6 vazio, a Palma com 7
  const N: Record<string, number> = { fire_cometa: 5, heal_desintox: 5, heal_palma: 7, lightning_risco: 7 };
  it('cada jutsu tem os quadros da folha, e a Revoada e a Chuva têm as peças soltas (uma brasa, um meteoro)', () => {
    for (const s of SKILLS) {
      const n = FOGO_SPRITE_FRAMES.filter((f) => f.replace(/_0\d\w?$/, '') === s && /_0\d$/.test(f)).length;
      assert.equal(n, N[s] ?? 6, s);
    }
    assert.ok(FOGO_SPRITE_FRAMES.includes('lightning_rede_01'), 'a Rede de Faíscas veio num quadro só');
    for (const f of ['lightning_ceu_01b', 'lightning_ceu_03b', 'lightning_ceu_05b', 'lightning_ceu_06b', 'lightning_2_02b', 'lightning_2_05b', 'fire_2_04b', 'fire_2_05b', 'fire_2_06b', 'fire_4_01b', 'fire_4_04b', 'fire_4_05b', 'fire_4_06b']) assert.ok(FOGO_SPRITE_FRAMES.includes(f), f);
  });
  it('"heal" (a Cura) só fica pronta com os quadros dela, não com os dos outros jutsus de Cura', () => {
    const src = readFileSync(new URL('../public/vfxJutsus.js', import.meta.url), 'utf8');
    assert.match(src, /n\.replace\(\/_0\\d\\w\?\$\/, ''\) === base/);
  });
  it('os jutsus são os do servidor (pelo nome da folha)', () => {
    const src = ['jutsus', 'jutsusMecanicas', 'jutsusFase25', 'jutsusClasses'].map((f) => readFileSync(new URL(`../src/realtime/${f}.ts`, import.meta.url), 'utf8')).join('\n');
    for (const s of SKILLS) assert.match(src, new RegExp(`\\b${s}: \\{ (name|cost):`), s);
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
