import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLOTH_COLORS, EYE_COLORS, EYE_STYLES, GENDERS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES, VILLAGES, fromLegacy,
} from '../src/realtime/appearance.js';

// Módulos do cliente (JavaScript puro): importados direto de public/.
const S = await import(new URL('../public/sprites.js', import.meta.url).href);
const { SPRITES } = await import(new URL('../public/spriteData.js', import.meta.url).href);
const RIG = await import(new URL('../public/rig.js', import.meta.url).href);
const ART = await import(new URL('../public/rigArt.js', import.meta.url).href);
const F = await import(new URL('../public/figure.js', import.meta.url).href);

const LOOK = {
  v: 2, gender: 'f', skin: 'canela', hairStyle: 'longo_lateral', hairColor: 'preto', eyeStyle: 'cilios', eyeColor: 'verde',
  outfit: 'vila', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_4',
};

describe('v9 + v25: visual e boneco desenhado por código (cliente)', () => {
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

  it('camadas: camisa e calça básicas, ou o conjunto da vila por cima; bandana só com ela; sapato só calçado', () => {
    assert.deepEqual(S.layersFor(LOOK), ['corpo', 'olhos', 'boca', 'cabelo', 'camisa', 'calca', 'conjunto', 'acessorio', 'chapeu']);
    assert.deepEqual(S.layersFor({ ...LOOK, outfit: 'basica', bandana: false, shoes: 'botas_ninja' }),
      ['corpo', 'olhos', 'boca', 'cabelo', 'camisa', 'calca', 'sapato']);
  });

  it('conjunto e bandana têm as cores da VILA (travadas); camisa e calça, as do jogador', () => {
    const v4 = SPRITES.vilas.vila_4;
    const base = (name: string) => SPRITES.paletas.roupa[name][2];
    const hex = (m: any) => `#${m.rgb[2].map((v: number) => v.toString(16).padStart(2, '0')).join('')}`;
    const m = ART.materialsFor(LOOK);
    assert.deepEqual([hex(m.colete), hex(m.terno), hex(m.faixa_vila)], v4.conjunto.map(base));
    assert.equal(hex(m.bandana), base(v4.bandana));
    const red = ART.materialsFor({ ...LOOK, shirtColor: 'vermelho', pantsColor: 'verde' });
    assert.equal(hex(red.colete), hex(m.colete), 'a cor da camisa não muda o conjunto');
    assert.equal(hex(red.camisa), base('vermelho'));
    assert.equal(hex(red.calca), base('verde'));
    assert.equal(hex(m.pele), SPRITES.paletas.pele.canela[2]);
    assert.equal(hex(m.cabelo), SPRITES.paletas.cabelo.preto[2]);
  });

  it('animação: parado respira, andar/correr seguem a fase dos passos, golpes tocam uma vez e voltam, caído e meditando', () => {
    assert.equal(RIG.pickAnim({ dead: true, moving: true }, 0).anim, 'morto');
    assert.equal(RIG.pickAnim({ moving: true, walk: 0.1 }, 0).anim, 'andar');
    assert.equal(RIG.pickAnim({ moving: true, running: true, walk: 0.1 }, 0).anim, 'correr');
    const t = (walk: number) => RIG.pickAnim({ moving: true, walk }, 0).t;
    assert.ok(Math.abs(t(Math.PI) - 0.25) < 1e-9 && Math.abs(t(4 * Math.PI + 0.5) - t(0.5)) < 1e-9, '1 ciclo = 2 passos (4π de fase)');
    for (const kind of ['soco', 'chute', 'jutsu', 'golpe', 'dano']) {
      const act = { kind, start: 1000 };
      const ms = RIG.ANIMS[kind].ms;
      assert.deepEqual(RIG.pickAnim({ act }, 1000), { anim: kind, t: 0 }, kind);
      assert.equal(RIG.pickAnim({ act }, 1000 + ms / 2).t, 0.5, kind);
      assert.equal(RIG.pickAnim({ act }, 1000 + ms + 1).anim, 'parado', `${kind}: acabou, volta`);
    }
    assert.equal(RIG.pickAnim({ meditating: true }, 1234).anim, 'meditar');
    assert.equal(RIG.pickAnim({ meditating: true, act: { kind: 'jutsu', start: 0 } }, 200).anim, 'jutsu', 'o jutsu toca por cima');
    const idle = RIG.pickAnim({ seed: 0 }, 0), later = RIG.pickAnim({ seed: 0 }, 900);
    assert.equal(idle.anim, 'parado');
    assert.notEqual(idle.t, later.t, 'parado: a pose muda com o tempo');
    assert.notEqual(RIG.pickAnim({ seed: 0 }, 0).t, RIG.pickAnim({ seed: 700 }, 0).t, 'cada boneco respira no seu tempo');
  });

  it('esqueleto: pés no chão em toda pose, cabeça em cima, olha para onde o yaw manda', () => {
    for (const anim of Object.keys(RIG.ANIMS)) {
      for (const k of [0, 0.25, 0.5, 0.75]) {
        const pose = RIG.poseOf(anim, k);
        const S2 = RIG.solve(pose, 0, 'm');
        const low = Math.min(S2.J.heelL[1], S2.J.toeL[1], S2.J.heelR[1], S2.J.toeR[1]);
        assert.ok(Math.abs(low - (pose.air || 0)) < 1e-9, `${anim} ${k}: o pé mais baixo no chão (+ voo)`);
        assert.ok(S2.J.head[1] > S2.J.pelvis[1] || anim === 'morto', `${anim} ${k}: cabeça acima do quadril`);
      }
    }
    // De frente (yaw 0) o rosto vem para a câmera (+z); de lado (90°), para a direita da tela (+x).
    const front = RIG.solve(RIG.basePose(), 0, 'm'), right = RIG.solve(RIG.basePose(), Math.PI / 2, 'm');
    const fwd = (s: any) => RIG.apply(s.R.head, [0, 0, 1]);
    assert.ok(fwd(front)[2] > 0.99 && fwd(right)[0] > 0.99);
    // Pose neutra simétrica: a mão esquerda e a direita na mesma altura, uma de cada lado.
    assert.ok(Math.abs(front.J.handL[1] - front.J.handR[1]) < 1e-9 && Math.abs(front.J.handL[0] + front.J.handR[0]) < 1e-9);
  });

  it('pixel art: cabe na célula, de frente tem olhos e de costas não, a esquerda é o espelho da direita', () => {
    const eye = SPRITES.paletas.olho[LOOK.eyeColor];
    const colors = (f: any) => {
      const set = new Set<string>();
      for (let i = 0; i < f.rgba.length; i += 4) if (f.rgba[i + 3]) set.add(`#${[0, 1, 2].map((k) => f.rgba[i + k].toString(16).padStart(2, '0')).join('')}`);
      return set;
    };
    const fig = (dir: number, extra = {}) => ART.renderFigure({ ...LOOK, shoes: 'sandalia_ninja' }, RIG.poseOf('parado', 0.1), RIG.YAW_OF_DIR[dir], extra);
    const front = fig(0), back = fig(3), left = fig(1), right = fig(2);
    assert.ok(front.top >= 0 && front.top < 30, `alto da cabeça na linha ${front.top}`);
    assert.ok(colors(front).has(eye[2]) && !colors(back).has(eye[2]), 'íris de frente; de costas, não');
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 64; x++) {
        const a = (y * 64 + x) * 4, b = (y * 64 + 63 - x) * 4;
        for (let k = 0; k < 4; k++) assert.equal(left.rgba[a + k], right.rgba[b + k], `pixel ${x},${y}`);
      }
    }
    assert.equal(left.anchors.hand[3], (540 - right.anchors.hand[3]) % 360, 'a lâmina espelha também');
    // Pés na linha 92 (a mesma do boneco antigo): o jogo põe a célula no mesmo lugar.
    let lowest = 0;
    for (let i = 3; i < front.rgba.length; i += 4) if (front.rgba[i]) lowest = Math.max(lowest, Math.floor(i / 4 / 64));
    assert.ok(lowest >= 92 && lowest <= 94, `pé na linha ${lowest}`);
    // Capa: camada própria, com o emblema nas costas.
    const kage = ART.renderFigure(LOOK, RIG.poseOf('parado', 0.1), RIG.YAW_OF_DIR[3], { cape: 'manto_kage' });
    assert.ok(colors(kage).has('#c8321e') || [...colors(kage)].some((c) => c.startsWith('#c8')), 'manto do Kage com o 影 vermelho');
    const only = ART.renderFigure(LOOK, RIG.poseOf('parado', 0.1), 0, { only: ['cabelo'] });
    assert.ok(!colors(only).has(SPRITES.paletas.pele.canela[2]), 'só a camada do cabelo: sem pele');
  });

  it('cache do navegador: quadro de cada instante, giro em 16 passos pela frente, chave só do que muda o desenho', () => {
    assert.equal(F.frameIndex('andar', 0), 0);
    assert.equal(F.frameIndex('andar', 0.999), F.FRAMES.andar - 1);
    assert.equal(F.frameIndex('soco', 1), F.FRAMES.soco - 1, 'golpe: o último quadro é o fim');
    for (const anim of Object.keys(F.FRAMES)) {
      for (let i = 0; i < F.FRAMES[anim]; i++) assert.equal(F.frameIndex(anim, F.frameTime(anim, i)), i, `${anim} ${i}`);
    }
    assert.deepEqual([0, 1, 2, 3].map((d) => F.yawIndex(RIG.YAW_OF_DIR[d])), [0, 12, 4, 8]);
    // Meia-volta da esquerda para a direita passa pela frente (yaw 0), não pelas costas.
    let yaw = RIG.YAW_OF_DIR[1];
    const seen = [];
    for (let k = 0; k < 40; k++) { yaw = F.stepYaw(yaw, RIG.YAW_OF_DIR[2], 16); seen.push(yaw); }
    assert.ok(seen.some((y) => Math.abs(y) < 0.2) && !seen.some((y) => Math.abs(y) > 2.5), 'passa pela frente');
    assert.ok(Math.abs(seen[seen.length - 1] - Math.PI / 2) < 1e-9, 'chega');
    assert.equal(F.stepYaw(0, Math.PI / 2, 0), 0, 'sem tempo, não gira');
    assert.notEqual(F.lookKey(LOOK), F.lookKey({ ...LOOK, hairColor: 'loiro' }));
    assert.notEqual(F.lookKey(LOOK), F.lookKey(LOOK, { cape: 'manto_kage' }));
    assert.equal(F.lookKey(LOOK), F.lookKey({ ...LOOK, v: 2 }));
  });

  it('escala: ~1,5 tile de altura; inteira em pixels do aparelho quando dá 2 px ou mais (pixel art sem borrar)', () => {
    for (const [T, dpr] of [[35, 3], [45, 3], [48, 2], [64, 1], [28, 1], [12, 3]] as [number, number][]) {
      const s = S.spriteScale(T, dpr);
      const dev = s * dpr;
      if (dev >= 2) assert.equal(Math.abs(dev - Math.round(dev)) < 1e-9, true, `T ${T} dpr ${dpr}: ${dev} px do aparelho`);
      assert.ok(Math.abs((92 * s) / T - 1.5) <= 0.35, `T ${T} dpr ${dpr}: altura ${(92 * s / T).toFixed(2)} tiles`);
    }
  });

});
