import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { CAVE_POI, CLEARING_POI, FOREST_ABYSS, FOREST_POI, WORLD_MAPS, type MapLayout } from '../src/realtime/maps.js';
import { PLAYER_RADIUS, blocked } from '../src/realtime/movement.js';
import { FakeConn, placeIn, seededRandom } from './support/world.js';

/*
 * Mapas do Arco 1 (docs/mapas.md): a Floresta por regiões, a Caverna do Lodo do outro lado do abismo, a Clareira
 * Queimada e o Poço (lacrados até a história abrir) e as zonas de caça por nível.
 */

const F = WORLD_MAPS.map_2;
const CAVE = WORLD_MAPS.caverna_lodo;

/** Casas (grade de meia casa) que se alcançam andando a partir de `start`, com o raio do jogador. */
function walkable(map: MapLayout, start: { x: number; y: number }) {
  const seen = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const free = (x: number, y: number) => x > PLAYER_RADIUS && y > PLAYER_RADIUS && x < map.width - PLAYER_RADIUS && y < map.height - PLAYER_RADIUS
    && !blocked(x, y, map.walls);
  const todo: [number, number][] = [[start.x, start.y]];
  seen.add(key(start.x, start.y));
  while (todo.length > 0) {
    const [x, y] = todo.pop()!;
    for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) {
      const k = key(x + dx, y + dy);
      if (seen.has(k) || !free(x + dx, y + dy)) continue;
      seen.add(k);
      todo.push([x + dx, y + dy]);
    }
  }
  /** Algum ponto livre dentro do círculo (x, y, r) se alcança? */
  return (p: { x: number; y: number; r?: number }) => {
    const r = p.r ?? 0.5;
    for (let x = Math.round((p.x - r) * 2) / 2; x <= p.x + r; x += 0.5) {
      for (let y = Math.round((p.y - r) * 2) / 2; y <= p.y + r; y += 0.5) if (Math.hypot(x - p.x, y - p.y) <= r && seen.has(key(x, y))) return true;
    }
    return false;
  };
}

function config(): RealtimeConfig {
  return { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0 } } };
}

describe('Arco 1: a Floresta por regiões', () => {
  const reach = walkable(F, { x: 40, y: 5 });

  it('do portão se chega andando a todos os lugares das missões, menos à saliência da caverna e à passagem sul', () => {
    for (const [name, p] of Object.entries(FOREST_POI)) {
      if (name === 'caverna') continue;
      assert.ok(reach(p), `${name} não se alcança andando`);
    }
    assert.ok(!reach(FOREST_POI.caverna), 'a saliência só com o Teleporte');
    assert.ok(!reach({ x: 42, y: 97 }), 'a passagem sul está lacrada pelos troncos');
  });

  it('as três Pedras-Selo: a 1 apagada (Clareira da Pedra), a 2 nas raízes do Carvalho, a 3 atrás da cachoeira seca', () => {
    const seals = F.walls.filter((w) => w.k === 'seal');
    assert.deepEqual(seals.map((w) => w.s), ['out', 'lit', 'lit']);
    const inside = (p: { x: number; y: number; r: number }, w: { x: number; y: number; w: number; h: number }) => Math.hypot(w.x + w.w / 2 - p.x, w.y + w.h / 2 - p.y) <= p.r + 1.5;
    assert.ok(inside(FOREST_POI.pedra1, seals[0]!) && inside(FOREST_POI.pedra2, seals[1]!) && inside(FOREST_POI.pedra3, seals[2]!));
    // A Pedra 3 só se alcança pela fresta do paredão (2 casas), no fim da trilha leste.
    for (let x = 62.5; x < 98; x += 0.5) {
      const gap = x > 78.5 + PLAYER_RADIUS && x < 80.5 - PLAYER_RADIUS;
      assert.equal(blocked(x, 37.5, F.walls), !gap, `paredão em x=${x}`);
    }
  });

  it('o abismo é o vão da Academia (2 casas): o Teleporte do nível 1 atravessa; dá na boca da caverna e volta', () => {
    let t = 1_000_000;
    const world = new GameWorld(config(), () => t, undefined, { random: seededRandom() });
    const tick = (n: number) => { for (let i = 0; i < n; i++) { t += 50; world.tick(); } };
    const conn = new FakeConn();
    const id = randomUUID();
    const h = world.join({ id, username: 'kaito', kits: { A: ['teleport'], B: [] } }, conn);
    assert.equal(FOREST_ABYSS.h, 2);
    placeIn(world, id, 'map_2', 65, FOREST_ABYSS.y - PLAYER_RADIUS - 0.05);
    h.receive(JSON.stringify({ type: 'cast', skill: 'teleport', dir: [0, 1] }));
    const s = (world as any).sessions.get(id);
    assert.ok(s.y > FOREST_ABYSS.y + FOREST_ABYSS.h, `do outro lado do abismo: y=${s.y}`);
    // A boca da caverna fica na face sul da rocha: contornando e empurrando para o norte, entra.
    placeIn(world, id, 'map_2', 80, 94.8);
    h.receive(JSON.stringify({ type: 'move', dx: 0, dy: -1 }));
    tick(6);
    assert.equal(s.map, 'caverna_lodo');
    assert.ok((world as any).inSafeZone(s), 'chega num pedaço seguro');
    // A saída fica embaixo: indo para o sul, sai; e quem continua andando não volta para dentro.
    h.receive(JSON.stringify({ type: 'move', dx: 0, dy: 1 }));
    tick(40);
    assert.equal(s.map, 'map_2', 'a saída leva de volta para a saliência');
    assert.ok(s.y > FOREST_ABYSS.y + FOREST_ABYSS.h);
  });

  it('zonas de caça: Slime perto da entrada, Lodo Escuro no fundo; ninguém nasce na Clareira da Entrada', () => {
    const cfg = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 40, perPlayer: 0 } } };
    const world = new GameWorld(cfg, () => 1_000_000, undefined, { random: seededRandom(9) });
    const all = (world as any).monstersIn('map_2') as { type: string; x: number; y: number }[];
    assert.equal(all.length, 40);
    const types = new Set(all.map((m) => m.type));
    assert.deepEqual([...types].sort(), ['lodo_escuro', 'slime']);
    for (const m of all) {
      assert.ok(m.y >= 18, `nasceu na Clareira da Entrada: ${m.x},${m.y}`);
      assert.ok(!blocked(m.x, m.y, F.walls), `dentro de parede: ${m.x},${m.y}`);
      if (m.type === 'lodo_escuro') assert.ok(m.x >= 60, `Lodo Escuro longe do fundo: ${m.x},${m.y}`);
    }
    // E andam só dentro da zona deles.
    const w2 = world as any;
    let t = 1_000_000;
    (w2 as { now: () => number }).now = () => t;
    for (let i = 0; i < 400; i++) {
      t += 50;
      for (const m of w2.monsters.values()) if (m.map === 'map_2') w2.stepMonster(m, t);
    }
    for (const m of w2.monsters.values()) {
      if (m.map !== 'map_2') continue;
      const z = m.zone;
      assert.ok(m.x >= z.x && m.y >= z.y && m.x < z.x + z.w && m.y < z.y + z.h, `${m.type} saiu da zona`);
    }
  });
});

describe('Arco 1: Caverna do Lodo, Clareira Queimada e Poço', () => {
  it('Caverna: da entrada se chega à galeria, aos dois túneis e ao fundo; o lago de lodo é parede', () => {
    const reach = walkable(CAVE, { x: 28, y: 40 });
    for (const p of [{ x: 28, y: 28 }, { x: 12, y: 20 }, { x: 44, y: 20 }, CAVE_POI.fundo]) assert.ok(reach(p), `${p.x},${p.y}`);
    assert.ok(blocked(CAVE_POI.lago.x, CAVE_POI.lago.y, CAVE.walls), 'o lago não é chão');
    assert.equal(CAVE.kind, 'cave');
    assert.ok(CAVE.zones!.every((z) => z.type === 'lodo_escuro'));
  });

  it('Clareira Queimada: arena livre em volta da Pedra 4; a saída norte costura com a passagem sul da Floresta', () => {
    const C = WORLD_MAPS.clareira_queimada;
    const reach = walkable(C, { x: 22, y: 2 });
    assert.ok(reach(CLEARING_POI.pedra4));
    let free = 0;
    for (let x = 8; x <= 36; x++) for (let y = 8; y <= 30; y++) if (!blocked(x, y, C.walls)) free++;
    assert.ok(free > 500, `arena aberta (${free} casas livres)`);
    const toForest = C.exits[0]!;
    const toClearing = F.exits.find((e) => e.map === 'clareira_queimada')!;
    assert.deepEqual([toForest.from + toForest.shift, toForest.to + toForest.shift], [toClearing.from, toClearing.to]);
  });

  it('lacrados até a história abrir: nenhuma porta leva ao Poço, e a tampa e a grade aparecem na Vila', () => {
    for (const m of Object.values(WORLD_MAPS)) {
      assert.ok(!m.doors.some((d) => d.map === 'poco') && !m.exits.some((e) => e.map === 'poco'), m.id);
    }
    const deco = WORLD_MAPS.map_1.deco.map((d) => d.k);
    assert.ok(deco.includes('well_lid') && deco.includes('grate'));
    const P = WORLD_MAPS.poco;
    assert.ok(P.walls.some((w) => w.k === 'gate'), 'a porta lacrada da Quinta Pedra');
  });

  it('Poço em imagem: as paredes seguem o desenho (escada, canal com ponte, porta lacrada e os dois cantos de baixo)', () => {
    const P = WORLD_MAPS.poco;
    assert.equal(P.art, 'poco');
    assert.deepEqual([P.width, P.height], [24, 18], 'a proporção da imagem');
    const reach = walkable(P, { x: 12, y: 5 });                  // o pé da escada
    assert.ok(reach({ x: 12, y: 2.5 }), 'sobe a escada');
    assert.ok(reach({ x: 12, y: 9 }) && reach({ x: 12, y: 12 }), 'atravessa o canal pela ponte');
    assert.ok(reach({ x: 2, y: 15.5 }) && reach({ x: 21.5, y: 15.5 }), 'os cantos de baixo (entulho e poça)');
    for (const [x, y, what] of [[5, 8.5, 'canal'], [19, 8.5, 'canal'], [12, 15, 'porta'], [5, 2, 'parede das tochas'], [7, 15.5, 'bloco de baixo']] as const) {
      assert.ok(!reach({ x, y, r: 0.4 }), what);
    }
    assert.ok((P.lights ?? []).length >= 10, 'as tochas da arte acendem');
  });
});
