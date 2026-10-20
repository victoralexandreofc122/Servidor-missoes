/*
 * Mapas (salas) do mundo, como no Nin Online: cada mapa tem tamanho, chão, paredes e
 * SAÍDAS nas bordas. Andar até uma saída leva ao mapa vizinho, na borda oposta.
 *
 *   map_1  Vila      50 x 50   chão de pedra, casas em volta (fechada), saída a LESTE
 *   map_2  Floresta 100 x 100  grama, árvores (paredes), monstros; saída a OESTE
 *
 * Os layouts são DADOS fixos, gerados aqui uma vez (a floresta com sorteio de semente
 * fixa: sempre as mesmas árvores). O servidor colide com eles e o cliente recebe a mesma
 * lista no `welcome` (desenha e prevê o movimento com ela). A regra de atravessar a borda
 * fica em movement.ts (servidor) e public/movement.js (cliente): a mesma conta nos dois.
 */
import type { Box } from './movement.js';

export type Edge = 'east' | 'west' | 'north' | 'south';
export type MapId = 'map_1' | 'map_2';

/** Parede com o tipo (o cliente desenha casa ou árvore; para a colisão é tudo caixa). */
export interface Wall extends Box {
  k: 'house' | 'tree';
}

/**
 * Saída numa borda. Vale entre `from` e `to` ao longo da borda (y nas bordas leste/oeste,
 * x nas norte/sul). Quem atravessa chega no mapa `map`, na borda OPOSTA, deslocado `shift`
 * ao longo dela (y + shift).
 */
export interface Exit {
  edge: Edge;
  from: number;
  to: number;
  map: MapId;
  shift: number;
}

export interface MapLayout {
  id: MapId;
  name: string;
  /** Chão e estilo: 'village' = pedra e casas; 'forest' = grama e árvores. */
  kind: 'village' | 'forest';
  width: number;
  height: number;
  /** Área segura: sem monstros. */
  safe: boolean;
  walls: Wall[];
  exits: Exit[];
  /** Estradas de terra (só desenho). */
  paths: Box[];
  /** Onde os monstros nascem e andam (mapas de caça). */
  hunt?: Box;
}

const house = (x: number, y: number, w: number, h: number): Wall => ({ x, y, w, h, k: 'house' });
const tree = (x: number, y: number, w: number, h: number): Wall => ({ x, y, w, h, k: 'tree' });

/** Portão leste da vila (y de 22 a 28) <-> trilha oeste da floresta (y de 47 a 53). */
const GATE = { from: 22, to: 28, shift: 25 };

/**
 * Vila (50 x 50): casas encostadas em todas as bordas (vila fechada e organizada), uma
 * praça no centro com o renascimento e o Mestre, e uma rua de terra até o portão leste.
 */
function village(): MapLayout {
  const W = 50, H = 50;
  const walls: Wall[] = [];
  for (let x = 0; x < W; x += 5) {
    walls.push(house(x, 0, 5, 3));                 // fileira norte
    walls.push(house(x, H - 3, 5, 3));             // fileira sul
  }
  for (let y = 3; y < H - 3; y += 4) walls.push(house(0, y, 3, Math.min(4, H - 3 - y)));   // coluna oeste
  // Coluna leste com o PORTÃO (y 22..28): casas param em 22 e voltam em 28.
  for (let y = 3; y < GATE.from; y += 4) walls.push(house(W - 3, y, 3, Math.min(4, GATE.from - y)));
  for (let y = GATE.to; y < H - 3; y += 4) walls.push(house(W - 3, y, 3, Math.min(4, H - 3 - y)));
  // Casas em volta da praça (as mesmas da vila antiga, a partir do centro 25,25).
  for (const h of PLAZA_HOUSES) walls.push(house(25 + h.dx, 25 + h.dy, h.w, h.h));
  return {
    id: 'map_1', name: 'Vila', kind: 'village', width: W, height: H, safe: true, walls,
    exits: [{ edge: 'east', from: GATE.from, to: GATE.to, map: 'map_2', shift: GATE.shift }],
    paths: [{ x: 25, y: 25, w: W - 25, h: 1 }],   // rua do centro até o portão
  };
}

/** Casas da praça, a partir do centro da vila (não cobrem o renascimento, o Mestre nem a rua). */
export const PLAZA_HOUSES = [
  { dx: -8, dy: -7, w: 4, h: 3 },
  { dx: 3, dy: -8, w: 4, h: 3 },
  { dx: -8, dy: 3, w: 4, h: 3 },
  { dx: 4, dy: 3, w: 3, h: 3 },
  { dx: -4, dy: -4, w: 2, h: 2 },
  { dx: 5, dy: -3, w: 3, h: 2 },
] as const;

/** Sorteio com semente (mulberry32): a floresta sai igual em todo servidor e todo boot. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/**
 * Floresta (100 x 100): mata fechada nas bordas (com a trilha a oeste, y 47..53, que leva
 * à vila), árvores espalhadas (2x2 e 3x3) e uma clareira na entrada, sem árvores e sem
 * monstros, para quem chega da vila.
 */
function forest(): MapLayout {
  const W = 100, H = 100;
  const gateFrom = GATE.from + GATE.shift, gateTo = GATE.to + GATE.shift;   // 47..53
  const walls: Wall[] = [
    tree(0, 0, W, 2),                      // mata norte
    tree(0, H - 2, W, 2),                  // mata sul
    tree(W - 2, 2, 2, H - 4),              // mata leste
    tree(0, 2, 2, gateFrom - 2),           // mata oeste, acima da trilha
    tree(0, gateTo, 2, H - 2 - gateTo),    // mata oeste, abaixo da trilha
  ];
  const clearing: Box = { x: 0, y: gateFrom - 6, w: 16, h: gateTo - gateFrom + 12 };   // entrada
  const trail: Box = { x: 0, y: 49, w: 34, h: 3 };
  const rnd = seeded(2026);
  for (let gx = 4; gx < W - 6; gx += 5) {
    for (let gy = 4; gy < H - 6; gy += 5) {
      if (rnd() > 0.42) continue;
      const size = rnd() < 0.2 ? 3 : 2;
      const t = tree(gx + Math.floor(rnd() * 3), gy + Math.floor(rnd() * 3), size, size);
      if (overlaps(t, clearing) || overlaps(t, trail, 1) || walls.some((w) => overlaps(t, w, 1))) continue;
      walls.push(t);
    }
  }
  return {
    id: 'map_2', name: 'Floresta', kind: 'forest', width: W, height: H, safe: false, walls,
    exits: [{ edge: 'west', from: gateFrom, to: gateTo, map: 'map_1', shift: -GATE.shift }],
    paths: [trail],
    hunt: { x: 18, y: 4, w: W - 22, h: H - 8 },
  };
}

/** Todos os mapas, por id. */
export function buildMaps(): Record<MapId, MapLayout> {
  return { map_1: village(), map_2: forest() };
}

export const WORLD_MAPS: Readonly<Record<MapId, MapLayout>> = buildMaps();
