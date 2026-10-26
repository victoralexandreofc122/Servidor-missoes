import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { FOREST_GATE_SHIFT, buildMaps, inSafeZone, shopDoor, villagePlan, WORLD_MAPS } from '../src/realtime/maps.js';
import { blocked, crossExit, moveStep } from '../src/realtime/movement.js';
import { mapOf, placeIn, seededRandom, setupWorld, withMonsters } from './support/world.js';

// Cliente (JavaScript puro): a MESMA regra de borda do navegador.
const client = await import(new URL('../public/movement.js', import.meta.url).href);

const VILA = WORLD_MAPS.map_1;
const FLORESTA = WORLD_MAPS.map_2;
const S = REALTIME.spawn;
const P = villagePlan('map_1');
/** Bem no meio do portão da Folha e a borda de baixo dela. */
const GX = 39, GY = VILA.height;
/** A mesma coluna, do lado da Floresta (a entrada dela fica mais à direita). */
const FX = GX + FOREST_GATE_SHIFT;
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
      if (seen.has(k) || blockedR(nx, ny, VILA.walls, r, VILA.width, VILA.height + 1)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('mapas: layout', () => {
  it('Vila da Folha (78x60, sem monstros) e Floresta (100x75, caça), as duas em imagem; sempre o mesmo layout', () => {
    assert.deepEqual([VILA.id, VILA.kind, VILA.width, VILA.height, VILA.safe, VILA.art], ['map_1', 'village', 78, 60, true, 'folha']);
    assert.deepEqual([FLORESTA.id, FLORESTA.kind, FLORESTA.width, FLORESTA.height, FLORESTA.safe, FLORESTA.art], ['map_2', 'forest', 100, 75, false, 'floresta']);
    assert.deepEqual(buildMaps(), WORLD_MAPS, 'a floresta tem semente fixa: igual em todo boot');
    assert.ok(FLORESTA.walls.filter((w) => w.k === 'tree').length > 20, 'a mata em volta das clareiras e trilhas');
    const styles = VILA.walls.filter((w) => w.k === 'house').map((w) => w.s);
    for (const s of ['leader', 'hospital', 'academy', 'shop_weapon', 'shop_cloth', 'shop_scroll'] as const) assert.ok(styles.includes(s), s);
    assert.deepEqual(VILA.deco, [], 'os enfeites estão no desenho');
    assert.ok((VILA.lights ?? []).length >= 8, 'as lanternas do desenho acendem de noite');
  });

  it('MURALHA: perímetro inteiro sólido; a única abertura é o portão sul (entre as duas folhas), 100% livre', () => {
    for (let i = 0.5; i < 78; i += 0.5) {
      assert.ok(blocked(i, 0.5, VILA.walls), `muralha norte aberta em x=${i}`);
      if (i < 60) assert.ok(blocked(0.5, i, VILA.walls) && blocked(77.5, i, VILA.walls), `muralha lateral aberta em y=${i}`);
      const gate = i >= 37 && i <= 41;
      assert.equal(blocked(i, 59.5, VILA.walls), !gate, `muralha sul em x=${i}`);
    }
    const gate = { x: P.gate.from, y: 53, w: P.gate.to - P.gate.from, h: 7 };
    const inGate = VILA.walls.filter((w) => w.x < gate.x + gate.w && w.x + w.w > gate.x && w.y < gate.y + gate.h && w.y + w.h > gate.y);
    assert.deepEqual(inGate, [], 'nenhuma colisão no vão do portão');
    assert.ok(!blocked(S.x, S.y, VILA.walls), 'renascimento livre');
    const npc = REALTIME.npcs[0]!;
    assert.ok(npc.map === 'map_1' && !blocked(npc.x, npc.y, VILA.walls) && Math.hypot(npc.x - S.x, npc.y - S.y) <= npc.range, 'Mestre livre e ao alcance de quem renasce');
  });

  it('ruas e becos: do renascimento chega-se a tudo, e as rotas principais têm corredor de 2+ casas', () => {
    const from: [number, number] = [Math.round(S.x * 2) / 2, Math.round(S.y * 2) / 2];   // na grade de meia casa
    const wide = reach(from, 1);                           // corpo de 2 casas: rua de verdade
    const near = (set: Set<string>, x: number, y: number) => {
      for (let dx = -1; dx <= 1; dx += 0.5) for (let dy = -1; dy <= 1; dy += 0.5) if (set.has(`${Math.round((x + dx) * 2) / 2},${Math.round((y + dy) * 2) / 2}`)) return true;
      return false;
    };
    const door = (b: { x: number; y: number; w: number; h: number }) => shopDoor(b).outside;
    const spots: [string, number, number][] = [
      ['portão', GX, 59.5], ['praça', P.plaza.x, P.plaza.y], ['Posto de Viagem', P.travel.x + 2.5, P.travel.y - 1.5],
      ['frente da academia', door(P.academy).x, door(P.academy).y],
      ['loja de armas', door(P.shops.weapons).x, door(P.shops.weapons).y], ['loja de roupas', door(P.shops.clothes).x, door(P.shops.clothes).y],
      ['loja de pergaminhos', door(P.shops.scrolls).x, door(P.shops.scrolls).y], ['entrada da arena', P.arena.respawn.x, P.arena.respawn.y],
      ['ponte da esquerda', 18.5, 28], ['ponte da direita', 69, 28], ['ponte do braço do rio', 13.7, 40],
    ];
    for (const [name, x, y] of spots) assert.ok(near(wide, x, y), `${name} (${x}, ${y}) sem corredor de 2 casas`);
    const narrow = reach(from, 0.3);                       // o jogador (raio 0,3) alcança até os cantos entre as árvores
    assert.ok(narrow.size > wide.size);
    for (const [name, x, y] of [['frente do hospital', 23.3, 22.5], ['cabana do canto de cima', 13.5, 12], ['casas da esquerda, do outro lado do rio', 5.5, 38], ['dentro da arena', 66, 47]] as const) {
      assert.ok(near(narrow, x, y), `${name} (${x}, ${y})`);
    }
  });

  it('praça logo acima do portão é zona segura; a avenida não', () => {
    assert.ok(inSafeZone(VILA, P.plaza.x, P.plaza.y) && inSafeZone(VILA, 30, 52) && inSafeZone(VILA, 50, 40));
    assert.ok(!inSafeZone(VILA, S.x, S.y) && !inSafeZone(VILA, 38, 36.5) && !inSafeZone(FLORESTA, 50, 50));
  });

  it('Floresta: mata em todas as bordas, entrada norte (x 45..52) com clareira e trilha; monstros longe dela', () => {
    for (let x = 1; x < 99; x += 0.5) assert.equal(blocked(x, 0.5, FLORESTA.walls), !(x > 45.3 && x < 51.7), `borda norte em x=${x}`);
    for (let y = 1; y < 74; y += 0.5) assert.ok(blocked(0.5, y, FLORESTA.walls) && blocked(99.5, y, FLORESTA.walls), `bordas em y=${y}`);
    for (let x = 41; x <= 60; x += 0.5) assert.ok(!blocked(x, 10, FLORESTA.walls) || (x >= 42 && x <= 44), `clareira em ${x},10`);
    for (let y = 0; y <= 36; y += 0.5) assert.ok(!blocked(48.5, y, FLORESTA.walls), `trilha bloqueada em y=${y}`);
    assert.ok(FLORESTA.zones!.every((z) => !(z.x < 62 && z.x + z.w > 40 && z.y < 16)), 'monstros não nascem na clareira de quem chega');
  });
});

describe('mapas: atravessar a borda (mesma regra no cliente e no servidor)', () => {
  const maps = WORLD_MAPS;
  it('portão da Vila (borda de baixo), empurrando para o sul: Floresta em (x, 0); borda norte da Floresta: Vila no portão', () => {
    assert.deepEqual(crossExit(maps, 'map_1', GX, GY, 0, 1), ['map_2', FX, 0]);
    assert.deepEqual(crossExit(maps, 'map_1', 37, GY, 0.7, 0.7), ['map_2', 37 + FOREST_GATE_SHIFT, 0]);
    assert.deepEqual(crossExit(maps, 'map_2', FX, 0, 0, -1), ['map_1', GX, P.gate.returnY], 'e volta: entre as folhas do portão');
    assert.equal(crossExit(maps, 'map_2', 44, 0, 0, -1), null, 'na Floresta, fora do trecho do portão da Folha: não atravessa');
  });

  it('não atravessa: fora do portão, sem estar na borda ou sem empurrar para fora', () => {
    assert.equal(crossExit(maps, 'map_1', 20, GY, 0, 1), null, 'fora do portão (muralha)');
    assert.equal(crossExit(maps, 'map_1', GX, GY - 0.1, 0, 1), null, 'ainda não chegou na borda');
    assert.equal(crossExit(maps, 'map_1', GX, GY, 1, 0), null, 'na borda, mas andando para o lado');
    assert.equal(crossExit(maps, 'map_1', 78, 30, 1, 0), null, 'leste da Vila não tem saída');
    assert.equal(crossExit(maps, 'map_2', FX, 0, 0, 1), null, 'recém-chegado, ainda indo para o sul: NÃO volta (sem pingue-pongue)');
  });

  it('chegada bloqueada: não atravessa', () => {
    const fechada = { ...maps, map_2: { ...maps.map_2, walls: [...maps.map_2.walls, { x: FX - 1, y: 0, w: 2, h: 2 }] } };
    assert.equal(crossExit(fechada, 'map_1', GX, GY, 0, 1), null);
  });

  it('PAREDE: quem anda para o sul fora do portão para na muralha e nunca chega na borda', () => {
    let [m, x, y] = ['map_1', 28, 52] as [string, number, number];
    for (let i = 0; i < 100; i++) [m, x, y] = moveStep(maps, m, x, y, 0, 1, 0.25);
    assert.ok(m === 'map_1' && y > 54.1 && y <= 54.4 && x === 28, `parou na muralha: ${[m, x, y]}`);
  });

  it('20 mil passos aleatórios pelos dois mapas: cliente (JS) e servidor (TS) dão exatamente o mesmo resultado', () => {
    const rnd = seededRandom(9);
    let state: [string, number, number] = ['map_1', S.x, S.y];
    let crossings = 0;
    for (let i = 0; i < 20_000; i++) {
      // puxado para o portão quase sempre (atravessa bastante), com trechos aleatórios
      const toGate = i % 500 < 420;
      const target = state[0] === 'map_1' ? [GX, GY] : [FX, 0];
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
const TRILHA = { x: 48.5, y: 20 };   // ponto livre da Floresta (trilha que desce da entrada)

describe('mapas: servidor (salas)', () => {
  it('andando do renascimento até o portão: vai para a Floresta; o dono recebe map_changed só com o que há lá', () => {
    const { world, connect, run } = setupWorld(withMonsters(3));
    const a = connect('kaito');
    const b = connect('mei');                                 // fica na Vila
    const c = connect('rin');
    placeIn(world, c.id, 'map_2', TRILHA.x, TRILHA.y);        // já está na Floresta
    run(100);
    a.conn.clear(); b.conn.clear(); c.conn.clear();
    walk(a, run, 1, 200, [0, 1]);                             // 50 casas para o sul: pela ponte do meio e pela praça, passa do portão
    run(500);
    assert.equal(mapOf(world, a.id), 'map_2');
    const changed = a.conn.last('map_changed');
    assert.equal(changed.map, 'map_2');
    assert.equal(changed.reason, 'walk');
    assert.deepEqual([changed.x, changed.y], [S.x + FOREST_GATE_SHIFT, 0], 'borda norte da Floresta, na mesma coluna');
    assert.deepEqual(changed.players.map((p: any) => p.id), [c.id], 'só quem está na Floresta');
    assert.equal(changed.monsters.length, 3, 'os monstros da Floresta');
    assert.deepEqual(b.conn.last('player_left'), { type: 'player_left', playerId: a.id }, 'quem ficou na Vila vê ele sair');
    assert.equal(c.conn.last('player_joined').player.id, a.id, 'quem está na Floresta vê ele chegar');
    const posAfter = b.conn.of('player_moved').filter((m: any) => m.playerId === a.id).at(-1);
    assert.ok(posAfter.y <= GY, 'a Vila não recebe as posições dele na Floresta');
    assert.ok(c.conn.of('player_moved').some((m: any) => m.playerId === a.id && m.y > 1), 'a Floresta recebe');
    const v = sess(world, a.id);
    assert.ok(v.y > 0 && v.y < 20 && v.x === S.x + FOREST_GATE_SHIFT, `continuou andando na Floresta (${v.x}, ${v.y})`);
  });

  it('chegando na Floresta ainda indo para o sul: não volta (sem pingue-pongue); para o norte na borda: volta à Vila', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: GX, y: GY - 1 });
    const seq = walk(a, run, 1, 20, [0, 1]);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_2');
    assert.ok(sess(world, a.id).y > 3);
    walk(a, run, seq, 30, [0, -1]);
    run(300);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.equal(a.conn.last('map_changed').map, 'map_1');
    assert.ok(sess(world, a.id).y < GY && sess(world, a.id).x === GX, 'voltou pelo portão da Vila');
  });

  it('MURALHA: empurrar contra a muralha nunca leva à Floresta, nem forçando a posição na borda', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: 28, y: 52 });
    walk(a, run, 1, 40, [0, 1]);
    assert.equal(mapOf(world, a.id), 'map_1');
    assert.ok(sess(world, a.id).y <= 54.4, 'parou na muralha');
    Object.assign(sess(world, a.id), { x: 28, y: GY });     // "teleportado" para a borda, fora do portão
    walk(a, run, 41, 20, [0, 1]);
    a.send({ type: 'move', dx: 0, dy: 1 });                 // direção segurada também
    run(1500);
    assert.equal(mapOf(world, a.id), 'map_1', 'fora do portão a borda não é saída');
    assert.equal(a.conn.of('map_changed').length, 0);
  });

  it('ZONA SEGURA (praça): nenhum jutsu, sem gastar chakra; o Ataque Básico sai (todos veem) mas não acerta; fora dela, tudo normal', () => {
    const { world, connect, run } = setupWorld(quiet);
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: P.plaza.x, y: P.plaza.y });     // praça, acima do portão
    const m = world.spawnMonster({ x: P.plaza.x + 0.8, y: P.plaza.y });
    for (const skill of ['fire', 'water', 'taijutsu', 'heal']) {
      a.send({ type: 'cast', skill });
      assert.deepEqual(a.conn.last('cast_failed'), { type: 'cast_failed', skill, reason: 'SAFE_ZONE' }, skill);
    }
    a.send({ type: 'attack', targetId: m.id });
    assert.equal(a.conn.last('attack_failed'), undefined);
    assert.equal(a.conn.of('attack').length, 1, 'o golpe sai (a animação)');
    assert.equal((world as any).monsters.get(m.id).hp, m.hp, 'mas não acerta ninguém');
    assert.equal(sess(world, a.id).chakra, 100, 'nada foi cobrado');
    assert.equal(a.conn.of('cast').length + a.conn.of('hit').length, 0);
    run(5000);
    assert.equal(a.conn.of('hit').length, 0, 'monstro também não bate em quem está na praça');
    Object.assign(sess(world, a.id), { x: 38, y: 36.5 });   // rua das lojas: fora da praça
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
    const hp = (world as any).monsters.get(m.id).hp;
    a.send({ type: 'attack', targetId: m.id });
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal((world as any).monsters.get(m.id).hp, hp, 'golpe e Taijutsu saem na Vila, mas não acertam o monstro da Floresta');
    assert.equal(a.conn.of('hit').length, 0);
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
    assert.deepEqual([w.world.width, w.world.height], [78, 60]);
    assert.deepEqual(Object.keys(w.world.maps), ['map_1', 'map_2', 'interior_weapons', 'interior_clothes', 'interior_scrolls', 'academy_interior']);
    assert.equal(w.world.maps.map_2.walls.length, FLORESTA.walls.length);
    assert.deepEqual(w.world.maps.map_1.safeZones, VILA.safeZones);
    assert.deepEqual(w.players, [], 'kaito está na Floresta: não aparece na Vila');
    // a Floresta do Arco 1 é maior (trilhas e riacho em curvas) e o céu vem junto (clima)
    assert.ok(JSON.stringify(w).length < 36_000, `welcome leve (v23: + a colisão da Folha em imagem) (${JSON.stringify(w).length} bytes)`);
  });
});

describe('mapas: desenho no cliente (world.js)', async () => {
  const W = await import(new URL('../public/world.js', import.meta.url).href);
  const maps = JSON.parse(JSON.stringify(WORLD_MAPS));          // como chega pela rede

  it('costura: além do portão sul da Vila aparece a Floresta (e vice-versa), no lugar certo', () => {
    const fromVila = W.placements(maps, 'map_1');
    assert.deepEqual(fromVila.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_1', 0, 0], ['map_2', -FOREST_GATE_SHIFT, 60]]);
    const fromFloresta = W.placements(maps, 'map_2');
    assert.deepEqual(fromFloresta.map((p: any) => [p.map.id, p.ox, p.oy]), [['map_2', 0, 0], ['map_1', FOREST_GATE_SHIFT, -60], ['clareira_queimada', 27, 75]]);
    // a mesma casa do mundo vista dos dois lados: a praça da Vila (e a Vila é em imagem dos dois lados)
    assert.equal(W.groundAt(fromVila, 38, 45), 'stone');
    assert.equal(W.groundAt(fromFloresta, 38 + FOREST_GATE_SHIFT, 45 - 60), 'stone');
    assert.deepEqual(W.artPlaces(fromFloresta), [{ art: 'floresta', x: 0, y: 0, w: 100, h: 75 }, { art: 'folha', x: FOREST_GATE_SHIFT, y: -60, w: 78, h: 60 }]);
    // e a trilha da Floresta logo depois do portão, vista da Vila (a faixa curva por cima da grama)
    assert.equal(W.groundAt(fromVila, 40, 63), 'trail');
  });

  it('chão da Vila (minimapa): pedra na praça, terra nas ruas, gramados, rio com pontes e a arena', () => {
    const v = W.placements(maps, 'map_1');
    assert.equal(W.groundAt(v, 38, 45), 'stone', 'praça');
    assert.equal(W.groundAt(v, 25, 24.5), 'path', 'rua da sede');
    assert.equal(W.groundAt(v, 10, 16), 'grass', 'gramado');
    assert.equal(W.groundAt(v, 13.5, 35), 'water', 'braço do rio');
    assert.equal(W.groundAt(v, 39, 28), 'bridge', 'ponte do meio');
    assert.equal(W.groundAt(v, 66, 47), 'arena', 'arena');
    assert.equal(W.groundAt(v, -3, 10), 'void');
    assert.equal(W.groundAt(W.placements(maps, 'map_2'), 60, 30), 'darkgrass', 'Floresta: grama escura');
    assert.equal(W.groundAt(W.placements(maps, 'interior_weapons'), 7, 9), 'wood', 'loja: assoalho');
  });

  it('paredes e enfeites visíveis (com o vizinho deslocado); zona segura; nome do mapa', () => {
    const walls = W.visibleWalls(W.placements(maps, 'map_1'));
    assert.equal(walls.length, VILA.walls.length + FLORESTA.walls.length);
    assert.ok(walls.some((w: any) => w.k === 'house' && w.s === 'leader' && w.art === 'folha'), 'as paredes da Folha vêm marcadas (só colisão)');
    assert.ok(walls.filter((w: any) => w.y >= 60).every((w: any) => w.art === 'floresta'), 'as da Floresta também (outra imagem)');
    const deco = W.visibleDeco(W.placements(maps, 'map_1'));
    assert.ok(deco.length === FLORESTA.deco.length && deco.every((d: any) => !d.art), 'os enfeites à vista são só os da Floresta');
    assert.ok(W.inSafeZone(maps.map_1, P.plaza.x, P.plaza.y) && !W.inSafeZone(maps.map_1, S.x, S.y));
    assert.equal(W.mapName(maps, 'map_2'), 'Floresta');
  });
});
