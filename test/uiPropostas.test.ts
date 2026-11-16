import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { blocked } from '../src/realtime/movement.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * v67: as 8 propostas do guia de UI aceitas pelo Victor em 16/11 (docs/ui/estrutura-ui-ux-hud.md, seção 13): joystick
 * fixo, ✋ cancelar selos, retratos de alvo no PvP, câmera da mira, toque longo no jutsu, "Enquanto você esteve fora",
 * daltonismo na auditoria e vida e chakra escondidos fora da luta.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('public/game.js');
const html = read('public/index.html');
const css = read('public/hud.css');
const FOREST = REALTIME.maps.map_2;

function config(): RealtimeConfig {
  return { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 } } };
}
function openSpot(): { x: number; y: number } {
  for (let y = 22; y < 90; y += 1) for (let x = 8; x < 80; x += 1) if ([0, 1, 2, 3].every((k) => !blocked(x + k, y, FOREST.walls))) return { x, y };
  throw new Error('sem lugar livre');
}

describe('v67: ✋ Cancelar selos (servidor)', () => {
  function caster() {
    const w = setupWorld(config());
    const world: any = w.world;
    const a = w.connect('selador');
    const spot = openSpot();
    placeIn(world, a.id, 'map_2', spot.x, spot.y);
    const s = world.sessions.get(a.id);
    Object.assign(s, { fx: 1, fy: 0, chakra: 500, cooldowns: {} });
    s.jutsus.set('fire_2', 0);
    s.kits[s.activeKit] = ['fire_2', ...s.kits[s.activeKit].filter((k: string) => k !== 'fire_2').slice(0, 3)];
    return { ...w, a, s };
  }

  it('desiste dos selos sem perder chakra nem ganhar recarga; o jutsu não sai', () => {
    const { a, s, clock } = caster();
    a.send({ type: 'cast', skill: 'fire_2' });
    assert.ok(a.conn.last('cast_start'), 'começou os selos');
    const chakra = s.chakra;
    a.send({ type: 'cast_stop' });
    assert.equal(s.casting, null);
    assert.equal(a.conn.last('cast_interrupted').reason, 'stop');
    assert.equal(s.chakra, chakra, 'sem custo');
    assert.ok(!((s.cooldowns.fire_2 ?? 0) > clock.now()), 'sem recarga');
    a.conn.clear();
    clock.advance(400);
    assert.equal(a.conn.of('projectile').length, 0, 'não saiu');
    a.send({ type: 'cast', skill: 'fire_2' });
    assert.ok(a.conn.last('cast_start'), 'pode lançar de novo na hora');
  });

  it('sem selos em andamento, o ✋ não faz nada', () => {
    const { a } = caster();
    a.send({ type: 'cast_stop' });
    assert.equal(a.conn.last('cast_interrupted'), undefined);
  });
});

describe('v67: "Enquanto você esteve fora" (servidor)', () => {
  it('a entrada leva a última visita (de antes desta) no welcome; um reconectar guarda a mesma', () => {
    const w = setupWorld();
    const conn1 = new FakeConn();
    const id = '6f6f6f6f-0000-4000-8000-000000000001';
    w.world.join({ id, username: 'voltou', tutorialStep: 4, lastSeenAt: '2026-11-01T10:00:00.000Z' } as any, conn1 as any);
    assert.equal(conn1.last('welcome').ninja.lastSeenAt, '2026-11-01T10:00:00.000Z');
    const conn2 = new FakeConn();
    w.world.join({ id, username: 'voltou', tutorialStep: 4, lastSeenAt: '2026-11-16T09:00:00.000Z' } as any, conn2 as any);
    assert.equal(conn2.last('welcome').ninja.lastSeenAt, '2026-11-01T10:00:00.000Z', 'reconectou: o resumo não some no meio');
  });
});

describe('v67: cliente', () => {
  it('Config. → HUD tem as 5 opções novas, guardadas no aparelho', () => {
    for (const id of ['pref-joystick', 'pref-aim-camera', 'pref-hold-info', 'pref-portraits', 'pref-hide-bars']) assert.match(html, new RegExp(`id="${id}"`), id);
    assert.match(html, /<option value="fixo">Fixo/);
    assert.match(html, /id="pref-hide-bars" type="checkbox">/, 'esconder as barras começa desligado');
    assert.match(game, /localStorage\.setItem\('nin\.uiPrefs'/);
  });

  it('joystick fixo: a base não sai do lugar e só o círculo dele pega o toque', () => {
    assert.match(game, /if \(uiPref\.joystick === 'fixo'\) return Math\.hypot\(x - joy\.restX, y - joy\.restY\) < joy\.radius \* 1\.6;/);
    assert.match(game, /if \(uiPref\.joystick === 'fixo'\) \{\n    joy\.baseX = joy\.restX;\n    joy\.baseY = joy\.restY;/);
  });

  it('✋ só aparece nos selos e manda cast_stop; o cancelamento sem custo não dá recarga no cliente', () => {
    assert.match(html, /id="cast-stop-btn" type="button" class="cast-stop" hidden/);
    assert.match(css, /\.cast-stop \{[^}]*width: 52px;[^}]*height: 52px;/, 'alvo de toque de pelo menos 44 px');
    assert.match(game, /castStopBtn\.hidden = !on;/);
    assert.match(game, /send\(\{ type: 'cast_stop' \}\)/);
    assert.match(game, /msg\.reason !== 'stop'\) startCooldown/);
  });

  it('câmera da mira: até 35% do alcance, no máximo 3 casas, e só mirando de verdade', () => {
    const src = game.slice(game.indexOf('function aimPan()'), game.indexOf('\n}\n', game.indexOf('function aimPan()')) + 2);
    const env = { uiPref: { aimCamera: true }, aim: { dir: [1, 0], dragged: true, since: 0, skill: 'x' }, performance: { now: () => 1000 }, HOLD_MS: 200, aimInfo: () => ({ range: 12 }) };
    const pan = new Function(...Object.keys(env), `${src}; return aimPan;`)(...Object.values(env));
    assert.deepEqual(pan(), { x: 3, y: 0 });
    env.aimInfo = () => ({ range: 4 });
    const pan2 = new Function(...Object.keys(env), `${src}; return aimPan;`)(...Object.values(env));
    assert.equal(Math.round(pan2().x * 100), 140);
    assert.match(game, /const pan = aimPan\(\);/);
  });

  it('toque longo: o cartão aparece em 450 ms; o jutsu sem mira sai ao soltar', () => {
    assert.match(game, /const HOLD_INFO_MS = 450;/);
    assert.match(html, /id="skill-tip" class="skill-tip" role="tooltip" hidden/);
  });

  it('v68: no jutsu que sai no toque, segurar mostra o ✕ Cancelar; soltar nele não lança, soltar fora lança', () => {
    assert.match(html, /id="skill-cancel" class="skill-cancel" hidden/);
    assert.match(game, /armSkillTip\(button, !isLineSkill\(skill\)\)/, 'o ✕ só no jutsu sem mira');
    assert.match(game, /if \(cast && !canceled\) castSlot\(i\);/);
    assert.match(game, /if \(pending !== null && pending === e\.pointerId\) \{ e\.preventDefault\(\); trackSkillCancel\(e\.clientX, e\.clientY\); return; \}/);
    assert.match(css, /\.skill-cancel \{[^}]*width: 64px;[^}]*height: 64px;/, 'alvo grande');
    // a conta do "em cima do ✕" (12 px de folga)
    const src = game.slice(game.indexOf('function trackSkillCancel('), game.indexOf('\n}\n', game.indexOf('function trackSkillCancel(')) + 2);
    const el = { hidden: false, getBoundingClientRect: () => ({ left: 100, right: 164, top: 100, bottom: 164 }), classList: { toggle() {} } };
    const track = new Function('skillCancel', `${src}; return trackSkillCancel;`)({ el, hot: false });
    assert.equal(track(130, 130), true);
    assert.equal(track(90, 175), true, 'na folga');
    assert.equal(track(60, 130), false);
  });

  it('retratos no PvP: até 3 inimigos a 12 casas, um toque foca e outro solta', () => {
    assert.match(game, /if \(d <= 12\) near\.push/);
    assert.match(game, /near\.slice\(0, 3\)/);
    assert.match(game, /setFocus\(state\.focusId === p\.id \? null : p\.id\)/);
    assert.match(css, /\.foe-portraits button \{[^}]*width: 48px;[^}]*height: 48px;/, 'alvo de toque de pelo menos 44 px');
  });

  it('resumo de quem voltou: 2 dias ou mais, uma vez por volta, com o próximo passo', () => {
    assert.match(game, /const AWAY_MIN_DAYS = 2;/);
    assert.match(game, /localStorage\.getItem\('nin\.awaySeen'\) === at/);
    assert.match(game, /rows\.push\(li\('Próximo passo:', awayNextStep\(\), 'next'\)\);/);
    assert.match(game, /setTimeout\(showAwaySummary, 1500\);/);
  });

  it('barras escondidas: só com a opção, vida e chakra cheios e fora da luta', () => {
    assert.match(game, /document\.body\.classList\.toggle\('bars-calm', uiPref\.hideFullBars && full && !fighting && performance\.now\(\) >= combatUntil\);/);
    assert.match(css, /body\.bars-calm \.hud-me \.bar \{ opacity: 0;/);
  });

  it('daltonismo: a auditoria simula deuteranopia, protanopia e tritanopia', () => {
    const audit = read('scripts/auditar-hud.ts');
    for (const k of ['deuteranopia', 'protanopia', 'tritanopia']) assert.match(audit, new RegExp(k));
  });
});
