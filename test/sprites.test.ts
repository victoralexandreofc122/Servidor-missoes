import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  CLOTH_COLORS, EYE_COLORS, EYE_STYLES, GENDERS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES, VILLAGES, fromLegacy,
} from '../src/realtime/appearance.js';

// Módulos do cliente (JavaScript puro): importados direto de public/.
const S = await import(new URL('../public/sprites.js', import.meta.url).href);
const { SPRITES } = await import(new URL('../public/spriteData.js', import.meta.url).href);

const LOOK = {
  v: 2, gender: 'f', skin: 'canela', hairStyle: 'longo_lateral', hairColor: 'preto', eyeStyle: 'cilios', eyeColor: 'verde',
  outfit: 'vila', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_2',
};

describe('v9: sprites do personagem (cliente)', () => {
  it('as opções do Criador são as mesmas que o servidor aceita', () => {
    assert.deepEqual(S.OPTIONS.gender, [...GENDERS]);
    assert.deepEqual(S.OPTIONS.skin, [...SKIN_TONES]);
    assert.deepEqual(S.OPTIONS.hairStyle, [...HAIR_STYLES]);
    assert.deepEqual(S.OPTIONS.hairColor, [...HAIR_COLORS]);
    assert.deepEqual(S.OPTIONS.eyeStyle, [...EYE_STYLES]);
    assert.deepEqual(S.OPTIONS.eyeColor, [...EYE_COLORS]);
    assert.deepEqual(S.OPTIONS.outfit, [...OUTFITS]);
    assert.deepEqual(S.OPTIONS.shirtColor, [...CLOTH_COLORS]);
    assert.deepEqual(S.OPTIONS.village, [...VILLAGES]);
  });

  it('visual da rede: válido passa igual; campo estranho cai no padrão; formato antigo vira o mesmo que o servidor', () => {
    assert.deepEqual(S.normalizeLook(LOOK), LOOK);
    const odd = S.normalizeLook({ ...LOOK, skin: 'url(x)', hairColor: '<b>', bandana: 'sim', extra: 1 });
    assert.equal(odd.skin, S.DEFAULT_APPEARANCE.skin);
    assert.equal(odd.hairColor, S.DEFAULT_APPEARANCE.hairColor);
    assert.equal(odd.bandana, S.DEFAULT_APPEARANCE.bandana);
    assert.equal('extra' in odd, false);
    assert.deepEqual(S.normalizeLook(null), S.DEFAULT_APPEARANCE);
    for (const old of [
      { skin: '#f1c9a0', hair: '#2b2118', shirt: '#2f5d8a', pants: '#2a2a33', cape: '#8a2b2b' },
      { skin: '#8d5524', hair: '#e8c547', shirt: '#ff7700', pants: '#1f2a44', cape: '#2e8b57' },
      { skin: '#ffdbac', hair: '#d94848', shirt: '#2e8b57', pants: '#3b2f2f', cape: '#f0a03c' },
    ]) assert.deepEqual(S.normalizeLook(old), fromLegacy(old), JSON.stringify(old));
  });

  it('itens: camisa e calça só sem o conjunto; o símbolo da vila vai junto da bandana e da camisa', () => {
    assert.deepEqual(S.itemsFor(LOOK), {
      corpo: ['base'], olhos: ['cilios'], boca: ['sorriso'], cabelo: ['longo_lateral'],
      chapeu: ['bandana', 'simbolo_espiral'], conjunto: ['vila'], camisa: [], calca: [],
    });
    const basic = S.itemsFor({ ...LOOK, outfit: 'basica', bandana: false });
    assert.deepEqual([basic.chapeu, basic.conjunto, basic.camisa, basic.calca], [[], [], ['basica', 'simbolo_espiral'], ['basica']]);
  });

  it('conjunto e bandana têm as cores da VILA (travadas); camisa e calça, as do jogador', () => {
    const v2 = SPRITES.vilas.vila_2;
    const r = S.rampsFor(LOOK, 'conjunto');
    assert.deepEqual([r[5], r[6], r[7]], v2.conjunto.map((n: string) => SPRITES.paletas.roupa[n]));
    assert.deepEqual(S.rampsFor({ ...LOOK, shirtColor: 'vermelho' }, 'conjunto'), r, 'a cor da camisa não muda o conjunto');
    assert.deepEqual(S.rampsFor(LOOK, 'chapeu')[5], SPRITES.paletas.roupa[v2.bandana]);
    assert.deepEqual(S.rampsFor({ ...LOOK, shirtColor: 'vermelho' }, 'camisa')[5], SPRITES.paletas.roupa.vermelho);
    assert.deepEqual(S.rampsFor(LOOK, 'corpo')[2], SPRITES.paletas.pele.canela);
    assert.notEqual(S.colorKey(LOOK, 'camisa'), S.colorKey({ ...LOOK, shirtColor: 'vermelho' }, 'camisa'));
    assert.equal(S.colorKey(LOOK, 'corpo'), S.colorKey({ ...LOOK, shirtColor: 'vermelho' }, 'corpo'), 'cache do corpo não depende da roupa');
  });

  it('animação: parado respira, andar/correr seguem a fase dos passos, soco/chute/selo tocam e voltam', () => {
    assert.deepEqual(S.pickFrame({ dead: true, moving: true }, 0), { anim: 'parado', frame: 0 });
    const walk = [0, 1, 2, 3, 4].map((k) => S.pickFrame({ moving: true, walk: k * Math.PI + 0.1 }, 0).frame);
    assert.deepEqual(walk, [0, 1, 2, 1, 0], 'ida e volta: perna da frente, passagem, perna de trás');
    assert.equal(S.pickFrame({ moving: true, running: true, walk: 0.1 }, 0).anim, 'correr');
    const act = { kind: 'soco', start: 1000 };
    assert.deepEqual([1000, 1100, 1300, 2000].map((t) => S.pickFrame({ act }, t)), [
      { anim: 'ataque', frame: 1 }, { anim: 'ataque', frame: 0 }, { anim: 'ataque', frame: 1 }, S.pickFrame({}, 2000)]);
    assert.equal(S.pickFrame({ act: { kind: 'chute', start: 0 } }, 150).frame, 2);
    // jutsu: preparação (A), lançamento (B) e volta (A); meditando: carregar chakra (quadro 0 do jutsu), parado
    const cast = { kind: 'jutsu', start: 0 };
    assert.deepEqual([50, 200, 330, 500].map((t) => S.pickFrame({ act: cast }, t)), [
      { anim: 'jutsu', frame: 1 }, { anim: 'jutsu', frame: 2 }, { anim: 'jutsu', frame: 1 }, S.pickFrame({}, 500)]);
    assert.deepEqual(S.pickFrame({ meditating: true }, 1234), { anim: 'jutsu', frame: 0 });
    assert.deepEqual(S.pickFrame({ meditating: true, act: cast }, 200), { anim: 'jutsu', frame: 2 }, 'o jutsu toca por cima');
    const idle = new Set([0, 1300, 1500, 1800, 2000].map((t) => S.pickFrame({}, t).frame));
    assert.ok(idle.has(0) && idle.has(1), 'parado: o quadro muda com o tempo');
  });

  it('direção: frente, lado (esquerda), lado espelhado (direita) e costas', () => {
    assert.deepEqual([0, 1, 2, 3].map((d) => S.viewOf(d)), [[0, false], [1, false], [1, true], [2, false]]);
  });

  it('escala: ~1,5 tile de altura; inteira em pixels do aparelho quando dá 2 px ou mais (pixel art sem borrar)', () => {
    for (const [T, dpr] of [[35, 3], [45, 3], [48, 2], [64, 1], [28, 1], [12, 3]] as [number, number][]) {
      const s = S.spriteScale(T, dpr);
      const dev = s * dpr;
      if (dev >= 2) assert.equal(Math.abs(dev - Math.round(dev)) < 1e-9, true, `T ${T} dpr ${dpr}: ${dev} px do aparelho`);
      assert.ok(Math.abs((92 * s) / T - 1.5) <= 0.35, `T ${T} dpr ${dpr}: altura ${(92 * s / T).toFixed(2)} tiles`);
    }
  });

  it('atlas: todo item usado existe em todas as animações, vistas e quadros dos 2 gêneros; PNG do tamanho do manifesto', () => {
    for (const [g, info] of Object.entries<any>(SPRITES.generos)) {
      const png = readFileSync(new URL(`../public/${info.atlas}`, import.meta.url));
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], info.tamanho, `${g}: largura/altura`);
      const has = (prefix: string) => Object.keys(info.celulas).some((k) => k.startsWith(prefix));
      for (const anim of Object.keys(SPRITES.animacoes)) {
        for (let view = 0; view < 3; view++) {
          for (let frame = 0; frame < 3; frame++) {
            for (const [slot, item] of [['corpo', 'base'], ['cabelo', 'espetado'], ['cabelo', 'longo_lateral'], ['chapeu', 'bandana'],
              ['conjunto', 'vila'], ['camisa', 'basica'], ['calca', 'basica']]) {
              assert.ok([0, 1, 2, 3].some((pl) => info.celulas[`${anim}/${slot}/${item}/${pl}/${view}/${frame}`]),
                `${g} ${anim} ${slot}/${item} vista ${view} quadro ${frame}`);
            }
            if (view !== 2) assert.ok(has(`${anim}/olhos/cilios/1/${view}/${frame}`), `${g} ${anim} olhos vista ${view}`);
            assert.ok(info.ancoras[`${anim}/${view}/${frame}`]?.costas, `${g} ${anim}: âncora das costas`);
          }
        }
      }
    }
  });
});
