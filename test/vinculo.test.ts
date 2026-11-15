import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME } from '../src/realtime/config.js';
import { blocked } from '../src/realtime/movement.js';
import { AFFINITY_XP, PRIMAL, VINCULO, affinityBar, affinityLevel, pickTarget } from '../src/realtime/vinculo.js';
import { placeIn, setupWorld, withMonsters } from './support/world.js';

/* v60: Vínculo Ancestral e Estado Primal (pedido do Victor, 14/11/2026). */

describe('v60: hierarquia de alvos da criatura (pura)', () => {
  const near = (id: string, dist: number, extra = {}) => ({ id, dist, ...extra });
  it('foco > quem bateu > Renegado > outra vila > chefe > monstro; empate: o mais perto', () => {
    const all = [near('mon', 1), near('boss', 5, { boss: true }), near('vila', 6, { enemyVillage: true }), near('ren', 7, { renegade: true }), near('hit', 8, { lastAttacker: true }), near('foco', 9, { focus: true })];
    assert.equal(pickTarget(all)?.id, 'foco');
    assert.equal(pickTarget(all.slice(0, 5))?.id, 'hit');
    assert.equal(pickTarget(all.slice(0, 4))?.id, 'ren');
    assert.equal(pickTarget(all.slice(0, 3))?.id, 'vila');
    assert.equal(pickTarget(all.slice(0, 2))?.id, 'boss');
    assert.equal(pickTarget([near('a', 4), near('b', 2)])?.id, 'b');
    assert.equal(pickTarget([]), undefined);
  });

  it('afinidade: 100, 300, 600 e 1000 de XP para os níveis 2 a 5 (igual ao banco)', () => {
    assert.deepEqual(AFFINITY_XP, [0, 100, 300, 600, 1000]);
    assert.deepEqual([0, 99, 100, 299, 300, 600, 999, 1000, 5000].map(affinityLevel), [1, 1, 2, 2, 3, 4, 4, 5, 5]);
    assert.deepEqual(affinityBar(150), { level: 2, into: 50, need: 200 });
    assert.deepEqual(affinityBar(1200), { level: 5, into: 0, need: null });
  });
});

/** Mundo sem monstros naturais; o ninja num ponto livre da Floresta (mapa aberto). */
function forest() {
  const w = setupWorld(withMonsters(0));
  const world = w.world as any;
  const m = REALTIME.maps.map_2;
  let spot = { x: 50.5, y: 40.5 };
  for (let y = 30; y < 60; y++) for (let x = 40; x < 70; x++) if (!blocked(x + 0.5, y + 0.5, m.walls) && !blocked(x + 3.5, y + 0.5, m.walls)) { spot = { x: x + 0.5, y: y + 0.5 }; y = 99; break; }
  const join = (name: string) => {
    const c = w.connect(name);
    const s = world.sessions.get(c.id);
    s.appearance = { ...DEFAULT_APPEARANCE };
    placeIn(w.world, c.id, 'map_2', spot.x, spot.y);
    return { ...c, s };
  };
  const vin = (c: { conn: any }) => c.conn.sent.filter((x: any) => x.type === 'vinculo_state').at(-1);
  const notice = (c: { conn: any }) => c.conn.sent.filter((x: any) => x.type === 'notice').at(-1)?.text ?? '';
  return { ...w, world, spot, join, vin, notice };
}

describe('v60: invocar', () => {
  it('equipa, invoca (40% do chakra, recarga de 2 min); a criatura segue o dono', () => {
    const { world, join, vin, notice, run } = forest();
    const a = join('ana');
    a.send({ type: 'vinculo', action: 'summon' });
    assert.match(notice(a), /Escolha uma criatura/);
    a.send({ type: 'vinculo', action: 'equip', creature: 'sapo' });
    assert.equal(vin(a).equipped, 'sapo');
    const before = a.s.chakra;
    a.send({ type: 'vinculo', action: 'summon' });
    assert.equal(before - a.s.chakra, Math.ceil(a.s.stats.maxChakra * VINCULO.chakraPct));
    const st = vin(a);
    assert.equal(st.summoned.length, 1);
    assert.ok(st.cdMs > 119_000);
    a.send({ type: 'vinculo', action: 'summon' });
    assert.match(notice(a), /já está com você/);
    // o dono anda; a criatura vai atrás
    const frog = world.monsters.get(st.summoned[0]);
    a.s.x += 3;
    run(2000);
    assert.ok(Math.hypot(frog.x - a.s.x, frog.y - a.s.y) < 3, 'seguiu o dono');
  });

  it('o Lobo são 2; chakra pouco ou recarga: não invoca', () => {
    const { join, vin, notice } = forest();
    const a = join('bia');
    a.send({ type: 'vinculo', action: 'equip', creature: 'lobo' });
    a.s.chakra = 1;
    a.send({ type: 'vinculo', action: 'summon' });
    assert.match(notice(a), /gasta \d+ de chakra/);
    a.s.chakra = a.s.stats.maxChakra;
    a.send({ type: 'vinculo', action: 'summon' });
    assert.equal(vin(a).summoned.length, 2);
    a.send({ type: 'vinculo', action: 'dismiss' });
    assert.equal(vin(a).summoned.length, 0);
    a.send({ type: 'vinculo', action: 'summon' });
    assert.match(notice(a), /espere \d+ s/);
  });
});

describe('v60: Regra de Ouro (só no mapa aberto)', () => {
  it('no Vale (rankeado) não invoca; entrar lá cancela a criatura e o Estado Primal', () => {
    const { world, join, vin, notice, run } = forest();
    const a = join('caio');
    a.send({ type: 'vinculo', action: 'equip', creature: 'tartaruga' });
    a.s.vinculo.creatures.tartaruga = { level: 5, xp: 1000 };
    a.send({ type: 'vinculo', action: 'summon' });
    a.send({ type: 'vinculo', action: 'primal' });
    assert.equal(vin(a).primal.kind, 'tartaruga');
    placeIn(world, a.id, 'vale_estatuas', 30, 40);
    run(500);
    const st = vin(a);
    assert.equal(st.summoned.length, 0, 'a criatura sumiu');
    assert.equal(st.primal.kind, null, 'o Primal acabou');
    assert.equal(st.allowed, false);
    a.s.vinculoCdUntil = 0;
    a.send({ type: 'vinculo', action: 'summon' });
    assert.match(notice(a), /só vale no mapa aberto/);
  });

  it('troca de mapa aberto: a criatura vai junto (com a vida que tinha)', () => {
    const { world, join, vin } = forest();
    const a = join('davi');
    a.send({ type: 'vinculo', action: 'equip', creature: 'tigre' });
    a.send({ type: 'vinculo', action: 'summon' });
    const t1 = world.monsters.get(vin(a).summoned[0]);
    t1.hp = 7;
    placeIn(world, a.id, 'caverna_lodo', 20, 30);
    const now = [...world.monsters.values()].filter((m: any) => m.creature && m.ownerId === a.id);
    assert.equal(now.length, 1);
    assert.equal(now[0].map, 'caverna_lodo');
    assert.equal(now[0].hp, 7);
  });
});

describe('v60: Estado Primal', () => {
  it('pede afinidade 5 e a criatura em campo; dura 60 s; recarga de 5 min', () => {
    const { join, vin, notice, run } = forest();
    const a = join('eva');
    a.send({ type: 'vinculo', action: 'equip', creature: 'lesma' });
    a.send({ type: 'vinculo', action: 'summon' });
    a.send({ type: 'vinculo', action: 'primal' });
    assert.match(notice(a), /afinidade 5/);
    a.s.vinculo.creatures.lesma = { level: 5, xp: 1000 };
    a.send({ type: 'vinculo', action: 'primal' });
    assert.equal(vin(a).primal.kind, 'lesma');
    run(VINCULO.primalMs + 600);
    assert.equal(vin(a).primal.kind, null);
    assert.ok(vin(a).primal.cdMs > VINCULO.primalCooldownMs - 2000);
  });

  it('Tartaruga: imune a controle e escudo de 30% da vida; Lesma: metade do dano e divide com ela', () => {
    const { world, join } = forest();
    const a = join('fabi');
    a.send({ type: 'vinculo', action: 'equip', creature: 'tartaruga' });
    a.s.vinculo.creatures.tartaruga = { level: 5, xp: 1000 };
    a.send({ type: 'vinculo', action: 'summon' });
    a.send({ type: 'vinculo', action: 'primal' });
    assert.equal(a.s.absorb.hp, Math.round(a.s.stats.maxHp * PRIMAL.turtleShieldPct));
    const me = { kind: 'player', id: a.id, x: a.s.x, y: a.s.y, session: a.s };
    world.applyStatus(me, 'stunned', 2000, world.now());
    assert.ok(a.s.stunnedUntil <= world.now(), 'não atordoou');
    world.applyEffect(me, 'lentidao', world.now(), 3000);
    assert.equal(a.s.effects.has('lentidao'), false);

    const b = join('gil');
    b.send({ type: 'vinculo', action: 'equip', creature: 'lesma' });
    b.send({ type: 'vinculo', action: 'summon' });
    b.s.hp = 1000;
    const hp = b.s.hp;
    world.damagePlayer(b.s, 100, world.now());
    assert.equal(hp - b.s.hp, 70, '30% foi para a Lesma');
    b.s.vinculo.creatures.lesma = { level: 5, xp: 1000 };
    b.send({ type: 'vinculo', action: 'primal' });
    b.s.hp = 1000;
    for (const m of world.monsters.values()) if (m.creature?.kind === 'lesma') m.hp = 500;
    const hp2 = b.s.hp;
    world.damagePlayer(b.s, 100, world.now());
    assert.equal(hp2 - b.s.hp, 35, 'Primal: metade, e 30% disso na Lesma');
  });

  it('Tigre: +40% no Ataque Básico; o botão do Primal vira o avanço extra', () => {
    const { world, join, spot } = forest();
    const a = join('hugo');
    a.send({ type: 'vinculo', action: 'equip', creature: 'tigre' });
    a.s.vinculo.creatures.tigre = { level: 5, xp: 1000 };
    const slime = world.spawnMonster({ x: spot.x + 1, y: spot.y }, world.now(), 'map_2', 'slime', true);
    const m = world.monsters.get(slime.id);
    (m as any).maxHp = 5000; m.hp = 5000;
    a.s.fx = 1; a.s.fy = 0;
    world.basicAttack(a.s, world.now(), m.id);
    const normal = 5000 - m.hp;
    a.send({ type: 'vinculo', action: 'summon' });
    a.send({ type: 'vinculo', action: 'primal' });
    a.s.cooldowns.attack = 0;
    const hp = m.hp;
    world.basicAttack(a.s, world.now(), m.id);
    assert.equal(hp - m.hp, Math.round(normal * PRIMAL.tigerPhysical));
    const x0 = a.s.x;
    a.s.fx = -1; a.s.fy = 0;
    a.send({ type: 'vinculo', action: 'primal' });
    assert.ok(a.s.x < x0, 'avançou');
  });
});

describe('v60: a criatura luta e ganha afinidade', () => {
  it('vai no alvo mirado (mesmo com outro mais perto), bate e ganha XP', () => {
    const { world, join, spot, run } = forest();
    const a = join('ivo');
    a.send({ type: 'vinculo', action: 'equip', creature: 'lobo' });
    a.send({ type: 'vinculo', action: 'summon' });
    const close = world.spawnMonster({ x: spot.x + 1, y: spot.y }, world.now(), 'map_2', 'slime', true);
    const far = world.spawnMonster({ x: spot.x + 3, y: spot.y }, world.now(), 'map_2', 'slime', true);
    for (const v of [close, far]) { const m = world.monsters.get(v.id); m.attackDamage = 0; }
    a.s.aimFocus = { id: far.id, at: world.now() };
    run(1200);
    const wolves = [...world.monsters.values()].filter((m: any) => m.creature);
    assert.ok(wolves.every((w: any) => w.summonTargetId === far.id), 'foram no mirado');
    run(4000);
    assert.ok(a.s.vinculo.creatures.lobo.xp > 0, 'ganhou afinidade');
  });
});
