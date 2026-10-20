import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { buildMaps, WORLD_MAPS } from '../src/realtime/maps.js';
import { blocked, crossExit, moveStep } from '../src/realtime/movement.js';
import { mapOf, placeIn, seededRandom, setupWorld, withMonsters } from './support/world.js';

// Cliente (JavaScript puro): a MESMA regra de borda do navegador.
const client = await import(new URL('../public/movement.js', import.meta.url).href);

const VILA = WORLD_MAPS.map_1;
const FLORESTA = WORLD_MAPS.map_2;
const S = REALTIME.spawn;
const sess = (world: any, id: string) => world.sessions.get(id);
/** Anda como o cliente: 2 entradas a cada 100 ms (o ritmo real), N entradas no total. */
function walk(a: { send: (m: unknown) => void }, run: (ms: number) => void, from: number, n: number, dir: [number, number] = [1, 0]): number {
  let seq = from;
  for (let left = n; left > 0; left -= 2) {
    a.send({ type: 'input', seq, inputs: Array.from({ length: Math.min(2, left) }, () => dir) });
    seq += Math.min(2, left);
    run(100);
  }
  return seq;
}

describe('mapas: layout', () => {
  it('Vila 50x50 (pedra, segura) e Floresta 100x100 (grama, caça); sempre o mesmo layout', () => {
    assert.deepEqual([VILA.id, VILA.kind, VILA.width, VILA.height, VILA.safe], ['map_1', 'village', 50, 50, true]);
    assert.deepEqual([FLORESTA.id, FLORESTA.kind, FLORESTA.width, FLORESTA.height, FLORESTA.safe], ['map_2', 'forest', 100, 100, false]);
    assert.deepEqual(buildMaps(), WORLD_MAPS, 'a floresta tem semente fixa: igual em todo boot');
    assert.ok(FLORESTA.walls.filter((w) => w.k === 'tree').length > 60, 'muitas árvores');
    assert.ok(VILA.walls.every((w) => w.k === 'house'));
  });

  it('Vila FECHADA: casas em todas as bordas; a única passagem é o portão leste (y 22..28)', () => {
    for (let i = 0.5; i < 50; i += 0.5) {
      assert.ok(blocked(i, 0.5, VILA.walls) && blocked(i, 49.5, VILA.walls), `borda norte/sul aberta em x=${i}`);
      assert.ok(blocked(0.5, i, VILA.walls), `borda oeste aberta em y=${i}`);
      const gate = i > 22.3 && i < 27.7;
      assert.equal(blocked(49.5, i, VILA.walls), !gate, `borda leste em y=${i}`);
    }
    assert.ok(!blocked(S.x, S.y, VILA.walls), 'renascimento livre');
    const npc = REALTIME.npcs[0]!;
    assert.ok(npc.map === 'map_1' && !blocked(npc.x, npc.y, VILA.walls), 'Mestre na praça, livre');
  });

  it('Floresta: mata nas bordas, trilha oeste (y 47..53) e clareira de entrada sem árvores; monstros fora dela', () => {
    for (let y = 1; y < 99; y += 0.5) assert.equal(blocked(0.5, y, FLORESTA.walls), !(y > 47.3 && y < 52.7), `borda oeste em y=${y}`);
    for (let x = 0; x <= 14; x += 0.5) for (let y = 46; y <= 54; y += 0.5) {
      if (x < 2.3 && (y <= 47.3 || y >= 52.7)) continue;            // a mata da borda
      assert.ok(!blocked(x, y, FLORESTA.walls), `árvore na clareira em ${x},${y}`);
    }
    assert.ok(FLORESTA.hunt!.x > 14, 'monstros não nascem na clareira de quem chega');
  });
});

describe('mapas: atravessar a borda (mesma regra no cliente e no servidor)', () => {
  const maps = WORLD_MAPS;
  it('borda leste da Vila, no portão, empurrando para leste: Floresta, borda oeste (x=0), y + 25', () => {
    assert.deepEqual(crossExit(maps, 'map_1', 50, 25, 1, 0), ['map_2', 0, 50]);
    assert.deepEqual(crossExit(maps, 'map_1', 50, 22.5, 0.7, -0.7), ['map_2', 0, 47.5]);
    assert.deepEqual(crossExit(maps, 'map_2', 0, 50, -1, 0), ['map_1', 50, 25], 'e volta: borda oeste da Floresta -> leste da Vila');
  });

  it('não atravessa: fora do portão, sem estar na borda ou sem empurrar para fora', () => {
    assert.equal(crossExit(maps, 'map_1', 50, 10, 1, 0), null, 'fora do portão (atrás das casas)');
    assert.equal(crossExit(maps, 'map_1', 49.9, 25, 1, 0), null, 'ainda não chegou na borda');
    assert.equal(crossExit(maps, 'map_1', 50, 25, 0, 1), null, 'na borda, mas andando para o sul');
    assert.equal(crossExit(maps, 'map_1', 0, 25, -1, 0), null, 'borda oeste da Vila não tem saída');
    assert.equal(crossExit(maps, 'map_2', 0, 50, 1, 0), null, 'recém-chegado, ainda indo para leste: NÃO volta (sem pingue-pongue)');
  });

  it('chegada bloqueada: não atravessa', () => {
    const fechada = { ...maps, map_2: { ...maps.map_2, walls: [...maps.map_2.walls, { x: 0, y: 49, w: 2, h: 2 }] } };
    assert.equal(crossExit(fechada, 'map_1', 50, 25, 1, 0), null);
  });

  it('PAREDE: quem anda para leste atrás das casas para nelas e nunca chega na borda', () => {
    let [m, x, y] = ['map_1', 44, 10] as [string, number, number];
    for (let i = 0; i < 100; i++) [m, x, y] = moveStep(maps, m, x, y, 1, 0, 0.25);
    assert.ok(m === 'map_1' && x > 46.4 && x <= 46.7 && y === 10, `parou na casa (x 47..50): ${[m, x, y]}`);
  });

  it('20 mil passos aleatórios pelos dois mapas: cliente (JS) e servidor (TS) dão exatamente o mesmo resultado', () => {
    const rnd = seededRandom(9);
    let state: [string, number, number] = ['map_1', S.x, S.y];
    let crossings = 0;
    for (let i = 0; i < 20_000; i++) {
      // puxado para o portão de vez em quando, para atravessar bastante
      const toGate = i % 400 < 200;
      const dx = toGate ? (state[0] === 'map_1' ? 1 : -1) : Math.round((rnd() * 2 - 1) * 20) / 20;
      const dy = toGate ? Math.round(((state[0] === 'map_1' ? 25 : 50) - state[2]) * 4) / 20 : Math.round((rnd() * 2 - 1) * 20) / 20;
      const ddy = Math.max(-1, Math.min(1, dy));
      const s = moveStep(maps, state[0], state[1], state[2], dx, ddy, 0.25 + (i % 3) * 0.15);
      const c = client.moveStep(maps, state[0], state[1], state[2], dx, ddy, 0.25 + (i % 3) * 0.15);
      assert.deepEqual(c, s, `passo ${i}`);
      if (s[0] !== state[0]) crossings += 1;
      state = s;
      assert.ok(!blocked(state[1], state[2], maps[state[0] as 'map_1'].walls), `dentro da parede em ${state}`);
    }
    assert.ok(crossings >= 10, `atravessou ${crossings} vezes`);
  });
});

const quiet: RealtimeConfig = withMonsters(0);

describe('mapas: servidor (salas)', () => {
  it('andando da praça até o portão: vai para a Floresta; o dono recebe map_changed só com o que há lá', () => {
    const { world, connect, run } = setupWorld(withMonsters(3));
    const a = connect('kaito');
    const b = connect('mei');                                 // fica na Vila
    const c = connect('rin');
    placeIn(world, c.id, 'map_2', 30, 50);                    // já está na Floresta
    run(100);
    a.conn.clear(); b.conn.clear(); c.conn.clear();
    walk(a, run, 1, 120);                                     // 30 casas: passa do portão (x=50)
    run(500);
    assert.equal(mapOf(world, a.id), 'map_2');
    const changed = a.conn.last('map_changed');
    assert.equal(changed.map, 'map_2');
    assert.equal(changed.reason, 'walk');
    assert.deepEqual([changed.x, changed.y], [0, 50], 'borda oeste da Floresta');
    assert.deepEqual(changed.players.map((p: any) => p.id), [c.id], 'só quem está na Floresta');
    assert.equal(changed.monsters.length, 3, 'os monstros da Floresta');
    assert.deepEqual(b.conn.last('player_left'), { type: 'player_left', playerId: a.id }, 'quem ficou na Vila vê ele sair');
    assert.equal(c.conn.last('player_joined').player.id, a.id, 'quem está na Floresta vê ele chegar');
    const posAfter = b.conn.of('player_moved').filter((m: any) => m.playerId === a.id).at(-1);
    assert.ok(posAfter.x <= 50, 'a Vila não recebe as posições dele na Floresta');
    assert.ok(c.conn.of('player_moved').some((m: any) => m.playerId === a.id && m.x > 2), 'a Floresta recebe');
    const v = sess(world, a.id);
    assert.ok(v.x > 0 && v.x < 10 && v.y === 50, `continuou andando na Floresta (${v.x}, ${v.y})`);
  });

  it('chegando na Floresta ainda segurando para leste: não volta (sem pingue-pongue); para oeste na borda: volta à Vila', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 49, y: 25 });
    const seq = walk(a, run, 1, 20);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_2');
    assert.ok(sess(world, a.id).x > 3);
    walk(a, run, seq, 30, [-1, 0]);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.equal(a.conn.last('map_changed').map, 'map_1');
    assert.ok(sess(world, a.id).x < 50 && sess(world, a.id).y === 25, 'voltou pelo portão leste da Vila');
  });

  it('PAREDE: empurrar contra as casas da borda leste nunca leva à Floresta, nem forçando a posição na borda', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 44, y: 10 });
    walk(a, run, 1, 40);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.ok(sess(world, a.id).x <= 46.7, 'parou na casa');
    Object.assign(sess(world, a.id), { x: 50, y: 10 });     // "teleportado" para a borda, fora do portão
    walk(a, run, 41, 20);
    a.send({ type: 'move', dx: 1, dy: 0 });                 // direção segurada também
    run(1500);
    assert.equal(mapOf(world, a.id), 'map_1', 'fora do portão a borda não é saída');
    assert.equal(a.conn.of('map_changed').length, 0);
  });

  it('isolamento: chat, combate e monstros só no mesmo mapa; aviso geral (announce) para todos', () => {
    const { world, connect, run } = setupWorld(withMonsters(2));
    const a = connect('kaito');
    const b = connect('mei');
    placeIn(world, b.id, 'map_2', 30, 50);
    a.conn.clear(); b.conn.clear();
    b.send({ type: 'chat', message: 'na floresta' });
    assert.equal(a.conn.of('chat').length, 0, 'chat da Floresta não chega na Vila');
    assert.equal(b.conn.of('chat').length, 1);
    run(10_000);
    assert.equal(a.conn.of('monsters_moved').length + a.conn.of('monster_spawned').length, 0, 'a Vila não recebe monstros da Floresta');
    assert.ok(b.conn.of('monsters_moved').length > 0);
    // Monstro da Floresta exatamente na mesma posição de quem está na Vila: não dá para bater nele.
    const m = world.monsterList()[0]!;
    Object.assign((world as any).monsters.get(m.id), { x: sess(world, a.id).x + 1, y: sess(world, a.id).y });
    a.send({ type: 'attack', targetId: m.id });
    assert.equal(a.conn.last('attack_failed').reason, 'NO_TARGET');
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal(a.conn.last('cast_failed').reason, 'NO_TARGET');
    (world as any).applyXp(b.id, 'mei', 20, { totalXp: 100, rank: { code: 'GENIN', name: 'Genin' }, promoted: true });
    assert.equal(a.conn.last('announce').message, 'mei subiu para Genin!', 'promoção é aviso geral');
  });

  it('NPC e jogadores: só no mesmo mapa (na Floresta, nas mesmas coordenadas do Mestre, ele está longe)', () => {
    const { world, connect } = setupWorld(quiet);
    const a = connect('kaito');
    const npc = REALTIME.npcs[0]!;
    placeIn(world, a.id, 'map_2', npc.x, npc.y);
    (world as any).missions = { talk: async () => ({ kind: 'rank_too_high' }), current: async () => null };
    a.send({ type: 'talk', npcId: 'sensei' });
    assert.equal(a.conn.last('error').code, 'NPC_TOO_FAR');
  });

  it('morreu na Floresta: renascer leva de volta à praça da Vila (map_changed "respawn")', () => {
    const { world, connect, clock, run } = setupWorld(quiet);
    const a = connect('kaito');
    const b = connect('mei');
    placeIn(world, a.id, 'map_2', 30, 50);
    placeIn(world, b.id, 'map_2', 31, 50);
    run(100);
    (world as any).damagePlayer(sess(world, a.id), 1000, clock.now());
    assert.equal(b.conn.last('player_died').playerId, a.id);
    clock.advance(REALTIME.combat.player.respawnMs);
    a.send({ type: 'respawn' });
    assert.equal(mapOf(world, a.id), 'map_1');
    const changed = a.conn.last('map_changed');
    assert.deepEqual([changed.map, changed.x, changed.y, changed.reason], ['map_1', S.x, S.y, 'respawn']);
    assert.equal(a.conn.last('player_respawned').playerId, a.id);
    assert.equal(b.conn.last('player_left').playerId, a.id, 'quem ficou na Floresta vê ele sumir');
    assert.equal(b.conn.of('player_respawned').length, 0);
  });

  it('welcome: mapa atual, layout de todos os mapas e só os jogadores do mesmo mapa', () => {
    const { world, connect } = setupWorld(quiet);
    const a = connect('kaito');
    placeIn(world, a.id, 'map_2', 30, 50);
    const b = connect('mei');
    const w = b.conn.last('welcome');
    assert.equal(w.world.map, 'map_1');
    assert.deepEqual([w.world.width, w.world.height], [50, 50]);
    assert.deepEqual(Object.keys(w.world.maps), ['map_1', 'map_2']);
    assert.equal(w.world.maps.map_2.walls.length, FLORESTA.walls.length);
    assert.deepEqual(w.players, [], 'kaito está na Floresta: não aparece na Vila');
    assert.ok(JSON.stringify(w).length < 30_000, `welcome leve (${JSON.stringify(w).length} bytes)`);
  });
});

describe('mapas: desenho no cliente (world.js)', async () => {
  const W = await import(new URL('../public/world.js', import.meta.url).href);
  const maps = JSON.parse(JSON.stringify(WORLD_MAPS));          // como chega pela rede

  it('costura: além do portão leste da Vila aparece a Floresta (e vice-versa), no lugar certo', () => {
    const fromVila = W.placements(maps, 'map_1');
    assert.deepEqual(fromVila.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_1', 0, 0], ['map_2', 50, -25]]);
    const fromFloresta = W.placements(maps, 'map_2');
    assert.deepEqual(fromFloresta.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_2', 0, 0], ['map_1', -50, 25]]);
    // a mesma casa do mundo vista dos dois lados: chão de pedra da Vila
    assert.equal(W.groundAt(fromVila, 40, 10), 'stone');
    assert.equal(W.groundAt(fromFloresta, 40 - 50, 10 + 25), 'stone');
    // e a trilha da Floresta logo depois do portão, vista da Vila
    assert.equal(W.groundAt(fromVila, 55, 25), 'path');
    assert.equal(W.groundAt(W.placements(maps, 'map_2'), 5, 50), 'path');
  });

  it('chão: pedra na Vila, rua de terra da praça ao portão, grama na Floresta, mata fechada fora do mundo', () => {
    const v = W.placements(maps, 'map_1');
    assert.equal(W.groundAt(v, 10, 10), 'stone');
    assert.equal(W.groundAt(v, 30, 25), 'path');
    assert.equal(W.groundAt(v, -3, 10), 'void');
    assert.equal(W.groundAt(v, 60, 10), 'grass', 'Floresta além da borda leste');
    const f = W.placements(maps, 'map_2');
    assert.equal(W.groundAt(f, 60, 20), 'grass');
    assert.equal(W.groundAt(f, 120, 20), 'void');
  });

  it('paredes visíveis: as do mapa e as do vizinho deslocadas; nome do mapa', () => {
    const walls = W.visibleWalls(W.placements(maps, 'map_1'));
    assert.equal(walls.length, VILA.walls.length + FLORESTA.walls.length);
    const t = FLORESTA.walls.at(-1)!;
    assert.ok(walls.some((w: any) => w.k === 'tree' && w.x === t.x + 50 && w.y === t.y - 25));
    assert.equal(W.mapName(maps, 'map_2'), 'Floresta');
  });
});
