import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ITEMS } from '../src/realtime/items.js';
import { loadPublicFiles } from '../src/web/staticFiles.js';

/*
 * Efeitos dos golpes e armas em pixel art (arte/armas-vfx): os dados gerados batem com os PNGs, tudo é
 * servido pela lista fechada, e toda arma da loja tem arte no boneco.
 */
const { VFX } = await import(new URL('../public/vfxData.js', import.meta.url).href);
const { ARMAS } = await import(new URL('../public/weaponData.js', import.meta.url).href);
const { SPRITES } = await import(new URL('../public/spriteData.js', import.meta.url).href);
const V = await import(new URL('../public/vfx.js', import.meta.url).href);
const W = await import(new URL('../public/weapons.js', import.meta.url).href);

const pngSize = (file: string) => {
  const png = readFileSync(new URL(`../public/${file}`, import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file}: PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('VFX: folhas dos efeitos', () => {
  it('cada folha tem de 1 a 8 quadros do tamanho dos dados, numa linha só; âncora dentro do quadro', () => {
    for (const [name, e] of Object.entries<any>(VFX.efeitos)) {
      assert.ok(e.quadros >= 1 && e.quadros <= 8, `${name}: ${e.quadros} quadros`);
      assert.deepEqual(pngSize(e.arquivo), [e.quadro[0] * e.quadros, e.quadro[1]], name);
      assert.ok(e.ancora[0] >= 0 && e.ancora[0] <= e.quadro[0] && e.ancora[1] >= 0 && e.ancora[1] <= e.quadro[1], `${name}: âncora`);
      assert.ok([1, 2].includes(e.px) && e.ms > 0, name);
    }
  });

  it('todo golpe tem o seu efeito (o cliente toca pelo nome)', () => {
    for (const name of ['slash', 'hit', 'punch', 'dust', 'smoke', 'fireball', 'explosion', 'water', 'lightning', 'spark',
      'shadow', 'bind', 'illusion', 'heal', 'stone', 'kunai']) assert.ok(VFX.efeitos[name], name);
    assert.equal(VFX.efeitos.explosion.raio, 2, 'explosão desenhada para o raio da hitbox (2 casas)');
    assert.equal(VFX.efeitos.illusion.raio, 3);
    assert.equal(VFX.efeitos.water.alcance, 4);
    assert.ok(VFX.efeitos.lightning.linha && VFX.efeitos.shadow.linha, 'raio e sombra são cortados no ponto do acerto');
  });

  it('VFXManager: sem as folhas carregadas (fora do navegador) não toca nada e avisa (o jogo usa o efeito antigo)', () => {
    const m = new V.VFXManager();
    assert.equal(m.play('explosion', 1, 1), false);
    assert.equal(m.launch(1, 'fireball', 0, 0, 1, 0, 12, 5, 0), false);
    assert.equal(m.list.length, 0);
    assert.equal(V.vfxDuration('slash'), VFX.efeitos.slash.quadros * VFX.efeitos.slash.ms);
    assert.equal(V.vfxReady('slash'), false);
  });
});

describe('armas no boneco', () => {
  const sheets = (a: any) => ['mao', 'costas', 'bainha'].filter((k) => a[k]).map((k) => [k, a[k]] as const);

  it('toda arma da loja (e os pergaminhos) tem arte de onde ela fica parada (mão ou costas)', () => {
    for (const item of ITEMS) {
      if (item.kind !== 'weapon' && item.kind !== 'scroll') continue;
      const art = ARMAS.armas[W.weaponArt(item.code)];
      assert.ok(art, `${item.code} sem arte`);
      assert.equal(art.onde, item.hold === 'hand' ? 'mao' : 'costas', item.code);
      assert.ok(art[art.onde], `${item.code}: arte de ${art.onde}`);
    }
    assert.equal(W.weaponArt('scroll_fire'), 'scroll');
    assert.equal(W.weaponSlot('katana'), 'costas');
    assert.equal(W.weaponSlot('kunai'), 'mao');
    assert.equal(W.weaponSlot('nada'), undefined);
  });

  it('armas das costas vão para a mão no golpe (a espada deixa a bainha vazia); o pergaminho fica nas costas', () => {
    for (const code of ['katana', 'fuma_shuriken']) assert.equal(W.drawnForStrike(code), true, code);
    for (const code of ['scroll_fire', 'kunai', 'tanto']) assert.equal(W.drawnForStrike(code), false, code);
    assert.ok(ARMAS.armas.katana.bainha, 'bainha vazia da espada');
    for (const item of ITEMS) {
      if (item.kind === 'weapon') assert.ok(ARMAS.armas[item.code].mao, `${item.code}: arte na mão (o Ataque Básico é com ela)`);
    }
  });

  it('folhas: 16 ângulos (mão) ou 3 vistas (costas e bainha), do tamanho dos dados', () => {
    for (const [code, a] of Object.entries<any>(ARMAS.armas)) {
      for (const [kind, sh] of sheets(a)) {
        const n = kind === 'mao' ? 16 : 3;
        if (kind === 'mao') assert.equal(sh.angulos, 16, code);
        else assert.equal(sh.desloc.length, 3, `${code} ${kind}`);
        assert.deepEqual(pngSize(sh.arquivo), [sh.quadro[0] * n, sh.quadro[1]], `${code} ${kind}`);
      }
    }
    assert.ok(ARMAS.armas.katana.costas.quadro[0] >= 64, 'espada longa grande nas costas');
  });

  it('ângulo -> quadro: o mais perto, de 22,5° em 22,5°, girando para os dois lados', () => {
    assert.deepEqual([0, 11, 12, 90, 180, -90, 359, 720].map(W.angleFrame), [0, 0, 1, 4, 8, 12, 0, 0]);
  });

  it('âncora da mão em todas as vistas traz o ângulo da lâmina; o golpe tem os 3 quadros em todas', () => {
    for (const [g, info] of Object.entries<any>(SPRITES.generos)) {
      for (const [key, an] of Object.entries<any>(info.ancoras)) {
        assert.ok(an.mao, `${g} ${key}: mão`);
        assert.equal(an.mao.length, 4, `${g} ${key}`);
        assert.ok(Number.isInteger(an.mao[3]) && an.mao[3] >= -180 && an.mao[3] <= 180, `${g} ${key}: ${an.mao[3]}`);
      }
      for (let view = 0; view < 3; view++) for (let f = 0; f < 3; f++) assert.ok(info.ancoras[`golpe/${view}/${f}`], `${g} golpe ${view}/${f}`);
    }
    assert.ok(SPRITES.animacoes.golpe, 'animação do golpe com arma');
  });
});

describe('lista fechada de arquivos (staticFiles)', () => {
  it('serve cada folha dos dados como image/png em bytes, e nenhuma a mais', () => {
    const files = loadPublicFiles();
    const served = new Set(files.filter((f) => f.route.startsWith('/assets/')).map((f) => f.route));
    const weaponSheets = Object.values<any>(ARMAS.armas).flatMap((a) => ['mao', 'costas', 'bainha'].filter((k) => a[k]).map((k) => a[k]));
    const wanted = new Set([...Object.values<any>(VFX.efeitos), ...weaponSheets].map((x) => `/${x.arquivo}`));
    assert.deepEqual([...served].sort(), [...wanted].sort());
    for (const f of files.filter((x) => x.route.startsWith('/assets/'))) {
      assert.equal(f.contentType, 'image/png', f.route);
      assert.ok(Buffer.isBuffer(f.body), f.route);
    }
    for (const route of ['/vfx.js', '/vfxData.js', '/weapons.js', '/weaponData.js']) {
      assert.equal(files.find((f) => f.route === route)?.contentType, 'text/javascript; charset=utf-8', route);
    }
  });
});
