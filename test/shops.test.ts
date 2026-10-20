import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { ROOM, SHOPS, shopDoor, WORLD_MAPS, type MapLayout } from '../src/realtime/maps.js';
import { blocked, moveStep, useDoor } from '../src/realtime/movement.js';
import { mapOf, seededRandom, setupWorld, withMonsters } from './support/world.js';

const client = await import(new URL('../public/movement.js', import.meta.url).href);

const sess = (world: any, id: string) => world.sessions.get(id);
function walk(a: { send: (m: unknown) => void }, run: (ms: number) => void, from: number, n: number, dir: [number, number]): number {
  let seq = from;
  for (let left = n; left > 0; left -= 2) {
    a.send({ type: 'input', seq, inputs: Array.from({ length: Math.min(2, left) }, () => dir) });
    seq += Math.min(2, left);
    run(100);
  }
  return seq;
}
/** Busca em largura (passo 0,25) com o raio do jogador: o que dá para alcançar dentro da sala. */
function reach(layout: MapLayout, from: [number, number]): (x: number, y: number) => boolean {
  const seen = new Set<string>();
  const k = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
  const queue: [number, number][] = [from];
  seen.add(k(...from));
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > layout.width || ny > layout.height || seen.has(k(nx, ny)) || blocked(nx, ny, layout.walls)) continue;
      seen.add(k(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return (x, y) => seen.has(k(x, y));
}

describe('lojas: salas (interiores)', () => {
  for (const sh of SHOPS) {
    const room = WORLD_MAPS[sh.map];
    it(`${sh.name}: sala 15x15 de assoalho, balcão no meio, lojista atrás dele e saída que sempre funciona`, () => {
      assert.deepEqual([room.kind, room.width, room.height, room.safe], ['interior', 15, 15, true]);
      assert.ok(room.areas.some((a) => a.g === 'wood'), 'chão de madeira');
      assert.ok(room.walls.some((w) => w.k === 'counter' && w.x <= 7.5 && w.x + w.w >= 7.5), 'balcão no meio');
      const can = reach(room, [ROOM.arrive.x, ROOM.arrive.y]);
      const npc = REALTIME.npcs.find((n) => n.shop === sh.shop)!;
      assert.equal(npc.map, sh.map, 'o lojista só existe dentro da loja');
      assert.ok(!can(npc.x, npc.y), 'ninguém passa para trás do balcão');
      assert.ok(can(7.5, 7.7) && Math.hypot(7.5 - npc.x, 7.7 - npc.y) <= npc.range, 'da frente do balcão dá para falar com ele');
      const exit = room.doors[0]!;
      assert.ok(can(7.5, 14.5) && 14.5 >= exit.y, 'a porta de saída é alcançável de onde se chega');
      // De QUALQUER ponto alcançável da sala dá para chegar na saída (ninguém fica preso).
      for (let x = 1; x < 14; x += 0.5) for (let y = 7.5; y < 14; y += 0.5) if (can(x, y)) assert.ok(can(7.5, 14.5));
    });
  }

  it('decoração própria: armas (espadas, lanças, escudos), roupas (manequins), pergaminhos (estantes)', () => {
    const styles = (m: MapLayout) => new Set(m.walls.filter((w) => w.k === 'furniture').map((w) => w.s));
    assert.ok(styles(WORLD_MAPS.interior_weapons).has('sword_rack') && styles(WORLD_MAPS.interior_weapons).has('shield_rack'));
    assert.ok(styles(WORLD_MAPS.interior_clothes).has('mannequin') && styles(WORLD_MAPS.interior_clothes).has('cloth_shelf'));
    assert.ok(styles(WORLD_MAPS.interior_scrolls).has('scroll_shelf') && styles(WORLD_MAPS.interior_scrolls).has('scroll_table'));
    assert.ok(!styles(WORLD_MAPS.interior_clothes).has('sword_rack'));
  });
});

describe('lojas: portas (mesma regra no cliente e no servidor)', () => {
  const maps = WORLD_MAPS;
  it('na Vila, empurrando a porta (para cima) entra; na sala, empurrando a porta (para baixo) sai na frente da loja', () => {
    for (const sh of SHOPS) {
      const { door, outside } = shopDoor(sh.building);
      const front = door.y + 0.3;                                         // encostado na fachada
      assert.deepEqual(useDoor(maps, 'map_1', door.x + 1, front, 0, -1), [sh.map, ROOM.arrive.x, ROOM.arrive.y], sh.name);
      assert.equal(useDoor(maps, 'map_1', door.x + 1, front, 1, 0), null, 'passando de lado: não entra');
      assert.equal(useDoor(maps, 'map_1', door.x + 1, front, 0, 1), null, 'indo embora: não entra');
      assert.deepEqual(useDoor(maps, sh.map, 7.5, 14.6, 0, 1), ['map_1', outside.x, outside.y]);
      assert.equal(useDoor(maps, sh.map, 7.5, 14.6, 0, -1), null);
      // as chegadas são livres e ficam FORA da porta do outro lado
      assert.ok(!blocked(outside.x, outside.y, maps.map_1.walls) && outside.y > door.y + door.h);
      assert.ok(!blocked(ROOM.arrive.x, ROOM.arrive.y, maps[sh.map].walls) && ROOM.arrive.y < maps[sh.map].doors[0]!.y);
    }
  });

  it('andando de verdade (moveStep): entra pela porta, sobe até o balcão, desce e sai na Vila', () => {
    const { door } = shopDoor(SHOPS[0].building);
    let s: [string, number, number] = ['map_1', door.x + 1, door.y + 3];
    for (let i = 0; i < 30 && s[0] === 'map_1'; i++) s = moveStep(maps, s[0], s[1], s[2], 0, -1, 0.25);
    assert.equal(s[0], 'interior_weapons');
    for (let i = 0; i < 40; i++) s = moveStep(maps, s[0], s[1], s[2], 0, -1, 0.25);
    assert.ok(s[0] === 'interior_weapons' && s[2] >= 7.5 && s[2] <= 7.75, `parou no balcão (${s})`);
    for (let i = 0; i < 40 && s[0] !== 'map_1'; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25);
    assert.equal(s[0], 'map_1', 'saiu');
    const after = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25);
    assert.equal(after[0], 'map_1', 'continuando para baixo, não volta para dentro');
  });

  it('ninguém fica preso no canto: descendo reto em qualquer ponto do capacho (até encostado na parede), sai', () => {
    for (const sh of SHOPS) {
      for (const x of [5.6, 6.1, 6.6, 7.5, 8.4, 8.9, 9.4]) {
        let s: [string, number, number] = [sh.map, x, 11];
        for (let i = 0; i < 40 && s[0] === sh.map; i++) s = moveStep(maps, s[0], s[1], s[2], 0, 1, 0.25);
        assert.equal(s[0], 'map_1', `${sh.name}: preso descendo em x=${x} (${s})`);
      }
    }
  });

  it('cliente (JS) e servidor (TS): mesmo resultado em 20 mil passos perto das portas', () => {
    const rnd = seededRandom(5);
    const { door } = shopDoor(SHOPS[1].building);
    let st: [string, number, number] = ['map_1', door.x + 1, door.y + 2];
    let inside = 0;
    for (let i = 0; i < 20_000; i++) {
      const toward = i % 300 < 150 ? -1 : 1;                              // para a porta / para a saída
      const dx = Math.round((rnd() * 2 - 1) * 10) / 20;
      const a = moveStep(maps, st[0], st[1], st[2], dx, toward, 0.25);
      const b = client.moveStep(maps, st[0], st[1], st[2], dx, toward, 0.25);
      assert.deepEqual(b, a, `passo ${i}`);
      if (a[0] !== st[0] && a[0] !== 'map_1') inside += 1;
      st = a;
    }
    assert.ok(inside >= 5, `entrou ${inside} vezes`);
  });
});

describe('lojas: servidor', () => {
  it('entra na loja, fala com o lojista do balcão (shop_open) e sai de volta para a Vila', () => {
    const { world, connect, run } = setupWorld(withMonsters(0));
    const a = connect('kaito');
    const b = connect('mei');                                             // fica na Vila
    const { door, outside } = shopDoor(SHOPS[0].building);
    Object.assign(sess(world, a.id), { x: door.x + 1, y: door.y + 1.5 });
    walk(a, run, 1, 10, [0, -1]);
    assert.equal(mapOf(world, a.id), 'interior_weapons');
    const changed = a.conn.last('map_changed');
    assert.deepEqual([changed.map, changed.x, changed.y, changed.players, changed.monsters], ['interior_weapons', ROOM.arrive.x, ROOM.arrive.y, [], []]);
    assert.equal(b.conn.last('player_left').playerId, a.id, 'quem está na Vila vê ele entrar na loja');
    // longe do balcão (logo na entrada): longe demais para falar
    a.send({ type: 'talk', npcId: 'shop_weapons' });
    assert.equal(a.conn.last('error').code, 'NPC_TOO_FAR');
    walk(a, run, 11, 30, [0, -1]);                                       // sobe até o balcão
    run(400);
    a.send({ type: 'talk', npcId: 'shop_weapons' });
    assert.deepEqual(a.conn.last('shop_open'), { type: 'shop_open', shop: 'weapons', npcId: 'shop_weapons' });
    a.send({ type: 'talk', npcId: 'shop_clothes' });                      // lojista de OUTRA loja
    assert.equal(a.conn.last('error').code, 'NPC_TOO_FAR');
    a.send({ type: 'cast', skill: 'fire' });
    assert.equal(a.conn.last('cast_failed').reason, 'SAFE_ZONE', 'dentro da loja não tem combate');
    walk(a, run, 41, 40, [0, 1]);                                        // desce e sai
    run(300);
    assert.equal(mapOf(world, a.id), 'map_1', 'não ficou preso: saiu');
    const back = a.conn.last('map_changed');
    assert.deepEqual([back.map, back.x, back.y], ['map_1', outside.x, outside.y]);
    assert.ok(back.players.some((p: any) => p.id === b.id));
    assert.ok(sess(world, a.id).y > outside.y, 'continuou andando para longe da porta');
  });

  it('da Vila não se fala com lojista (mesma posição, outro mapa); o Mestre continua na Vila', () => {
    const { world, connect } = setupWorld(withMonsters(0));
    const a = connect('kaito');
    Object.assign(sess(world, a.id), { x: ROOM.npc.x, y: ROOM.npc.y + 2 });
    a.send({ type: 'talk', npcId: 'shop_scrolls' });
    assert.equal(a.conn.last('error').code, 'NPC_TOO_FAR');
    assert.equal(a.conn.of('shop_open').length, 0);
  });
});
