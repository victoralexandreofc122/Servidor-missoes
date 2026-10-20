import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distance, inCone, nearest, randomInRing, shieldedDamage } from '../src/realtime/combat.js';
import { REALTIME, type CombatConfig, type RealtimeConfig } from '../src/realtime/config.js';
import type { Progression } from '../src/realtime/gameWorld.js';
import { seededRandom, setupWorld } from './support/world.js';

const S = REALTIME.spawn;
const M = REALTIME.combat.monsters;
const SK = REALTIME.combat.skills;

/** Monstros parados (stepMs enorme) e colocados à mão: cada teste controla quem está onde. */
function config(monsters: Partial<CombatConfig['monsters']> = {}, player: Partial<CombatConfig['player']> = {}): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      monsters: { ...M, count: 0, stepMs: 1e12, ...monsters },
      player: { ...REALTIME.combat.player, ...player },
    },
  };
}

function fakeProgression(threshold = 100) {
  const calls: [string, number][] = [];
  const totals = new Map<string, number>();
  const progression: Progression = {
    async grantXp(id, amount) {
      calls.push([id, amount]);
      const before = totals.get(id) ?? 0;
      const total = before + amount;
      totals.set(id, total);
      const genin = total >= threshold;
      return { totalXp: total, rank: genin ? { code: 'GENIN', name: 'Genin' } : { code: 'ACADEMY', name: 'Academia' }, promoted: genin && before < threshold };
    },
  };
  return { progression, calls };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Mexe direto no estado interno (só em teste): posição e vida do monstro, recarga e chakra do jogador. */
function place(world: any, monsterId: string, x: number, y: number, hp?: number) {
  const m = world.monsters.get(monsterId);
  m.x = x;
  m.y = y;
  if (hp !== undefined) m.hp = hp;
}
function ready(world: any, playerId: string) {
  const s = world.sessions.get(playerId);
  s.cooldowns = {};
  s.chakra = 100;
}
const monsterHp = (world: any, id: string) => world.monsterList().find((m: any) => m.id === id)?.hp;

describe('combate: geometria', () => {
  it('cone, mais perto, escudo e ponto no anel', () => {
    const o = { x: 0, y: 0 };
    assert.equal(inCone(o, 1, 0, { x: 3, y: 0.5 }, 4, 90), true);
    assert.equal(inCone(o, 1, 0, { x: 3, y: 3.5 }, 4, 90), false, 'fora do ângulo');
    assert.equal(inCone(o, 1, 0, { x: -2, y: 0 }, 4, 90), false, 'atrás');
    assert.equal(inCone(o, 1, 0, { x: 5, y: 0 }, 4, 90), false, 'longe');
    assert.equal(nearest(o, [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }], 3)?.x, 1);
    assert.equal(shieldedDamage(10, 0.5), 5);
    assert.equal(shieldedDamage(7, 0.5), 4);
    const r = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const d = distance(randomInRing(S, 5, 16, r), S);
      assert.ok(d >= 4.3 && d <= 16.8, String(d));
    }
  });
});

describe('combate: monstros', () => {
  it('o mundo mantém 5 monstros na zona de caça (fora da área segura do centro), andando ~1 casa por segundo', () => {
    const { world, connect, run } = setupWorld(REALTIME);
    const a = connect('kaito');
    assert.equal(a.conn.of('welcome')[0].monsters.length, 5);
    const before = world.monsterList();
    run(30_000);
    const after = world.monsterList();
    assert.equal(after.length, 5);
    for (const m of after) {
      const d = distance(m, S);
      assert.ok(d >= M.safeRadius && d <= M.zoneRadius, `monstro fora da zona: ${d}`);
      assert.ok(Number.isInteger(m.x) && Number.isInteger(m.y));
    }
    assert.ok(after.some((m, i) => m.x !== before[i]!.x || m.y !== before[i]!.y), 'monstros andaram');
    const batches = a.conn.of('monsters_moved');
    assert.ok(batches.length > 10 && batches.length <= 30 * 5, `${batches.length} lotes em 30 s`);
    for (const batch of batches) for (const [, x, y] of batch.m) assert.ok(Number.isInteger(x) && Number.isInteger(y));
  });

  it('monstro ataca quem está colado, a cada 2 s; longe (2 casas) não ataca', () => {
    const { world, connect, run } = setupWorld(config({}, { hpRegenPerSec: 0 }));
    const a = connect('kaito');
    const b = connect('longe');
    world.spawnMonster({ x: S.x + 1, y: S.y });
    run(4900);                                               // ataques em t≈0, 2 s e 4 s
    const hitsOnA = a.conn.of('hit').filter((h) => h.target === 'player' && h.id === a.id);
    assert.equal(hitsOnA.length, 3);
    assert.equal(a.conn.last('stats').hp, 100 - 3 * M.attackDamage);
    assert.equal(b.conn.of('hit').filter((h) => h.id === b.id).length, 0, 'cada monstro bate em um só (o mais perto)');
    assert.equal(b.conn.of('hit').length, 3, 'todos veem os números de dano');
  });
});

describe('combate: habilidades', () => {
  it('Fogo (20 chakra): área de 3 casas; quem está a 3,5 não é atingido', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const b = connect('mei');
    const near = world.spawnMonster({ x: S.x + 2, y: S.y });
    const edge = world.spawnMonster({ x: S.x, y: S.y - 3 });
    const far = world.spawnMonster({ x: S.x + 3, y: S.y + 2 });   // ~3,6 casas
    a.send({ type: 'cast', skill: 'fire' });
    assert.deepEqual(b.conn.last('cast'), { type: 'cast', playerId: a.id, skill: 'fire', x: S.x, y: S.y, fx: 0, fy: 1 });
    assert.equal(monsterHp(world, near.id), M.maxHp - SK.fire.damage!);
    assert.equal(monsterHp(world, edge.id), M.maxHp - SK.fire.damage!);
    assert.equal(monsterHp(world, far.id), M.maxHp);
    assert.equal(a.conn.last('stats').chakra, 100 - SK.fire.cost);
    assert.deepEqual(b.conn.of('hit').map((h) => [h.target, h.amount, h.kind]), [['monster', 25, 'damage'], ['monster', 25, 'damage']]);
  });

  it('Água (15 chakra): cone na frente de onde o jogador olhou por último', () => {
    const { world, connect, run } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'move', dx: 1, dy: 0 });                     // vira para a direita
    run(50);
    a.send({ type: 'move', dx: 0, dy: 0 });
    const ax = S.x + 0.25;
    const front = world.spawnMonster({ x: Math.round(ax + 3), y: S.y });
    const behind = world.spawnMonster({ x: Math.round(ax - 2), y: S.y });
    const side = world.spawnMonster({ x: Math.round(ax), y: S.y + 3 });
    a.send({ type: 'cast', skill: 'water' });
    assert.equal(monsterHp(world, front.id), M.maxHp - SK.water.damage!);
    assert.equal(monsterHp(world, behind.id), M.maxHp);
    assert.equal(monsterHp(world, side.id), M.maxHp);
    assert.equal(a.conn.last('cast').fx, 1);
  });

  it('Taijutsu (5 chakra): dano alto só no MAIS PERTO a até 1,5 casa; sem alvo não gasta chakra', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill: 'taijutsu', reason: 'NO_TARGET' });
    assert.equal(a.conn.of('stats').length, 0, 'nada foi cobrado');
    const m1 = world.spawnMonster({ x: S.x + 1, y: S.y });
    const m2 = world.spawnMonster({ x: S.x - 1, y: S.y + 1 });   // 1,41: mais longe
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal(monsterHp(world, m1.id), M.maxHp - SK.taijutsu.damage!);
    assert.equal(monsterHp(world, m2.id), M.maxHp);
    assert.equal(a.conn.last('stats').chakra, 95);
  });

  it('Ilusão (30 chakra): atordoa por 3 s, o monstro não anda nem ataca; depois volta', () => {
    const { world, connect, run } = setupWorld(config({ stepMs: 200 }, { hpRegenPerSec: 0 }));
    const a = connect('kaito');
    const m = world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'switch_kit', kit: 'B' });                // Ilusão está no kit B (padrão)
    a.send({ type: 'cast', skill: 'illusion' });
    assert.deepEqual(a.conn.last('monster_status'), { type: 'monster_status', id: m.id, status: 'stunned', ms: 3000 });
    run(2900);
    const still = world.monsterList().find((x) => x.id === m.id)!;
    assert.deepEqual([still.x, still.y], [m.x, m.y], 'atordoado não anda');
    assert.equal(a.conn.of('hit').filter((h) => h.target === 'player').length, 0, 'atordoado não ataca');
    run(2000);
    const moved = world.monsterList().find((x) => x.id === m.id)!;
    const attacked = a.conn.of('hit').some((h) => h.target === 'player');
    assert.ok(moved.x !== m.x || moved.y !== m.y || attacked, 'depois de 3 s volta a agir');
  });

  it('Sombra (25 chakra): prende por 5 s, o monstro não anda mas ainda ataca', () => {
    const { world, connect, run } = setupWorld(config({ stepMs: 200 }, { hpRegenPerSec: 0 }));
    const a = connect('kaito');
    const m = world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'switch_kit', kit: 'B' });
    a.send({ type: 'cast', skill: 'shadow' });
    assert.equal(a.conn.last('monster_status').status, 'rooted');
    assert.equal(a.conn.last('monster_status').ms, 5000);
    run(4900);
    const still = world.monsterList().find((x) => x.id === m.id)!;
    assert.deepEqual([still.x, still.y], [m.x, m.y], 'preso não anda');
    assert.ok(a.conn.of('hit').filter((h) => h.target === 'player').length >= 2, 'preso ainda ataca');
  });

  it('Pedra (15 chakra): o próximo dano cai pela metade; o seguinte é normal', () => {
    const { world, connect, run } = setupWorld(config({}, { hpRegenPerSec: 0 }));
    const a = connect('kaito');
    a.send({ type: 'switch_kit', kit: 'B' });
    a.send({ type: 'cast', skill: 'stone' });
    assert.equal(a.conn.last('stats').shield, true);
    a.send({ type: 'cast', skill: 'stone' });
    assert.equal(a.conn.last('cast_failed').reason, 'COOLDOWN');
    world.spawnMonster({ x: S.x + 1, y: S.y });
    run(2100);
    const hits = a.conn.of('hit').filter((h) => h.target === 'player');
    assert.deepEqual(hits.map((h) => [h.amount, h.shielded ?? false]), [[5, true], [10, false]]);
    assert.equal(a.conn.last('stats').shield, false);
  });

  it('Cura (30 chakra): +30 de vida até o máximo; com vida cheia não gasta chakra', () => {
    const { world, clock, connect, run } = setupWorld(config({ attackDamage: 45 }, { hpRegenPerSec: 0 }));
    const a = connect('kaito');
    a.send({ type: 'cast', skill: 'heal' });
    assert.equal(a.conn.last('cast_failed').reason, 'FULL_HP');
    world.spawnMonster({ x: S.x + 1, y: S.y });
    run(50);                                                 // 1 ataque: 100 -> 55
    a.send({ type: 'move', dx: -1, dy: 0 });
    run(600);                                                // sai de perto antes do próximo ataque
    a.send({ type: 'move', dx: 0, dy: 0 });
    clock.advance(10);
    a.send({ type: 'cast', skill: 'heal' });
    const heal = a.conn.of('hit').find((h) => h.kind === 'heal');
    assert.deepEqual([heal.amount, heal.hp], [30, 85]);
    assert.equal(a.conn.last('stats').chakra < 100, true);
  });

  it('chakra: NÃO regenera sozinho (só meditando); sem chakra suficiente falha (NO_CHAKRA)', () => {
    const { connect, run } = setupWorld(config());
    const a = connect('kaito');
    for (let i = 0; i < 4; i++) {
      a.send({ type: 'cast', skill: 'fire' });                // 100 -> 80 -> 60 -> 40 -> 20
      run(1500);
    }
    assert.equal(a.conn.last('stats').chakra, 20, 'nada voltou em 6 s andando/parado');
    a.send({ type: 'cast', skill: 'fire' });                  // custa 20, tem 20: ainda dá
    run(1500);
    a.send({ type: 'cast', skill: 'fire' });                  // 0
    assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill: 'fire', reason: 'NO_CHAKRA' });
    run(5000);
    assert.equal(a.conn.last('stats').chakra, 0, 'continua 0 sem meditar');
  });

  it('recarga: Fogo duas vezes seguidas: a segunda falha (COOLDOWN) e só cobra uma vez', () => {
    const { connect } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'cast', skill: 'fire' });
    a.send({ type: 'cast', skill: 'fire' });
    assert.equal(a.conn.of('cast').length, 1);
    assert.equal(a.conn.last('cast_failed').reason, 'COOLDOWN');
    assert.equal(a.conn.last('stats').chakra, 80);
  });
});

describe('combate: morte, renascimento e autoridade do servidor', () => {
  it('HP 0: morre (todos veem), não anda nem usa habilidade; renascer só depois de 5 s, no centro, cheio', () => {
    const { world, clock, connect, run, pos } = setupWorld(config({ attackDamage: 100 }));
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'move', dx: 1, dy: 0 });
    run(400);                                                 // a sai do centro (S.x + 2)
    a.send({ type: 'move', dx: 0, dy: 0 });
    b.send({ type: 'move', dx: -1, dy: 0 });
    run(1000);                                                // b longe (S.x - 5)
    b.send({ type: 'move', dx: 0, dy: 0 });
    world.spawnMonster({ x: S.x + 3, y: S.y });
    run(50);
    assert.deepEqual(b.conn.last('player_died'), { type: 'player_died', playerId: a.id, respawnInMs: 5000 });
    assert.equal(a.conn.last('stats').hp, 0);

    const where = pos(a.id);
    a.send({ type: 'move', dx: -1, dy: 0 });
    run(500);
    assert.deepEqual(pos(a.id), where, 'morto não anda');
    a.send({ type: 'cast', skill: 'heal' });
    assert.equal(a.conn.last('cast_failed').reason, 'DEAD');
    const hitsWhileDead = a.conn.of('hit').filter((h) => h.target === 'player').length;
    run(2000);
    assert.equal(a.conn.of('hit').filter((h) => h.target === 'player').length, hitsWhileDead, 'monstro ignora morto');

    a.send({ type: 'respawn' });                              // ~2,5 s depois da morte
    assert.equal(a.conn.last('error').code, 'RESPAWN_NOT_READY');
    clock.advance(2600);
    a.send({ type: 'respawn' });
    assert.deepEqual(b.conn.last('player_respawned'), { type: 'player_respawned', playerId: a.id, x: S.x, y: S.y, hp: 100, maxHp: 100 });
    assert.deepEqual([a.conn.last('stats').hp, a.conn.last('stats').chakra], [100, 100]);
    a.send({ type: 'respawn' });
    assert.equal(a.conn.last('error').code, 'RESPAWN_NOT_READY', 'vivo não "renasce" de novo');
  });

  it('monstro morto: XP para o ÚLTIMO golpe (gravado antes de avisar), outro nasce na hora; 100 XP: aviso de Genin', async () => {
    const fake = fakeProgression(100);
    const { world, connect } = setupWorld({ ...config(), combat: { ...config().combat, monsters: { ...config().combat.monsters, count: 1 } } }, fake.progression);
    const a = connect('kaito');
    const b = connect('mei');
    for (let kill = 1; kill <= 5; kill++) {
      const target = world.monsterList()[0]!;
      place(world, target.id, S.x + 1, S.y, 10);
      const who = kill === 5 ? b : a;
      ready(world, who.id);
      who.send({ type: 'cast', skill: 'taijutsu' });
      assert.deepEqual(a.conn.last('monster_died'), { type: 'monster_died', id: target.id, killerId: who.id });
      assert.equal(world.monsterList().length, 1, 'sempre o mesmo número de monstros');
      assert.equal(a.conn.last('monster_spawned').monster.hp, M.maxHp);
      await flush();
    }
    assert.deepEqual(fake.calls.map(([id, xp]) => [id === a.id ? 'a' : 'b', xp]), [['a', 20], ['a', 20], ['a', 20], ['a', 20], ['b', 20]]);
    assert.deepEqual(a.conn.of('xp').map((x) => x.totalXp), [20, 40, 60, 80]);
    assert.equal(b.conn.last('xp').totalXp, 20);
    const fake2 = fakeProgression(100);
    const w2 = setupWorld(config(), fake2.progression);
    const p = w2.connect('kaito');
    const o = w2.connect('outro');
    for (let i = 0; i < 5; i++) {
      const m = w2.world.spawnMonster({ x: S.x + 1, y: S.y });
      place(w2.world, m.id, S.x + 1, S.y, 1);
      ready(w2.world, p.id);
      p.send({ type: 'cast', skill: 'taijutsu' });
      await flush();
    }
    assert.deepEqual(p.conn.last('xp'), { type: 'xp', gained: 20, totalXp: 100, rank: { code: 'GENIN', name: 'Genin' }, promoted: true });
    assert.deepEqual(o.conn.of('announce'), [{ type: 'announce', message: 'kaito subiu para Genin!' }]);
  });

  it('banco fora do ar ao gravar XP: o jogo segue, sem aviso falso de XP', async () => {
    const { world, connect } = setupWorld(config(), { grantXp: async () => { throw new Error('banco caiu'); } });
    const a = connect('kaito');
    const m = world.spawnMonster({ x: S.x + 1, y: S.y });
    place(world, m.id, S.x + 1, S.y, 1);
    a.send({ type: 'cast', skill: 'taijutsu' });
    await flush();
    assert.equal(a.conn.of('monster_died').length, 1);
    assert.equal(a.conn.of('xp').length, 0);
    assert.equal(world.online, 1);
  });

  it('o cliente não decide nada: "hit" e "stats" do cliente são recusados; campos extras (damage) são ignorados', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const m = world.spawnMonster({ x: S.x + 1, y: S.y });
    a.send({ type: 'hit', target: 'monster', id: m.id, amount: 9999 });
    a.send({ type: 'stats', hp: 9999 });
    assert.equal(a.conn.of('error').filter((e) => e.code === 'INVALID_MESSAGE').length, 2);
    a.send({ type: 'cast', skill: 'taijutsu', damage: 9999, target: 'qualquer' });
    assert.equal(monsterHp(world, m.id), M.maxHp - SK.taijutsu.damage!);
  });

  it('desempenho: 100 jogadores andando + 5 monstros: um tick leva bem menos que os 50 ms do loop', () => {
    const { world, clock } = setupWorld(REALTIME);
    let sent = 0;
    const conn = () => ({ send: () => { sent += 1; }, close: () => {}, bufferedAmount: 0 });
    const handles = Array.from({ length: 100 }, (_, i) => world.join({ id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`, username: `p${i}` }, conn()));
    handles.forEach((h, i) => h.receive(JSON.stringify({ type: 'move', dx: Math.cos(i), dy: Math.sin(i) })));
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      clock.advance(50);
      world.tick();
    }
    const perTick = (performance.now() - t0) / 20;
    assert.ok(perTick < 20, `${perTick.toFixed(2)} ms por tick`);
    assert.ok(sent >= 20 * 100 * 100, 'cada jogador recebe a posição de cada um (N x N)');
    assert.equal(world.online, 100);
  });
});

describe('jutsus direcionados (targetId)', () => {
  it('Água com alvo: o servidor mira no alvo mesmo com o jogador virado para o outro lado', () => {
    const { world, connect, run } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'move', dx: -1, dy: 0 });                 // olhando para a ESQUERDA
    run(50);
    a.send({ type: 'move', dx: 0, dy: 0 });
    const ax = S.x - 0.25;
    const right = world.spawnMonster({ x: Math.round(ax + 3), y: S.y });   // à DIREITA, a ~3,25
    const left = world.spawnMonster({ x: Math.round(ax - 2), y: S.y });    // na frente de onde olhava
    a.send({ type: 'cast', skill: 'water', targetId: right.id });
    assert.equal(monsterHp(world, right.id), M.maxHp - SK.water.damage!, 'acertou o alvo atrás');
    assert.equal(monsterHp(world, left.id), M.maxHp, 'o cone virou: quem estava na frente antiga não apanha');
    const cast = a.conn.last('cast');
    assert.equal(cast.fx, 1);
    assert.equal(cast.fy, 0);
  });

  it('alcance continua valendo: alvo longe demais = OUT_OF_RANGE, sem gastar chakra nem recarga', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const far = world.spawnMonster({ x: S.x + 6, y: S.y });  // Água 4, Ilusão/Sombra 5, Fogo 3
    for (const skill of ['water', 'illusion', 'shadow', 'fire']) {
      a.send({ type: 'switch_kit', kit: skill === 'water' || skill === 'fire' ? 'A' : 'B' });
      a.send({ type: 'cast', skill, targetId: far.id });
      assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill, reason: 'OUT_OF_RANGE' });
    }
    assert.equal(a.conn.of('stats').length, 0, 'nada cobrado');
    assert.equal(monsterHp(world, far.id), M.maxHp);
    const near = world.spawnMonster({ x: S.x + 4, y: S.y });
    a.send({ type: 'switch_kit', kit: 'A' });
    a.send({ type: 'cast', skill: 'water', targetId: near.id });   // exatamente 4: dentro
    assert.equal(monsterHp(world, near.id), M.maxHp - SK.water.damage!);
  });

  it('Ilusão e Sombra com alvo: pegam O FOCADO, não o mais perto', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const close = world.spawnMonster({ x: S.x + 1, y: S.y });
    const focused = world.spawnMonster({ x: S.x - 4, y: S.y });
    a.send({ type: 'switch_kit', kit: 'B' });
    a.send({ type: 'cast', skill: 'illusion', targetId: focused.id });
    assert.deepEqual(a.conn.last('monster_status'), { type: 'monster_status', id: focused.id, status: 'stunned', ms: 3000 });
    a.send({ type: 'cast', skill: 'shadow' });                      // sem alvo: o mais perto
    assert.equal(a.conn.last('monster_status').id, close.id);
  });

  it('Fogo com alvo: alvo precisa estar no raio (3); a área continua em volta do jogador', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const t1 = world.spawnMonster({ x: S.x + 2, y: S.y });
    const other = world.spawnMonster({ x: S.x - 2, y: S.y });
    a.send({ type: 'cast', skill: 'fire', targetId: t1.id });
    assert.equal(monsterHp(world, t1.id), M.maxHp - SK.fire.damage!);
    assert.equal(monsterHp(world, other.id), M.maxHp - SK.fire.damage!, 'área em volta, não só o alvo');
  });

  it('alvo morto, inexistente ou com id inválido: NO_TARGET / INVALID_MESSAGE; Taijutsu ignora targetId', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'cast', skill: 'water', targetId: 'm999' });
    assert.equal(a.conn.last('cast_failed').reason, 'NO_TARGET');
    a.send({ type: 'cast', skill: 'water', targetId: '../../etc' });
    assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');
    const close = world.spawnMonster({ x: S.x + 1, y: S.y });
    const farOne = world.spawnMonster({ x: S.x + 1, y: S.y + 1 });
    a.send({ type: 'cast', skill: 'taijutsu', targetId: farOne.id });
    assert.equal(monsterHp(world, close.id), M.maxHp - SK.taijutsu.damage!, 'Taijutsu: sempre o mais perto');
    assert.equal(monsterHp(world, farOne.id), M.maxHp);
  });

  it('welcome informa o alcance de cada habilidade (o cliente usa para o foco)', () => {
    const { connect } = setupWorld(config());
    const a = connect('kaito');
    const skills = a.conn.of('welcome')[0].world.skills;
    assert.deepEqual([skills.fire.range, skills.water.range, skills.illusion.range, skills.shadow.range, skills.taijutsu.range], [3, 4, 5, 5, 1.5]);
    assert.equal(skills.heal.range, undefined);
  });
});

describe('meditação', () => {
  it('meditar: todos veem; parado; chakra 3x mais rápido (15/s)', () => {
    const { world, connect, run, pos } = setupWorld(config());
    const a = connect('kaito');
    const b = connect('mei');
    (world as any).sessions.get(a.id).chakra = 10;
    a.send({ type: 'move', dx: 1, dy: 0 });
    run(100);
    a.send({ type: 'meditate', active: true });
    assert.deepEqual(b.conn.last('meditation'), { type: 'meditation', playerId: a.id, active: true });
    const where = pos(a.id);
    run(2000);
    assert.deepEqual(pos(a.id), where, 'meditando não anda (a direção foi zerada)');
    const chakra = (world as any).sessions.get(a.id).chakra;
    assert.ok(Math.abs(chakra - (10 + 15 * 2)) < 0.01, `chakra ${chakra}: 15/s meditando (andando: 0)`);
    assert.equal(b.conn.of('welcome').length, 1);
    const c = connect('rin');
    assert.equal(c.conn.of('welcome')[0].players.find((p: any) => p.id === a.id).meditating, true, 'quem chega vê a aura');
  });

  it('tentar andar cancela na hora (moved); soltar o joystick (0,0) não cancela', () => {
    const { connect, run } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'meditate', active: true });
    a.send({ type: 'move', dx: 0, dy: 0 });
    assert.equal(a.conn.of('meditation').length, 1, '0,0 não cancela');
    a.send({ type: 'move', dx: 0.5, dy: 0 });
    assert.deepEqual(a.conn.last('meditation'), { type: 'meditation', playerId: a.id, active: false, reason: 'moved' });
    run(200);
    assert.ok(a.conn.of('player_moved').length > 0, 'depois de cancelar, anda normal');
  });

  it('tentar usar habilidade cancela (cast), mesmo que a habilidade falhe', () => {
    const { connect } = setupWorld(config());
    const a = connect('kaito');
    a.send({ type: 'meditate', active: true });
    a.send({ type: 'cast', skill: 'heal' });                 // vida cheia: falha
    assert.equal(a.conn.last('cast_failed').reason, 'FULL_HP');
    assert.deepEqual(a.conn.last('meditation'), { type: 'meditation', playerId: a.id, active: false, reason: 'cast' });
  });

  it('não dá para burlar: apanhou de monstro, a meditação acaba ANTES do dano e o chakra volta ao normal', () => {
    const { world, connect, run } = setupWorld(config());
    const a = connect('kaito');
    (world as any).sessions.get(a.id).chakra = 0;
    a.send({ type: 'meditate', active: true });
    world.spawnMonster({ x: S.x + 1, y: S.y });
    run(50);
    const idxMed = a.conn.sent.findIndex((m) => m.type === 'meditation' && m.active === false);
    const idxHit = a.conn.sent.findIndex((m) => m.type === 'hit' && m.target === 'player');
    assert.ok(idxMed >= 0 && idxMed < idxHit, 'meditação termina antes do número de dano');
    assert.equal(a.conn.sent[idxMed].reason, 'damaged');
    a.send({ type: 'meditate', active: true });              // volta a meditar colado no monstro...
    run(2000);                                                // ...e o próximo golpe derruba de novo
    assert.equal(a.conn.of('meditation').filter((m) => m.reason === 'damaged').length, 2);
    // depois de interrompida, o chakra PARA de subir (só medita quem não apanha)
    const before = (world as any).sessions.get(a.id).chakra;
    run(1000);
    const after = (world as any).sessions.get(a.id).chakra;
    assert.equal(after, before, `ganhou ${(after - before).toFixed(2)} em 1 s sem meditar`);
  });

  it('morto não medita; parar manualmente avisa todos; reconectar não mantém a meditação', () => {
    const { world, connect } = setupWorld(config({ attackDamage: 100 }));
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'meditate', active: true });
    a.send({ type: 'meditate', active: false });
    assert.deepEqual(b.conn.last('meditation'), { type: 'meditation', playerId: a.id, active: false, reason: 'manual' });
    a.send({ type: 'meditate', active: true });
    const again = connect.length >= 0 ? new (a.conn.constructor as any)() : null;
    world.join({ id: a.id, username: 'kaito' }, again);
    assert.equal(again.of('welcome')[0].you.meditating, false);
    assert.equal(b.conn.last('meditation').active, false, 'os outros param de ver a aura');
    const dead = connect('morto');
    (world as any).sessions.get(dead.id).dead = true;
    dead.send({ type: 'meditate', active: true });
    assert.equal(dead.conn.last('error').code, 'CANNOT_MEDITATE');
  });
});
