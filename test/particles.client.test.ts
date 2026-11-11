import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CLASSES, JUTSUS } from '../src/realtime/jutsus.js';
import { seededRandom } from './support/world.js';

/* v47: partículas dos jutsus (public/particles.js): um sistema só para os 100, por elemento e por forma. Só no cliente. */
const P = await import(new URL('../public/particles.js', import.meta.url).href);
const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const mk = () => new P.Particles(seededRandom(7));

describe('v47: partículas dos jutsus', () => {
  it('toda classe tem o seu elemento (10 classes), com cores, forma e vida; Teleporte e Substituição usam o vento', () => {
    for (const c of CLASSES) {
      const e = P.ELEMENTS[c];
      assert.ok(e, `sem partículas para ${c}`);
      assert.ok(e.colors.length >= 2 && e.life[1] > e.life[0] && e.size[1] > e.size[0], c);
      assert.equal(P.elementOf(c), c);
    }
    for (const j of JUTSUS) assert.ok(P.ELEMENTS[P.elementOf(j.mechanic)], j.code);
    assert.equal(P.elementOf('teleport'), 'wind');
    assert.equal(P.elementOf('coisa'), 'neutral');
    // os elementos se distinguem: fogo sobe, água e pedra caem, raio é zigue-zague, vento é risco, sombra é fumaça
    assert.ok(P.ELEMENTS.fire.g < 0 && P.ELEMENTS.water.g > 0 && P.ELEMENTS.stone.g > 0);
    assert.deepEqual([P.ELEMENTS.lightning.shape, P.ELEMENTS.wind.shape, P.ELEMENTS.shadow.shape, P.ELEMENTS.heal.shape], ['bolt', 'streak', 'smoke', 'plus']);
    assert.deepEqual(Object.keys(P.GROUND_ELEMENT).sort(), ['agua', 'armas', 'cura', 'fogo', 'ilusao', 'lama', 'sombra']);
  });

  it('emissores: estouro, faísca com clarão, cone, linha, anel; explosão maior solta mais', () => {
    const p = mk();
    p.burst('fire', 5, 5, 1);
    const small = p.count;
    assert.ok(small >= 8);
    p.burst('fire', 5, 5, 2.4, 2);
    assert.ok(p.count - small > small, 'a explosão solta mais que o golpe comum');
    const q = mk();
    q.spark('lightning', 3, 3, 1, 3);
    assert.ok(q.list.some((x: any) => x.shape === 'flash'), 'o clarão no alvo');
    assert.ok(q.list.filter((x: any) => x.shape !== 'flash').every((x: any) => x.vx > -0.5), 'a faísca vai para o lado contrário de quem bateu');
    const c = mk();
    c.cone('wind', 0, 0, 1, 0, 3, 60);
    assert.ok(c.list.every((x: any) => x.x >= -0.01 && Math.abs(Math.atan2(x.y, x.x || 1e-9)) <= Math.PI / 6 + 0.01), 'dentro do leque de 60°');
    const l = mk();
    l.line('shadow', 0, 0, 6, 0);
    assert.ok(l.list.every((x: any) => x.x >= 0 && x.x <= 6 && Math.abs(x.y) < 1e-9));
    const r = mk();
    r.ring('water', 0, 0, 3);
    assert.ok(r.list.every((x: any) => Math.hypot(x.x, x.y / 0.85) <= 3.01 && Math.hypot(x.x, x.y / 0.85) >= 1.6));
  });

  it('o tempo anda: o fogo sobe, a água cai, tudo some no fim da vida', () => {
    const f = mk(), w = mk();
    f.one('fire', 0, 0, 0, 0, { shape: 'dot' });
    w.one('water', 0, 0, 0, 0, { shape: 'dot' });
    for (let i = 0; i < 6; i++) { f.step(0.05); w.step(0.05); }
    assert.ok(f.list[0].y < 0, 'brasa sobe');
    assert.ok(w.list[0].y > 0, 'gota cai');
    for (let i = 0; i < 40; i++) { f.step(0.05); w.step(0.05); }
    assert.equal(f.count + w.count, 0);
  });

  it('teto de partículas e qualidade: reduzido solta menos; desligado, nada; o emissor contínuo não depende dos quadros', () => {
    const full = mk(), low = mk(), off = mk();
    low.setQuality('low');
    off.setQuality('off');
    for (let i = 0; i < 200; i++) { full.burst('fire', 0, 0, 3, 3); low.burst('fire', 0, 0, 3, 3); off.burst('fire', 0, 0, 3, 3); off.spark('fire', 0, 0); }
    assert.equal(full.count, P.PARTICLE_CAP.full);
    assert.equal(low.count, P.PARTICLE_CAP.low);
    assert.equal(off.count, 0);
    const a = mk(), b = mk();
    for (let i = 0; i < 60; i++) a.aura('fire', 0, 0, 1 / 60, 'k');      // 1 s a 60 quadros
    for (let i = 0; i < 20; i++) b.aura('fire', 0, 0, 1 / 20, 'k');      // 1 s a 20 quadros
    assert.ok(Math.abs(a.count - b.count) <= 1 && a.count >= 24, `${a.count} e ${b.count} em 1 s`);
  });

  it('o jogo usa: lançamento, projétil, impacto, acerto (faísca, clarão e tremor leve), zona, aviso, selos e Config.; o servidor não mudou', () => {
    const js = pub('game.js');
    for (const hook of ['castParticles(msg, form, info)', 'flying.set(msg.id', 'hitParticles(msg, target, mine)', 'particles.zone(', 'particles.aura(', 'particles.trail(', "drawParticles(toScreenX, toScreenY, T, viewW, viewH, now)", "$('vfx-quality')"]) {
      assert.ok(js.includes(hook), hook);
    }
    // toda forma de jutsu cai num emissor (as que voam ou caem no chão usam o rastro, o impacto e a zona)
    const start = js.indexOf('function castParticles('), block = js.slice(start, js.indexOf('function hitParticles('));
    const flyOrGround = new Set(['linha_explode', 'projetil', 'trilhas', 'leque', 'bumerangue', 'meteoros', 'nuvem_detona', 'zona', 'aviso', 'recuo', 'teleporte']);
    for (const j of JUTSUS) assert.ok(block.includes(`'${j.form}'`) || flyOrGround.has(j.form), `${j.code}: forma ${j.form} sem partículas`);
    assert.match(pub('index.html'), /id="vfx-quality"/);
    assert.match(js, /if \(particles\.quality === 'off'\) return;\n  state\.shakeUntil/);
  });
});
