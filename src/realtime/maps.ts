/*
 * Mapas (salas) do mundo, como no Nin Online: cada mapa tem tamanho, chão, paredes e
 * SAÍDAS nas bordas. Andar até uma saída leva ao mapa vizinho, na borda oposta.
 *
 *   map_1  Vila      80 x 80   muralha em volta, PORTÃO no sul (x 35..45), sede, hospital,
 *                              academia, lojas, rio com pontes, praça segura e campo de treino
 *   map_2  Floresta 100 x 100  grama, árvores (paredes), monstros; entrada no NORTE (x 45..55)
 *
 * Os layouts são DADOS fixos, gerados aqui uma vez (a floresta com sorteio de semente fixa:
 * sempre as mesmas árvores). O servidor colide com `walls` e o cliente recebe a MESMA lista
 * no `welcome` (desenha e prevê o movimento com ela). `areas` (chão) e `deco` (bancos,
 * lanternas...) são só desenho. A regra de atravessar a borda fica em movement.ts e
 * public/movement.js: a mesma conta nos dois.
 */
import type { Box } from './movement.js';

export type Edge = 'east' | 'west' | 'north' | 'south';
export type MapId = 'map_1' | 'map_2';

/**
 * Parede (colisão) com o tipo, para o cliente desenhar:
 *  wall = muralha · gatepost = pilar do portão · rock = montanha · house = prédio (s = estilo)
 *  tree = árvore · water = rio/canal · dummy = boneco de treino
 */
export interface Wall extends Box {
  k: 'wall' | 'gatepost' | 'rock' | 'house' | 'tree' | 'water' | 'dummy';
  /** Estilo do prédio: sede, hospital, academia, loja (arma, roupa, pergaminho), casa, cabana. */
  s?: 'leader' | 'hospital' | 'academy' | 'shop_weapon' | 'shop_cloth' | 'shop_scroll' | 'home' | 'hut';
}

/** Chão pintado (só desenho): stone = pedra clara, grass, sand, water, bridge, path (terra). */
export interface Area extends Box {
  g: 'stone' | 'grass' | 'sand' | 'water' | 'bridge' | 'path';
}

/** Enfeite sem colisão: banco, rosa dos ventos no chão, lanterna, vaso, telhado do portão (por cima). */
export interface Deco extends Box {
  k: 'bench' | 'rosette' | 'lamp' | 'plant' | 'gate_roof';
}

/**
 * Saída numa borda. Vale entre `from` e `to` ao longo da borda (x nas bordas norte/sul,
 * y nas leste/oeste). Quem atravessa chega no mapa `map`, na borda OPOSTA, deslocado
 * `shift` ao longo dela (x + shift).
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
  /** Estilo e chão padrão: 'village' = pedra clara; 'forest' = grama. */
  kind: 'village' | 'forest';
  width: number;
  height: number;
  /** Mapa seguro: sem monstros. */
  safe: boolean;
  walls: Wall[];
  exits: Exit[];
  /** Chão por cima do padrão (o último da lista vale). */
  areas: Area[];
  deco: Deco[];
  /** Zonas seguras: ninguém usa habilidade nem ataca dentro delas (o servidor confere). */
  safeZones: Box[];
  /** Onde os monstros nascem e andam (mapas de caça). */
  hunt?: Box;
}

const wall = (k: Wall['k'], x: number, y: number, w: number, h: number, s?: Wall['s']): Wall => (s ? { x, y, w, h, k, s } : { x, y, w, h, k });
const tree = (x: number, y: number, size = 2): Wall => wall('tree', x, y, size, size);
const area = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g });
const deco = (k: Deco['k'], x: number, y: number, w = 1, h = 1): Deco => ({ x, y, w, h, k });

/** Portão sul da Vila (x 35..45) <-> entrada norte da Floresta (x 45..55). */
export const VILLAGE_GATE = { from: 35, to: 45, shift: 10 } as const;

/**
 * Vila (80 x 80), planta baixa da arte conceitual:
 *
 *   ┌──────── muralha ───────────────────────────────────┐
 *   │ casa  árvores  [ MONTANHA (paredão de rocha) ]  cabana│   y  2..12
 *   │ cabana           beco escondido atrás da sede        │   y 12..15
 *   │ cabana HOSPITAL      [  SEDE DA VILA  ]     ACADEMIA casa│ y 15..31
 *   │ ───────────────── rua principal (y 31..35) ─────────── │
 *   │ ~  ≈≈canal≈≈        avenida       ≈≈canal≈≈   ≈≈canal≈≈│   y 35..36
 *   │ ~  LOJA ARMAS     (x 38..42)    LOJA ROUPAS  PERGAMINHOS│ y 37..50
 *   │rio ──────────────── rua de baixo (y 50..55) ─────────── │
 *   │ ~  casa  gramado  [ PRAÇA SEGURA ]  gramado  CAMPO DE  │   y 55..78
 *   │ ~ ponte            bancos · rosa        TREINO (areia) │
 *   └──────────────── muralha ──[ PORTÃO ]── muralha ───────┘   x 35..45, y 78..80
 *
 * Ruas e becos com 2 a 4 casas de largura entre as colisões (o teste mede); o portão e a
 * praça não têm colisão nenhuma.
 */
function village(): MapLayout {
  const W = 80, H = 80;
  const G = VILLAGE_GATE;
  const walls: Wall[] = [
    // Muralha: perímetro sólido (2 casas de espessura), aberta só no portão.
    wall('wall', 0, 0, W, 2),
    wall('wall', 0, 2, 2, H - 4),
    wall('wall', W - 2, 2, 2, H - 4),
    wall('wall', 0, H - 2, G.from, 2),
    wall('wall', G.to, H - 2, W - G.to, 2),
    // Pilares do portão (fora da abertura: o vão x 35..45 fica livre).
    wall('gatepost', G.from - 2, H - 4, 2, 2),
    wall('gatepost', G.to, H - 4, 2, 2),
    // Montanha no topo (paredão de rocha atrás da sede).
    wall('rock', 18, 2, 44, 10),
    // Prédios.
    wall('house', 31, 15, 18, 16, 'leader'),        // sede da vila, no topo, no eixo da avenida
    wall('house', 15, 19, 12, 11, 'hospital'),      // hospital, à esquerda
    wall('house', 53, 19, 12, 11, 'academy'),       // academia, à direita
    wall('house', 4, 5, 7, 6, 'home'),              // casa (canto superior esquerdo)
    wall('house', 3, 16, 6, 5, 'hut'),              // cabanas da esquerda
    wall('house', 3, 24, 6, 5, 'hut'),
    wall('house', 69, 5, 7, 7, 'hut'),              // cabana (canto superior direito)
    wall('house', 69, 16, 7, 6, 'home'),
    wall('house', 23, 39, 10, 7, 'shop_weapon'),    // lojas no meio
    wall('house', 46, 39, 10, 7, 'shop_cloth'),
    wall('house', 63, 39, 10, 7, 'shop_scroll'),
    wall('house', 12, 54, 7, 6, 'home'),            // casa perto do rio
    // Rio (esquerda), com duas pontes (y 42..45 e 62..65), e os canais em frente às lojas.
    wall('water', 6, 31, 3, 11),
    wall('water', 6, 45, 3, 17),
    wall('water', 6, 65, 3, 13),
    wall('water', 21, 35, 14, 1),
    wall('water', 44, 35, 14, 1),
    wall('water', 61, 35, 15, 1),
    // Boneco de madeira no campo de treino.
    wall('dummy', 65, 65, 1, 1),
    // Árvores (só nos gramados; nenhuma na rua, na praça ou no portão).
    tree(12, 3), tree(14, 8), tree(11, 12, 1), tree(63, 3), tree(65, 8), tree(66, 12, 1),
    tree(10, 22, 1), tree(28, 22, 1), tree(51, 22, 1), tree(67, 25, 1),
    tree(21, 47), tree(33, 47), tree(44, 47), tree(56, 47), tree(61, 47), tree(74, 47),
    tree(22, 58), tree(25, 67), tree(13, 70), tree(19, 74), tree(53, 62), tree(53, 70),
    tree(72, 58, 1), tree(58, 72, 1),
  ];
  const areas: Area[] = [
    // Gramados (o resto é pedra clara: ruas e praça).
    area('grass', 2, 2, 16, 12), area('grass', 62, 2, 16, 12), area('grass', 18, 2, 44, 13),   // gramado em volta da montanha
    area('grass', 2, 14, 11, 17), area('grass', 13, 17, 16, 14), area('grass', 51, 17, 16, 14), area('grass', 67, 14, 11, 17),
    area('grass', 21, 36, 14, 13), area('grass', 44, 36, 14, 13), area('grass', 61, 36, 15, 13),
    area('grass', 2, 31, 4, 47), area('grass', 9, 55, 19, 23), area('grass', 52, 55, 4, 23), area('grass', 56, 74, 22, 4),
    // Rio e canais, pontes de madeira.
    area('water', 6, 31, 3, 47), area('water', 21, 35, 14, 1), area('water', 44, 35, 14, 1), area('water', 61, 35, 15, 1),
    area('bridge', 5, 42, 5, 3), area('bridge', 5, 62, 5, 3),
    // Campo de treino (areia) no canto inferior direito.
    area('sand', 56, 56, 20, 18),
    // Avenida e praça em pedra (por cima dos gramados vizinhos).
    area('stone', 38, 31, 4, 24), area('stone', 28, 55, 24, 23),
  ];
  const decos: Deco[] = [
    deco('bench', 31, 57, 3, 1), deco('bench', 46, 57, 3, 1),       // bancos da praça
    deco('bench', 29, 61, 1, 3), deco('bench', 50, 61, 1, 3),
    deco('bench', 3, 50, 1, 2),                                       // banco escondido do outro lado do rio
    deco('rosette', 38, 64, 4, 4), deco('rosette', 18, 51, 3, 3),     // rosas dos ventos no chão
    deco('plant', 30, 56), deco('plant', 49, 56), deco('plant', 30, 74), deco('plant', 49, 74),
    deco('lamp', 35, 32), deco('lamp', 44, 32), deco('lamp', 36, 52), deco('lamp', 43, 52),
    deco('lamp', 33, 75), deco('lamp', 46, 75),
    deco('gate_roof', G.from - 2, H - 5, G.to - G.from + 4, 2),       // telhado do portão (desenhado por cima)
  ];
  return {
    id: 'map_1', name: 'Vila', kind: 'village', width: W, height: H, safe: true, walls,
    exits: [{ edge: 'south', from: G.from, to: G.to, map: 'map_2', shift: G.shift }],
    areas, deco: decos,
    // Praça social logo acima do portão: sem combate.
    safeZones: [{ x: 28, y: 55, w: 24, h: 23 }],
  };
}

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
 * Floresta (100 x 100): mata fechada nas bordas, com a entrada no NORTE (x 45..55), que
 * leva ao portão da Vila; uma trilha desce dali e há uma clareira na chegada, sem árvores e
 * sem monstros. Árvores espalhadas (2x2 e 3x3).
 */
function forest(): MapLayout {
  const W = 100, H = 100;
  const gateFrom = VILLAGE_GATE.from + VILLAGE_GATE.shift, gateTo = VILLAGE_GATE.to + VILLAGE_GATE.shift;   // 45..55
  const walls: Wall[] = [
    wall('tree', 0, 0, gateFrom, 2),               // mata norte, à esquerda da entrada
    wall('tree', gateTo, 0, W - gateTo, 2),        // mata norte, à direita
    wall('tree', 0, H - 2, W, 2),                  // mata sul
    wall('tree', 0, 2, 2, H - 4),                  // mata oeste
    wall('tree', W - 2, 2, 2, H - 4),              // mata leste
  ];
  const clearing: Box = { x: gateFrom - 8, y: 0, w: gateTo - gateFrom + 16, h: 14 };   // chegada
  const trail: Box = { x: 49, y: 0, w: 3, h: 36 };
  const rnd = seeded(2026);
  for (let gx = 4; gx < W - 6; gx += 5) {
    for (let gy = 4; gy < H - 6; gy += 5) {
      if (rnd() > 0.42) continue;
      const size = rnd() < 0.2 ? 3 : 2;
      const t = tree(gx + Math.floor(rnd() * 3), gy + Math.floor(rnd() * 3), size);
      if (overlaps(t, clearing) || overlaps(t, trail, 1) || walls.some((w) => overlaps(t, w, 1))) continue;
      walls.push(t);
    }
  }
  return {
    id: 'map_2', name: 'Floresta', kind: 'forest', width: W, height: H, safe: false, walls,
    exits: [{ edge: 'north', from: gateFrom, to: gateTo, map: 'map_1', shift: -VILLAGE_GATE.shift }],
    areas: [area('path', trail.x, trail.y, trail.w, trail.h)],
    deco: [],
    safeZones: [],
    hunt: { x: 4, y: 18, w: W - 8, h: H - 22 },
  };
}

/** Todos os mapas, por id. */
export function buildMaps(): Record<MapId, MapLayout> {
  return { map_1: village(), map_2: forest() };
}

export const WORLD_MAPS: Readonly<Record<MapId, MapLayout>> = buildMaps();

/** O ponto está numa zona segura do mapa? (posição do SERVIDOR) */
export function inSafeZone(layout: MapLayout, x: number, y: number): boolean {
  return layout.safeZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
