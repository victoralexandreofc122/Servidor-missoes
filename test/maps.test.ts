import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { buildMaps, inSafeZone, WORLD_MAPS } from '../src/realtime/maps.js';
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

/** Bloqueado para um corpo de raio r (r = 0,3 é o jogador; r = 1 pede um corredor de 2 casas). */
function blockedR(x: number, y: number, walls: readonly { x: number; y: number; w: number; h: number }[], r: number, W: number, H: number): boolean {
  if (x < r || y < r || x > W - r || y > H - r) return true;
  return walls.some((b) => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r);
}
/** Busca em largura (passo de 0,5 casa): de `from`, quais destinos dá para alcançar com folga r? */
function reach(from: [number, number], r: number): Set<string> {
  const seen = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const queue: [number, number][] = [from];
  seen.add(key(...from));
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (seen.has(k) || blockedR(nx, ny, VILA.walls, r, VILA.width, VILA.height + 2)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('mapas: layout', () => {
  it('Vila 80x80 (sem monstros) e Floresta 100x100 (caça); sempre o mesmo layout', () => {
    assert.deepEqual([VILA.id, VILA.kind, VILA.width, VILA.height, VILA.safe], ['map_1', 'village', 80, 80, true]);
    assert.deepEqual([FLORESTA.id, FLORESTA.kind, FLORESTA.width, FLORESTA.height, FLORESTA.safe], ['map_2', 'forest', 100, 100, false]);
    assert.deepEqual(buildMaps(), WORLD_MAPS, 'a floresta tem semente fixa: igual em todo boot');
    assert.ok(FLORESTA.walls.filter((w) => w.k === 'tree').length > 60, 'muitas árvores');
    const styles = VILA.walls.filter((w) => w.k === 'house').map((w) => w.s);
    for (const s of ['leader', 'hospital', 'academy', 'shop_weapon', 'shop_cloth', 'shop_scroll'] as const) assert.ok(styles.includes(s), s);
    assert.equal(VILA.walls.filter((w) => w.k === 'dummy').length, 1, 'um boneco de madeira só');
  });

  it('MURALHA: perímetro inteiro sólido; a única abertura é o portão sul (x 35..45), 100% livre', () => {
    for (let i = 0.5; i < 80; i += 0.5) {
      assert.ok(blocked(i, 0.5, VILA.walls), `muralha norte aberta em x=${i}`);
      assert.ok(blocked(0.5, i, VILA.walls) && blocked(79.5, i, VILA.walls), `muralha lateral aberta em y=${i}`);
      const gate = i > 35.3 && i < 44.7;
      assert.equal(blocked(i, 79.5, VILA.walls), !gate, `muralha sul em x=${i}`);
    }
    const gate = { x: 35, y: 70, w: 10, h: 10 };
    const inGate = VILA.walls.filter((w) => w.x < gate.x + gate.w && w.x + w.w > gate.x && w.y < gate.y + gate.h && w.y + w.h > gate.y);
    assert.deepEqual(inGate, [], 'nenhuma colisão no vão do portão (x 35..45, y 70..80)');
    assert.ok(!blocked(S.x, S.y, VILA.walls), 'renascimento livre');
    const npc = REALTIME.npcs[0]!;
    assert.ok(npc.map === 'map_1' && !blocked(npc.x, npc.y, VILA.walls), 'Mestre livre');
  });

  it('ruas e becos: do renascimento chega-se a tudo, e as rotas principais têm corredor de 2+ casas', () => {
    const wide = reach([S.x, S.y], 1);                     // corpo de 2 casas: rua de verdade
    const spots: [string, number, number][] = [
      ['portão', 40, 79.5], ['praça', 40, 66], ['frente do hospital', 21, 31.5], ['frente da academia', 59, 31.5],
      ['loja de armas', 28, 48], ['loja de roupas', 51, 48], ['loja de pergaminhos', 68, 48],
      ['campo de treino', 65, 60], ['beco atrás da sede', 40, 13.5], ['outro lado do rio (ponte)', 4, 50],
      ['ponte de baixo', 7.5, 63.5], ['casa do canto', 7.5, 12.5],
    ];
    for (const [name, x, y] of spots) assert.ok(wide.has(`${x},${y}`), `${name} (${x}, ${y}) sem corredor de 2 casas`);
    const narrow = reach([S.x, S.y], 0.3);                 // o jogador (raio 0,3) alcança até os becos estreitos
    assert.ok(narrow.size > wide.size);
    assert.ok(narrow.has('2.5,22.5'), 'beco atrás das cabanas (esconderijo)');
  });

  it('praça logo acima do portão é zona segura; a avenida não', () => {
    assert.ok(inSafeZone(VILA, 40, 76) && inSafeZone(VILA, 30, 56) && inSafeZone(VILA, 51, 77));
    assert.ok(!inSafeZone(VILA, S.x, S.y) && !inSafeZone(VILA, 40, 53) && !inSafeZone(FLORESTA, 50, 50));
  });

  it('Floresta: mata em todas as bordas, entrada norte (x 35..45) com clareira e trilha; monstros longe dela', () => {
    for (let x = 1; x < 99; x += 0.5) assert.equal(blocked(x, 0.5, FLORESTA.walls), !(x > 35.3 && x < 44.7), `borda norte em x=${x}`);
    for (let y = 2.5; y < 99; y += 0.5) assert.ok(blocked(0.5, y, FLORESTA.walls) && blocked(99.5, y, FLORESTA.walls));
    for (let x = 28; x <= 52; x += 0.5) for (let y = 2.5; y <= 13.5; y += 0.5) assert.ok(!blocked(x, y, FLORESTA.walls), `árvore na clareira em ${x},${y}`);
    for (let y = 0; y <= 35; y += 0.5) assert.ok(!blocked(40.5, y, FLORESTA.walls), `trilha bloqueada em y=${y}`);
    assert.ok(FLORESTA.hunt!.y >= 18, 'monstros não nascem na clareira de quem chega');
  });
});

describe('mapas: atravessar a borda (mesma regra no cliente e no servidor)', () => {
  const maps = WORLD_MAPS;
  it('portão da Vila (y 80), empurrando para o sul: Floresta em (x, 0); borda norte da Floresta: Vila em (x, 75)', () => {
    assert.deepEqual(crossExit(maps, 'map_1', 40, 80, 0, 1), ['map_2', 40, 0]);
    assert.deepEqual(crossExit(maps, 'map_1', 36, 80, 0.7, 0.7), ['map_2', 36, 0]);
    assert.deepEqual(crossExit(maps, 'map_2', 40, 0, 0, -1), ['map_1', 40, 75], 'e volta: dentro da praça, longe do portão');
  });

  it('não atravessa: fora do portão, sem estar na borda ou sem empurrar para fora', () => {
    assert.equal(crossExit(maps, 'map_1', 20, 80, 0, 1), null, 'fora do portão (muralha)');
    assert.equal(crossExit(maps, 'map_1', 40, 79.9, 0, 1), null, 'ainda não chegou na borda');
    assert.equal(crossExit(maps, 'map_1', 40, 80, 1, 0), null, 'na borda, mas andando para o lado');
    assert.equal(crossExit(maps, 'map_1', 80, 40, 1, 0), null, 'leste da Vila não tem saída');
    assert.equal(crossExit(maps, 'map_2', 40, 0, 0, 1), null, 'recém-chegado, ainda indo para o sul: NÃO volta (sem pingue-pongue)');
  });

  it('chegada bloqueada: não atravessa', () => {
    const fechada = { ...maps, map_2: { ...maps.map_2, walls: [...maps.map_2.walls, { x: 39, y: 0, w: 2, h: 2 }] } };
    assert.equal(crossExit(fechada, 'map_1', 40, 80, 0, 1), null);
  });

  it('PAREDE: quem anda para o sul fora do portão para na muralha e nunca chega na borda', () => {
    let [m, x, y] = ['map_1', 20, 74] as [string, number, number];
    for (let i = 0; i < 100; i++) [m, x, y] = moveStep(maps, m, x, y, 0, 1, 0.25);
    assert.ok(m === 'map_1' && y > 77.4 && y <= 77.7 && x === 20, `parou na muralha (y 78..80): ${[m, x, y]}`);
  });

  it('20 mil passos aleatórios pelos dois mapas: cliente (JS) e servidor (TS) dão exatamente o mesmo resultado', () => {
    const rnd = seededRandom(9);
    let state: [string, number, number] = ['map_1', S.x, S.y];
    let crossings = 0;
    for (let i = 0; i < 20_000; i++) {
      // puxado para o portão quase sempre (atravessa bastante), com trechos aleatórios
      const toGate = i % 500 < 420;
      const target = state[0] === 'map_1' ? [40, 80] : [40, 0];
      const dx = toGate ? Math.max(-1, Math.min(1, Math.round((target[0]! - state[1]) * 4) / 20)) : Math.round((rnd() * 2 - 1) * 20) / 20;
      const dy = toGate ? (state[0] === 'map_1' ? 1 : -1) : Math.round((rnd() * 2 - 1) * 20) / 20;
      const s = moveStep(maps, state[0], state[1], state[2], dx, dy, 0.25 + (i % 3) * 0.15);
      const c = client.moveStep(maps, state[0], state[1], state[2], dx, dy, 0.25 + (i % 3) * 0.15);
      assert.deepEqual(c, s, `passo ${i}`);
      if (s[0] !== state[0]) crossings += 1;
      state = s;
      assert.ok(!blocked(state[1], state[2], maps[state[0] as 'map_1'].walls), `dentro da parede em ${state}`);
    }
    assert.ok(crossings >= 10, `atravessou ${crossings} vezes`);
  });
});

const quiet: RealtimeConfig = withMonsters(0);
const TRILHA = { x: 40.5, y: 20 };   // ponto livre da Floresta (trilha que desce da entrada)

describe('mapas: servidor (salas)', () => {
  it('andando do renascimento até o portão: vai para a Floresta; o dono recebe map_changed só com o que há lá', () => {
    const { world, connect, run } = setupWorld(withMonsters(3));
    const a = connect('kaito');
    const b = connect('mei');                                 // fica na Vila
    const c = connect('rin');
    placeIn(world, c.id, 'map_2', TRILHA.x, TRILHA.y);        // já está na Floresta
    run(100);
    a.conn.clear(); b.conn.clear(); c.conn.clear();
    walk(a, run, 1, 200, [0, 1]);                             // 50 casas para o sul: passa do portão (y=80)
    run(500);
    assert.equal(mapOf(world, a.id), 'map_2');
    const changed = a.conn.last('map_changed');
    assert.equal(changed.map, 'map_2');
    assert.equal(changed.reason, 'walk');
    assert.deepEqual([changed.x, changed.y], [40, 0], 'borda norte da Floresta (x 40, y 0)');
    assert.deepEqual(changed.players.map((p: any) => p.id), [c.id], 'só quem está na Floresta');
    assert.equal(changed.monsters.length, 3, 'os monstros da Floresta');
    assert.deepEqual(b.conn.last('player_left'), { type: 'player_left', playerId: a.id }, 'quem ficou na Vila vê ele sair');
    assert.equal(c.conn.last('player_joined').player.id, a.id, 'quem está na Floresta vê ele chegar');
    const posAfter = b.conn.of('player_moved').filter((m: any) => m.playerId === a.id).at(-1);
    assert.ok(posAfter.y <= 80, 'a Vila não recebe as posições dele na Floresta');
    assert.ok(c.conn.of('player_moved').some((m: any) => m.playerId === a.id && m.y > 1), 'a Floresta recebe');
    const v = sess(world, a.id);
    assert.ok(v.y > 0 && v.y < 10 && v.x === 40, `continuou andando na Floresta (${v.x}, ${v.y})`);
  });

  it('chegando na Floresta ainda indo para o sul: não volta (sem pingue-pongue); para o norte na borda: volta à Vila', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 40, y: 79 });
    const seq = walk(a, run, 1, 20, [0, 1]);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_2');
    assert.ok(sess(world, a.id).y > 3);
    walk(a, run, seq, 30, [0, -1]);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.equal(a.conn.last('map_changed').map, 'map_1');
    assert.ok(sess(world, a.id).y < 80 && sess(world, a.id).x === 40, 'voltou pelo portão da Vila');
  });

  it('MURALHA: empurrar contra a muralha nunca leva à Floresta, nem forçando a posição na borda', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 20, y: 74 });
    walk(a, run, 1, 40, [0, 1]);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.ok(sess(world, a.id).y <= 77.7, 'parou na muralha');
    Object.assign(sess(world, a.id), { x: 20, y: 80 });     // "teleportado" para a borda, fora do portão
    walk(a, run, 41, 20, [0, 1]);
    a.send({ type: 'move', dx: 0, dy: 1 });                 // direção segurada também
    run(1500);
    assert.equal(mapOf(world, a.id), 'map_1', 'fora do portão a borda não é saída');
    assert.equal(a.conn.of('map_changed').length, 0);
  });

  it('ZONA SEGURA (praça): nenhuma habilidade nem ataque, sem gastar chakra; fora dela, tudo normal', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 40, y: 70 });     // praça, acima do portão
    world.spawnMonster({ x: 40.8, y: 70 });
    for (const skill of ['fire', 'water', 'taijutsu', 'heal']) {
      a.send({ type: 'cast', skill });
      assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill, reason: 'SAFE_ZONE' }, skill);
    }
    a.send({ type: 'attack' });
    assert.equal(a.conn.last('attack_failed').reason, 'SAFE_ZONE');
    assert.equal(sess(world, a.id).chakra, 100, 'nada foi cobrado');
    assert.equal(a.conn.of('cast').length + a.conn.of('attack').length + a.conn.of('hit').length, 0);
    run(5000);
    assert.equal(a.conn.of('hit').length, 0, 'monstro também não bate em quem está na praça');
    Object.assign(sess(world, a.id), { x: 40, y: 53 });     // rua de baixo: fora da praça
    a.send({ type: 'cast', skill: 'fire' });
    assert.equal(a.conn.last('cast').skill, 'fire', 'fora da praça a habilidade sai');
  });

  it('isolamento: chat, combate e monstros só no mesmo mapa; aviso geral (announce) para todos', () => {
    const { world, connect, run } = setupWorld(withMonsters(2));
    const a = connect('kaito');
    const b = connect('mei');
    placeIn(world, b.id, 'map_2', TRILHA.x, TRILHA.y);
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

  it('morreu na Floresta: renascer leva de volta à Vila (map_changed "respawn")', () => {
    const { world, connect, clock, run } = setupWorld(quiet);
    const a = connect('kaito');
    const b = connect('mei');
    placeIn(world, a.id, 'map_2', TRILHA.x, TRILHA.y);
    placeIn(world, b.id, 'map_2', TRILHA.x, TRILHA.y + 1);
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

  it('welcome: mapa atual, layouts dele e dos vizinhos (os outros chegam ao trocar de mapa) e só os jogadores do mesmo mapa', () => {
    const { world, connect } = setupWorld(quiet);
    const a = connect('kaito');
    placeIn(world, a.id, 'map_2', TRILHA.x, TRILHA.y);
    const b = connect('mei');
    const w = b.conn.last('welcome');
    assert.equal(w.world.map, 'map_1');
    assert.deepEqual([w.world.width, w.world.height], [80, 80]);
    assert.deepEqual(Object.keys(w.world.maps), ['map_1', 'map_2', 'interior_weapons', 'interior_clothes', 'interior_scrolls', 'academy_interior']);
    assert.equal(w.world.maps.map_2.walls.length, FLORESTA.walls.length);
    assert.deepEqual(w.world.maps.map_1.safeZones, VILA.safeZones);
    assert.deepEqual(w.players, [], 'kaito está na Floresta: não aparece na Vila');
    assert.ok(JSON.stringify(w).length < 30_000, `welcome leve (${JSON.stringify(w).length} bytes)`);
  });
});

describe('mapas: desenho no cliente (world.js)', async () => {
  const W = await import(new URL('../public/world.js', import.meta.url).href);
  const maps = JSON.parse(JSON.stringify(WORLD_MAPS));          // como chega pela rede

  it('costura: além do portão sul da Vila aparece a Floresta (e vice-versa), no lugar certo', () => {
    const fromVila = W.placements(maps, 'map_1');
    assert.deepEqual(fromVila.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_1', 0, 0], ['map_2', 0, 80]]);
    const fromFloresta = W.placements(maps, 'map_2');
    assert.deepEqual(fromFloresta.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_2', 0, 0], ['map_1', 0, -80]]);
    // a mesma casa do mundo vista dos dois lados: a praça da Vila
    assert.equal(W.groundAt(fromVila, 40, 70), 'stone');
    assert.equal(W.groundAt(fromFloresta, 40, 70 - 80), 'stone');
    // e a trilha da Floresta logo depois do portão, vista da Vila
    assert.equal(W.groundAt(fromVila, 40, 83), 'path');
  });

  it('chão da Vila: pedra clara nas ruas e praça, gramados, rio com pontes, areia no campo de treino e a arena de terra batida', () => {
    const v = W.placements(maps, 'map_1');
    assert.equal(W.groundAt(v, 40, 66), 'stone', 'praça');
    assert.equal(W.groundAt(v, 25, 33), 'stone', 'rua principal');
    assert.equal(W.groundAt(v, 14, 18), 'grass', 'gramado do hospital');
    assert.equal(W.groundAt(v, 7, 50), 'water', 'rio');
    assert.equal(W.groundAt(v, 7, 43), 'bridge', 'ponte');
    assert.equal(W.groundAt(v, 57, 70), 'sand', 'campo de treino');
    assert.equal(W.groundAt(v, 65, 60), 'arena', 'arena no meio do campo de treino');
    assert.equal(W.groundAt(v, -3, 10), 'void');
    assert.equal(W.groundAt(W.placements(maps, 'map_2'), 60, 30), 'darkgrass', 'Floresta: grama escura');
    assert.equal(W.groundAt(W.placements(maps, 'interior_weapons'), 7, 9), 'wood', 'loja: assoalho');
  });

  it('paredes e enfeites visíveis (com o vizinho deslocado); zona segura; nome do mapa', () => {
    const walls = W.visibleWalls(W.placements(maps, 'map_1'));
    assert.equal(walls.length, VILA.walls.length + FLORESTA.walls.length);
    assert.ok(walls.some((w: any) => w.k === 'house' && w.s === 'leader'));
    const deco = W.visibleDeco(W.placements(maps, 'map_1'));
    assert.ok(deco.filter((d: any) => d.k === 'bench').length >= 4 && deco.some((d: any) => d.k === 'gate_roof'));
    assert.ok(W.inSafeZone(maps.map_1, 40, 70) && !W.inSafeZone(maps.map_1, 40, 34));
    assert.equal(W.mapName(maps, 'map_2'), 'Floresta');
  });
});
