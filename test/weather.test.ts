import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAdminCommand } from '../src/realtime/admin.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DAY_PHASES, SKY, SKY_CAP, WEATHERS, dayPhase, offsetFor, outdoors, pickWeather, skyEffects, weatherFits } from '../src/realtime/weather.js';
import { placeIn, seededRandom, setupWorld } from './support/world.js';

/*
 * Ciclo de dia e noite e clima (weather.ts, docs/clima.md): o servidor decide a hora e o clima, igual para todos, e
 * eles mudam os jutsus ao ar livre (Fogo no dia quente, Água e Raio na chuva, Ilusão na neblina, Sombra de noite).
 */

const SK = REALTIME.combat.skills;
const F = { x: 51, y: 10 };                                       // clareira da Floresta (ao ar livre)

function pvpConfig(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      damageScale: { jutsu: 1, basic: 1 },  // testes de mecânica: dano base de antes da v28 (os números novos estão em pveDamage)
      pvp: true,
      monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);
function duel() {
  const w = setupWorld(pvpConfig());
  const a = w.connect('kaito');
  const b = w.connect('mei');
  placeIn(w.world, a.id, 'map_2', F.x, F.y);
  placeIn(w.world, b.id, 'map_2', F.x + 2, F.y);
  Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
  return { ...w, a, b };
}
function learn(world: any, id: string, skill: string) {
  const s = session(world, id);
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), skill];
}

describe('clima: a hora e o sorteio (weather.ts)', () => {
  it('o ciclo de 48 min: amanhecer, dia, entardecer e noite, pelo relógio do servidor (não pelo boot)', () => {
    const at = (f: number) => dayPhase(f * SKY.cycleMs).phase;
    assert.deepEqual([at(0.01), at(0.3), at(0.6), at(0.8), at(0.999)], ['amanhecer', 'dia', 'entardecer', 'noite', 'noite']);
    assert.equal(dayPhase(SKY.cycleMs * 5 + 0.3 * SKY.cycleMs).phase, 'dia', 'repete todo dia');
    // "/admin hora noite": o ajuste faz a noite começar agora.
    const t = 1_234_567;
    for (const phase of ['amanhecer', 'dia', 'entardecer', 'noite'] as const) {
      const d = dayPhase(t, offsetFor(phase, t));
      assert.equal(d.phase, phase);
      assert.ok(Math.abs(d.progress - SKY.phaseStarts[phase]) < 1e-9);
    }
  });

  it('o sorteio: nunca repete o clima atual, dia quente só de dia, e a neblina aparece mais de noite', () => {
    const r = seededRandom(5);
    const count = (phase: 'dia' | 'noite') => {
      const c: Record<string, number> = { normal: 0, quente: 0, chuva: 0, neblina: 0 };
      let cur: any = 'normal';
      for (let i = 0; i < 4000; i++) {
        const next = pickWeather(r, phase, cur);
        assert.notEqual(next, cur);
        c[next]! += 1;
        cur = next;
      }
      return c;
    };
    const day = count('dia'), night = count('noite');
    assert.ok(day.quente! > 0 && night.quente === 0, 'sem dia quente de noite');
    assert.ok(night.neblina! / 4000 > day.neblina! / 4000, 'mais neblina de noite');
    assert.equal(weatherFits('quente', 'entardecer'), false);
  });

  it('os bônus: clima e noite multiplicam; ao ar livre só (vila, Floresta, mapas abertos)', () => {
    assert.deepEqual(skyEffects('dia', 'normal'), { damage: {}, status: {} });
    assert.deepEqual(skyEffects('dia', 'quente').damage, { fire: 1.05, water: 0.95 });
    assert.deepEqual(skyEffects('dia', 'chuva').damage, { water: 1.05, lightning: 1.05, fire: 0.95 });
    assert.deepEqual(skyEffects('noite', 'neblina').status, { illusion: 1.05, shadow: 1.05 });
    // nenhum bônus passa de 5%, em nenhuma combinação de clima e hora
    for (const phase of DAY_PHASES) for (const weather of WEATHERS) {
      const e = skyEffects(phase, weather);
      for (const v of [...Object.values(e.damage), ...Object.values(e.status)]) assert.ok(Math.abs(v - 1) <= SKY_CAP + 1e-9, `${phase}/${weather}: ${v}`);
    }
    assert.ok(outdoors('forest') && outdoors('village') && outdoors('wild'));
    assert.ok(!outdoors('interior') && !outdoors('cave'));
  });

  it('admin: /admin clima <clima> [min] e /admin hora <fase>', () => {
    assert.deepEqual(parseAdminCommand('/admin clima chuva 5', []), { ok: true, command: { cmd: 'clima', weather: 'chuva', minutes: 5 } });
    assert.deepEqual(parseAdminCommand('/admin clima neblina', []), { ok: true, command: { cmd: 'clima', weather: 'neblina', minutes: 10 } });
    assert.deepEqual(parseAdminCommand('/admin hora noite', []), { ok: true, command: { cmd: 'hora', phase: 'noite' } });
    assert.equal(parseAdminCommand('/admin clima tempestade', []).ok, false);
    assert.equal(parseAdminCommand('/admin hora meiodia', []).ok, false);
  });
});

describe('clima no jogo: o servidor aplica nos jutsus e avisa todos', () => {
  it('o welcome traz o céu; o clima vence e o servidor sorteia o próximo e avisa todos', () => {
    const { connect, clock, run } = setupWorld(pvpConfig());
    const p = connect('kaito');
    const sky = p.conn.last('welcome').world.sky;
    assert.equal(sky.cycleMs, SKY.cycleMs);
    assert.equal(sky.weather, 'normal');
    assert.equal(sky.phase, 'dia');
    clock.advance(SKY.weatherMinMs + 1);
    run(100);
    const msg = p.conn.last('sky');
    assert.ok(msg, 'avisou');
    assert.notEqual(msg.sky.weather, 'normal');
    assert.equal(msg.changed, 'weather');
  });

  it('chuva: a Água bate 5% mais forte; dia quente: 5% mais fraca; dentro de casa, nada muda', () => {
    const normal = duel();
    normal.a.send({ type: 'cast', skill: 'water' });
    const base = normal.b.conn.last('hit').amount;
    assert.equal(base, SK.water.damage);

    const rain = duel();
    Object.assign((rain.world as any).sky, { weather: 'chuva' });
    rain.a.send({ type: 'cast', skill: 'water' });
    assert.equal(rain.b.conn.last('hit').amount, Math.round(SK.water.damage! * 1.05));

    const hot = duel();
    Object.assign((hot.world as any).sky, { weather: 'quente' });
    hot.a.send({ type: 'cast', skill: 'water' });
    assert.equal(hot.b.conn.last('hit').amount, Math.round(SK.water.damage! * 0.95));

    assert.equal((rain.world as any).skyEffectsAt('academy_interior'), null, 'dentro de casa o clima não vale');
    assert.ok((rain.world as any).skyEffectsAt('map_2'));
  });

  it('noite: a Sombra prende 5% mais; e quando escurece o dia quente vira normal (para todos)', () => {
    const { world, a, b, clock, run } = duel();
    const w = world as any;
    Object.assign(w.sky, { weather: 'quente', until: clock.now() + 3_600_000 });
    w.sky.offsetMs = offsetFor('noite', clock.now() + 100);
    run(200);
    assert.equal(w.sky.phase, 'noite');
    assert.equal(w.sky.weather, 'normal', 'sem dia quente de noite');
    // o dia quente já acaba no entardecer (escureceu); depois chega a noite
    assert.ok(b.conn.of('sky').some((m: any) => m.changed === 'both' && m.sky.weather === 'normal'));
    assert.equal(b.conn.last('sky').sky.phase, 'noite');
    learn(world, a.id, 'shadow');
    session(world, a.id).chakra = 100;
    a.send({ type: 'cast', skill: 'shadow', targetId: b.id });
    // v28: num ninja, o orçamento de controle corta em 1,5 s; num monstro, vale a noite inteira (+5%).
    assert.deepEqual(b.conn.last('player_status'), { type: 'player_status', playerId: b.id, status: 'rooted', ms: 1500 });
    const at = { x: session(world, b.id).x, y: session(world, b.id).y };
    session(world, b.id).x += 30;
    const m = world.spawnMonster(at, undefined, session(world, a.id).map);
    Object.assign(session(world, a.id), { chakra: 100, cooldowns: {} });
    a.send({ type: 'cast', skill: 'shadow', targetId: m.id });
    assert.equal(a.conn.last('monster_status').ms, Math.round(SK.shadow.rootMs! * 1.05));
  });
});
