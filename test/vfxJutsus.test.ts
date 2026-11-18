import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CAMADAS_FRAMES, FOGO_SPRITE_FRAMES, JUTSU_SPRITES, JUTSU_SPRITE_FRAMES, loadPublicFiles } from '../src/web/staticFiles.js';

/* v56: os sprites desenhados pelo Victor (Teleporte, Substituição, Fogo, Sopro, Névoa e Linha), 3 quadros cada. */
const J = await import(new URL('../public/vfxJutsus.js', import.meta.url).href);
const { VFX_CAMADAS } = await import(new URL('../public/vfxCamadas.js', import.meta.url).href);

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
      if (f.quadros) continue;   // v78: as camadas em grade têm o teste delas (abaixo)
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

describe('v78: as camadas do PixelFX que complementam as folhas desenhadas (camadasJutsus.js)', () => {
  // os 50 jutsus desenhados: os 4 de Fogo da v56 e os 46 das folhas (v73 a v77)
  const DESENHADOS = ['fire', 'fire_endan', 'fire_kasumi', 'fire_hibashiri', ...new Set(FOGO_SPRITE_FRAMES.map((f) => f.replace(/_0\d\w?$/, '')))];
  const src = readFileSync(new URL('../public/camadasJutsus.js', import.meta.url), 'utf8');

  it('os 50 jutsus desenhados têm camadas (lançamento, impacto ou chão)', () => {
    assert.equal(DESENHADOS.length, 50);
    for (const s of DESENHADOS) assert.match(src, new RegExp(`case '${s}':`), s);
  });

  it('toda camada usada existe na tabela gerada, e toda camada gerada é usada', () => {
    const usadas = new Set([...src.matchAll(/'(pfx_\w+)'/g)].map((m) => m[1] ?? ''));
    for (const el of ['fogo', 'cura', 'raio']) usadas.add(`pfx_${el}_carga`);   // a carga dos selos: `pfx_${el}_carga`
    for (const n of usadas) assert.ok(VFX_CAMADAS[n], `${n}: não existe em vfxCamadas.js`);
    for (const n of Object.keys(VFX_CAMADAS)) assert.ok(usadas.has(n), `${n}: gerada e não usada`);
    assert.deepEqual(Object.keys(VFX_CAMADAS).sort(), [...CAMADAS_FRAMES].sort());
  });

  it('cada folha é a grade da cor em cima e a da luz embaixo, com a âncora dentro do quadro', () => {
    let total = 0;
    for (const [name, f] of Object.entries<any>(VFX_CAMADAS)) {
      const [w, h] = pngSize(name);
      const rows = Math.ceil(f.quadros / f.cols);
      assert.deepEqual([w, h], [f.cols * f.quadro[0], rows * f.quadro[1] * 2], `${name}: grade`);
      assert.ok(w <= 2048, `${name}: largura ${w}`);
      assert.ok(f.ancora[0] >= 0 && f.ancora[0] <= f.quadro[0] && f.ancora[1] >= 0 && f.ancora[1] <= f.quadro[1], `${name}: âncora`);
      assert.ok(f.casas > 0 && f.casas <= 9 && f.ms > 0 && f.quadros > 0, `${name}: tamanho e tempo`);
      assert.ok(['normal', 'glow', 'screen', 'lighter'].includes(f.blend), `${name}: mistura`);
      total += readFileSync(new URL(`../public/assets/vfx/${name}.png`, import.meta.url)).length;
    }
    assert.ok(total < 1_000_000, `as camadas pesam ${total} bytes (o celular baixa tudo no começo)`);
  });

  it('sem as folhas carregadas, as camadas não desenham (nem por cima do desenho antigo)', async () => {
    const C = await import(new URL('../public/camadasJutsus.js', import.meta.url).href);
    const fx = new J.JutsuSprites();
    const msg = { skill: 'fire_coroa', playerId: 'a', x: 0, y: 0, fx: 1, fy: 0 };
    assert.equal(C.camadasCast(fx, msg, {}, { tx: 5, ty: 0 }, 0, () => null), false);
    assert.equal(C.camadasCastStart(fx, { skill: 'fire_rugido', ms: 500 }, { id: 'a' }, 0, () => null), false);
    assert.equal(C.camadasImpact(fx, { x: 0, y: 0, r: 2 }, 'fire', 0), false);
    assert.equal(C.camadasGround(fx, { skill: 'fire_4', kind: 'aviso', x: 0, y: 0, r: 1.3, ms: 800 }, 0), false);
    assert.equal(fx.layer('pfx_fogo_anel', 0, 0, 0), false);
    assert.equal(fx.list.length, 0);
  });

  it('o jogo chama as camadas nos mesmos pontos das folhas', () => {
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    for (const f of ['camadasCast(', 'camadasCastStart(', 'camadasImpact(', 'camadasGround(', 'camadasMarca(', 'camadasDetona(']) assert.ok(game.includes(f), f);
  });

  it('os créditos do PixelFX (MIT) vêm junto', () => {
    assert.match(readFileSync(new URL('../arte/pixelfx/LICENSE-pixelfx', import.meta.url), 'utf8'), /MIT License/);
    assert.match(readFileSync(new URL('../public/vfxCamadas.js', import.meta.url), 'utf8'), /PixelFX .*MIT/);
  });
});
