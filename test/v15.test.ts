import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE, OPEN_VILLAGES, villageAllowed, type Appearance } from '../src/realtime/appearance.js';
import { REALTIME, type CombatConfig, type RealtimeConfig } from '../src/realtime/config.js';
import type { Progression } from '../src/realtime/gameWorld.js';
import { ITEM_BY_CODE } from '../src/realtime/items.js';
import { arenaAt, villagePlan } from '../src/realtime/maps.js';
import { PLAYER_RADIUS, blocked } from '../src/realtime/movement.js';
import type { Profile } from '../src/realtime/profile.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * v15 (design geral do jogo): arena de treino de PvP na Vila, XP por participação, monstros por jogador
 * no mapa, teto de atordoar/prender em jogadores, o jeito de lutar de cada arma e as vilas travadas no
 * Criador até o Arco 2.
 */

const M = REALTIME.combat.monsters;
const SK = REALTIME.combat.skills;
const BA = REALTIME.combat.basicAttack;
const VILA = REALTIME.maps.map_1;
const ARENA = VILA.arenas![0]!;
const IN = { x: 66, y: 47 };                                  // meio da arena, longe dos pilares
const STREET = { x: 66, y: 38.5 };                            // gramado logo acima da arena
/** A cerca da esquerda (de cima da entrada): a arena da Folha só se entra por esse lado. */
const FENCE = VILA.walls.find((w) => w.k === 'fence' && w.h > 4 && w.w < 1)!;
const F = { x: 51, y: 10 };                                    // clareira da Floresta

function config(combat: Partial<CombatConfig> = {}, monsters: Partial<CombatConfig['monsters']> = {}): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      damageScale: { jutsu: 1, basic: 1 },  // testes de mecânica: dano base de antes da v28 (os números novos estão em pveDamage)
      monsters: { ...M, count: 0, stepMs: 1e12, attackDamage: 0, ...monsters },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
      ...combat,
    },
  };
}

const look = (village: Appearance['village']): Appearance => ({ ...DEFAULT_APPEARANCE, village });
const session = (world: any, id: string) => world.sessions.get(id);
function ready(world: any, id: string) {
  const s = session(world, id);
  s.cooldowns = {};
  s.chakra = 100;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Mundo com ninjas que já passaram pelo Criador (a vila vem do visual). */
function world(cfg: RealtimeConfig = config(), progression?: Progression, profile?: Profile) {
  const w = setupWorld(cfg, progression, undefined, profile);
  const join = (username: string, village: Appearance['village'] | null = 'vila_1') => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: village ? look(village) : null }, conn);
    return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)) };
  };
  /** Põe o jogador num ponto do mapa (posição do servidor) virado para a direita. */
  const at = (p: { id: string }, map: string, x: number, y: number) => {
    placeIn(w.world, p.id, map, x, y);
    Object.assign(session(w.world, p.id), { x, y, fx: 1, fy: 0 });
  };
  return { ...w, join, at };
}

function fakeProgression() {
  const calls: [string, number, number][] = [];
  const progression: Progression = {
    async grantXp(id, amount, ryo = 0) {
      calls.push([id, amount, ryo]);
      return { totalXp: amount, rank: { code: 'ACADEMY', name: 'Academia' }, promoted: false };
    },
  };
  return { progression, calls };
}

describe('v15: arena da Vila (layout)', () => {
  it('cerca de madeira com a entrada pela esquerda; a luta é dentro dela; quem perde renasce fora', () => {
    const P = villagePlan('map_1');
    assert.equal(VILA.village, 'vila_1');
    assert.deepEqual(ARENA, { ...P.arena.fight, village: 'vila_1', respawn: P.arena.respawn });
    const fx = FENCE.x, fy = 40.3, fw = 16.6, fh = 13.3;      // a cerca, de fora a fora (como no desenho)
    for (let x = fx + 0.25; x < fx + fw; x += 0.5) {
      assert.ok(blocked(x, fy + 0.25, VILA.walls), `cerca de cima em x=${x}`);
      assert.ok(blocked(x, fy + fh - 0.25, VILA.walls), `cerca de baixo em x=${x}`);
    }
    for (let y = fy + 0.75; y < fy + fh - 0.5; y += 0.5) {
      const gap = y > 46.4 + PLAYER_RADIUS && y < 48.4 - PLAYER_RADIUS;   // a entrada: o corpo do ninja passa
      assert.equal(blocked(fx + 0.25, y, VILA.walls), !gap, `cerca da esquerda em y=${y}`);
      assert.ok(blocked(fx + fw - 0.25, y, VILA.walls), `cerca da direita em y=${y}`);
    }
    const pillars = VILA.walls.filter((x) => x.k === 'pillar');
    assert.equal(pillars.length, 4, 'os quatro pilares de pedra do desenho');
    for (const p of pillars) assert.ok(arenaAt(VILA, p.x + p.w / 2, p.y + p.h / 2), 'pilares dentro da arena');
    assert.ok(arenaAt(VILA, IN.x, IN.y) && !blocked(IN.x, IN.y, VILA.walls));
    assert.equal(arenaAt(VILA, STREET.x, STREET.y), undefined);
    const r = ARENA.respawn;
    assert.ok(!blocked(r.x, r.y, VILA.walls) && !arenaAt(VILA, r.x, r.y), 'renasce fora da cerca, num lugar livre');
    assert.equal(REALTIME.maps.map_2.village, undefined, 'a Floresta não é mapa de vila');
  });
});

describe('v15: arena da Vila (PvP de treino)', () => {
  it('dentro da arena, dois ninjas da vila lutam (arco, cone); fora dela a Vila nunca tem PvP, nem com o PvP aberto ligado', () => {
    const { world: w, join, at } = world(config({ pvp: true }));
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_1', IN.x, IN.y);
    at(b, 'map_1', IN.x + 1, IN.y);
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(w, b.id).hp, 100 - BA.damage, 'Ataque Básico acerta o outro ninja');
    ready(w, a.id);
    a.send({ type: 'cast', skill: 'water' });
    assert.equal(session(w, b.id).hp, 100 - BA.damage - SK.water.damage!);
    assert.equal(a.conn.of('xp').length, 0, 'treino não dá XP');
    // na rua, logo fora da cerca: nada
    at(a, 'map_1', STREET.x, STREET.y);
    at(b, 'map_1', STREET.x + 1, STREET.y);
    ready(w, a.id);
    const hpOutside = session(w, b.id).hp;
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(w, b.id).hp, hpOutside, 'fora da cerca o golpe sai, mas não acerta');
  });

  it('um dentro e outro fora da cerca: ninguém acerta ninguém (nem atravessando a cerca)', () => {
    const { world: w, join, at } = world();
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_1', FENCE.x + 1, IN.y - 3);                     // dentro, colado na cerca da esquerda
    at(b, 'map_1', FENCE.x - 0.4, IN.y - 3);                   // fora, do outro lado da cerca
    Object.assign(session(w, a.id), { fx: -1, fy: 0 });
    a.send({ type: 'attack', targetId: b.id });
    b.send({ type: 'attack', targetId: a.id });
    assert.deepEqual([session(w, a.id).hp, session(w, b.id).hp], [100, 100]);
  });

  it('só os ninjas DA VILA da arena lutam: o de outra vila e quem não criou o personagem só assistem', () => {
    const { world: w, join, at } = world();
    const a = join('kaito');
    const guest = join('visita', 'vila_3');                    // escolheu antes de as vilas travarem
    const blank = join('novato', null);
    at(a, 'map_1', IN.x, IN.y);
    at(guest, 'map_1', IN.x + 1, IN.y);
    at(blank, 'map_1', IN.x, IN.y + 1);
    a.send({ type: 'attack', targetId: guest.id });
    guest.send({ type: 'attack', targetId: a.id });
    assert.equal(session(w, a.id).hp, 100);
    ready(w, a.id);
    Object.assign(session(w, a.id), { fx: 0, fy: 1 });
    a.send({ type: 'attack', targetId: blank.id });
    assert.deepEqual([guest, blank].map((p) => session(w, p.id).hp), [100, 100]);
  });

  it('perdeu: renasce na entrada da arena em 3 s (sem custo), placar para todos no mapa, e 5 s sem apanhar de jogador', async () => {
    const fake = fakeProgression();
    const { world: w, join, at, clock } = world(config(), fake.progression);
    const a = join('kaito');
    const b = join('mei');
    const watcher = join('rin');
    at(a, 'map_1', IN.x, IN.y);
    at(b, 'map_1', IN.x + 1, IN.y);
    session(w, b.id).hp = 5;
    a.send({ type: 'attack', targetId: b.id });
    assert.deepEqual(b.conn.last('player_died'), { type: 'player_died', playerId: b.id, respawnInMs: REALTIME.combat.arena.respawnMs, arena: true });
    const result = watcher.conn.last('arena_result');
    assert.deepEqual(result, {
      type: 'arena_result', winnerId: a.id, winner: 'kaito', loserId: b.id, loser: 'mei',
      winnerRecord: { wins: 1, losses: 0 }, loserRecord: { wins: 0, losses: 1 },
    });
    clock.advance(REALTIME.combat.arena.respawnMs - 1);
    b.send({ type: 'respawn' });
    assert.equal(b.conn.last('error').code, 'RESPAWN_NOT_READY');
    clock.advance(1);
    b.send({ type: 'respawn' });
    const back = b.conn.last('player_respawned');
    assert.deepEqual([back.x, back.y, back.hp], [ARENA.respawn.x, ARENA.respawn.y, 100]);
    assert.equal(session(w, b.id).map, 'map_1', 'continua na Vila');
    await flush();
    assert.equal(fake.calls.length, 0, 'treino não dá XP nem ryō');
    // de volta para dentro: protegido por 5 s
    at(b, 'map_1', IN.x + 1, IN.y);
    ready(w, a.id);
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(w, b.id).hp, 100, 'acabou de renascer: protegido');
    clock.advance(REALTIME.combat.arena.protectMs);
    ready(w, a.id);
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(w, b.id).hp, 100 - BA.damage);
  });

  it('morrer fora da arena continua igual: 5 s e renasce na avenida', () => {
    const { world: w, join, at } = world(config({}, { attackDamage: 200 }));
    const a = join('kaito');
    at(a, 'map_2', F.x, F.y);
    const m = w.spawnMonster({ x: F.x + 1, y: F.y }, undefined, 'map_2');
    (w as any).monsterAttack((w as any).monsters.get(m.id), Date.now() * 2);
    assert.deepEqual(a.conn.last('player_died'), { type: 'player_died', playerId: a.id, respawnInMs: REALTIME.combat.player.respawnMs });
  });

  it('na arena a Cura não pega o adversário (ele é inimigo), só em si mesmo', () => {
    const { world: w, join, at } = world();
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_1', IN.x, IN.y);
    at(b, 'map_1', IN.x + 1, IN.y);
    session(w, b.id).hp = 50;
    a.send({ type: 'cast', skill: 'heal', targetId: b.id });
    assert.equal(a.conn.last('cast_failed').reason, 'FULL_HP', 'o único "aliado" ferido por perto é o adversário');
    assert.equal(session(w, b.id).hp, 50);
  });
});

describe('v15: XP por participação', () => {
  it('quem tirou 20% da vida ganha o abate inteiro (XP, ryō e missão) junto com o último golpe; menos que isso, nada', async () => {
    const fake = fakeProgression();
    const { world: w, join, at } = world(config(), fake.progression);
    const a = join('kaito');
    const b = join('mei');
    const c = join('rin');
    for (const p of [a, b, c]) at(p, 'map_2', F.x, F.y);
    const m = w.spawnMonster({ x: F.x + 1, y: F.y }, undefined, 'map_2');
    const mon = (w as any).monsters.get(m.id);
    const t = 1;
    (w as any).damageMonster(mon, 12, session(w, a.id), t, 'attack');        // 20% de 60: conta
    (w as any).damageMonster(mon, 11, session(w, c.id), t, 'attack');        // 18%: não conta
    (w as any).damageMonster(mon, 99, session(w, b.id), t, 'skill');         // último golpe (tirou só os 37 que faltavam)
    await flush();
    assert.deepEqual(fake.calls.map(([id, xp]) => [id, xp]), [[b.id, M.xp], [a.id, M.xp]], 'o último golpe primeiro');
    for (const [, , ryo] of fake.calls) assert.ok(ryo >= 5 && ryo <= 15, 'cada um sorteia o seu ryō');
    assert.equal(mon.damageBy.get(b.id), 37, 'conta só a vida que tirou de verdade');
  });

  it('quem saiu do mapa (ou do jogo) antes do abate não ganha', async () => {
    const fake = fakeProgression();
    const { world: w, join, at } = world(config(), fake.progression);
    const a = join('kaito');
    const b = join('mei');
    for (const p of [a, b]) at(p, 'map_2', F.x, F.y);
    const m = w.spawnMonster({ x: F.x + 1, y: F.y }, undefined, 'map_2');
    const mon = (w as any).monsters.get(m.id);
    (w as any).damageMonster(mon, 30, session(w, a.id), 1, 'attack');
    at(a, 'map_1', 40, 34);
    (w as any).damageMonster(mon, 30, session(w, b.id), 1, 'attack');
    await flush();
    assert.deepEqual(fake.calls.map(([id]) => id), [b.id]);
  });
});

describe('v15: monstros por jogador no mapa', () => {
  const dense = () => config({}, { count: M.count, perPlayer: M.perPlayer, maxCount: M.maxCount, spawnEveryMs: M.spawnEveryMs });
  const hunt = (w: any) => w.monsterList().filter((m: any) => w.monsters.get(m.id).map === 'map_2').length;

  it('10 de base, +3 por jogador na Floresta (1 por segundo); esvaziou, voltam aos 10 sumindo longe de todos', () => {
    const { world: w, join, at, run } = world(dense());
    assert.equal(hunt(w), 10);
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_2', F.x, F.y);
    run(1000);
    assert.ok(hunt(w) > 10 && hunt(w) < 13, 'aparecem aos poucos');
    run(3000);
    assert.equal(hunt(w), 13);
    at(b, 'map_2', F.x, F.y);
    run(4000);
    assert.equal(hunt(w), 16);
    const gone = a.conn.of('monster_gone').length;
    at(a, 'map_1', 40, 34);
    at(b, 'map_1', 40, 34);
    run(7000);
    assert.equal(hunt(w), 10, 'o mapa vazio volta à base');
    assert.equal(a.conn.of('monster_gone').length, gone, 'quem está na Vila não recebe nada da Floresta');
  });

  it('com gente no mapa, só some monstro que ninguém está vendo e com a vida cheia', () => {
    const { world: w, join, at, run } = world(dense());
    const a = join('kaito');
    at(a, 'map_2', F.x, F.y);
    run(4000);
    assert.equal(hunt(w), 13);
    (w as any).config.combat.monsters.perPlayer = 0;          // o alvo cai para 10 com ele lá
    for (const m of (w as any).monsters.values()) if (m.map === 'map_2') { m.x = F.x + 2; m.y = F.y; }   // todos à vista
    run(5000);
    assert.equal(hunt(w), 13, 'nenhum some na frente do jogador');
    (w as any).config.combat.monsters.perPlayer = M.perPlayer;
  });

  it('teto de 40 por mapa, e base 0 desliga a caça (testes)', () => {
    const { world: w, join, at, run } = world(dense());
    for (let i = 0; i < 12; i++) at(join(`n${i}`), 'map_2', F.x, F.y);
    run(40_000);
    assert.equal(hunt(w), M.maxCount);
    const quiet = world();
    quiet.at(quiet.join('kaito'), 'map_2', F.x, F.y);
    quiet.run(5000);
    assert.equal(hunt(quiet.world), 0);
  });
});

describe('v15: teto de atordoar e prender em jogadores', () => {
  it('v28: controle de jogador em jogador gasta o orçamento (v30: 5 s em 15 s); sobra menor que 0,2 s não pega; passou a janela, volta', () => {
    const { world: w, join, at, clock } = world(config({ pvp: true }));
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_2', F.x, F.y);
    at(b, 'map_2', F.x + 2, F.y);
    const s = session(w, a.id);
    s.jutsus.set('lightning', 0);
    s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), 'lightning'];
    const zap = () => {
      ready(w, a.id);
      session(w, b.id).hp = 100;                               // o teste é o atordoamento, não a morte
      b.conn.clear();
      a.send({ type: 'cast', skill: 'lightning', targetId: b.id });
      clock.advance(1000);
      return b.conn.last('player_status')?.ms;
    };
    const full = SK.lightning.stunMs!;                         // 600 ms (v30); os choques da paralisia também gastam (metade)
    const got: (number | undefined)[] = [];
    for (let i = 0; i < 12; i++) got.push(zap());
    assert.equal(got[0], full);
    assert.ok(got.includes(undefined), `o orçamento acaba: ${got.join(', ')}`);
    clock.advance(15_000);
    assert.equal(zap(), full, 'passou a janela de 15 s: pega inteiro de novo');
  });

  it('monstro não tem teto (controle no PvE continua valendo inteiro)', () => {
    const { world: w, join, at, clock } = world();
    const a = join('kaito');
    at(a, 'map_2', F.x, F.y);
    const m = w.spawnMonster({ x: F.x + 2, y: F.y }, undefined, 'map_2');
    (w as any).monsters.get(m.id).hp = 1e6;
    const s = session(w, a.id);
    s.jutsus.set('lightning', 0);
    s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), 'lightning'];
    const ms: number[] = [];
    for (let i = 0; i < 4; i++) {
      ready(w, a.id);
      a.send({ type: 'cast', skill: 'lightning', targetId: m.id });
      ms.push(a.conn.last('monster_status').ms);
      clock.advance(1000);
    }
    assert.deepEqual(ms, [SK.lightning.stunMs, SK.lightning.stunMs, SK.lightning.stunMs, SK.lightning.stunMs]);
  });
});

describe('v15: o jeito de lutar de cada arma', () => {
  /**
   * Golpe com a arma equipada: o alvo a (dx, dy) do jogador (o golpe mira nele) e, se vier, um segundo monstro
   * em `side` (o arco pega ou não). Devolve quem apanhou e a mensagem do golpe.
   */
  function swing(weapon: string | null, dx: number, dy: number, side?: readonly [number, number]) {
    const { world: w, join, at } = world();
    const a = join('kaito');
    at(a, 'map_2', F.x, F.y);
    session(w, a.id).equipped = weapon;
    const spawn = (x: number, y: number) => {
      const m = w.spawnMonster({ x: F.x + x, y: F.y + y }, undefined, 'map_2');
      (w as any).monsters.get(m.id).hp = 1e6;
      return m.id;
    };
    const main = spawn(dx, dy);
    const other = side ? spawn(...side) : undefined;
    a.send({ type: 'attack', targetId: main });
    const hurt = (id: string | undefined) => id !== undefined && (w as any).monsters.get(id).hp < 1e6;
    return { hit: hurt(main), sideHit: hurt(other), msg: a.conn.last('attack') };
  }

  it('kunai rápida e estreita, espada curta equilibrada, espada longa lenta, larga e com mais alcance', () => {
    const base = 600;
    for (const [code, cd, r, arc] of [['kunai', 510, 1.5, 70], ['tanto', 540, 1.6, 90], ['katana', 690, 2, 140]] as const) {
      const item = ITEM_BY_CODE.get(code)!;
      assert.deepEqual(item.swing, { cooldownFactor: cd / base, arcDeg: arc, range: r }, code);
      const { msg } = swing(code, 1, 0);
      assert.deepEqual([msg.cd, msg.r, msg.arc], [cd, r, arc], `${code}: o cliente desenha o corte desse tamanho`);
    }
    const bare = swing(null, 1, 0).msg;
    assert.deepEqual([bare.cd, bare.r, bare.arc], [BA.cooldownMs, BA.range, BA.arcDeg], 'sem arma: o soco de sempre');
    assert.equal(swing('kunai', 1.55, 0).hit, false, 'kunai: 1,5 casa');
    assert.equal(swing('tanto', 1.55, 0).hit, true);
    assert.equal(swing('katana', 1.9, 0).hit, true, 'espada longa: 2 casas');
    // um segundo monstro 70° para o lado, a 1,4 casa: fora do arco de 70° e do de 90°, dentro do de 140°
    // (o arco sai de um pouco atrás do jogador, então visto dele abre um pouco mais que os graus)
    const side = [Math.cos((70 * Math.PI) / 180) * 1.4, Math.sin((70 * Math.PI) / 180) * 1.4] as const;
    for (const [code, wide] of [['kunai', false], ['tanto', false], ['katana', true]] as const) {
      const r = swing(code, 1, 0, side);
      assert.deepEqual([r.hit, r.sideHit], [true, wide], code);
    }
  });

  it('a Shuriken Gigante continua sendo arremesso (sem `swing`)', () => {
    const item = ITEM_BY_CODE.get('fuma_shuriken')!;
    assert.ok(item.throw && !item.swing);
    const { msg } = swing('fuma_shuriken', 3, 0);
    assert.equal(msg.throw, 'fuma_shuriken');
    assert.equal(msg.r, undefined);
  });
});

describe('v15: vilas travadas no Criador até o Arco 2', () => {
  function fakeProfile() {
    const saved: Appearance[] = [];
    const profile = { async saveAppearance(_id: string, a: Appearance) { saved.push(a); } } as unknown as Profile;
    return { profile, saved };
  }

  it('só a primeira vila está aberta; quem já tinha outra pode continuar com ela', async () => {
    assert.deepEqual(OPEN_VILLAGES, ['vila_1']);
    assert.equal(villageAllowed('vila_1', undefined), true);
    assert.equal(villageAllowed('vila_4', 'vila_1'), false);
    assert.equal(villageAllowed('vila_3', 'vila_3'), true);
    const { profile, saved } = fakeProfile();
    const { join } = world(config(), undefined, profile);
    const a = join('kaito');
    a.send({ type: 'set_appearance', appearance: look('vila_4') });
    await flush();
    assert.equal(a.conn.last('error').code, 'VILLAGE_LOCKED');
    assert.deepEqual(saved, []);
    const old = join('antigo', 'vila_3');
    old.send({ type: 'set_appearance', appearance: { ...look('vila_3'), bandana: true } });
    await flush();
    assert.equal(saved.length, 1, 'trocou outra coisa e manteve a vila que já tinha');
    const blank = join('novato', null);
    blank.send({ type: 'set_appearance', appearance: look('vila_4') });
    await flush();
    assert.equal(blank.conn.last('error').code, 'VILLAGE_LOCKED');
  });
});

describe('v15: arena no cliente (world.js: a mesma regra do servidor)', async () => {
  const W = await import(new URL('../public/world.js', import.meta.url).href);
  const ninja = (x: number, y: number, village = 'vila_1', dead = false) => ({ x, y, dead, look: { village } });

  it('arenaAt: dentro da cerca é arena; na rua, não', () => {
    assert.equal(W.arenaAt(VILA, IN.x, IN.y)?.village, 'vila_1');
    assert.equal(W.arenaAt(VILA, STREET.x, STREET.y), null);
    assert.equal(W.arenaAt(REALTIME.maps.map_2, 50, 50), null);
  });

  it('arenaFoes: dois da vila dentro da arena; nunca de fora, de outra vila ou derrotado', () => {
    const a = ninja(IN.x, IN.y);
    assert.equal(W.arenaFoes(VILA, a, ninja(IN.x + 2, IN.y)), true);
    assert.equal(W.arenaFoes(VILA, a, ninja(STREET.x, STREET.y)), false);
    assert.equal(W.arenaFoes(VILA, a, ninja(IN.x + 1, IN.y, 'vila_3')), false);
    assert.equal(W.arenaFoes(VILA, a, ninja(IN.x + 1, IN.y, 'vila_1', true)), false);
    assert.equal(W.arenaFoes(VILA, a, a), false);
  });
});
