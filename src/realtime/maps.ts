/*
 * Mapas (salas) do mundo, como no Nin Online: cada mapa tem tamanho, chão, paredes e
 * SAÍDAS nas bordas. Andar até uma saída leva ao mapa vizinho, na borda oposta.
 *
 *   map_1  Vila      80 x 80   muralha em volta, PORTÃO no sul (x 35..45), sede, hospital,
 *                              academia, lojas, rio com pontes, praça segura e campo de treino
 *   map_2  Floresta 100 x 100  grama escura, árvores (paredes), monstros; entrada no NORTE (x 35..45)
 *   interior_weapons / interior_clothes / interior_scrolls   salas 15 x 15 das lojas: assoalho,
 *                              paredes, balcão no meio e o lojista atrás dele; porta de saída embaixo
 *   academy_interior  Academia 64 x 16: 4 salas do tutorial (v8: fechadas; o servidor leva o jogador
 *                              para a sala seguinte quando ele conclui a etapa)
 *
 * Os layouts são DADOS fixos, gerados aqui uma vez (a floresta com sorteio de semente fixa:
 * sempre as mesmas árvores). O servidor colide com `walls` e o cliente recebe a MESMA lista
 * no `welcome` (desenha e prevê o movimento com ela). `areas` (chão) e `deco` (bancos,
 * lanternas...) são só desenho. A regra de atravessar a borda fica em movement.ts e
 * public/movement.js: a mesma conta nos dois.
 */
import type { Box } from './movement.js';

export type Edge = 'east' | 'west' | 'north' | 'south';
export type MapId = 'map_1' | 'map_2' | 'interior_weapons' | 'interior_clothes' | 'interior_scrolls' | 'academy_interior';
/** As 3 lojas com interior (o NPC lojista manda `shop_open` com isto). */
export type ShopKind = 'weapons' | 'clothes' | 'scrolls';

/**
 * Parede (colisão) com o tipo, para o cliente desenhar:
 *  wall = muralha · gatepost = pilar do portão · rock = montanha · house = prédio (s = estilo)
 *  tree = árvore · water = rio/canal · dummy = boneco de treino
 *  iwall = parede de interior · counter = balcão · furniture = móvel (s = qual)
 *  pit = vão no chão (Academia): ninguém atravessa andando, mas o Teleporte Curto salta por cima
 */
export interface Wall extends Box {
  k: 'wall' | 'gatepost' | 'rock' | 'house' | 'tree' | 'water' | 'dummy' | 'iwall' | 'counter' | 'furniture' | 'pit';
  /**
   * Estilo do prédio (sede, hospital, academia, lojas, casa, cabana) ou do móvel do interior
   * (suporte de espadas, de lanças, de escudos, manequim, prateleira de roupas, estante de
   * pergaminhos, mesa de pergaminhos, barril).
   */
  s?: 'leader' | 'hospital' | 'academy' | 'shop_weapon' | 'shop_cloth' | 'shop_scroll' | 'home' | 'hut'
    | 'sword_rack' | 'spear_rack' | 'shield_rack' | 'mannequin' | 'cloth_shelf' | 'scroll_shelf' | 'scroll_table' | 'barrel';
}

/** Chão pintado (só desenho): stone = pedra clara, grass, sand, water, bridge, path (terra), wood (assoalho). */
export interface Area extends Box {
  g: 'stone' | 'grass' | 'sand' | 'water' | 'bridge' | 'path' | 'wood';
}

/**
 * Enfeite sem colisão: banco, rosa dos ventos no chão, lanterna, vaso, telhado do portão (por
 * cima), tapete e capacho de porta.
 */
export interface Deco extends Box {
  k: 'bench' | 'rosette' | 'lamp' | 'plant' | 'gate_roof' | 'rug' | 'mat' | 'door' | 'cushion' | 'board';
  /** Porta da Academia: desenhada FECHADA enquanto o passo do tutorial do jogador for menor que este. */
  step?: number;
}

/**
 * PORTA: um retângulo no chão. Quem está dentro dele e anda na direção `dir` (para dentro da
 * porta) vai para o mapa `map`, na posição `at`. A chegada fica FORA da porta do outro lado
 * (não volta sozinho) e o jogador continua andando no mesmo sentido, para longe dela.
 */
export interface Door extends Box {
  dir: Edge;
  map: MapId;
  at: { x: number; y: number };
  /**
   * Trava do tutorial da Academia: a porta só funciona para quem já chegou neste passo (0 a 4).
   * Sem `step`, abre para todos. O servidor confere com o passo GRAVADO do jogador.
   */
  step?: number;
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
  /**
   * Onde chega, na direção perpendicular à borda (y nas bordas norte/sul). Sem isto, chega
   * encostado na borda oposta (x = 0, y = 0...). Com isto, chega mais para dentro (ex.: y 75).
   */
  arrive?: number;
}

export interface MapLayout {
  id: MapId;
  name: string;
  /** Estilo e chão padrão: 'village' = pedra clara; 'forest' = grama. */
  kind: 'village' | 'forest' | 'interior';
  width: number;
  height: number;
  /** Mapa seguro: sem monstros. */
  safe: boolean;
  walls: Wall[];
  exits: Exit[];
  /** Portas (lojas): entram e saem de interiores. */
  doors: Door[];
  /** Chão por cima do padrão (o último da lista vale). */
  areas: Area[];
  deco: Deco[];
  /** Zonas seguras: ninguém usa habilidade nem ataca dentro delas (o servidor confere). */
  safeZones: Box[];
  /** Onde os monstros nascem e andam (mapas de caça). */
  hunt?: Box;
  /** Monstros FIXOS (bonecos da Academia): tipo e lugar; renascem no mesmo ponto. */
  spawns?: { type: string; x: number; y: number }[];
  /** Campos que drenam chakra de quem está dentro (Sala de Controle da Academia), por segundo. */
  fields?: (Box & { chakraPerSec: number })[];
}

const wall = (k: Wall['k'], x: number, y: number, w: number, h: number, s?: Wall['s']): Wall => (s ? { x, y, w, h, k, s } : { x, y, w, h, k });
const tree = (x: number, y: number, size = 2): Wall => wall('tree', x, y, size, size);
const area = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g });
const deco = (k: Deco['k'], x: number, y: number, w = 1, h = 1): Deco => ({ x, y, w, h, k });

/**
 * Portão sul da Vila (x 35..45, y 79/80) <-> entrada norte da Floresta (mesmos x, y 0).
 * Quem sai pelo portão chega na Floresta em (x, 0); quem volta pela borda norte da Floresta
 * chega na Vila em (x, 75), dentro da praça, já longe do portão. Centro: x 40.
 */
export const VILLAGE_GATE = { from: 35, to: 45, shift: 0, returnY: 75 } as const;

/**
 * Lojas com interior: o prédio na Vila (porta no meio da fachada, embaixo) e a sala.
 * Na Vila, a porta é a faixa de 2 casas logo abaixo da fachada; empurrando para cima, entra.
 */
export const SHOPS = [
  { shop: 'weapons', map: 'interior_weapons', name: 'Armaria', building: { x: 23, y: 39, w: 10, h: 7 }, keeper: 'Ferreiro Tetsu' },
  { shop: 'clothes', map: 'interior_clothes', name: 'Alfaiataria', building: { x: 46, y: 39, w: 10, h: 7 }, keeper: 'Costureira Hana' },
  { shop: 'scrolls', map: 'interior_scrolls', name: 'Casa dos Pergaminhos', building: { x: 63, y: 39, w: 10, h: 7 }, keeper: 'Sábio Ren' },
] as const satisfies readonly { shop: ShopKind; map: MapId; name: string; building: Box; keeper: string }[];

/**
 * Sala de loja: 15 x 15. Vão da porta de 3 casas (x 6..9) no meio da parede de baixo. A SAÍDA é
 * o capacho inteiro (x 5,5..9,5, y 13,4..15): quem empurra para baixo ali sai, mesmo encostado
 * na parede ao lado do vão (ninguém fica preso no canto). Quem entra chega em (7,5; 12,8).
 */
export const ROOM = {
  w: 15, h: 15, doorFrom: 6, doorTo: 9, counterY: 6, npc: { x: 7.5, y: 4.6 }, arrive: { x: 7.5, y: 12.8 },
  exit: { x: 5.5, y: 13.4, w: 4, h: 1.6 },
} as const;

/**
 * Academia (tutorial, v8): 4 salas de 16 x 16 lado a lado (x 0, 16, 32, 48), FECHADAS entre si.
 * Não há porta de uma sala para a outra: quando o SERVIDOR vê a etapa concluída, ele mesmo leva o
 * jogador para a sala seguinte (e, no fim, para a Praça da Vila). Assim ninguém pula etapa. A
 * única saída (sala 4, embaixo) só abre com o tutorial completo (passo 4).
 *
 *   Etapa 1  Sala de Taijutsu  3 bonecos, só o Ataque Básico (os jutsus ficam ocultos)
 *   Etapa 2  Sala de Controle  um campo drena o chakra: meditar 🧘 até encher
 *   Etapa 3  Sala de Jutsus    Teleporte Curto por cima do vão + Substituição contra a armadilha
 *   Etapa 4  Sala de Armas     equipar a Kunai de Treino (🎒) e acertar o boneco com o Ataque Básico
 */
export const ACADEMY = {
  room: 16, height: 16, rooms: 4,
  /** Prédio da Academia na Vila (porta embaixo, no meio). */
  building: { x: 53, y: 19, w: 12, h: 11 },
  /** Onde se chega na sala 4 vindo da Vila. */
  arrive: { x: 56, y: 12.4 },
  /** Onde fica o Diretor (sala 4): Missão de Genin e Exame Chunin. */
  director: { x: 56, y: 4.2 },
  /** Sala de Controle: o campo que drena o chakra (a sala inteira; chakra/s). */
  drainField: { x: 17, y: 2, w: 14, h: 13, chakraPerSec: 6 },
  /** Sala de Jutsus: o vão de lado a lado (só o Teleporte passa). Nasce-se ao sul dele. */
  gap: { x: 33, y: 7, w: 14, h: 2 },
  /** Nomes das etapas (passo 0 a 3). */
  stages: ['Sala de Taijutsu', 'Sala de Controle', 'Sala de Jutsus', 'Sala de Armas'],
} as const;
/** Onde se nasce/renasce na Academia: na sala do passo atual do tutorial (0 a 3; 4 = sala 4). */
export function academySpawn(step: number): { x: number; y: number } {
  const room = Math.max(0, Math.min(3, Math.floor(step)));
  return { x: ACADEMY.room * room + 8, y: 11 };
}
/** Praça da Vila (zona segura): onde o tutorial termina. */
export const VILLAGE_PLAZA = { x: 40, y: 66 } as const;

/** O Teleporte atravessou o vão da Sala de Jutsus (de um lado para o outro)? */
export function crossedGap(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const g = ACADEMY.gap;
  const inX = (p: { x: number }) => p.x >= g.x && p.x <= g.x + g.w;
  if (!inX(from) || !inX(to)) return false;
  return (from.y >= g.y + g.h && to.y <= g.y) || (from.y <= g.y && to.y >= g.y + g.h);
}

/** Porta da loja na Vila (faixa logo abaixo da fachada) e onde se chega ao sair da sala. */
export function shopDoor(b: Box): { door: Box; outside: { x: number; y: number } } {
  const cx = b.x + b.w / 2;
  return { door: { x: cx - 1.5, y: b.y + b.h, w: 3, h: 0.5 }, outside: { x: cx, y: b.y + b.h + 1.5 } };
}

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
  const doors: Door[] = SHOPS.map((sh) => {
    const { door } = shopDoor(sh.building);
    decos.push(deco('mat', door.x + 0.5, door.y, 2, 0.6));        // capacho na porta
    return { ...door, dir: 'north' as const, map: sh.map, at: { ...ROOM.arrive } };
  });
  // Academia: a porta do prédio leva à sala 4 (onde fica o Diretor e a Missão de Genin).
  const academyDoor = shopDoor(ACADEMY.building).door;
  decos.push(deco('mat', academyDoor.x + 0.5, academyDoor.y, 2, 0.6));
  doors.push({ ...academyDoor, dir: 'north', map: 'academy_interior', at: { ...ACADEMY.arrive } });
  return {
    id: 'map_1', name: 'Vila', kind: 'village', width: W, height: H, safe: true, walls,
    exits: [{ edge: 'south', from: G.from, to: G.to, map: 'map_2', shift: G.shift }],
    doors,
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
 * Floresta (100 x 100): grama escura, mata fechada nas bordas, com a entrada no NORTE (x 35..45), que
 * leva ao portão da Vila; uma trilha desce dali e há uma clareira na chegada, sem árvores e
 * sem monstros. Árvores espalhadas (2x2 e 3x3).
 */
function forest(): MapLayout {
  const W = 100, H = 100;
  const gateFrom = VILLAGE_GATE.from + VILLAGE_GATE.shift, gateTo = VILLAGE_GATE.to + VILLAGE_GATE.shift;   // 35..45
  const walls: Wall[] = [
    wall('tree', 0, 0, gateFrom, 2),               // mata norte, à esquerda da entrada
    wall('tree', gateTo, 0, W - gateTo, 2),        // mata norte, à direita
    wall('tree', 0, H - 2, W, 2),                  // mata sul
    wall('tree', 0, 2, 2, H - 4),                  // mata oeste
    wall('tree', W - 2, 2, 2, H - 4),              // mata leste
  ];
  const clearing: Box = { x: gateFrom - 8, y: 0, w: gateTo - gateFrom + 16, h: 14 };   // chegada
  const trail: Box = { x: 39, y: 0, w: 3, h: 36 };
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
    exits: [{ edge: 'north', from: gateFrom, to: gateTo, map: 'map_1', shift: -VILLAGE_GATE.shift, arrive: VILLAGE_GATE.returnY }],
    doors: [],
    areas: [area('path', trail.x, trail.y, trail.w, trail.h)],
    deco: [],
    safeZones: [],
    hunt: { x: 4, y: 18, w: W - 8, h: H - 22 },
  };
}

/**
 * Sala de loja (15 x 15), vista de cima em 3/4:
 *
 *   ████████ parede do fundo (prateleiras da loja) ████████   y 0..3
 *   █              lojista (atrás do balcão)             █    y 3..6
 *   █▓▓ divisória ▓▓[======= BALCÃO =======]▓▓ divisória ▓▓█  y 6..7,2  (ninguém passa para trás)
 *   █ móveis                  tapete                móveis █   y 7,2..14
 *   █████████████████████  [ porta ]  ████████████████████    y 14..15  (vão x 6..9)
 *
 * A porta de saída é o capacho (x 5,5..9,5, y 13,4..15): empurrando para baixo, volta para a
 * Vila, na frente da loja. Quem entra chega em (7,5; 12,8), fora dela, e continua subindo.
 */
function interior(sh: (typeof SHOPS)[number]): MapLayout {
  const { w: W, h: H } = ROOM;
  const f = (s: Wall['s'], x: number, y: number, w: number, h: number) => wall('furniture', x, y, w, h, s);
  const walls: Wall[] = [
    wall('iwall', 0, 0, W, 3),                       // parede do fundo (alta: vista em 3/4)
    wall('iwall', 0, 3, 1, H - 3),                   // esquerda
    wall('iwall', W - 1, 3, 1, H - 3),               // direita
    wall('iwall', 0, H - 1, ROOM.doorFrom, 1),       // frente, à esquerda da porta
    wall('iwall', ROOM.doorTo, H - 1, W - ROOM.doorTo, 1),
    wall('counter', 3, ROOM.counterY, 9, 1.2),       // balcão no meio
    wall('counter', 1, ROOM.counterY, 2, 1.2),       // divisórias: ninguém vai para trás do balcão
    wall('counter', 12, ROOM.counterY, 2, 1.2),
  ];
  if (sh.shop === 'weapons') {
    walls.push(f('sword_rack', 1, 0.6, 5, 2.2), f('sword_rack', 9, 0.6, 5, 2.2));      // espadas na parede
    walls.push(f('spear_rack', 1, 8.5, 1, 4), f('shield_rack', 13, 8.5, 1, 4), f('barrel', 2.2, 12.6, 1, 1));
  } else if (sh.shop === 'clothes') {
    walls.push(f('cloth_shelf', 1, 0.6, 5, 2.2), f('cloth_shelf', 9, 0.6, 5, 2.2));    // roupas dobradas
    walls.push(f('mannequin', 1.4, 8.5, 1, 1), f('mannequin', 1.4, 11, 1, 1), f('mannequin', 12.6, 8.5, 1, 1), f('mannequin', 12.6, 11, 1, 1));
  } else {
    walls.push(f('scroll_shelf', 1, 0.6, 5, 2.2), f('scroll_shelf', 9, 0.6, 5, 2.2));  // pergaminhos
    walls.push(f('scroll_shelf', 1, 8.5, 1, 4), f('scroll_shelf', 13, 8.5, 1, 4), f('scroll_table', 11.4, 12.2, 1.6, 1));
  }
  const back = shopDoor(sh.building).outside;
  return {
    id: sh.map, name: sh.name, kind: 'interior', width: W, height: H, safe: true, walls,
    exits: [],
    doors: [{ ...ROOM.exit, dir: 'south', map: 'map_1', at: { ...back } }],
    areas: [area('wood', 0, 0, W, H)],
    deco: [deco('rug', 4.5, 8.6, 6, 3.4), deco('mat', ROOM.doorFrom, ROOM.exit.y, ROOM.doorTo - ROOM.doorFrom, H - ROOM.exit.y)],
    safeZones: [{ x: 0, y: 0, w: W, h: H }],         // dentro da loja não tem combate
  };
}

/**
 * Academia (64 x 16), 4 salas vistas de cima:
 *
 *   ┌ sala 1 ──────┐┌ sala 2 ──────┐┌ sala 3 ──────┐┌ sala 4 ──────┐
 *   │ Taijutsu:    ││ Controle:    ││ Jutsus: ar-  ││ Armas: DIRE- │
 *   │ 3 bonecos    ││ campo drena  ││ madilha      ││ TOR  boneco  │
 *   │ (Ataque      ││ o chakra     ││ ~~~~ vão ~~~ ││ (Kunai +     │
 *   │  Básico)     ││ (meditar)    ││ (Teleporte)  ││  Ataque)     │
 *   └──────────────┘└──────────────┘└──────────────┘└──[ saída ]───┘
 *
 * Entre duas salas a parede é dupla (2 casas) e não tem passagem: quem leva de uma sala para a
 * outra é o servidor (etapa concluída). A saída (embaixo, na sala 4) só abre no passo 4 e leva à
 * frente da Academia na Vila; quem conclui o tutorial é levado direto para a Praça da Vila.
 */
function academy(): MapLayout {
  const R = ACADEMY.room, H = ACADEMY.height;
  const walls: Wall[] = [];
  const doors: Door[] = [];
  const decos: Deco[] = [];
  for (let k = 0; k < ACADEMY.rooms; k++) {
    const x0 = R * k;
    walls.push(wall('iwall', x0, 0, R, 2));                                              // fundo
    walls.push(wall('iwall', x0, 2, 1, H - 2), wall('iwall', x0 + R - 1, 2, 1, H - 2));  // laterais
    if (k < ACADEMY.rooms - 1) {
      walls.push(wall('iwall', x0 + 1, H - 1, R - 2, 1));                               // frente
    } else {
      walls.push(wall('iwall', x0 + 1, H - 1, 5.5, 1), wall('iwall', x0 + 9.5, H - 1, 5.5, 1));   // vão da saída (x 54,5..57,5)
    }
  }
  // Saída: o capacho inteiro (como nas lojas, ninguém fica preso no canto). Só no passo 4.
  doors.push({ x: 54.5, y: H - 1.6, w: 3, h: 1.6, dir: 'south', map: 'map_1', at: shopDoor(ACADEMY.building).outside, step: 4 });
  decos.push({ ...deco('door', 54.5, H - 1, 3, 1), step: 4 }, deco('mat', 55, H - 1.6, 2, 0.6));
  // Etapa 3: o vão de parede a parede (Teleporte por cima). Colide como parede para quem anda.
  const g = ACADEMY.gap;
  walls.push(wall('pit', g.x, g.y, g.w, g.h));
  // Sala 1: tapete e quadro · Sala 2: almofadas · Sala 3: tapete (além do vão) · Sala 4: armas na parede.
  decos.push(deco('rug', 3, 3.5, 10, 4.5), deco('board', 6, 0.5, 4, 1.2));
  decos.push(deco('cushion', 20, 6, 1.4, 1.4), deco('cushion', 23.3, 5, 1.4, 1.4), deco('cushion', 26.6, 6, 1.4, 1.4), deco('board', 22, 0.5, 4, 1.2));
  decos.push(deco('rug', 35, 2.4, 10, 3.8), deco('board', 38, 0.5, 4, 1.2));
  decos.push(deco('rug', 52, 6, 8, 4));
  walls.push(wall('furniture', 49.4, 0.6, 3.6, 2.2, 'sword_rack'), wall('furniture', 59, 0.6, 3.6, 2.2, 'shield_rack'));
  const f = ACADEMY.drainField;
  return {
    id: 'academy_interior', name: 'Academia', kind: 'interior', width: R * ACADEMY.rooms, height: H, safe: true, walls,
    exits: [], doors,
    areas: [area('wood', 0, 0, R * ACADEMY.rooms, H)],
    deco: decos,
    // Só o canto do Diretor é seguro: na Sala de Armas se treina o Ataque Básico com a arma.
    safeZones: [{ x: 52.5, y: 2, w: 7, h: 4.5 }],
    spawns: [
      { type: 'dummy', x: 4.5, y: 5.5 }, { type: 'dummy', x: 8, y: 4.5 }, { type: 'dummy', x: 11.5, y: 5.5 },
      // Armadilha de lâminas ALÉM do vão: só bate em quem chega perto (Substituição!).
      { type: 'sparring', x: 40, y: 4 },
      { type: 'dummy', x: 51.5, y: 10 },
    ],
    fields: [{ x: f.x, y: f.y, w: f.w, h: f.h, chakraPerSec: f.chakraPerSec }],
  };
}

/** Todos os mapas, por id. */
export function buildMaps(): Record<MapId, MapLayout> {
  const [weapons, clothes, scrolls] = SHOPS;
  return {
    map_1: village(), map_2: forest(),
    interior_weapons: interior(weapons), interior_clothes: interior(clothes), interior_scrolls: interior(scrolls),
    academy_interior: academy(),
  };
}

export const WORLD_MAPS: Readonly<Record<MapId, MapLayout>> = buildMaps();

/** O ponto está numa zona segura do mapa? (posição do SERVIDOR) */
export function inSafeZone(layout: MapLayout, x: number, y: number): boolean {
  return layout.safeZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
