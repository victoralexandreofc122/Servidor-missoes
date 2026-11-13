import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import type { Progression } from '../src/realtime/gameWorld.js';
import type { Missions } from '../src/realtime/missions.js';
import type { Profile, SpendResult } from '../src/realtime/profile.js';
import type { MissionView } from '../src/realtime/protocol.js';
import { derivedStats, levelForXp, levelProgress, levelStart, NO_ATTRIBUTES, scaledDamage } from '../src/realtime/stats.js';
import { setupWorld } from './support/world.js';

const S = REALTIME.spawn;
const M = REALTIME.combat.monsters;
const SK = REALTIME.combat.skills;
const BA = REALTIME.combat.basicAttack;

/** Monstros parados e posicionados à mão. */
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 }, monsters: { ...M, count: 0, stepMs: 1e12 } } };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const sess = (world: any, id: string) => world.sessions.get(id);
const monsterHp = (world: any, id: string) => world.monsterList().find((m: any) => m.id === id)?.hp;

function fakeProfile(points = 0) {
  const calls = { spend: [] as string[], save: [] as unknown[] };
  let statPoints = points;
  const attrs = { ...NO_ATTRIBUTES };
  const profile: Profile = {
    async spendPoint(_id, attribute): Promise<SpendResult> {
      calls.spend.push(attribute);
      if (statPoints <= 0) return { ok: false, reason: 'NO_POINTS' };
      statPoints -= 1;
      attrs[attribute] += 1;
      return { ok: true, statPoints, attributes: { ...attrs } };
    },
    async saveLoadout(_id, kitA, kitB) {
      calls.save.push([kitA, kitB]);
    },
    async saveAppearance() {},
    async resetAttributes() {
      return { ok: false, text: 'sem banco' };
    },
  };
  return { profile, calls };
}

describe('v5: atributos e nível (funções puras)', () => {
  it('meta crescente (v7, até o 60): N -> N+1 custa 100·N + 25·N·(N-1); o XP "zera" a cada nível', () => {
    assert.deepEqual([0, 99, 100, 349, 350, 799, 800].map(levelForXp), [1, 1, 2, 2, 3, 3, 4]);
    assert.deepEqual(levelProgress(400), { level: 3, xpInLevel: 50, xpToNext: 450 });
    assert.deepEqual(levelProgress(100), { level: 2, xpInLevel: 0, xpToNext: 250 });
    assert.deepEqual([levelStart(11), levelStart(40), levelStart(60)], [13_750, 572_000, 1_888_000]);
    assert.equal(levelForXp(10 ** 9), 60, 'nível máximo 60');
    assert.deepEqual(levelProgress(10 ** 9), { level: 60, xpInLevel: 0, xpToNext: 0 });
  });

  it('1º ponto: +10 vida, +10 chakra e +1/s meditando (Chakra), Taijutsu +5% físico, +0,1 velocidade e Básico mais rápido; +5% jutsu; Chakra +4% de cura; os seguintes com soft cap (v8, v53)', () => {
    const base = { maxHp: 100, maxChakra: 100, meditationChakraPerSec: 15, walkSpeed: 5, runSpeed: 8, attackCooldownMs: 600 };
    const one = derivedStats(base, REALTIME.combat.attributes, { vitality: 1, chakra: 1, taijutsu: 1, ninjutsu: 1, weapons: 1 });
    assert.deepEqual(one, { maxHp: 110, maxChakra: 110, meditationChakraPerSec: 16, walkSpeed: 5.1, runSpeed: 8.1, physicalMultiplier: 1.05, jutsuMultiplier: 1.05, weaponMultiplier: 1.05, attackCooldownMs: 598, healMultiplier: 1.04 });
    // 2 pontos = 1 + 1/1,05; 3 = ... + 1/1,10; 4 = ... + 1/1,15 (rendimento decrescente).
    const d = derivedStats(base, REALTIME.combat.attributes, { vitality: 2, chakra: 3, taijutsu: 2, ninjutsu: 4, weapons: 0 });
    assert.deepEqual(d, { maxHp: 120, maxChakra: 129, meditationChakraPerSec: 17.86, walkSpeed: 5.2, runSpeed: 8.2, physicalMultiplier: 1.098, jutsuMultiplier: 1.187, weaponMultiplier: 1, attackCooldownMs: 595, healMultiplier: 1.114 });
    assert.equal(scaledDamage(12, 1.1), 13);
    assert.equal(scaledDamage(25, 1.2), 30);
  });
});

describe('v5: energia', () => {
  it('vida só regenera com o chakra no MÁXIMO; meditar enche o chakra e a vida volta a subir', () => {
    const { world, connect, run } = setupWorld(config);
    const a = connect('kaito');
    const s = sess(world, a.id);
    s.hp = 50;
    run(2000);
    assert.ok(Math.abs(s.hp - 52) < 0.01, `chakra cheio: +1/s (${s.hp})`);
    a.send({ type: 'cast', skill: 'fire' });                     // chakra 80
    const hp = s.hp;
    run(3000);
    assert.equal(s.hp, hp, 'chakra abaixo do máximo: vida parada');
    assert.equal(s.chakra, 80, 'e o chakra não volta sozinho');
    a.send({ type: 'meditate', active: true });
    run(1400);                                                    // 15/s: 80 -> 100 em ~1,33 s
    assert.equal(s.chakra, 100);
    run(2000);                                                    // 6,4 s desde o golpe: ainda não
    assert.equal(s.hp, hp, 'v29: a vida espera 7 s sem gastar chakra');
    run(1600);
    assert.ok(s.hp > hp + 0.5, 'chakra cheio e 7 s de calma: a vida volta a subir');
  });

  it('v29: apanhar também segura a vida por 7 s (com o chakra cheio)', () => {
    const { world, connect, run, clock } = setupWorld(config);
    const a = connect('kaito');
    const s = sess(world, a.id);
    s.hp = 50;
    s.calmSince = clock.now();                                    // acabou de apanhar
    run(6500);
    assert.equal(s.hp, 50);
    run(1500);
    assert.ok(s.hp > 50.5);
  });

  it('Chakra (atributo, v8): também acelera a meditação (+1/s no 1º ponto, com soft cap)', () => {
    const { world, run } = setupWorld(config);
    const conn = new (class { sent: any[] = []; bufferedAmount = 0; send(d: string) { this.sent.push(JSON.parse(d)); } close() {} })();
    const handle = world.join({ id: 'p1', username: 'zen', attributes: { ...NO_ATTRIBUTES, chakra: 5 } }, conn);
    const s = sess(world, 'p1');
    s.chakra = 0;
    handle.receive(JSON.stringify({ type: 'meditate', active: true }));
    run(1000);
    assert.ok(Math.abs(s.chakra - 19.56) < 0.01, `15 + 4,56 (5 pontos com soft cap) = 19,56/s (${s.chakra})`);
  });
});

describe('v5: corrida e velocidade', () => {
  it('andar 5 casas/s, correr 8; o servidor decide (o cliente só liga/desliga)', () => {
    const { connect, run, pos } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'move', dx: 1, dy: 0 });
    run(1000);
    assert.ok(Math.abs(pos(a.id).x - (S.x + 5)) < 0.06, `andando: ${pos(a.id).x}`);
    a.send({ type: 'run', active: true });
    assert.deepEqual([a.conn.last('stats').speed, a.conn.last('stats').running], [8, true]);
    const x = pos(a.id).x;
    run(1000);
    assert.ok(Math.abs(pos(a.id).x - (x + 8)) < 0.06, `correndo: ${pos(a.id).x - x}`);
  });

  it('anti-hack: velocidade, posição ou joystick maior que 1 mandados pelo cliente não valem', () => {
    const { connect, run, pos } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'run', active: true, speed: 50 });            // campo extra: ignorado
    a.send({ type: 'move', dx: 1, dy: 0, x: 90, y: 90 });
    run(1000);
    assert.ok(pos(a.id).x - S.x <= 8.05, `no máximo 8 casas em 1 s (${pos(a.id).x - S.x})`);
    a.send({ type: 'move', dx: 5, dy: 0 });
    assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');
  });

  it('v53: Taijutsu dá velocidade: +0,1 no 1º ponto (soft cap nos seguintes) em andar E correr', () => {
    const { world } = setupWorld(config);
    const conn = new (class { sent: any[] = []; bufferedAmount = 0; send(d: string) { this.sent.push(JSON.parse(d)); } close() {} })();
    const h = world.join({ id: 'p2', username: 'rapido', attributes: { ...NO_ATTRIBUTES, taijutsu: 4 } }, conn);
    assert.equal(conn.sent[0].you.speed, 5.37);
    h.receive(JSON.stringify({ type: 'run', active: true }));
    assert.equal(conn.sent.at(-1).speed, 8.37);
  });
});

describe('v5: Ataque Básico (físico) vs jutsus', () => {
  it('Ataque Básico: não gasta chakra, 12 de dano, recarga 0,6 s, mira no focado se estiver no alcance', () => {
    const { world, connect, clock } = setupWorld(config);
    const a = connect('kaito');
    const near = world.spawnMonster({ x: S.x + 1, y: S.y });
    const focused = world.spawnMonster({ x: S.x - 1.5, y: S.y });
    a.send({ type: 'attack', targetId: focused.id });
    assert.equal(monsterHp(world, focused.id), M.maxHp - BA.damage);
    assert.equal(monsterHp(world, near.id), M.maxHp);
    assert.equal(sess(world, a.id).chakra, 100, 'chakra intacto');
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('attack_failed').reason, 'COOLDOWN');
    clock.advance(BA.cooldownMs);
    a.send({ type: 'attack' });                                   // sem alvo: o mais perto
    assert.equal(monsterHp(world, near.id), M.maxHp - BA.damage);
  });

  it('sem ninguém no alcance o golpe sai assim mesmo (e erra); focado longe: vira para ele e erra; a recarga vale', () => {
    const { world, connect, clock } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('attack_failed'), undefined);
    assert.deepEqual([a.conn.last('attack').fx, a.conn.last('attack').fy], [0, 1], 'para onde ele olha');
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('attack_failed').reason, 'COOLDOWN');
    clock.advance(REALTIME.combat.basicAttack.cooldownMs);
    const far = world.spawnMonster({ x: S.x + 5, y: S.y });
    a.send({ type: 'attack', targetId: far.id });
    assert.deepEqual([a.conn.last('attack').fx, a.conn.last('attack').fy], [1, 0], 'virou para o focado');
    assert.equal(monsterHp(world, far.id), M.maxHp, 'longe: errou');
    assert.equal(a.conn.of('attack').length, 2);
  });

  it('Taijutsu sobe SÓ o Ataque Básico; Ninjutsu sobe SÓ os jutsus', () => {
    const { world, run } = setupWorld(config);
    const mk = (id: string, attrs: Partial<typeof NO_ATTRIBUTES>) => {
      const conn = new (class { sent: any[] = []; bufferedAmount = 0; send(d: string) { this.sent.push(JSON.parse(d)); } close() {} })();
      const h = world.join({ id, username: id, attributes: { ...NO_ATTRIBUTES, ...attrs } }, conn);
      return (msg: unknown) => h.receive(JSON.stringify(msg));
    };
    const tai = mk('tai', { taijutsu: 4 });                       // +20% físico
    const nin = mk('nin', { ninjutsu: 4 });                       // +20% jutsu
    const target = () => {
      const m = world.spawnMonster({ x: S.x + 1, y: S.y });
      return m.id;
    };
    let m = target();
    tai({ type: 'attack' });
    assert.equal(monsterHp(world, m), M.maxHp - scaledDamage(BA.damage, 1.2), 'Taijutsu no ataque: 12 -> 14');
    (world as any).monsters.delete(m);
    m = target();
    tai({ type: 'cast', skill: 'fire' });
    run(300);                                                     // o Fogo é um projétil: o dano chega quando ele bate
    assert.equal(monsterHp(world, m), M.maxHp - SK.fire.damage!, 'Taijutsu NÃO mexe no Fogo');
    (world as any).monsters.delete(m);
    m = target();
    nin({ type: 'cast', skill: 'fire' });
    run(300);
    assert.equal(monsterHp(world, m), M.maxHp - scaledDamage(SK.fire.damage!, 1.2), 'Ninjutsu no Fogo: 25 -> 30');
    (world as any).monsters.delete(m);
    m = target();
    nin({ type: 'attack' });
    assert.equal(monsterHp(world, m), M.maxHp - BA.damage, 'Ninjutsu NÃO mexe no Ataque Básico');
  });

  it('atacar encerra a meditação (não dá para meditar lutando)', () => {
    const { world, connect } = setupWorld(config);
    const a = connect('kaito');
    world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'meditate', active: true });
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('meditation').reason, 'cast');
  });
});

describe('v5: kits (2 x 4 habilidades)', () => {
  it('só o kit ATIVO vale; trocar de kit é o servidor que confirma', () => {
    const { world, connect } = setupWorld(config);
    const a = connect('kaito');
    world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'cast', skill: 'illusion' });                  // kit B, ativo é A
    assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill: 'illusion', reason: 'NOT_EQUIPPED' });
    assert.equal(sess(world, a.id).chakra, 100, 'não cobrou');
    a.send({ type: 'switch_kit', kit: 'B' });
    assert.deepEqual(a.conn.last('kit').active, 'B');
    a.send({ type: 'cast', skill: 'illusion' });
    assert.equal(a.conn.last('monster_status').status, 'stunned');
    a.send({ type: 'cast', skill: 'fire' });                      // agora o Fogo (kit A) está fora
    assert.equal(a.conn.last('cast_failed').reason, 'NOT_EQUIPPED');
  });

  it('montar kits: até 4, sem repetir, só habilidades que existem; salva no banco e vale depois de salvo', async () => {
    const { profile, calls } = fakeProfile();
    const { world, connect, clock } = setupWorld(config, undefined, undefined, profile);
    const a = connect('kaito');
    for (const bad of [
      { kitA: ['fire', 'water', 'taijutsu', 'heal', 'stone'], kitB: [] },
      { kitA: ['fire', 'fire'], kitB: [] },
      { kitA: ['rasengan'], kitB: [] },
    ]) {
      a.send({ type: 'set_loadout', ...bad });
      assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');
    }
    a.send({ type: 'set_loadout', kitA: ['illusion', 'fire'], kitB: ['heal'] });
    assert.deepEqual(sess(world, a.id).kits.A, ['fire', 'water', 'taijutsu', 'heal'], 'ainda não gravou');
    await flush();
    assert.deepEqual(calls.save, [[['illusion', 'fire'], ['heal']]]);
    assert.deepEqual(a.conn.last('kit'), { type: 'kit', active: 'A', kits: { A: ['illusion', 'fire'], B: ['heal'] } });
    clock.advance(1000);
    world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'cast', skill: 'illusion' });
    assert.equal(a.conn.last('monster_status').status, 'stunned');
  });

  it('sem banco de ficha: PROFILE_UNAVAILABLE', () => {
    const { connect } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'set_loadout', kitA: ['fire'], kitB: [] });
    assert.equal(a.conn.last('error').code, 'PROFILE_UNAVAILABLE');
  });
});

describe('v5: pontos de atributo', () => {
  it('sem ponto: NO_POINTS sem tocar no banco; com ponto: vida máxima +10, a vida sobe junto e os outros veem', async () => {
    const { profile, calls } = fakeProfile(1);
    const { world, connect, clock } = setupWorld(config, undefined, undefined, profile);
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'spend_point', attribute: 'vitality' });
    assert.equal(a.conn.last('error').code, 'NO_POINTS', 'a sessão sabe que tem 0');
    assert.deepEqual(calls.spend, []);
    sess(world, a.id).statPoints = 1;                              // (como se tivesse subido de nível)
    a.send({ type: 'spend_point', attribute: 'vitality' });
    await flush();
    const p = a.conn.last('progress');
    assert.deepEqual([p.statPoints, p.attributes.vitality, p.derived.maxHp], [0, 1, 110]);
    assert.deepEqual([a.conn.last('stats').hp, a.conn.last('stats').maxHp], [110, 110]);
    assert.deepEqual(b.conn.last('player_hp'), { type: 'player_hp', playerId: a.id, hp: 110, maxHp: 110 });
    clock.advance(1000);
    a.send({ type: 'spend_point', attribute: 'nonsense' });
    assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');
  });

  it('subir de nível (XP do banco): +1 ponto, aviso e o nível novo para todos', async () => {
    const progression: Progression = {
      async grantXp() {
        return { totalXp: 100, rank: { code: 'GENIN', name: 'Genin' }, promoted: true, level: 2, statPoints: 1, levelsGained: 1 };
      },
    };
    const { world, connect } = setupWorld(config, progression);
    const a = connect('kaito');
    const b = connect('mei');
    const m = world.spawnMonster({ x: S.x + 1, y: S.y });
    (world as any).monsters.get(m.id).hp = 1;
    a.send({ type: 'attack' });
    await flush();
    assert.deepEqual([a.conn.last('progress').level, a.conn.last('progress').statPoints, a.conn.last('progress').xpInLevel], [2, 1, 0]);
    assert.match(a.conn.last('notice').text, /Nível 2! \+1 ponto/);
    assert.deepEqual(b.conn.last('player_rank'), { type: 'player_rank', playerId: a.id, rank: { code: 'GENIN', name: 'Genin' }, level: 2 });
  });

  it('Vitalidade e Chakra já valem ao entrar (vida e chakra cheios no máximo novo)', () => {
    const { world } = setupWorld(config);
    const conn = new (class { sent: any[] = []; bufferedAmount = 0; send(d: string) { this.sent.push(JSON.parse(d)); } close() {} })();
    world.join({ id: 'p3', username: 'forte', attributes: { ...NO_ATTRIBUTES, vitality: 3, chakra: 2 } }, conn);
    const you = conn.sent[0].you;
    assert.deepEqual([you.hp, you.maxHp, you.chakra, you.maxChakra], [129, 129, 120, 120]);
  });
});

describe('v5: missões entre jogadores (sensei Chunin+)', () => {
  const view = (extra: Partial<MissionView> = {}): MissionView => ({
    id: '0199a000-0000-7000-8000-0000000000aa', status: 'active', senseiName: 'obito', senseiId: 'obito', fromNpc: false,
    type: { code: 'DEFEAT_MONSTER', name: 'Derrotar monstros' }, target: { code: 'slime', quantity: 3 },
    progress: 0, reward: { xp: 100, title: null }, expiresAt: null, ready: false, ...extra,
  });

  function fakeMissions() {
    const calls: unknown[][] = [];
    const missions: Missions = {
      async current() { return null; },
      async talk() { return { kind: 'unavailable' }; },
      async board() { return []; },
      async recordKill() { return null; },
      async create(...args) { calls.push(['create', ...args]); return { kind: 'created', mission: view() }; },
      async deliver(...args) { calls.push(['deliver', ...args]); return { kind: 'submitted', mission: view({ status: 'submitted', progress: 3, ready: false }) }; },
      async evaluate(...args) { calls.push(['evaluate', ...args]); return { kind: 'evaluated', approved: true, traineeId: String(args[3] ?? ''), mission: view({ status: 'approved', progress: 3, ready: true }), traineeRank: { code: 'ACADEMY', name: 'Academia', canBeSensei: false } }; },
      async pendingEvaluations() { return [{ missionId: 'x', trainee: { id: 't', username: 'naruto' }, mission: view({ status: 'submitted' }) }]; },
      async senseiOptions() { return [{ code: 'BASIC', name: 'Básica', xp: 100, title: null }]; },
    };
    return { missions, calls };
  }

  it('sensei conecta: recebe as opções de missão e as entregas esperando avaliação', async () => {
    const { missions } = fakeMissions();
    const { world } = setupWorld(config, undefined, missions);
    const conn = new (class { sent: any[] = []; bufferedAmount = 0; send(d: string) { this.sent.push(JSON.parse(d)); } close() {} })();
    world.join({ id: 'obito', username: 'obito', canBeSensei: true }, conn);
    await flush();
    assert.deepEqual(conn.sent.find((m) => m.type === 'sensei_options'), {
      type: 'sensei_options', difficulties: [{ code: 'BASIC', name: 'Básica', xp: 100, title: null }], quantities: [3, 5, 10],
    });
    assert.equal(conn.sent.find((m) => m.type === 'evaluation_request').trainee.username, 'naruto');
  });

  it('criar: perto (3 casas, posição do servidor), quantidade da lista; aprendiz recebe a missão e o aviso', async () => {
    const { missions, calls } = fakeMissions();
    const { world, connect, clock } = setupWorld(config, undefined, missions);
    const sensei = connect('obito');
    const trainee = connect('naruto');
    sensei.send({ type: 'create_mission', traineeId: trainee.id, difficulty: 'BASIC', quantity: 7 });
    assert.equal(sensei.conn.last('error').code, 'INVALID_MISSION_OPTION');
    sensei.send({ type: 'create_mission', traineeId: sensei.id, difficulty: 'BASIC', quantity: 3 });
    assert.equal(sensei.conn.last('error').code, 'PLAYER_NOT_FOUND', 'não cria para si mesmo');
    sess(world, trainee.id).x = S.x + 3.5;
    sensei.send({ type: 'create_mission', traineeId: trainee.id, difficulty: 'BASIC', quantity: 3 });
    assert.equal(sensei.conn.last('error').code, 'PLAYER_TOO_FAR');
    assert.equal(calls.length, 0, 'nada chegou ao banco');
    sess(world, trainee.id).x = S.x + 2;
    sensei.send({ type: 'create_mission', traineeId: trainee.id, difficulty: 'BASIC', quantity: 3 });
    await flush();
    assert.deepEqual(calls, [['create', sensei.id, trainee.id, 'BASIC', 3]]);
    assert.equal(trainee.conn.last('mission').reason, 'assigned');
    assert.match(trainee.conn.last('notice').text, /O sensei obito te passou uma missão: Derrotar 3 slimes/);
    assert.match(sensei.conn.last('notice').text, /Missão criada para naruto/);
    clock.advance(1000);
  });

  it('entregar (aprendiz toca no sensei) -> o sensei recebe o pedido de avaliação; avaliar -> o aprendiz é avisado', async () => {
    const { missions, calls } = fakeMissions();
    const { connect, clock } = setupWorld(config, undefined, missions);
    const sensei = connect('obito');
    const trainee = connect('naruto');
    trainee.send({ type: 'deliver_mission', senseiId: sensei.id });
    await flush();
    assert.deepEqual(calls[0], ['deliver', trainee.id, sensei.id]);
    assert.equal(sensei.conn.last('evaluation_request').trainee.username, 'naruto');
    assert.match(trainee.conn.last('notice').text, /Aguarde a avaliação/);
    clock.advance(1000);
    // O fake devolve traineeId vazio; o que importa é o comando chegar com o avaliador = quem enviou.
    sensei.send({ type: 'evaluate_mission', missionId: '0199a000-0000-7000-8000-0000000000aa', approved: true, score: 5 });
    await flush();
    assert.deepEqual(calls[1], ['evaluate', sensei.id, '0199a000-0000-7000-8000-0000000000aa', true, 5]);
    assert.match(sensei.conn.last('notice').text, /aprovada/);
    sensei.send({ type: 'evaluate_mission', missionId: 'nao-e-uuid', approved: true, score: 9 });
    assert.equal(sensei.conn.last('error').code, 'INVALID_MESSAGE');
  });
});
