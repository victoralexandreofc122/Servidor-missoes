import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstOnLine, isInArc, isInCircle, isInCone, lineIntersects, rotate } from '../src/realtime/combat.js';
import { REALTIME, type CombatConfig, type RealtimeConfig } from '../src/realtime/config.js';
import { ITEM_BY_CODE } from '../src/realtime/items.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Hitboxes geométricas (v10): o servidor decide quem cada golpe acerta pela FORMA do golpe
 * (arco, cone, círculo, linha), sempre com as posições dele. O cliente só desenha.
 */

const S = REALTIME.spawn;
const M = REALTIME.combat.monsters;
const SK = REALTIME.combat.skills;
const BA = REALTIME.combat.basicAttack;
const F = { x: 10, y: 50 };                                       // clareira da Floresta (fora da zona segura)

/** Monstros parados (stepMs enorme) que não batem; PvP ligado ou não. */
function config(pvp = false, monsters: Partial<CombatConfig['monsters']> = {}): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      pvp,
      monsters: { ...M, count: 0, stepMs: 1e12, attackDamage: 0, ...monsters },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

const session = (world: any, id: string) => world.sessions.get(id);
const monsterHp = (world: any, id: string) => world.monsterList().find((m: any) => m.id === id)?.hp;
/** Ensina um jutsu de classe e põe no kit ativo (no lugar do último, a Cura). */
function learn(world: any, id: string, skill: string) {
  const s = session(world, id);
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), skill];
}
function ready(world: any, id: string) {
  const s = session(world, id);
  s.cooldowns = {};
  s.chakra = 100;
}

describe('hitboxes: geometria (combat.ts)', () => {
  const o = { x: 0, y: 0 };

  it('cone: dentro do leque e do alcance; nunca atrás, nem de lado além da abertura', () => {
    assert.equal(isInCone(o, 1, 0, { x: 3, y: 0.5 }, 4, 90), true);
    assert.equal(isInCone(o, 1, 0, { x: 2, y: 2 }, 4, 90), true, 'na borda dos 45°');
    assert.equal(isInCone(o, 1, 0, { x: 2, y: 2.2 }, 4, 90), false, 'fora do ângulo');
    assert.equal(isInCone(o, 1, 0, { x: -2, y: 0 }, 4, 90), false, 'atrás');
    assert.equal(isInCone(o, 1, 0, { x: -0.5, y: 0.1 }, 4, 90), false, 'atrás, colado');
    assert.equal(isInCone(o, 1, 0, { x: 4.1, y: 0 }, 4, 90), false, 'longe');
    assert.equal(isInCone(o, 1, 0, { x: 0.1, y: 0.1 }, 4, 90), true, 'em cima do jogador conta');
  });

  it('arco: o corte passa em volta do corpo (colado do lado apanha); atrás e longe, não', () => {
    assert.equal(isInArc(o, 1, 0, { x: 1.5, y: 0 }, 1.6, 90), true);
    assert.equal(isInArc(o, 1, 0, { x: 1, y: 1 }, 1.6, 90), true, 'diagonal da frente');
    assert.equal(isInArc(o, 1, 0, { x: 0.1, y: 0.45 }, 1.6, 90), true, 'colado do lado: o arco apanha');
    assert.equal(isInCone(o, 1, 0, { x: 0.1, y: 0.45 }, 1.6, 90), false, '... o cone, não');
    assert.equal(isInArc(o, 1, 0, { x: 0, y: 1.2 }, 1.6, 90), false, 'de lado, mais longe');
    assert.equal(isInArc(o, 1, 0, { x: -1, y: 0 }, 1.6, 90), false, 'atrás');
    assert.equal(isInArc(o, 1, 0, { x: 1.7, y: 0 }, 1.6, 90), false, 'além do raio');
  });

  it('círculo: a borda conta', () => {
    assert.equal(isInCircle(o, 2, { x: 2, y: 0 }), true);
    assert.equal(isInCircle(o, 2, { x: 1.5, y: 1.4 }), false);
  });

  it('linha: o segmento passa a até "raio" do alvo; antes do início e depois do fim, não', () => {
    const a = { x: 0, y: 0 }, b = { x: 4, y: 0 };
    assert.equal(lineIntersects(a, b, { x: 2, y: 0.4 }, 0.5), true);
    assert.equal(lineIntersects(a, b, { x: 2, y: 0.6 }, 0.5), false);
    assert.equal(lineIntersects(a, b, { x: 4.4, y: 0 }, 0.5), true, 'na ponta');
    assert.equal(lineIntersects(a, b, { x: 4.6, y: 0 }, 0.5), false, 'depois do fim');
    assert.equal(lineIntersects(a, b, { x: -1, y: 0 }, 0.5), false, 'atrás do início');
  });

  it('primeiro na linha: o que a linha encontra primeiro, não o mais perto do jogador', () => {
    const a = { x: 0, y: 0 }, b = { x: 5, y: 0 };
    const side = { x: 1, y: 0.8, id: 'lado' };                    // perto do jogador, mas fora da linha
    const first = { x: 3, y: 0.3, id: 'primeiro' };
    const second = { x: 4, y: 0, id: 'segundo' };
    const hit = firstOnLine(a, b, [second, side, first], 0.5)!;
    assert.equal(hit.target.id, 'primeiro');
    assert.deepEqual(hit.at, { x: 3, y: 0 });
    assert.equal(firstOnLine(a, b, [side], 0.5), undefined);
  });

  it('girar: +90° leva a direita para baixo (y cresce para baixo na tela)', () => {
    const [x, y] = rotate(1, 0, 90);
    assert.ok(Math.abs(x) < 1e-9 && Math.abs(y - 1) < 1e-9);
  });
});

describe('hitboxes no jogo (monstros)', () => {
  it('Ataque Básico: arco de 90° na direção do alvo acerta os DOIS da frente; o de trás, não', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const front = world.spawnMonster({ x: S.x + 1, y: S.y });
    const diag = world.spawnMonster({ x: S.x + 1, y: S.y + 1 });
    const back = world.spawnMonster({ x: S.x - 1, y: S.y });
    a.send({ type: 'attack', targetId: front.id });
    assert.equal(monsterHp(world, front.id), M.maxHp - BA.damage);
    assert.equal(monsterHp(world, diag.id), M.maxHp - BA.damage, 'o corte pega a diagonal');
    assert.equal(monsterHp(world, back.id), M.maxHp, 'atrás não apanha');
    assert.deepEqual([a.conn.last('attack').fx, a.conn.last('attack').fy], [1, 0]);
  });

  it('Taijutsu: AVANÇA até o alvo (o servidor move o jogador) e golpeia o círculo na frente', () => {
    const { world, connect, pos } = setupWorld(config());
    const a = connect('kaito');
    const b = connect('mei');
    const m = world.spawnMonster({ x: S.x + 2, y: S.y });
    a.send({ type: 'cast', skill: 'taijutsu' });
    const dash = b.conn.last('dash');
    assert.equal(dash.playerId, a.id);
    assert.deepEqual([dash.fromX, dash.fromY, dash.y], [S.x, S.y, S.y]);
    assert.ok(Math.abs(dash.x - (S.x + 1.25)) < 0.06, `parou colado: ${dash.x}`);
    assert.ok(Math.abs(pos(a.id).x - dash.x) < 1e-9, 'a posição do servidor é a do avanço');
    assert.equal(monsterHp(world, m.id), M.maxHp - SK.taijutsu.damage!);
    const cast = b.conn.last('cast');
    assert.ok(Math.abs(cast.tx - (S.x + 2)) < 0.06, 'o golpe é no alvo');
    (world as any).monsters.delete(m.id);
    const far = world.spawnMonster({ x: S.x + 8, y: S.y });
    ready(world, a.id);
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal(a.conn.last('cast_failed'), undefined, 'longe (alcance 2,5): avança e erra');
    assert.equal(monsterHp(world, far.id), M.maxHp);
  });

  it('Relâmpago: linha instantânea; acerta e atordoa só o PRIMEIRO que ela encontra (mesmo mirando o de trás)', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    learn(world, a.id, 'lightning');
    const first = world.spawnMonster({ x: S.x + 2, y: S.y });
    const second = world.spawnMonster({ x: S.x + 4, y: S.y });
    a.send({ type: 'cast', skill: 'lightning', targetId: second.id });
    assert.equal(monsterHp(world, first.id), M.maxHp - SK.lightning.damage!);
    assert.equal(monsterHp(world, second.id), M.maxHp, 'o raio parou no primeiro');
    assert.deepEqual(a.conn.last('monster_status'), { type: 'monster_status', id: first.id, status: 'stunned', ms: SK.lightning.stunMs });
    assert.deepEqual([a.conn.last('cast').tx, a.conn.last('cast').ty], [S.x + 2, S.y]);
  });

  it('linha e projétil param na parede: Relâmpago atrás da árvore bate no tronco e erra (gasta); o Fogo explode no tronco', () => {
    const { world, connect, run } = setupWorld(config());
    const a = connect('kaito');
    learn(world, a.id, 'lightning');
    // Uma árvore da Floresta (2 x 2) com chão livre dos dois lados: jogador à esquerda, monstro do outro lado.
    const forest = REALTIME.maps.map_2;
    const tree = forest.walls.find((w) => w.k === 'tree' && w.w === 2 && w.x > 4 && w.x < 90
      && !blocked(w.x - 1.5, w.y + 1, forest.walls) && !blocked(w.x - 0.5, w.y + 1, forest.walls) && !blocked(w.x + 3, w.y + 1, forest.walls))!;
    const cy = tree.y + 1;
    placeIn(world, a.id, 'map_2', tree.x - 1.5, cy);
    const m = world.spawnMonster({ x: tree.x + 3, y: cy }, undefined, 'map_2');
    a.send({ type: 'cast', skill: 'lightning' });
    const bolt = a.conn.last('cast');
    assert.equal(bolt.skill, 'lightning');
    assert.ok(bolt.tx < tree.x + 0.01, `a linha para no tronco: ${bolt.tx}`);
    assert.equal(monsterHp(world, m.id), M.maxHp, 'atrás da árvore: não acerta');
    a.send({ type: 'cast', skill: 'fire', targetId: m.id });
    run(500);
    const boom = a.conn.last('impact');
    assert.ok(boom.x < tree.x && boom.x > tree.x - 1, `explodiu no tronco: ${boom.x}`);
    assert.equal(monsterHp(world, m.id), M.maxHp, 'atrás da árvore, fora da explosão');
  });

  it('Kunais: 3 em leque de 45°, cada uma no primeiro que encontra; colado, o alvo leva SÓ uma', () => {
    const { world, connect, run } = setupWorld(config());
    const a = connect('kaito');
    learn(world, a.id, 'weapons');
    const mid = world.spawnMonster({ x: S.x + 3, y: S.y });
    const up = world.spawnMonster({ x: S.x + 3, y: S.y - 1 });
    const down = world.spawnMonster({ x: S.x + 3, y: S.y + 1 });
    a.send({ type: 'cast', skill: 'weapons' });
    const shots = a.conn.of('projectile');
    assert.equal(shots.length, 3);
    const angles = shots.map((p) => (Math.atan2(p.fy, p.fx) * 180) / Math.PI);
    [0, -22.5, 22.5].forEach((want, i) => assert.ok(Math.abs(angles[i]! - want) < 1, `${angles[i]}° (${want}°)`));
    run(400);
    for (const m of [mid, up, down]) assert.equal(monsterHp(world, m.id), M.maxHp - SK.weapons.damage!);
    assert.equal(a.conn.of('impact').length, 3);

    const { world: w2, connect: c2, run: r2 } = setupWorld(config());
    const p = c2('kaito');
    learn(w2, p.id, 'weapons');
    const close = w2.spawnMonster({ x: S.x + 1, y: S.y });
    p.send({ type: 'cast', skill: 'weapons' });
    r2(400);
    assert.equal(monsterHp(w2, close.id), M.maxHp - SK.weapons.damage!, 'uma kunai por alvo, por arremesso');
  });

  it('Cura: com vida cheia, cura o aliado mais ferido a até 3 casas; o focado tem preferência; longe: FULL_HP', () => {
    const { world, connect } = setupWorld(config());
    const a = connect('kaito');
    const b = connect('mei');
    const c = connect('rin');
    for (const [who, x, hp] of [[a, F.x, 100], [b, F.x + 2, 40], [c, F.x, 70]] as const) {
      placeIn(world, who.id, 'map_2', x, F.y + (who === c ? 2 : 0));
      session(world, who.id).hp = hp;
    }
    a.send({ type: 'cast', skill: 'heal', targetId: c.id });     // focado: o Rin (menos ferido)
    assert.deepEqual(a.conn.last('hit'), { type: 'hit', target: 'player', id: c.id, amount: 30, kind: 'heal', hp: 100, maxHp: 100 });
    assert.equal(c.conn.last('stats').hp, 100, 'o curado recebe a vida nova');
    ready(world, a.id);
    a.send({ type: 'cast', skill: 'heal' });                       // sem foco: o mais ferido
    assert.equal(a.conn.last('hit').id, b.id);
    assert.deepEqual([a.conn.last('cast').tx, a.conn.last('cast').ty], [F.x + 2, F.y]);
    ready(world, a.id);
    session(world, b.id).hp = 50;
    placeIn(world, b.id, 'map_2', F.x + 4, F.y);
    a.send({ type: 'cast', skill: 'heal' });
    assert.equal(a.conn.last('cast_failed').reason, 'FULL_HP', 'a 4 casas: longe demais');
  });
});

describe('hitboxes: PvP (preparado, desligado por padrão)', () => {
  /** Dois jogadores na clareira da Floresta, a 2 casas, `a` virado para `b`. */
  function duel(pvp: boolean) {
    const w = setupWorld(config(pvp));
    const a = w.connect('kaito');
    const b = w.connect('mei');
    placeIn(w.world, a.id, 'map_2', F.x, F.y);
    placeIn(w.world, b.id, 'map_2', F.x + 2, F.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0 });
    return { ...w, a, b };
  }

  it('desligado: as hitboxes passam pelos jogadores (só monstros apanham)', () => {
    const { world, a, b } = duel(false);
    a.send({ type: 'cast', skill: 'water' });
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(world, b.id).hp, 100);
    assert.equal(a.conn.last('attack').playerId, a.id, 'o golpe sai (e erra)');
  });

  it('ligado: cone, arco, projétil e linha acertam o outro jogador (com escudo, morte e tudo)', () => {
    const { world, a, b, run } = duel(true);
    a.send({ type: 'cast', skill: 'water' });
    assert.deepEqual(b.conn.last('hit'), { type: 'hit', target: 'player', id: b.id, amount: SK.water.damage, kind: 'damage', hp: 80, maxHp: 100 });
    ready(world, a.id);
    a.send({ type: 'cast', skill: 'fire', targetId: b.id });
    run(300);
    assert.equal(session(world, b.id).hp, 80 - SK.fire.damage!);
    placeIn(world, b.id, 'map_2', F.x + 1, F.y);
    a.send({ type: 'attack', targetId: b.id });
    assert.equal(session(world, b.id).hp, 80 - SK.fire.damage! - BA.damage);
    assert.equal(a.conn.of('xp').length, 0, 'PvP não dá XP');
  });

  it('ligado: Relâmpago atordoa o jogador (não anda, não ataca, não lança); Sombra prende (não anda, mas ataca)', () => {
    const { world, a, b, run, pos } = duel(true);
    learn(world, a.id, 'lightning');
    a.send({ type: 'cast', skill: 'lightning', targetId: b.id });
    assert.deepEqual(b.conn.last('player_status'), { type: 'player_status', playerId: b.id, status: 'stunned', ms: SK.lightning.stunMs });
    b.send({ type: 'attack', targetId: a.id });
    assert.equal(b.conn.last('attack_failed').reason, 'STUNNED');
    b.send({ type: 'cast', skill: 'fire' });
    assert.equal(b.conn.last('cast_failed').reason, 'STUNNED');
    const where = pos(b.id);
    b.send({ type: 'move', dx: 1, dy: 0 });
    run(300);
    assert.deepEqual(pos(b.id), where, 'atordoado não anda');
    run(400);
    assert.ok(pos(b.id).x > where.x, 'passou o choque: anda de novo');
    b.send({ type: 'move', dx: 0, dy: 0 });

    a.send({ type: 'switch_kit', kit: 'B' });
    a.send({ type: 'cast', skill: 'shadow', targetId: b.id });
    assert.equal(b.conn.last('player_status').status, 'rooted');
    const held = pos(b.id);
    b.send({ type: 'move', dx: 1, dy: 0 });
    run(500);
    assert.deepEqual(pos(b.id), held, 'preso não anda');
    b.send({ type: 'move', dx: 0, dy: 0 });
    b.send({ type: 'cast', skill: 'water' });
    assert.equal(b.conn.last('cast').skill, 'water', 'preso ainda lança');
  });

  it('ligado: ninguém apanha na zona segura nem na Academia', () => {
    const { world, a, b } = duel(true);
    session(world, b.id).tutorial = 3;                             // ainda na Academia
    a.send({ type: 'cast', skill: 'water' });
    assert.equal(session(world, b.id).hp, 100);
  });
});

describe('Shuriken Gigante: arma de ARREMESSO (o Ataque Básico vira um lançamento dela)', () => {
  const FUMA = ITEM_BY_CODE.get('fuma_shuriken')!;
  const TH = FUMA.throw!;

  /** Kaito com a Shuriken Gigante equipada e monstros com bastante vida (para ver o dano sem matar). */
  function armed() {
    const w = setupWorld(config());
    const a = w.connect('kaito');
    session(w.world, a.id).equipped = 'fuma_shuriken';
    const mon = (x: number, y: number) => {
      const m = w.world.spawnMonster({ x, y });
      const raw = (w.world as any).monsters.get(m.id);
      Object.assign(raw, { x, y, hp: 500 });
      return m.id;
    };
    return { ...w, a, mon };
  }

  it('lança a shuriken (projétil que ATRAVESSA todos no caminho); o dano é (golpe + arma) x 2,5 e chega quando ela passa', () => {
    const { world, a, run, mon } = armed();
    const near = mon(S.x + 2, S.y);
    const far = mon(S.x + 5, S.y);                                  // atrás do primeiro: a shuriken atravessa
    const wide = mon(S.x + 3.5, S.y + 0.7);                         // 0,7 casa da linha: a hitbox grossa pega
    const off = mon(S.x + 3.5, S.y + 1.2);                          // longe demais da linha
    a.send({ type: 'attack' });
    const atk = a.conn.last('attack');
    assert.equal(atk.throw, 'fuma_shuriken');
    assert.equal(atk.cd, BA.cooldownMs * TH.cooldownFactor, 'recarga bem lenta');
    const shot = a.conn.last('projectile');
    assert.deepEqual([shot.weapon, shot.skill, shot.speed, shot.range, shot.fx, shot.fy], ['fuma_shuriken', undefined, TH.speed, TH.range, 1, 0]);
    assert.equal(monsterHp(world, near), 500, 'ainda voando');
    run(900);
    const dmg = Math.round((BA.damage + FUMA.damage!) * TH.damageFactor);
    for (const id of [near, far, wide]) assert.equal(monsterHp(world, id), 500 - dmg, id);
    assert.equal(monsterHp(world, off), 500);
    assert.equal(a.conn.of('impact').length, 1, 'um impacto só: no fim do alcance');
  });

  it('recarga: o segundo arremesso antes do tempo falha (COOLDOWN); alcance de 6 casas; sem ninguém perto, sai e erra', () => {
    const { a, run, mon } = armed();
    a.send({ type: 'attack' });
    assert.equal(a.conn.of('attack').length, 1, 'sem alvo: a shuriken sai assim mesmo (e gasta a recarga)');
    assert.equal(a.conn.of('projectile').length, 1);
    run(BA.cooldownMs * 2);
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('attack_failed').reason, 'COOLDOWN', 'um corte normal já estaria pronto');
    run(BA.cooldownMs * TH.cooldownFactor);
    mon(S.x + 5.5, S.y);                                            // longe para o corte, perto para o arremesso
    a.send({ type: 'attack' });
    assert.equal(a.conn.of('attack').length, 2);
    assert.deepEqual([a.conn.last('projectile').fx, a.conn.last('projectile').fy], [1, 0], 'mirou no de 5,5 casas');
  });

  it('sem a shuriken, o Ataque Básico continua corpo a corpo (arco), sem projétil', () => {
    const { world, a, mon } = armed();
    session(world, a.id).equipped = 'kunai';
    const m = mon(S.x + 1, S.y);
    a.send({ type: 'attack' });
    assert.equal(a.conn.of('projectile').length, 0);
    assert.equal(a.conn.last('attack').throw, undefined);
    assert.equal(monsterHp(world, m), 500 - (BA.damage + ITEM_BY_CODE.get('kunai')!.damage!));
  });
});
