import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { POWERS } from '../src/realtime/akatsuki.js';
import { DEFAULT_APPEARANCE, type Village } from '../src/realtime/appearance.js';
import { parseAdminCommand, type AdminStore } from '../src/realtime/admin.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { ITEM_BY_CODE } from '../src/realtime/items.js';
import { REFUGE, TRAVEL_POST, conflictCamp } from '../src/realtime/maps.js';
import { PLAYER_RADIUS, blocked } from '../src/realtime/movement.js';
import { VILLAGE_INFO } from '../src/realtime/villages.js';
import { fakeEndgame } from './support/endgameStore.js';
import { FakeConn, placeIn, seededRandom } from './support/world.js';

/*
 * v16 (fim de jogo, docs/endgame.md): o mundo com o banco da v11 (aqui, um falso em memória). As REGRAS do banco
 * (quem vota, quem expulsa, Elo, recompensa...) têm o teste delas em v11.integration; aqui fica o que o MUNDO decide
 * na hora: em qual vila nasce, quem entra em qual mapa, as passivas, o PvP da Zona de Conflito, o renegado no Refúgio,
 * o Posto de Viagem, os poderes da Akatsuki, as capas e os comandos de admin.
 */

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
};
const sessionOf = (w: GameWorld, id: string) => (w as any).sessions.get(id);

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

async function setup(modules?: Parameters<typeof fakeEndgame>[0], admin?: AdminStore) {
  const cfg = config();
  let t = 1_000_000;
  const fake = fakeEndgame(modules);
  const world = new GameWorld(cfg, () => t, undefined, { random: seededRandom(), endgame: fake.store, ...(admin ? { admin } : {}) });
  await world.endgameMaintenance();
  const join = (username: string, village: Village | null = 'vila_1', extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    fake.setVillage(id, village, village === null ? 'vila_2' : null);
    const conn = new FakeConn();
    const h = world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: village ?? 'vila_2' }, endgame: fake.player(id), ...extra }, conn);
    return { id, conn, username, send: (m: unknown) => h.receive(JSON.stringify(m)) };
  };
  const run = (ms: number) => {
    for (let x = 0; x < ms; x += cfg.tickMs) {
      t += cfg.tickMs;
      world.tick();
    }
  };
  const advance = (ms: number) => void (t += ms);
  const at = (p: { id: string }, map: string, x: number, y: number) => placeIn(world, p.id, map, x, y);
  return { world, fake, join, run, advance, at, cfg };
}

describe('v16: módulos do fim de jogo', () => {
  it('sem a v11 (sem banco do fim de jogo) nada muda: todos na Folha, sem facção na vista, Posto fechado', () => {
    const world = new GameWorld(config(), () => 1, undefined, {});
    const conn = new FakeConn();
    world.join({ id: randomUUID(), username: 'kaito', appearance: { ...DEFAULT_APPEARANCE } }, conn);
    const welcome = conn.last('welcome');
    assert.equal(welcome.world.map, 'map_1');
    assert.deepEqual(welcome.world.openVillages, ['vila_1']);
    assert.equal(welcome.you.faction, undefined);
    assert.equal(conn.of('endgame').length, 0);
  });

  it('a manutenção acha a v11, liga o módulo que a população alcançou e anuncia para todos', async () => {
    const { world, fake, join } = await setup([]);
    const a = join('kaito');
    assert.deepEqual(a.conn.last('endgame').modules, []);
    fake.setPopulation(REALTIME.endgame.thresholds.vilas);
    await world.endgameMaintenance();
    assert.ok(fake.calls.some((c) => c[0] === 'activate' && c[1] === 'vilas'));
    assert.match(a.conn.last('announce').message, /cinco vilas/);
    assert.deepEqual(a.conn.last('endgame').modules, ['vilas']);
    // A população não chegou no pvp: ele continua desligado.
    assert.ok(!fake.calls.some((c) => c[0] === 'activate' && c[1] === 'pvp'));
  });

  it('cada vila nasce na própria praça; com o módulo, o Criador abre as cinco', async () => {
    const { join } = await setup(['vilas']);
    const nevoa = join('mizu', 'vila_3');
    const w = nevoa.conn.last('welcome');
    assert.equal(w.world.map, 'vila_nevoa');
    assert.deepEqual(w.world.openVillages, ['vila_1', 'vila_2', 'vila_3', 'vila_4', 'vila_5']);
    assert.deepEqual(w.you.faction, { village: 'vila_3' });
  });
});

describe('v16: vilas, acesso e Posto de Viagem', () => {
  it('a saída para uma vila em que ele não entra é parede (a borda norte da Floresta, para quem não é da Folha)', async () => {
    const { world, join, run, at } = await setup(['vilas']);
    const nevoa = join('mizu', 'vila_3');
    const folha = join('kaito', 'vila_1');
    at(nevoa, 'map_2', 40, 0.5);
    at(folha, 'map_2', 41, 0.5);
    nevoa.send({ type: 'move', dx: 0, dy: -1 });
    folha.send({ type: 'move', dx: 0, dy: -1 });
    run(400);
    assert.equal(sessionOf(world, nevoa.id).map, 'map_2');
    assert.equal(sessionOf(world, folha.id).map, 'map_1');
  });

  it('Posto de Viagem: casa, Floresta, Zona (com o pvp) e a vila aliada por 50 ryō; longe dele, nada', async () => {
    const { world, fake, join, at } = await setup(['vilas', 'pvp']);
    fake.politics.relations.push({ a: 'vila_1', b: 'vila_3', state: 'alianca', declaredBy: 'vila_1' });
    await world.refreshPolitics();
    const p = join('mizu', 'vila_3', { ryo: 1000 });
    at(p, 'vila_nevoa', TRAVEL_POST.x, TRAVEL_POST.y + 1);
    p.send({ type: 'talk', npcId: 'travel_vila_nevoa' });
    const options = p.conn.last('travel_options').options.map((o: { to: string; cost: number }) => `${o.to}:${o.cost}`);
    assert.deepEqual(options, ['map_2:0', 'zona_conflito:0', 'vila_1:50']);
    p.send({ type: 'travel', to: 'vila_1' });
    await flush();
    assert.deepEqual(fake.calls.find((c) => c[0] === 'payTravel'), ['payTravel', p.id, 'vila_1']);
    const s = sessionOf(world, p.id);
    assert.equal(s.map, 'map_1');
    assert.equal(s.ryo, 950);
    assert.equal(p.conn.last('map_changed').reason, 'travel');
    // Longe do Posto: recusa.
    at(p, 'map_1', 40, 40);
    (s as any).lastPanelAt = 0;
    p.send({ type: 'travel', to: 'casa' });
    assert.equal(p.conn.last('error').code, 'TRAVEL_TOO_FAR');
  });

  it('cada destino tem chão livre para chegar', async () => {
    const maps = REALTIME.maps;
    const free = (map: keyof typeof maps, x: number, y: number) => !blocked(x, y, maps[map].walls) && !blocked(x + PLAYER_RADIUS, y, maps[map].walls);
    assert.ok(free('vila_nevoa', TRAVEL_POST.x + 2.5, TRAVEL_POST.y - 1.5));
    assert.ok(free('map_2', 44, 8));
    assert.ok(free('refugio', REFUGE.spawn.x, REFUGE.spawn.y));
    for (const who of ['vila_1', 'vila_2', 'vila_3', 'vila_4', 'vila_5', 'renegados'] as const) {
      const a = conflictCamp(who).arrive;
      assert.ok(free('zona_conflito', a.x, a.y), who);
    }
  });

  it('a aliança acabou com o visitante dentro: ele volta para casa', async () => {
    const { world, fake, join, at } = await setup(['vilas']);
    fake.politics.relations.push({ a: 'vila_1', b: 'vila_3', state: 'alianca', declaredBy: 'vila_1' });
    await world.refreshPolitics();
    const p = join('mizu', 'vila_3');
    at(p, 'map_1', 40, 40);
    fake.politics.relations.length = 0;
    await world.refreshPolitics();
    assert.equal(sessionOf(world, p.id).map, 'vila_nevoa');
    assert.equal(p.conn.last('map_changed').reason, 'exiled');
  });

  it('a loja é a mesma sala para todos: a porta de saída leva de volta para a vila de onde ele entrou', async () => {
    const { world, join, at, run } = await setup(['vilas']);
    const p = join('mizu', 'vila_3');
    const vila = REALTIME.maps.vila_nevoa;
    const door = vila.doors.find((d) => d.map === 'interior_weapons')!;
    at(p, 'vila_nevoa', door.back!.x, door.back!.y);
    p.send({ type: 'move', dx: 0, dy: -1 });
    run(600);
    assert.equal(sessionOf(world, p.id).map, 'interior_weapons');
    p.send({ type: 'move', dx: 0, dy: 1 });
    run(3000);
    assert.equal(sessionOf(world, p.id).map, 'vila_nevoa');
  });
});

describe('v16: passivas das vilas', () => {
  it('Pedra: +10% de vida; Névoa: +10% de velocidade; renegado: nada', async () => {
    const { world, join } = await setup(['vilas', 'pvp', 'renegados']);
    const base = join('kaito', 'vila_1');
    const pedra = join('iwa', 'vila_2');
    const nevoa = join('mizu', 'vila_3');
    const ren = join('nuke', null);
    const hp = (p: { id: string }) => sessionOf(world, p.id).stats.maxHp;
    const speed = (p: { id: string }) => sessionOf(world, p.id).stats.walkSpeed;
    assert.equal(hp(pedra), Math.round(hp(base) * 1.1));
    assert.equal(speed(nevoa), Math.round(speed(base) * 1.1 * 100) / 100);
    assert.equal(hp(ren), hp(base));
    assert.equal(speed(ren), speed(base));
  });

  it('Areia: +10% no que a arma soma ao Ataque Básico; Nuvem: +10% no dano dos jutsus', async () => {
    const { world, join, at } = await setup(['vilas']);
    const monsterHit = async (village: Village, act: (p: ReturnType<typeof join>) => void) => {
      const p = join(`n_${village}`, village, { items: { kunai: 1 }, equipped: 'kunai' });
      at(p, 'map_2', 10, 50);
      const m = world.spawnMonster({ x: 11, y: 50 }, undefined, 'map_2');
      const s = sessionOf(world, p.id);
      Object.assign(s, { fx: 1, fy: 0, chakra: 100, cooldowns: {} });
      act(p);
      const hit = p.conn.of('hit').find((h: { id: string }) => h.id === m.id);
      (world as any).monsters.delete(m.id);
      return hit.amount as number;
    };
    const attack = (p: ReturnType<typeof join>) => p.send({ type: 'attack' });
    const folha = await monsterHit('vila_1', attack);
    const areia = await monsterHit('vila_5', attack);
    const weapon = ITEM_BY_CODE.get('kunai')!.damage!;
    assert.ok(areia > folha && areia - folha <= Math.ceil(weapon * 0.1) + 1, `${areia} x ${folha}`);
    const fire = (p: ReturnType<typeof join>) => p.send({ type: 'cast', skill: 'water' });
    const f1 = await monsterHit('vila_1', fire);
    const nuvem = await monsterHit('vila_4', fire);
    assert.equal(nuvem, Math.round(f1 * 1.1));
  });
});

describe('v16: Zona de Conflito', () => {
  it('PvP livre fora do acampamento, menos aliados; a vitória vai para o banco (ranking, espólio)', async () => {
    const { world, fake, join, at } = await setup(['vilas', 'pvp']);
    fake.politics.relations.push({ a: 'vila_1', b: 'vila_2', state: 'alianca', declaredBy: 'vila_1' });
    await world.refreshPolitics();
    const a = join('kaito', 'vila_1');
    const ally = join('iwa', 'vila_2');
    const foe = join('mizu', 'vila_3');
    at(a, 'zona_conflito', 40, 30);
    at(ally, 'zona_conflito', 41, 30);
    a.send({ type: 'attack', targetId: ally.id });
    assert.equal(a.conn.last('attack_failed').reason, 'NO_TARGET');
    at(foe, 'zona_conflito', 41, 30.2);
    const s = sessionOf(world, a.id);
    Object.assign(s, { fx: 1, fy: 0, cooldowns: {} });
    sessionOf(world, foe.id).hp = 1;
    fake.setPvp({ lootRyo: 31, ryoWinner: 31 });
    a.send({ type: 'attack', targetId: foe.id });
    assert.equal(sessionOf(world, foe.id).dead, true);
    await flush();
    assert.deepEqual(fake.calls.find((c) => c[0] === 'pvpKill'), ['pvpKill', a.id, foe.id]);
    const r = a.conn.last('pvp_result');
    assert.equal(r.winnerDelta, 16);
    assert.equal(r.loot, 31);
    assert.equal(s.ryo, 31);
    assert.match(a.conn.last('notice').text, /Espólio/);
  });

  it('acampamento é zona segura; sem o módulo pvp ninguém luta lá; a arena da vila não conta para o ranking', async () => {
    const { world, fake, join, at } = await setup(['vilas']);
    const a = join('kaito', 'vila_1');
    const b = join('mizu', 'vila_3');
    at(a, 'zona_conflito', 40, 30);
    at(b, 'zona_conflito', 41, 30);
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(a.conn.last('attack_failed').reason, 'NO_TARGET');
    const arena = REALTIME.maps.map_1.arenas![0]!;
    const c = join('ryu', 'vila_1');
    at(a, 'map_1', arena.x + 4, arena.y + 4);
    at(c, 'map_1', arena.x + 5, arena.y + 4);
    Object.assign(sessionOf(world, a.id), { fx: 1, fy: 0, cooldowns: {} });
    sessionOf(world, c.id).hp = 1;
    a.send({ type: 'attack', targetId: c.id });
    assert.equal(sessionOf(world, c.id).dead, true);
    await flush();
    assert.ok(!fake.calls.some((x) => x[0] === 'pvpKill'));
  });

  it('karma: a vitória que transforma em renegado leva para o Refúgio (renascer, Posto) e todos ficam sabendo', async () => {
    const { world, fake, join, at } = await setup(['vilas', 'pvp', 'renegados']);
    const a = join('kaito', 'vila_1');
    const b = join('aya', 'vila_1');
    at(a, 'zona_conflito', 40, 30);
    at(b, 'zona_conflito', 41, 30);
    Object.assign(sessionOf(world, a.id), { fx: 1, fy: 0, cooldowns: {} });
    sessionOf(world, b.id).hp = 1;
    fake.setPvp({ becameRenegade: true });
    fake.setVillage(a.id, null, 'vila_1');
    a.send({ type: 'attack', targetId: b.id });
    await flush();
    const s = sessionOf(world, a.id);
    assert.equal(s.village, null);
    assert.match(b.conn.last('announce').message, /kaito virou renegado \(Folha\)/);
    assert.deepEqual(a.conn.last('player_faction').faction, { village: null, renegadeFrom: 'vila_1' });
    // Ainda na Zona (é dele também). Morrendo, renasce no Refúgio.
    assert.equal(s.map, 'zona_conflito');
    Object.assign(s, { hp: 0, dead: true, deadAt: 0 });
    a.send({ type: 'respawn' });
    assert.equal(s.map, 'refugio');
  });
});

describe('v16: renegados', () => {
  it('nasce no Refúgio, não entra em vila nenhuma e o Posto dele só vai para casa e para a Zona', async () => {
    const { world, join, at } = await setup(['vilas', 'pvp', 'renegados']);
    const r = join('nuke', null);
    assert.equal(r.conn.last('welcome').world.map, 'refugio');
    at(r, 'refugio', REFUGE.post.x, REFUGE.post.y + 1);
    r.send({ type: 'talk', npcId: 'travel_refugio' });
    assert.deepEqual(r.conn.last('travel_options').options.map((o: { to: string }) => o.to), ['zona_conflito']);
    at(r, 'map_2', 40, 0.5);
    r.send({ type: 'move', dx: 0, dy: -1 });
    (world as any).tick();
    assert.notEqual(sessionOf(world, r.id).map, 'map_1');
  });

  it('o Kage expulsa: o alvo online vira renegado na hora, vai para o Refúgio e todos ficam sabendo', async () => {
    const { world, fake, join } = await setup(['vilas', 'pvp', 'renegados']);
    const kage = join('hokage', 'vila_1');
    const t = join('traidor', 'vila_1');
    fake.politics.kages.push({ village: 'vila_1', playerId: kage.id, username: 'hokage', termEndsAt: 9e15 });
    await world.refreshPolitics();
    assert.equal(sessionOf(world, kage.id).kageOf, 'vila_1');
    fake.store.exile = async () => ({ ok: true, targetId: t.id, username: 'traidor' });
    fake.setVillage(t.id, null, 'vila_1');
    kage.send({ type: 'kage_exile', name: 'traidor', reason: 'atacou os companheiros' });
    await flush();
    assert.equal(sessionOf(world, t.id).map, 'refugio');
    assert.match(kage.conn.last('announce').message, /traidor virou renegado/);
    assert.equal(kage.conn.last('village_panel').isKage, true);
  });
});

describe('v16: Kage e diplomacia', () => {
  it('guerra declarada: o banco decide, o mundo relê a política e anuncia', async () => {
    const { world, fake, join } = await setup(['vilas']);
    const kage = join('hokage', 'vila_1');
    fake.politics.kages.push({ village: 'vila_1', playerId: kage.id, username: 'hokage', termEndsAt: 9e15 });
    await world.refreshPolitics();
    fake.store.kageAction = async () => {
      fake.politics.relations.push({ a: 'vila_1', b: 'vila_3', state: 'guerra', declaredBy: 'vila_1' });
      return { ok: true };
    };
    kage.send({ type: 'kage_action', action: 'guerra', village: 'vila_3' });
    await flush();
    assert.match(kage.conn.last('announce').message, /Folha declarou guerra à Vila da Névoa/);
    assert.equal(kage.conn.last('endgame').relations[0].state, 'guerra');
  });

  it('recusa do banco vira aviso; sem o módulo de vilas, o pedido nem vai ao banco', async () => {
    const { fake, join } = await setup(['vilas']);
    const p = join('kaito', 'vila_1');
    fake.store.vote = async () => ({ ok: false, text: 'Só Genin ou acima votam.' });
    p.send({ type: 'kage_vote', candidate: randomUUID() });
    await flush();
    assert.equal(p.conn.last('notice').text, 'Só Genin ou acima votam.');
    const off = await setup([]);
    const q = off.join('mei', 'vila_1');
    q.send({ type: 'village_panel' });
    assert.equal(q.conn.last('error').code, 'ENDGAME_OFF');
  });

  it('Criador com o módulo: escolher outra vila passa pelo banco (choose_village) e a passiva muda', async () => {
    const saved: unknown[] = [];
    const cfg = config();
    const fake = fakeEndgame(['vilas']);
    const profile = { saveAppearance: async (_id: string, a: unknown) => void saved.push(a) } as any;
    const world = new GameWorld(cfg, () => 1_000_000, undefined, { endgame: fake.store, profile });
    await world.endgameMaintenance();
    const id = randomUUID();
    const conn = new FakeConn();
    const h = world.join({ id, username: 'iwa', appearance: null, endgame: fake.player(id) }, conn);
    h.receive(JSON.stringify({ type: 'set_appearance', appearance: { ...DEFAULT_APPEARANCE, village: 'vila_2' } }));
    await flush();
    assert.deepEqual(fake.calls.find((c) => c[0] === 'chooseVillage'), ['chooseVillage', id, 'vila_2']);
    assert.equal(saved.length, 1);
    const s = sessionOf(world, id);
    assert.equal(s.village, 'vila_2');
    assert.equal(s.stats.maxHp, Math.round(REALTIME.combat.player.maxHp * 1.1));
  });
});

describe('v16: Akatsuki', () => {
  const member = async (slot: number) => {
    const env = await setup();
    const p = env.join('akat', null);
    env.fake.politics.akatsuki.push({ slot, playerId: p.id, username: 'akat' });
    await env.world.refreshPolitics();
    env.at(p, 'zona_conflito', 40, 30);
    const s = sessionOf(env.world, p.id);
    Object.assign(s, { chakra: 100, cooldowns: {}, fx: 1, fy: 0 });
    return { ...env, p, s };
  };

  it('os 10 poderes: uma vaga, um poder, nomes únicos', () => {
    assert.deepEqual(POWERS.map((p) => p.slot), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(new Set(POWERS.map((p) => p.code)).size, 10);
  });

  it('quem não é membro não usa poder', async () => {
    const { join } = await setup();
    const p = join('kaito', 'vila_1');
    p.send({ type: 'power' });
    assert.equal(p.conn.last('power_failed').reason, 'NOT_MEMBER');
  });

  it('Corvos da Ilusão: atordoa todos em volta; recarga e chakra contados pelo servidor', async () => {
    const { join, at, p, s, world } = await member(6);
    const foe = join('mizu', 'vila_3');
    at(foe, 'zona_conflito', 41.5, 30);
    p.send({ type: 'power' });
    assert.equal(p.conn.last('power').power, 'crows');
    assert.ok(sessionOf(world, foe.id).stunnedUntil > 0);
    assert.equal(s.chakra, 100 - POWERS[5]!.cost);
    p.send({ type: 'power' });
    assert.equal(p.conn.last('power_failed').reason, 'COOLDOWN');
  });

  it('Atração do Vazio: puxa o inimigo para perto; Máscara Intangível: nenhum dano', async () => {
    const env = await member(1);
    const foe = env.join('mizu', 'vila_3');
    env.at(foe, 'zona_conflito', 43.5, 30);
    env.p.send({ type: 'power' });
    const f = sessionOf(env.world, foe.id);
    assert.ok(f.x < 42, `x = ${f.x}`);
    assert.equal(foe.conn.last('teleport').playerId, foe.id);
    const masked = await member(10);
    masked.p.send({ type: 'power' });
    const hp = masked.s.hp;
    (masked.world as any).damagePlayer(masked.s, 50, 1_000_100);
    assert.equal(masked.s.hp, hp);
  });

  it('Cinco Corações: três golpes pela metade; Akatsuki não bate em Akatsuki', async () => {
    const env = await member(7);
    env.p.send({ type: 'power' });
    const before = env.s.hp;
    (env.world as any).damagePlayer(env.s, 20, 1_000_100);
    assert.equal(before - env.s.hp, 10);
    assert.equal(env.s.hearts, 2);
    const other = env.join('pain', null);
    env.fake.politics.akatsuki.push({ slot: 2, playerId: other.id, username: 'pain' });
    await env.world.refreshPolitics();
    env.at(other, 'zona_conflito', 41, 30);
    Object.assign(env.s, { cooldowns: {} });
    env.p.send({ type: 'attack', targetId: other.id });
    assert.equal(env.p.conn.last('attack_failed').reason, 'NO_TARGET');
  });

  it('convite: o líder convida, o alvo online recebe, aceitar o transforma (o banco decide)', async () => {
    const env = await setup();
    const leader = env.join('lider', null);
    const target = env.join('alvo', 'vila_1');
    env.fake.politics.akatsuki.push({ slot: 1, playerId: leader.id, username: 'lider' });
    await env.world.refreshPolitics();
    env.fake.store.akatsukiInvite = async () => ({ ok: true, targetId: target.id, username: 'alvo' });
    leader.send({ type: 'akatsuki_invite', name: 'alvo', slot: 4 });
    await flush();
    const inv = target.conn.last('akatsuki_invite');
    assert.equal(inv.from, 'lider');
    assert.equal(inv.power, 'Argila Viva');
    env.fake.store.akatsukiAccept = async () => {
      env.fake.politics.akatsuki.push({ slot: 4, playerId: target.id, username: 'alvo' });
      env.fake.setVillage(target.id, null, 'vila_1');
      env.fake.player(target.id).akatsukiSlot = 4;
      return { ok: true, slot: 4 };
    };
    target.send({ type: 'akatsuki_answer', accept: true });
    await flush();
    const s = sessionOf(env.world, target.id);
    assert.equal(s.akatsukiSlot, 4);
    assert.equal(s.village, null);
    assert.equal(s.map, 'refugio');
    assert.match(leader.conn.last('announce').message, /alvo entrou para a Akatsuki/);
  });
});

describe('v16: capas e o que mostrar no boneco', () => {
  it('equipar capa (do inventário) passa pelo banco e todos veem; esconder arma tira do boneco (o golpe continua)', async () => {
    const { world, fake, join } = await setup(['vilas']);
    const p = join('kaito', 'vila_1', { items: { capa_viagem: 1, kunai: 1 }, equipped: 'kunai' });
    const other = join('mei', 'vila_1');
    p.send({ type: 'equip', item: 'capa_viagem', slot: 'cape' });
    await flush();
    assert.deepEqual(fake.calls.find((c) => c[0] === 'equipCape'), ['equipCape', p.id, 'capa_viagem']);
    assert.equal(other.conn.last('player_faction').faction.cape, 'capa_viagem');
    p.send({ type: 'set_display', cape: false, weapon: false, scroll: true });
    assert.equal(other.conn.last('player_gear').gear.hand, null);
    assert.equal(other.conn.last('player_faction').faction.cape, undefined);
    assert.equal(sessionOf(world, p.id).equipped, 'kunai');
    p.send({ type: 'equip', item: 'manto_kage', slot: 'cape' });
    assert.match(p.conn.last('notice').text, /só do Kage/);
    p.send({ type: 'equip', item: 'kunai', slot: 'cape' });
    assert.equal(p.conn.last('error').code, 'NOT_A_CAPE');
  });
});

describe('v16: comandos de admin do fim de jogo', () => {
  it('lê os comandos novos (vila pelo nome, sem acento) e recusa formato errado', () => {
    const ok = (text: string) => {
      const r = parseAdminCommand(text, ['slime']);
      assert.ok(r.ok, text);
      return r.command;
    };
    assert.deepEqual(ok('/admin endgame pvp on'), { cmd: 'endgame', module: 'pvp', mode: 'on' });
    assert.deepEqual(ok('/admin vila Kaito nevoa'), { cmd: 'vila', username: 'Kaito', village: 'vila_3' });
    assert.deepEqual(ok('/admin kage Névoa Kaito'), { cmd: 'kage', village: 'vila_3', username: 'Kaito' });
    assert.deepEqual(ok('/admin evento tregua todas 12'), { cmd: 'evento', kind: 'tregua', a: null, b: null, hours: 12 });
    assert.deepEqual(ok('/admin evento guerra folha areia 24'), { cmd: 'evento', kind: 'guerra', a: 'vila_1', b: 'vila_5', hours: 24 });
    assert.deepEqual(ok('/admin renegado Kaito off'), { cmd: 'renegado', username: 'Kaito', on: false });
    assert.deepEqual(ok('/admin akatsuki lider Kaito'), { cmd: 'akatsuki', action: 'lider', username: 'Kaito' });
    assert.deepEqual(ok('/admin temporada fechar'), { cmd: 'temporada' });
    for (const bad of ['/admin endgame tudo on', '/admin vila Kaito lua', '/admin evento guerra folha 24', '/admin temporada abrir', '/admin renegado Kaito talvez']) {
      assert.equal(parseAdminCommand(bad, ['slime']).ok, false, bad);
    }
  });

  it('o admin manda; quem não é admin recebe "Comando desconhecido" e nada vai ao banco', async () => {
    const used: unknown[] = [];
    const admin: AdminStore = {
      findPlayer: async (name) => (name === 'alvo' ? { id: alvoId, username: 'alvo' } : undefined),
      setLevel: async () => ({ ok: false, text: '' }), giveJutsu: async () => ({ ok: false, text: '' }),
      giveItem: async () => ({ ok: false, text: '' }), giveRyo: async () => ({ ok: false, text: '' }), resetStats: async () => ({ ok: false, text: '' }),
      log: async () => undefined,
      endgame: async (adminId, c, target) => (used.push([adminId, c.cmd, target]), { ok: true, result: null }),
    };
    let alvoId = '';
    const env = await setup(['vilas'], admin);
    const boss = env.join('chefe', 'vila_1', { isAdmin: true });
    const alvo = env.join('alvo', 'vila_1');
    alvoId = alvo.id;
    const nobody = env.join('zé', 'vila_1');
    nobody.send({ type: 'chat', message: '/admin vila alvo nevoa' });
    assert.equal(nobody.conn.last('notice').text, 'Comando desconhecido.');
    boss.send({ type: 'chat', message: '/admin vila alvo nevoa' });
    await flush();
    assert.deepEqual(used, [[boss.id, 'vila', alvo.id]]);
    assert.match(boss.conn.last('notice').text, /alvo agora é da Vila da Névoa/);
    assert.equal(alvo.conn.of('announce').length, 0);           // admin não anuncia nada
  });
});

describe('v16: nomes e passivas no catálogo', () => {
  it('cada vila tem mapa, nome e uma passiva diferente', () => {
    const kinds = Object.values(VILLAGE_INFO).map((v) => v.passive.kind);
    assert.equal(new Set(kinds).size, 5);
    for (const v of Object.values(VILLAGE_INFO)) assert.ok(REALTIME.maps[v.map as keyof typeof REALTIME.maps], v.map);
  });
});
