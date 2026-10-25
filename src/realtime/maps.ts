/*
 * Mapas (salas) do mundo, como no Nin Online: cada mapa tem tamanho, chão, paredes e
 * SAÍDAS nas bordas. Andar até uma saída leva ao mapa vizinho, na borda oposta.
 *
 *   map_1  Vila      80 x 80   muralha em volta, PORTÃO no sul (x 35..45), sede, hospital,
 *                              academia, lojas, rio com pontes, praça segura e a ARENA (no campo de treino)
 *   map_2  Floresta 100 x 100  grama escura, árvores, monstros por zona (mais longe, mais forte); entrada no NORTE
 *                              (x 35..45); as Pedras-Selo 1 a 3, o Velho Carvalho, a Cachoeira Seca, o Acampamento
 *                              Queimado, o riacho e o abismo do Arco 1 (docs/mapas.md)
 *   caverna_lodo       56 x 44  do outro lado do abismo (só com o Teleporte): túneis e o lago de lodo
 *   clareira_queimada  44 x 40  o coração da Floresta (Pedra 4, chefe); passagem sul LACRADA até a história abrir
 *   poco               24 x 20  o Poço sob a Praça; tampa LACRADA até a história abrir
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
import type { Village } from './appearance.js';
import type { Box } from './movement.js';

export type Edge = 'east' | 'west' | 'north' | 'south';
export type MapId = 'map_1' | 'map_2' | 'interior_weapons' | 'interior_clothes' | 'interior_scrolls' | 'academy_interior'
  | 'vila_pedra' | 'vila_nevoa' | 'vila_nuvem' | 'vila_areia' | 'zona_conflito' | 'refugio'
  | 'caverna_lodo' | 'clareira_queimada' | 'poco';
/** Tema de cores do mapa (chão, telhados e enfeites; ver public/mapArt.js). */
export type MapTheme = 'folha' | 'pedra' | 'nevoa' | 'nuvem' | 'areia' | 'conflito' | 'refugio';
/** As 3 lojas com interior (o NPC lojista manda `shop_open` com isto). */
export type ShopKind = 'weapons' | 'clothes' | 'scrolls';

/**
 * Parede (colisão) com o tipo, para o cliente desenhar:
 *  wall = muralha · gatepost = pilar do portão · rock = montanha · house = prédio (s = estilo)
 *  tree = árvore · water = rio/canal · dummy = boneco de treino
 *  iwall = parede de interior · counter = balcão · furniture = móvel (s = qual)
 *  pit = vão no chão (Academia): ninguém atravessa andando, mas o Teleporte Curto salta por cima
 *  fence = cerca de madeira da arena · pillar = pilar de pedra (cobertura dentro da arena)
 *  gate = portão fechado (vilas sem saída a pé: só pelo Posto de Viagem)
 *  pit com s = chasm: o abismo da Floresta (bordas de pedra, em vez das tábuas da Academia)
 *  seal = Pedra-Selo (s = lit acesa / out apagada) · oak = tronco do Velho Carvalho · cliff = paredão (s = fall: a
 *  cachoeira seca) · tent = barraca (s = burnt: queimada) · cave = rocha de caverna · deadtree = árvore morta ·
 *  logs = troncos caídos (passagem lacrada) · sink = sumidouro (onde o riacho some) · pool = lago de lodo
 */
export interface Wall extends Box {
  k: 'wall' | 'gatepost' | 'rock' | 'house' | 'tree' | 'water' | 'dummy' | 'iwall' | 'counter' | 'furniture' | 'pit' | 'fence' | 'pillar' | 'gate'
    | 'seal' | 'oak' | 'cliff' | 'tent' | 'cave' | 'deadtree' | 'logs' | 'sink' | 'pool';
  /**
   * Estilo do prédio (sede, hospital, academia, lojas, casa, cabana) ou do móvel do interior
   * (suporte de espadas, de lanças, de escudos, manequim, prateleira de roupas, estante de
   * pergaminhos, mesa de pergaminhos, barril).
   */
  s?: 'leader' | 'hospital' | 'academy' | 'shop_weapon' | 'shop_cloth' | 'shop_scroll' | 'home' | 'hut'
    | 'sword_rack' | 'spear_rack' | 'shield_rack' | 'mannequin' | 'cloth_shelf' | 'scroll_shelf' | 'scroll_table' | 'barrel'
    | 'lit' | 'out' | 'fall' | 'burnt' | 'chasm' | 'mouth'
    // pilar da arena da vila: bloco de ardósia com moldura dourada (os da Zona de Conflito são ruína)
    | 'arena';
}

/**
 * Chão pintado (só desenho): stone = pedra clara, grass, sand, water, bridge, path (terra), wood (assoalho), arena
 * (terra batida), dirt (chão de pedra solta da Zona de Conflito), ash (cinzas do Refúgio), cave (chão de caverna),
 * burnt (grama queimada), pebbles (seixos do leito seco), lodo (o lago de lodo, embaixo da parede `pool`).
 */
export interface Area extends Box {
  g: 'stone' | 'grass' | 'sand' | 'water' | 'bridge' | 'path' | 'wood' | 'arena' | 'dirt' | 'ash' | 'cave' | 'burnt' | 'pebbles' | 'lodo';
  /** 'oval': só a mancha oval (com a borda ondulada) dentro da caixa pinta o chão. Sem: a caixa toda. */
  shape?: 'oval';
}

/**
 * Enfeite sem colisão: banco, rosa dos ventos no chão, lanterna, vaso, telhado do portão (por
 * cima), tapete, capacho de porta, estandarte (entrada da arena) e o círculo pintado no chão da arena.
 */
export interface Deco extends Box {
  k: 'bench' | 'rosette' | 'lamp' | 'plant' | 'gate_roof' | 'rug' | 'mat' | 'door' | 'cushion' | 'board' | 'banner' | 'ring' | 'fire' | 'bones'
    // Arco 1 (docs/mapas.md): placa da trilha, raízes, kunais cravadas, brasas, grade do canal, tampa do poço, a copa
    // do Velho Carvalho (POR CIMA dos jogadores, como o telhado do portão), estalagmite, pegadas e a escada do poço.
    | 'signpost' | 'roots' | 'kunai' | 'embers' | 'grate' | 'well_lid' | 'oak_canopy' | 'stalagmite' | 'footprints' | 'ladder' | 'scorch'
    // o riacho e o leito seco, desenhados como uma faixa que segue a linha `p` (largura 2 × `r`)
    | 'stream' | 'drybed';
  /** Linha do riacho/leito: x0, y0, x1, y1... em casas, a partir do canto (x, y) do enfeite. */
  p?: number[];
  /** Meia largura da faixa, em casas. */
  r?: number;
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
  /** Porta de uma vila para uma sala compartilhada: ao sair da sala, volta aqui (gates.back no movimento). */
  back?: { x: number; y: number };
  /** Saída de sala compartilhada (lojas, Academia): volta para onde o jogador entrou (sem isso: map/at). */
  toBack?: boolean;
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

/**
 * ARENA de treino de PvP (uma em cada vila). Dentro da cerca, os ninjas DA VILA DONA lutam entre si; os de
 * outra vila (e quem ainda não criou o personagem) só assistem, sem bater nem apanhar. Fora dela, a Vila
 * nunca tem PvP. Perder não custa nada: renasce em `respawn` (fora da cerca) com vida e chakra cheios.
 */
export interface Arena extends Box {
  village: Village;
  respawn: { x: number; y: number };
}

/** Zona de caça com nome (docs/mapas.md, 3.3), o monstro dela e o peso no sorteio. */
export interface HuntZone extends Box {
  name: string;
  type: string;
  weight: number;
}

export interface MapLayout {
  id: MapId;
  name: string;
  /** Mapa de vila: a vila dona (a arena é dela; só quem é dela ou de vila aliada entra; nunca há PvP aberto aqui). */
  village?: Village;
  /** Refúgio dos Renegados: só renegado entra. */
  refuge?: boolean;
  /** Zona de Conflito: PvP livre (menos aliados), com ranking. */
  conflict?: boolean;
  /** Tema de cores (desenho). */
  theme?: MapTheme;
  /** Arenas de treino de PvP (área de luta, DENTRO da cerca). */
  arenas?: Arena[];
  /** Estilo e chão padrão: 'village' = pedra clara; 'forest' = grama; 'wild' = pedra solta; 'interior' = assoalho; 'cave' = caverna (escura). */
  kind: 'village' | 'forest' | 'interior' | 'wild' | 'cave';
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
  /** Tipo de monstro de caça do mapa (sem isto: o slime). */
  huntType?: string;
  /**
   * Zonas de caça com o monstro de cada uma (mais longe da entrada, mais forte). `weight` = quanto dos monstros do mapa
   * nasce nela; cada monstro anda só dentro da zona dele. Sem isto: `hunt` e `huntType`.
   */
  zones?: HuntZone[];
  /** Monstros FIXOS (bonecos da Academia): tipo e lugar; renascem no mesmo ponto. */
  spawns?: { type: string; x: number; y: number }[];
  /** Campos que drenam chakra de quem está dentro (Sala de Controle da Academia), por segundo. */
  fields?: (Box & { chakraPerSec: number })[];
}

const wall = (k: Wall['k'], x: number, y: number, w: number, h: number, s?: Wall['s']): Wall => (s ? { x, y, w, h, k, s } : { x, y, w, h, k });
const tree = (x: number, y: number, size = 2): Wall => wall('tree', x, y, size, size);
const area = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g });
const oval = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g, shape: 'oval' });
const deco = (k: Deco['k'], x: number, y: number, w = 1, h = 1): Deco => ({ x, y, w, h, k });

/** Faixa que segue uma linha (riacho, leito seco): o enfeite ocupa a caixa da linha mais a largura. */
function band(k: 'stream' | 'drybed', pts: readonly (readonly [number, number])[], r: number): Deco {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const x = r1(Math.min(...xs) - r - 0.5), y = r1(Math.min(...ys) - r - 0.5);
  const w = r1(Math.max(...xs) + r + 0.5 - x), h = r1(Math.max(...ys) + r + 0.5 - y);
  const p = pts.flatMap(([px, py]) => [r1(px - x), r1(py - y)]);
  return { k, x, y, w, h, p, r };
}

/** y da linha na altura x (a linha vai da direita para a esquerda ou ao contrário; interpola reto entre os pontos). */
function lineY(pts: readonly (readonly [number, number])[], x: number): number {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0]![0]) return sorted[0]![1];
  for (let i = 1; i < sorted.length; i++) {
    const [x0, y0] = sorted[i - 1]!, [x1, y1] = sorted[i]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return sorted[sorted.length - 1]![1];
}

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

/**
 * Arena da Vila, no campo de treino (canto de baixo à direita). Cerca de madeira de meia casa de espessura
 * com duas entradas de 3 casas: ao norte (de frente para a rua de baixo) e a oeste (do lado da praça).
 * Dois pilares de pedra dentro servem de cobertura (param linhas e projéteis).
 */
export const VILLAGE_ARENA = {
  /** Cerca, de fora a fora. A área de luta é o que fica dentro dela (`fightBox`). */
  fence: { x: 58, y: 57, w: 17, h: 16 },
  thickness: 0.5,
  /** Vão de entrada no lado de cima (x) e no lado esquerdo (y). */
  north: { from: 64.5, to: 67.5 },
  west: { from: 63, to: 66 },
  pillars: [{ x: 62, y: 61 }, { x: 70, y: 68 }],
  /** Quem perde renasce aqui: fora da cerca, ao lado da entrada oeste. */
  respawn: { x: 56.6, y: 64.5 },
} as const;

/** A área de luta: dentro da cerca. */
export function arenaFightBox(a: typeof VILLAGE_ARENA = VILLAGE_ARENA): Box {
  const t = a.thickness;
  return { x: a.fence.x + t, y: a.fence.y + t, w: a.fence.w - 2 * t, h: a.fence.h - 2 * t };
}

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
/** Cada vila: o mapa, o nome que aparece, a vila dona, o tema e se o portão sul abre (só a Folha, para a Floresta). */
interface VillageMapDef { id: MapId; name: string; village: Village; theme: MapTheme; gate: boolean }

export const VILLAGE_MAPS: readonly VillageMapDef[] = [
  { id: 'map_1', name: 'Vila da Folha', village: 'vila_1', theme: 'folha', gate: true },
  { id: 'vila_pedra', name: 'Vila da Pedra', village: 'vila_2', theme: 'pedra', gate: false },
  { id: 'vila_nevoa', name: 'Vila da Névoa', village: 'vila_3', theme: 'nevoa', gate: false },
  { id: 'vila_nuvem', name: 'Vila da Nuvem', village: 'vila_4', theme: 'nuvem', gate: false },
  { id: 'vila_areia', name: 'Vila da Areia', village: 'vila_5', theme: 'areia', gate: false },
];

/** Posto de Viagem de cada vila: dentro da praça, perto do portão. */
export const TRAVEL_POST = { x: 36.5, y: 73.5 } as const;

function village(def: VillageMapDef = VILLAGE_MAPS[0]!): MapLayout {
  const W = 80, H = 80;
  const G = VILLAGE_GATE;
  const walls: Wall[] = [
    // Muralha: perímetro sólido (2 casas de espessura), aberta só no portão.
    wall('wall', 0, 0, W, 2),
    wall('wall', 0, 2, 2, H - 4),
    wall('wall', W - 2, 2, 2, H - 4),
    wall('wall', 0, H - 2, G.from, 2),
    wall('wall', G.to, H - 2, W - G.to, 2),
    // Pilares do portão (fora da abertura: o vão x 35..45 fica livre). Sem saída a pé: o portão fica fechado.
    wall('gatepost', G.from - 2, H - 4, 2, 2),
    wall('gatepost', G.to, H - 4, 2, 2),
    ...(def.gate ? [] : [wall('gate', G.from, H - 2, G.to - G.from, 2)]),
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
    // Boneco de madeira no campo de treino, ao lado da arena (a arena é para lutar entre ninjas).
    wall('dummy', 76, 75, 1, 1),
    ...arenaWalls(),
    // Árvores (só nos gramados; nenhuma na rua, na praça ou no portão).
    tree(12, 3), tree(14, 8), tree(11, 12, 1), tree(63, 3), tree(65, 8), tree(66, 12, 1),
    tree(10, 22, 1), tree(28, 22, 1), tree(51, 22, 1), tree(67, 25, 1),
    tree(21, 47), tree(33, 47), tree(44, 47), tree(56, 47), tree(61, 47), tree(74, 47),
    tree(22, 58), tree(25, 67), tree(13, 70), tree(19, 74), tree(53, 62), tree(53, 70),
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
    // Campo de treino (areia) no canto inferior direito, com a arena de terra batida no meio.
    area('sand', 56, 56, 20, 18),
    area('arena', VILLAGE_ARENA.fence.x, VILLAGE_ARENA.fence.y, VILLAGE_ARENA.fence.w, VILLAGE_ARENA.fence.h),
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
    // Arco 1: a grade onde o rio passa por baixo da muralha (M2: "a água vem da Floresta") e a tampa lacrada do poço.
    deco('grate', 5.5, 77, 4, 1), deco('well_lid', 33, 65, 2, 2),
    deco('gate_roof', G.from - 2, H - 5, G.to - G.from + 4, 2),       // telhado do portão (desenhado por cima)
    // Arena: o círculo pintado no chão, estandartes nas duas entradas e bancos para quem assiste.
    deco('ring', arenaFightBox().x, arenaFightBox().y, arenaFightBox().w, arenaFightBox().h),
    deco('banner', VILLAGE_ARENA.north.from - 1.2, VILLAGE_ARENA.fence.y - 1.2), deco('banner', VILLAGE_ARENA.north.to + 0.2, VILLAGE_ARENA.fence.y - 1.2),
    deco('banner', VILLAGE_ARENA.fence.x - 1.7, VILLAGE_ARENA.west.from - 1.2), deco('banner', VILLAGE_ARENA.fence.x - 1.7, VILLAGE_ARENA.west.to + 0.2),
    deco('bench', 60, 74.6, 3, 1), deco('bench', 66, 74.6, 3, 1), deco('bench', 72, 74.6, 2, 1),
  ];
  // Lojas e Academia são salas compartilhadas pelas cinco vilas: a porta lembra de onde o jogador veio (`back`).
  const doors: Door[] = SHOPS.map((sh) => {
    const { door, outside } = shopDoor(sh.building);
    decos.push(deco('mat', door.x + 0.5, door.y, 2, 0.6));        // capacho na porta
    return { ...door, dir: 'north' as const, map: sh.map, at: { ...ROOM.arrive }, back: { ...outside } };
  });
  // Academia: a porta do prédio leva à sala 4 (onde fica o Diretor e a Missão de Genin).
  const academy = shopDoor(ACADEMY.building);
  decos.push(deco('mat', academy.door.x + 0.5, academy.door.y, 2, 0.6));
  doors.push({ ...academy.door, dir: 'north', map: 'academy_interior', at: { ...ACADEMY.arrive }, back: { ...academy.outside } });
  return {
    id: def.id, name: def.name, kind: 'village', village: def.village, theme: def.theme, width: W, height: H, safe: true, walls,
    exits: def.gate ? [{ edge: 'south', from: G.from, to: G.to, map: 'map_2', shift: G.shift }] : [],
    doors,
    areas, deco: decos,
    // Praça social logo acima do portão: sem combate.
    safeZones: [{ x: 28, y: 55, w: 24, h: 23 }],
    arenas: [{ ...arenaFightBox(), village: def.village, respawn: { ...VILLAGE_ARENA.respawn } }],
  };
}

/** Cerca da arena (4 lados, com os vãos das entradas) e os pilares de dentro. */
function arenaWalls(): Wall[] {
  const { fence: f, thickness: t, north: n, west: w } = VILLAGE_ARENA;
  return [
    wall('fence', f.x, f.y, n.from - f.x, t),                       // cima, à esquerda da entrada norte
    wall('fence', n.to, f.y, f.x + f.w - n.to, t),                  // cima, à direita
    wall('fence', f.x, f.y + f.h - t, f.w, t),                      // baixo
    wall('fence', f.x, f.y + t, t, w.from - f.y - t),               // esquerda, acima da entrada oeste
    wall('fence', f.x, w.to, t, f.y + f.h - t - w.to),              // esquerda, abaixo
    wall('fence', f.x + f.w - t, f.y + t, t, f.h - 2 * t),          // direita
    ...VILLAGE_ARENA.pillars.map((p) => wall('pillar', p.x, p.y, 1, 1, 'arena')),
  ];
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
/**
 * Pontos da Floresta que as missões do Arco 1 usam (docs/mapas.md, 3.2): centro e raio (casas). O "IR ATÉ" do
 * sistema de história aponta para eles pelo nome.
 */
export const FOREST_POI = {
  entrada: { x: 40, y: 8, r: 6 },
  pedra1: { x: 22, y: 23, r: 3 },
  sumidouro: { x: 57, y: 22, r: 3 },
  encruzilhada: { x: 40.5, y: 38, r: 4 },
  carvalho: { x: 14, y: 46, r: 6 },
  pedra2: { x: 14, y: 50, r: 2.5 },
  cachoeira: { x: 79.5, y: 40, r: 4 },
  pedra3: { x: 79.5, y: 36.3, r: 1.8 },
  acampamento: { x: 18, y: 71, r: 8 },
  abismo: { x: 65, y: 80, r: 3 },
  caverna: { x: 80, y: 95.5, r: 3 },
  passagemSul: { x: 42, y: 91, r: 3 },
} as const;

/** O abismo da Floresta: um vão de 2 casas, o mesmo da Sala de Jutsus (o Teleporte do nível 1 alcança 3). */
export const FOREST_ABYSS = { x: 60, y: 82, w: 38, h: 2 } as const;

/** O riacho da Floresta, do leste até o sumidouro (casas), e a meia largura dele. */
const STREAM = [[99, 11.2], [94, 11.7], [89, 13.1], [84, 14], [79, 14.6], [74, 15.7], [69, 16.6], [64.5, 17.4], [60, 18]] as const;
const STREAM_R = 1.2;
/** O leito seco: sai do riacho e desce até a cachoeira seca. */
const DRYBED = [[79, 15.5], [78.2, 19], [79.6, 23], [78.6, 27], [79.5, 30.6]] as const;

/**
 * Floresta (100 x 100), desenhada por regiões (docs/mapas.md, seção 3):
 *
 *   ┌───────── mata ────[ ENTRADA x 35..45 ]──── mata ─────────┐
 *   │            Clareira da Entrada (Posto de Viagem)   ≈ riacho │  y  0..14
 *   │  Clareira da Pedra (Pedra 1, apagada) ═╗   ◎ sumidouro ≈≈≈ │  y 16..28
 *   │                                        ║        leito seco │
 *   │  Velho Carvalho ══════ Encruzilhada ═══╬════ paredão[fresta]│  y 32..41 (Pedra 3 atrás da cachoeira)
 *   │  (Pedra 2 nas raízes)                  ║                   │
 *   │  Acampamento Queimado ═════════════════╣                   │  y 62..82
 *   │                                        ╚═══ pegadas ▒▒ABISMO│  y 76..84
 *   │                          [troncos]          saliência ⌂caverna│ y 84..98
 *   └────────────────────────[ SAÍDA SUL x 38..46 ]──────────────┘
 *
 * O resto é mata: árvores com sorteio de semente fixa (sempre as mesmas), longe das trilhas e dos lugares.
 * Mais longe da entrada, monstros mais fortes (zonas de caça).
 */
function forest(): MapLayout {
  const W = 100, H = 100;
  const gateFrom = VILLAGE_GATE.from + VILLAGE_GATE.shift, gateTo = VILLAGE_GATE.to + VILLAGE_GATE.shift;   // 35..45
  const south = { from: 38, to: 46 };                                             // passagem sul (Clareira Queimada)
  const walls: Wall[] = [
    wall('tree', 0, 0, gateFrom, 2),               // mata norte, à esquerda da entrada
    wall('tree', gateTo, 0, W - gateTo, 2),        // mata norte, à direita
    wall('tree', 0, H - 2, south.from, 2),         // mata sul, dos dois lados da passagem
    wall('tree', south.to, H - 2, W - south.to, 2),
    wall('tree', 0, 2, 2, H - 4),                  // mata oeste
    wall('tree', W - 2, 2, 2, H - 4),              // mata leste
  ];
  // Riacho: desce do leste e some no sumidouro (é a água que sobe no canal da Vila, M2). Na tela, uma faixa curva
  // (o enfeite 'stream'); a colisão são caixas de 2 casas que seguem a mesma linha.
  for (let x = 61; x < 98; x += 2) {
    const cy = lineY(STREAM, x + 1);
    walls.push(wall('water', x, Math.round((cy - STREAM_R) * 10) / 10, 2, STREAM_R * 2));
  }
  walls.push(wall('sink', 57, 16, 4, 4));
  // Pedra-Selo 1 (apagada: a Tsubaki acha na M3), na Clareira da Pedra.
  walls.push(wall('seal', 21, 20, 2, 2, 'out'));
  // Velho Carvalho: o tronco (a copa passa por cima de quem anda embaixo) e a Pedra-Selo 2 nas raízes.
  walls.push(wall('oak', 12, 42, 4, 3), wall('seal', 13, 47, 2, 2, 'lit'));
  // Cachoeira Seca: o paredão, a face lisa da queda e a fresta (x 78,5..80,5) que leva à Pedra-Selo 3, atrás dela.
  walls.push(
    wall('cliff', 62, 32, 14, 6), wall('cliff', 83, 32, 15, 6), wall('cliff', 76, 30, 7, 3, 'fall'),
    wall('cliff', 76, 37, 2.5, 1), wall('cliff', 80.5, 37, 2.5, 1), wall('seal', 78.5, 33.6, 2, 2, 'lit'),
  );
  // Acampamento Queimado: barracas queimadas dos Cinzas.
  for (const [x, y] of [[8, 64], [16, 63], [24, 65], [9, 75], [25, 76]] as const) walls.push(wall('tent', x, y, 4, 3, 'burnt'));
  // Abismo (vão: só o Teleporte passa) e a rocha que fecha a saliência do outro lado; a boca da caverna.
  const A = FOREST_ABYSS;
  walls.push(wall('pit', A.x, A.y, A.w, A.h, 'chasm'), wall('cliff', 56, 82, 6, 16), wall('cave', 74, 88, 12, 6, 'mouth'));
  // Passagem sul: troncos queimados fecham o caminho até a história abrir (M14); árvores nos lados.
  walls.push(wall('logs', 37, 93, 10, 2), wall('tree', 33, 90, 4, 8), wall('tree', 47, 90, 4, 8));

  const paths: Box[] = [
    { x: 39, y: 0, w: 3, h: 93 },                  // trilha principal, do portão à passagem sul
    { x: 28, y: 22, w: 11, h: 2 },                 // para a Pedra 1
    { x: 16, y: 37, w: 23, h: 2 },                 // oeste: o Velho Carvalho
    { x: 42, y: 39, w: 37, h: 2 },                 // leste: a cachoeira seca (termina na fresta)
    { x: 78.5, y: 37, w: 2, h: 2 },
    { x: 24, y: 70, w: 15, h: 2 },                 // o Acampamento Queimado
    { x: 42, y: 76, w: 24, h: 2 },                 // o abismo
    { x: 64, y: 78, w: 2, h: 4 },
  ];
  // Lugares sem árvore do sorteio (clareiras, o paredão e o leito, a saliência, a passagem).
  const keep: Box[] = [
    { x: gateFrom - 8, y: 0, w: gateTo - gateFrom + 16, h: 14 },   // Clareira da Entrada
    { x: 14, y: 16, w: 16, h: 12 },                // Clareira da Pedra
    { x: 33, y: 34, w: 15, h: 8 },                 // Encruzilhada
    { x: 4, y: 34, w: 30, h: 26 },                 // Velho Carvalho
    { x: 6, y: 62, w: 26, h: 20 },                 // Acampamento
    { x: 54, y: 9, w: 44, h: 33 },                 // riacho, leito seco e paredão
    { x: 54, y: 78, w: 44, h: 20 },                // abismo e saliência
    { x: 30, y: 86, w: 24, h: 12 },                // passagem sul
  ];
  const rnd = seeded(2026);
  for (let gx = 4; gx < W - 6; gx += 5) {
    for (let gy = 4; gy < H - 6; gy += 5) {
      if (rnd() > 0.5) continue;
      const size = rnd() < 0.2 ? 3 : 2;
      const t = tree(gx + Math.floor(rnd() * 3), gy + Math.floor(rnd() * 3), size);
      if (keep.some((k) => overlaps(t, k)) || paths.some((pa) => overlaps(t, pa, 1)) || walls.some((w) => overlaps(t, w, 1))) continue;
      walls.push(t);
    }
  }
  return {
    id: 'map_2', name: 'Floresta', kind: 'forest', width: W, height: H, safe: false, walls,
    exits: [
      { edge: 'north', from: gateFrom, to: gateTo, map: 'map_1', shift: -VILLAGE_GATE.shift, arrive: VILLAGE_GATE.returnY },
      { edge: 'south', from: south.from, to: south.to, map: 'clareira_queimada', shift: -20, arrive: 2 },
    ],
    doors: [
      // A boca da caverna, na face sul da rocha (a que se vê): contornando a rocha e empurrando para o norte, entra.
      { x: 78.5, y: 94, w: 3, h: 0.5, dir: 'north', map: 'caverna_lodo', at: { ...CAVE_ARRIVE } },
    ],
    areas: [
      area('pebbles', 76, 33, 7, 4),                 // o chão atrás da cachoeira (onde fica a Pedra 3)
      ...paths.map((b) => area('path', b.x, b.y, b.w, b.h)),
      oval('burnt', 4, 60, 31, 24), oval('dirt', 9, 64.5, 21, 14),   // o chão queimado e o batido do acampamento
      oval('dirt', 62.5, 84.5, 35, 13.5),            // saliência do outro lado do abismo
      oval('burnt', 31, 84.5, 22, 15),               // a passagem sul já começa queimada
    ],
    deco: [
      band('drybed', DRYBED, 1.5),                   // leito seco: o riacho corria até a cachoeira
      band('stream', STREAM, STREAM_R),
      deco('signpost', 37, 11.6, 1, 1.4), deco('signpost', 43.4, 34.6, 1, 1.4),
      deco('oak_canopy', 7, 35, 14, 10), deco('roots', 9, 45, 10, 2.5),
      deco('kunai', 13, 70), deco('kunai', 21, 68.4), deco('kunai', 27.4, 72.6), deco('kunai', 19, 77),
      deco('scorch', 12.5, 67, 10, 7),                // o chão chamuscado em volta da fogueira
      deco('embers', 16, 70, 3, 2),                   // a fogueira apagada do acampamento
      deco('footprints', 63.4, 78.6, 3, 3),            // as pegadas param na beira do abismo
      deco('embers', 39, 89, 2, 1.4), deco('embers', 44, 88, 2, 1.4),
    ],
    safeZones: [],
    hunt: { x: 4, y: 18, w: 92, h: 76 },
    zones: [
      { name: 'bosque', type: 'slime', weight: 5, x: 4, y: 18, w: 92, h: 22 },
      { name: 'mata', type: 'slime', weight: 4, x: 4, y: 40, w: 56, h: 24 },
      { name: 'fundo', type: 'slime', weight: 3, x: 4, y: 64, w: 52, h: 28 },
      { name: 'leito', type: 'lodo_escuro', weight: 1, x: 62, y: 21, w: 34, h: 10 },
      { name: 'beira', type: 'lodo_escuro', weight: 2, x: 60, y: 42, w: 36, h: 38 },
    ],
  };
}

/** Onde se chega na Caverna do Lodo (logo depois da entrada, num pedaço seguro). */
const CAVE_ARRIVE = { x: 28, y: 40.4 } as const;

/** Pontos da Caverna do Lodo: o lago e o fundo (M11: "IR ATÉ o fundo"). */
export const CAVE_POI = {
  entrada: { x: 28, y: 40, r: 3 },
  lago: { x: 28, y: 10, r: 6 },
  fundo: { x: 28, y: 4.5, r: 3 },
} as const;

/**
 * Caverna do Lodo (56 x 44), do outro lado do abismo (docs/mapas.md, seção 4). A boca fica na face sul da rocha da
 * saliência: entra-se indo para o norte, então a entrada é embaixo e o fundo em cima.
 *
 *   ████████████████████████████████████
 *   █          ◇ o fundo                █
 *   █   câmara: ≈≈ lago de lodo ≈≈      █   y 2..16
 *   █ túnel ███ rocha do meio ███ túnel █   y 16..24 (oeste x 8..16, leste x 40..48)
 *   █      galeria com estalagmites  █    y 24..32
 *   ████████████[saída]████████████    túnel de entrada (x 25..31), seguro no começo
 */
function cave(): MapLayout {
  const W = 56, H = 44;
  const c = (x: number, y: number, w: number, h: number) => wall('cave', x, y, w, h);
  const walls: Wall[] = [
    c(0, 0, W, 2), c(0, H - 1.4, W, 1.4), c(0, 2, 2, H - 3.4), c(W - 2, 2, 2, H - 3.4),
    c(2, 32, 23, 10.6), c(31, 32, 23, 10.6),       // o túnel de entrada fica entre as duas massas
    c(2, 24, 5, 8), c(49, 24, 5, 8),               // a galeria vai de x 7 a 49
    c(2, 16, 6, 8), c(16, 16, 24, 8), c(48, 16, 6, 8),   // dois túneis sobem (oeste e leste)
    c(14, 27, 2, 2), c(38, 28, 2, 2),              // estalagmites grandes na galeria
    c(7, 10, 2, 2), c(47, 8, 2, 2),                // e na câmara
    wall('pool', 19, 7, 18, 6),                    // o lago de lodo: ninguém entra
  ];
  return {
    id: 'caverna_lodo', name: 'Caverna do Lodo', kind: 'cave', width: W, height: H, safe: false, walls,
    exits: [],
    doors: [{ x: 26.5, y: 42, w: 3, h: 0.6, dir: 'south', map: 'map_2', at: { x: 80, y: 95.8 } }],
    areas: [area('cave', 0, 0, W, H), area('lodo', 19, 7, 18, 6)],
    deco: [
      deco('stalagmite', 10, 29.2, 1, 1.4), deco('stalagmite', 44, 26.6, 1, 1.4), deco('stalagmite', 30, 17.6, 1, 1.4),
      deco('stalagmite', 12, 3.6, 1, 1.4), deco('stalagmite', 43, 3.2, 1, 1.4),
      deco('bones', 26.5, 3.8, 2, 1), deco('roots', 24, 2, 8, 1.4),
    ],
    safeZones: [{ x: 24, y: 37.6, w: 8, h: 5 }],     // quem chega não apanha na hora
    hunt: { x: 7, y: 2, w: 42, h: 30 },
    huntType: 'lodo_escuro',
    zones: [{ name: 'caverna', type: 'lodo_escuro', weight: 1, x: 7, y: 2, w: 42, h: 30 }],
  };
}

/** Pontos da Clareira Queimada: a Pedra 4 no meio da arena do chefe. */
export const CLEARING_POI = { pedra4: { x: 22, y: 18, r: 3 }, arena: { x: 22, y: 20, r: 12 } } as const;

/**
 * Clareira Queimada (44 x 40): o coração da Floresta, arena do chefe do Arco 1 (docs/mapas.md, seção 5). Árvores
 * mortas em volta, chão queimado e a Pedra-Selo 4 no meio. Sem coluna no meio: o chefe tem ataque em área.
 * Entrada pelo norte (x 18..26), que é a passagem sul da Floresta.
 */
function burnedClearing(): MapLayout {
  const W = 44, H = 40;
  const d = (x: number, y: number, w: number, h: number) => wall('deadtree', x, y, w, h);
  const walls: Wall[] = [
    d(0, 0, 18, 4), d(26, 0, 18, 4), d(0, 4, 5, 32), d(39, 4, 5, 32), d(0, 36, W, 4),
    d(5, 4, 6, 4), d(33, 4, 6, 4), d(5, 30, 5, 6), d(34, 30, 5, 6),   // cantos: a arena fica redonda
    wall('seal', 21, 17, 2, 2, 'lit'),
  ];
  return {
    id: 'clareira_queimada', name: 'Clareira Queimada', kind: 'forest', width: W, height: H, safe: false, walls,
    exits: [{ edge: 'north', from: 18, to: 26, map: 'map_2', shift: 20, arrive: 97 }],
    doors: [],
    areas: [area('burnt', 0, 0, W, H)],
    deco: [deco('scorch', 11, 9, 22, 19), deco('embers', 10, 12, 2, 1.4), deco('embers', 30, 24, 2, 1.4), deco('embers', 16, 28, 2, 1.4), deco('embers', 28, 9, 2, 1.4)],
    safeZones: [],
  };
}

/**
 * Poço sob a Praça (24 x 20): a cisterna debaixo da Vila (docs/mapas.md, seção 6). Desce-se pela escada do poço da
 * Praça (a tampa fica lacrada até a história abrir). Canal de água com uma ponte e, no fundo, a porta lacrada da
 * Quinta Pedra (Arco 2).
 */
function well(): MapLayout {
  const W = 24, H = 20;
  const walls: Wall[] = [
    wall('wall', 0, 0, W, 2), wall('wall', 0, 2, 1, H - 2), wall('wall', W - 1, 2, 1, H - 2),
    wall('wall', 0, H - 2, 10, 2), wall('wall', 14, H - 2, 10, 2), wall('gate', 10, H - 2, 4, 2),   // a porta lacrada
    wall('water', 1, 8, 10, 2), wall('water', 13, 8, 10, 2),                                          // canal (ponte no meio)
  ];
  return {
    id: 'poco', name: 'Poço sob a Praça', kind: 'cave', width: W, height: H, safe: false, walls,
    exits: [],
    doors: [],
    areas: [area('stone', 0, 0, W, H), area('water', 1, 8, 10, 2), area('water', 13, 8, 10, 2), area('bridge', 11, 8, 2, 2)],
    deco: [deco('ladder', 11, 2, 2, 2)],
    safeZones: [],
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
    doors: [{ ...ROOM.exit, dir: 'south', map: 'map_1', at: { ...back }, toBack: true }],
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
  doors.push({ x: 54.5, y: H - 1.6, w: 3, h: 1.6, dir: 'south', map: 'map_1', at: shopDoor(ACADEMY.building).outside, step: 4, toBack: true });
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

/**
 * Zona de Conflito (110 x 80): planalto de pedra solta, com mesas de rocha e árvores secas espalhadas e uma ruína no
 * meio (pilares que servem de cobertura). PvP livre (menos aliados) e monstros mais fortes (lodo sombrio). Cada vila e
 * os renegados têm um ACAMPAMENTO na borda (zona segura onde se chega pelo Posto de Viagem, com o Posto para voltar).
 *
 *   Folha ──────────── Pedra ──────────── Névoa
 *     │                  ruína               │
 *   Nuvem ──────────── Renegados ────────── Areia
 */
export const CONFLICT = {
  width: 110, height: 80,
  camps: [
    { who: 'vila_1', x: 4, y: 4 }, { who: 'vila_2', x: 50, y: 3 }, { who: 'vila_3', x: 96, y: 4 },
    { who: 'vila_4', x: 4, y: 68 }, { who: 'vila_5', x: 96, y: 68 }, { who: 'renegados', x: 50, y: 69 },
  ] as const,
  camp: { w: 10, h: 8 },
  ruin: { x: 47, y: 32, w: 16, h: 16 },
} as const;
export type CampOwner = (typeof CONFLICT.camps)[number]['who'];

/** Acampamento de quem chega: a área (zona segura), onde se chega e onde fica o Posto de Viagem. */
export function conflictCamp(who: CampOwner): { box: Box; arrive: { x: number; y: number }; post: { x: number; y: number } } {
  const c = CONFLICT.camps.find((k) => k.who === who)!;
  const { w, h } = CONFLICT.camp;
  return { box: { x: c.x, y: c.y, w, h }, arrive: { x: c.x + w / 2, y: c.y + h / 2 + 1 }, post: { x: c.x + 2, y: c.y + 2 } };
}

function conflictZone(): MapLayout {
  const { width: W, height: H } = CONFLICT;
  const walls: Wall[] = [
    wall('rock', 0, 0, W, 2), wall('rock', 0, H - 2, W, 2), wall('rock', 0, 2, 2, H - 4), wall('rock', W - 2, 2, 2, H - 4),
  ];
  const camps = CONFLICT.camps.map((c) => conflictCamp(c.who).box);
  const ruin = CONFLICT.ruin;
  // A ruína do meio: quatro pilares nos cantos e dois no meio dos lados (sobra espaço entre eles para passar).
  for (const [px, py] of [[0, 0], [14, 0], [0, 14], [14, 14], [7, 0], [7, 14], [0, 7], [14, 7]] as const) {
    walls.push(wall('pillar', ruin.x + px, ruin.y + py, 2, 2));
  }
  const rnd = seeded(7077);
  for (let gx = 6; gx < W - 8; gx += 7) {
    for (let gy = 6; gy < H - 8; gy += 7) {
      if (rnd() > 0.5) continue;
      const big = rnd() < 0.35;
      const t: Wall = big
        ? wall('rock', gx + Math.floor(rnd() * 3), gy + Math.floor(rnd() * 3), 3 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 2))
        : wall('tree', gx + Math.floor(rnd() * 4), gy + Math.floor(rnd() * 4), 2, 2);
      if (camps.some((c) => overlaps(t, c, 3)) || overlaps(t, ruin, 2) || walls.some((w) => overlaps(t, w, 1))) continue;
      walls.push(t);
    }
  }
  const decos: Deco[] = [];
  for (const c of CONFLICT.camps) {
    const { box } = conflictCamp(c.who);
    decos.push(deco('banner', box.x + box.w - 2, box.y + 1), deco('fire', box.x + box.w / 2 - 0.5, box.y + box.h / 2 - 1.5));
  }
  decos.push(deco('bones', 30, 40, 2, 1), deco('bones', 80, 22, 2, 1), deco('bones', 72, 58, 2, 1));
  return {
    id: 'zona_conflito', name: 'Zona de Conflito', kind: 'wild', theme: 'conflito', conflict: true, width: W, height: H, safe: false, walls,
    exits: [], doors: [],
    areas: [
      ...camps.map((c) => area('ash', c.x, c.y, c.w, c.h)),
      area('stone', ruin.x + 2, ruin.y + 2, ruin.w - 2, ruin.h - 2),
    ],
    deco: decos,
    safeZones: camps,
    hunt: { x: 4, y: 14, w: W - 8, h: H - 28 },
    huntType: 'lodo_sombrio',
  };
}

/**
 * Refúgio dos Renegados (48 x 40): acampamento escondido entre rochas, com cinzas no chão, barracas, uma fogueira, a
 * Armaria e a Casa dos Pergaminhos dos renegados (as mesmas salas das vilas) e o Posto de Viagem. Só renegado entra.
 * Inteiro seguro (é a casa deles).
 */
export const REFUGE = {
  width: 48, height: 40,
  spawn: { x: 24, y: 28 },
  post: { x: 20, y: 31 },
  weapons: { x: 6, y: 5, w: 10, h: 7 },
  scrolls: { x: 32, y: 5, w: 10, h: 7 },
} as const;

function refuge(): MapLayout {
  const { width: W, height: H } = REFUGE;
  const walls: Wall[] = [
    wall('rock', 0, 0, W, 3), wall('rock', 0, H - 2, W, 2), wall('rock', 0, 3, 2, H - 5), wall('rock', W - 2, 3, 2, H - 5),
    wall('house', REFUGE.weapons.x, REFUGE.weapons.y, REFUGE.weapons.w, REFUGE.weapons.h, 'shop_weapon'),
    wall('house', REFUGE.scrolls.x, REFUGE.scrolls.y, REFUGE.scrolls.w, REFUGE.scrolls.h, 'shop_scroll'),
    wall('house', 4, 22, 6, 5, 'hut'), wall('house', 38, 22, 6, 5, 'hut'), wall('house', 5, 31, 5, 4, 'hut'),
    tree(14, 33), tree(42, 32), wall('rock', 20, 15, 3, 2),
  ];
  const doors: Door[] = [];
  const decos: Deco[] = [deco('fire', 23, 22, 2, 2), deco('bones', 30, 33, 2, 1), deco('bones', 12, 18, 2, 1)];
  for (const [b, map] of [[REFUGE.weapons, 'interior_weapons'], [REFUGE.scrolls, 'interior_scrolls']] as const) {
    const { door, outside } = shopDoor(b);
    decos.push(deco('mat', door.x + 0.5, door.y, 2, 0.6));
    doors.push({ ...door, dir: 'north', map, at: { ...ROOM.arrive }, back: { ...outside } });
  }
  return {
    id: 'refugio', name: 'Refúgio dos Renegados', kind: 'wild', theme: 'refugio', refuge: true, width: W, height: H, safe: true, walls,
    exits: [], doors,
    areas: [area('ash', 2, 3, W - 4, H - 5), area('path', 21, 12, 6, 20)],
    deco: decos,
    safeZones: [{ x: 0, y: 0, w: W, h: H }],
  };
}

/** Todos os mapas, por id. */
export function buildMaps(): Record<MapId, MapLayout> {
  const [weapons, clothes, scrolls] = SHOPS;
  return {
    map_1: village(VILLAGE_MAPS[0]), map_2: forest(),
    vila_pedra: village(VILLAGE_MAPS[1]), vila_nevoa: village(VILLAGE_MAPS[2]), vila_nuvem: village(VILLAGE_MAPS[3]), vila_areia: village(VILLAGE_MAPS[4]),
    zona_conflito: conflictZone(), refugio: refuge(),
    caverna_lodo: cave(), clareira_queimada: burnedClearing(), poco: well(),
    interior_weapons: interior(weapons), interior_clothes: interior(clothes), interior_scrolls: interior(scrolls),
    academy_interior: academy(),
  };
}

export const WORLD_MAPS: Readonly<Record<MapId, MapLayout>> = buildMaps();

/** O ponto está numa zona segura do mapa? (posição do SERVIDOR) */
export function inSafeZone(layout: MapLayout, x: number, y: number): boolean {
  return layout.safeZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

/** A arena em que o ponto está (dentro da cerca), se houver. */
export function arenaAt(layout: MapLayout, x: number, y: number): Arena | undefined {
  return layout.arenas?.find((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);
}
