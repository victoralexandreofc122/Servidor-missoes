import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import type { Fase3Store } from '../src/realtime/fase3Store.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { RELIC, RELICS, pickRelic, rollRarity } from '../src/realtime/loot.js';
import { BEARER, TITAN_EVENT, TITANS, isBehind, titanOfDay } from '../src/realtime/titans.js';
import { mapAllowed } from '../src/realtime/villages.js';
import { CHRONICLE, featureOpen, lockedMaps, stageFor } from '../src/realtime/worldProgress.js';
import { FakeConn, seededRandom } from './support/world.js';

/* Fase 3 (v61/v62, migrações v36 e v37): Titãs e Portadores, Progressão de Mundo e Loot. */

const DAY = 86_400_000;

describe('Fase 3: contas puras', () => {
  it('um Titã por dia nos 10 primeiros dias da Era', () => {
    const start = 1_000_000;
    assert.equal(titanOfDay(start, start), 1);
    assert.equal(titanOfDay(start, start + DAY * 4 + 5), 5);
    assert.equal(titanOfDay(start, start + DAY * 9.9), 10);
    assert.equal(titanOfDay(start, start + DAY * 10), null);
    assert.equal(TITANS.length, 10);
    assert.deepEqual(TITANS.map((t) => t.name), ['Chama Eterna', 'Maré de Sangue', 'Trovão Ancestral', 'Vento Cortante', 'Rocha Antiga', 'Noite Eterna', 'Pesadelo', 'Corpo Fechado', 'Mil Lâminas', 'Vida']);
  });

  it('marcos do mundo: 30 Floresta, 60 Zona, 100 Refúgio/Kage, 150 Titãs, 250 expansão', () => {
    assert.deepEqual([0, 29, 30, 59, 60, 100, 149, 150, 251].map(stageFor), [0, 0, 30, 30, 60, 100, 100, 150, 250]);
    assert.ok(lockedMaps(0).includes('map_2') && lockedMaps(0).includes('zona_conflito') && lockedMaps(0).includes('refugio'));
    assert.ok(!lockedMaps(30).includes('map_2') && lockedMaps(30).includes('zona_conflito'));
    assert.deepEqual(lockedMaps(250), []);
    assert.equal(featureOpen(100, 'kage'), true);
    assert.equal(featureOpen(149, 'titas'), false);
    assert.equal(CHRONICLE.length, 6);
    // a mesma regra trava a passagem (servidor e predição do cliente)
    assert.equal(mapAllowed({ id: 'map_2' }, { village: 'vila_1', allies: [], locked: ['map_2'], villagesOff: true }), false);
    assert.equal(mapAllowed({ id: 'map_1' }, { village: 'vila_1', allies: [], locked: ['map_2'], villagesOff: true }), true);
  });

  it('raridade: Lendário 0,05%, Épico 0,5%, Raro 3%, Comum 10%; o resto, nada', () => {
    assert.equal(rollRarity(0), 'lendario');
    assert.equal(rollRarity(0.0004999), 'lendario');
    assert.equal(rollRarity(0.0005), 'epico');
    assert.equal(rollRarity(0.0054999), 'epico');
    assert.equal(rollRarity(0.0055), 'raro');
    assert.equal(rollRarity(0.0355), 'comum');
    assert.equal(rollRarity(0.1354), 'comum');
    assert.equal(rollRarity(0.1355), null);
    assert.equal(pickRelic('lendario', 0).rarity, 'lendario');
    assert.ok(RELICS.some((r) => r.code === 'reliquia_l_renascer') && RELICS.some((r) => r.code === 'reliquia_l_brasa'));
  });

  it('de costas: o alvo olha para longe de quem bate', () => {
    assert.equal(isBehind({ x: 0, y: 0, fx: 1, fy: 0 }, { x: -1, y: 0 }), true);
    assert.equal(isBehind({ x: 0, y: 0, fx: 1, fy: 0 }, { x: 1, y: 0 }), false);
  });
});

/** Banco falso da Fase 3 (as mesmas regras de game.titan_crown: o MVP que ainda não porta outro Titã). */
function fakeStore(stage = 250) {
  const titans = new Map<string, { titan: number; maxHp: number; hp: number; spawnedAt: number; sleepsAt: number; defeatedAt: number | null }>();
  const damage = new Map<string, number>();
  const bearers: { era: number; titan: number; playerId: string; activeCdUntil: number }[] = [];
  const loot: { id: string; item: string }[] = [];
  const items = new Map<string, Record<string, number>>();
  const names = new Map<string, string>();
  const w = { stage, override: null as number | null };
  const store: Fase3Store = {
    async available() { return { titans: true, world: true }; },
    async titans(era) { return [...titans.entries()].filter(([k]) => k.startsWith(`${era}:`)).map(([, v]) => v); },
    async awaken(era, titan, maxHp, sleepsAt) {
      const k = `${era}:${titan}`;
      if (!titans.has(k)) titans.set(k, { titan, maxHp, hp: maxHp, spawnedAt: 0, sleepsAt: sleepsAt.getTime(), defeatedAt: null });
      return titans.get(k)!;
    },
    async saveTitan(era, titan, hp) { const r = titans.get(`${era}:${titan}`); if (r && !r.defeatedAt) r.hp = hp; },
    async addDamage(era, titan, rows) { for (const r of rows) damage.set(`${era}:${titan}:${r.playerId}`, (damage.get(`${era}:${titan}:${r.playerId}`) ?? 0) + r.damage); },
    async crown(era, titan) {
      const best = [...damage.entries()].filter(([k]) => k.startsWith(`${era}:${titan}:`)).map(([k, v]) => [k.split(':')[2]!, v] as const)
        .filter(([id]) => !bearers.some((b) => b.era === era && b.playerId === id)).sort((a, b) => b[1] - a[1])[0];
      if (!best || bearers.some((b) => b.era === era && b.titan === titan)) return null;
      bearers.push({ era, titan, playerId: best[0], activeCdUntil: 0 });
      const r = titans.get(`${era}:${titan}`); if (r) { r.defeatedAt = 1; r.hp = 0; }
      return best[0];
    },
    async bearers(era) { return bearers.filter((b) => b.era === era).map((b) => ({ titan: b.titan, playerId: b.playerId, username: names.get(b.playerId) ?? '?', activeCdUntil: b.activeCdUntil })); },
    async setActiveCooldown(era, playerId, until) { const b = bearers.find((x) => x.era === era && x.playerId === playerId); if (b) b.activeCdUntil = until.getTime(); },
    async expireTitles() { return 0; },
    async world() { return { active: 5, stage: w.stage, override: w.override }; },
    async setWorldOverride(_a, stage) { w.override = stage; },
    async grantLoot(id, item) { loot.push({ id, item }); const inv = { ...(items.get(id) ?? {}) }; inv[item] = (inv[item] ?? 0) + 1; items.set(id, inv); return inv; },
    async useRevive() { return true; },
    async revivesUsed() { return []; },
  };
  return { store, titans, damage, bearers, loot, names, w };
}

const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
function setup(stage = 250, secure = () => 0.9) {
  let t = 10 * DAY;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const fake = fakeStore(stage);
  const world: any = new GameWorld(cfg, clock.now, undefined, { random: seededRandom(), fase3: fake.store, secureRandom: secure });
  world.f3.era = { id: 7, startsAt: t };
  const join = (username: string) => {
    const id = randomUUID();
    const conn = new FakeConn();
    const h = world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    fake.names.set(id, username);
    const s = world.sessions.get(id);
    return { id, conn, s, send: (m: unknown) => h.receive(JSON.stringify(m)) };
  };
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  return { world, clock, fake, join, flush };
}

describe('Fase 3: Titãs e Portadores', () => {
  it('o Titã do dia acorda na Clareira com a vida global; quem dá mais dano vira o Portador; a passiva vale', async () => {
    const { world, fake, join, flush } = setup();
    const a = join('ana'), b = join('bia');
    await world.fase3Maintenance();
    const titan = [...world.monsters.values()].find((m: any) => m.titan);
    assert.ok(titan, 'o 1º Titã acordou');
    assert.equal(titan.type, 'tita_1');
    assert.equal(titan.map, TITAN_EVENT.map);
    assert.equal(titan.maxHp, TITAN_EVENT.hp(1));
    for (const s of [a.s, b.s]) world.transfer(s, 'clareira_queimada', 22, 22, 'gate');
    titan.damageBy.set(a.id, 20);
    titan.hp = 50;
    world.damageMonster(titan, 9999, b.s, world.now(), 'attack');   // a bia derruba com o golpe maior
    await flush();
    assert.equal(fake.bearers[0]?.playerId, b.id, 'MVP: a bia');
    assert.equal(world.f3.bearers.get(b.id)?.titan, 1);
    // passiva da Chama Eterna: Ataque Básico queima
    const dummy = world.spawnMonster({ x: b.s.x + 1, y: b.s.y }, world.now(), 'clareira_queimada', 'slime', true);
    const m = world.monsters.get(dummy.id);
    (m as any).maxHp = 999; m.hp = 999;
    b.s.fx = 1; b.s.fy = 0;
    world.basicAttack(b.s, world.now(), m.id);
    assert.ok(m.effects.has('queimadura'), 'queimou');
  });

  it('um Titã por ninja na Era: o MVP que já porta passa para o 2º em dano', async () => {
    const { world, fake, join, flush } = setup();
    const a = join('caio'), b = join('davi');
    fake.bearers.push({ era: 7, titan: 1, playerId: a.id, activeCdUntil: 0 });
    await world.fase3Maintenance(2);
    const titan = [...world.monsters.values()].find((m: any) => m.titan === 2);
    titan.damageBy.set(b.id, 10);
    world.damageMonster(titan, titan.hp + 1, a.s, world.now(), 'attack');
    await flush();
    assert.equal(fake.bearers.find((x) => x.titan === 2)?.playerId, b.id);
  });

  it('Suprema: 20 min de recarga; Vida cura todos os aliados; Rocha: escudo de 15% que volta', async () => {
    const { world, fake, join, clock } = setup();
    const a = join('eva'), b = join('fabi');
    fake.bearers.push({ era: 7, titan: 10, playerId: a.id, activeCdUntil: 0 }, { era: 7, titan: 5, playerId: b.id, activeCdUntil: 0 });
    await world.fase3Maintenance();
    a.s.hp = 1; b.s.hp = 1;
    b.s.x = a.s.x + 1; b.s.y = a.s.y;
    a.send({ type: 'fase3', action: 'supreme' });
    assert.equal(a.s.hp, a.s.stats.maxHp);
    assert.equal(b.s.hp, b.s.stats.maxHp, 'aliado curado');
    a.s.hp = 1;
    a.send({ type: 'fase3', action: 'supreme' });
    assert.equal(a.s.hp, 1, 'em recarga');
    assert.ok(world.f3.bearers.get(a.id).cdUntil - world.now() >= TITAN_EVENT.activeCooldownMs - 1);
    clock.advance(100); world.tick();
    assert.equal(b.s.absorb?.hp, Math.round(b.s.stats.maxHp * BEARER.rockShieldPct), 'escudo da Rocha');
  });
});

describe('Fase 3: Progressão de Mundo', () => {
  it('marco 0: a Floresta tranca; quem estava lá volta para a praça; o Cronista borra o que falta', async () => {
    const { world, join, flush } = setup(0);
    const a = join('gil');
    world.transfer(a.s, 'map_2', 50, 40, 'gate');
    await world.fase3Maintenance();
    await flush();
    assert.equal(world.worldStage(), 0);
    assert.notEqual(a.s.map, 'map_2', 'saiu da Floresta trancada');
    assert.ok(world.accessOf(a.s).locked.includes('map_2'));
    // o Cronista
    world.transfer(a.s, 'academy_interior', 51, 7, 'gate');
    a.send({ type: 'talk', npcId: 'cronista' });
    const chron = a.conn.last('chronicle');
    assert.equal(chron.chapters[0].open, true);
    assert.equal(chron.chapters[1].open, false);
    assert.match(chron.chapters[1].text, /borrados/);
  });
});

describe('Fase 3: Loot', () => {
  it('o chefe derrubado: quem tirou 5% rola; com a rolagem 0 sai Lendário; as relíquias funcionam', async () => {
    const { world, fake, join, flush } = setup(250, () => 0);
    const a = join('hugo');
    await world.fase3Maintenance();
    world.transfer(a.s, 'caverna_lodo', 20, 30, 'gate');
    const v = world.spawnMonster({ x: 21, y: 30 }, world.now(), 'caverna_lodo', 'rei_lodo', true);
    const boss = world.monsters.get(v.id);
    world.damageMonster(boss, boss.hp + 1, a.s, world.now(), 'attack');
    await flush();
    assert.equal(fake.loot.length, 1);
    assert.equal(fake.loot[0]!.item, pickRelic('lendario', 0).code);
    // Renascer: morreu, volta com 30%
    a.s.items = { reliquia_l_renascer: 1 };
    a.s.hp = 5;
    world.damagePlayer(a.s, 50, world.now());
    assert.equal(a.s.dead, false);
    assert.equal(a.s.hp, Math.round(a.s.stats.maxHp * RELIC.revivePct));
    world.damagePlayer(a.s, a.s.hp + 10, world.now());
    assert.equal(a.s.dead, true, 'uma vez por Era');
  });

  it('Couraça corta 8% do dano; Vida e Chakra sobem o máximo', () => {
    const { world, join } = setup();
    const a = join('ivo');
    a.s.hp = 1000;
    a.s.items = { reliquia_r_couraca: 1 };
    world.damagePlayer(a.s, 100, world.now());
    assert.equal(1000 - a.s.hp, 92);
    const max = a.s.stats.maxHp;
    a.s.items = { reliquia_c_vida: 1 };
    world.refreshStats(a.s, world.now());
    assert.equal(a.s.stats.maxHp, Math.round(max * (1 + RELIC.hpPct)));
  });
});
