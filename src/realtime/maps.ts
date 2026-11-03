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
 *   poco               24 x 18  o Poço sob a Praça; tampa LACRADA até a história abrir
 *   interior_weapons / interior_clothes / interior_scrolls   salas das lojas: balcão e o lojista atrás
 *                              dele, porta de saída embaixo (Armaria e Pergaminhos 17 x 13 em imagem; Alfaiataria 15 x 15)
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
  | 'vila_nevoa' | 'vila_nuvem' | 'vila_areia' | 'zona_conflito' | 'refugio'
  | 'caverna_lodo' | 'clareira_queimada' | 'poco' | 'vale_estatuas';
/** Tema de cores do mapa (chão, telhados e enfeites; ver public/mapArt.js). */
export type MapTheme = 'folha' | 'nevoa' | 'nuvem' | 'areia' | 'conflito' | 'refugio';
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
    | 'arena'
    // árvore cerejeira (copa rosa, nos gramados da vila) e a montanha atrás da sede (paredão com mata em cima)
    | 'sakura' | 'mountain';
}

/**
 * Chão pintado (só desenho): stone = pedra clara, grass, sand, water, bridge, path (terra), wood (assoalho), arena
 * (terra batida), dirt (chão de pedra solta da Zona de Conflito), ash (cinzas do Refúgio), cave (chão de caverna),
 * burnt (grama queimada), pebbles (seixos do leito seco), lodo (o lago de lodo, embaixo da parede `pool`).
 */
export interface Area extends Box {
  g: 'stone' | 'grass' | 'sand' | 'water' | 'bridge' | 'path' | 'wood' | 'arena' | 'dirt' | 'ash' | 'cave' | 'burnt' | 'pebbles' | 'lodo'
    // trilha da Floresta: o chão é a grama; a trilha curva vem do enfeite 'trail' (aqui só não nasce mato em cima)
    | 'trail';
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
    | 'stream' | 'drybed' | 'trail'
    // o que sobrou no Acampamento Queimado: caixote quebrado, panela no tripé, esteira e um pergaminho caído
    | 'crate' | 'pot' | 'bedroll' | 'scroll_drop'
    // vila: lanterna de pedra (tōrō, acende de noite) e vaso de flores; bandeira da Vila da Nuvem
    | 'toro' | 'planter' | 'flag';
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
  /** v29: a arena do modo rankeado (Vale das Estátuas): só lutam os dois da partida da fila. */
  ranked?: boolean;
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
  /** v29: o Vale das Estátuas (modo rankeado): sem clima, PvP só na arena e só entre os dois da partida. */
  ranked?: boolean;
  conflict?: boolean;
  /** Tema de cores (desenho). */
  theme?: MapTheme;
  /**
   * Arte do mapa em imagem: o chão, as paredes e os enfeites vêm de public/mapas/<art>/ (blocos de 8 x 8 casas, feitos
   * por arte/mapas/fatiar.py) e o cliente não desenha nada por código nele. As paredes daqui só dão a colisão e
   * precisam seguir o desenho (confira com arte/mapas/sobrepor.py).
   */
  art?: string;
  /**
   * Saltos com o Teleporte (abismo largo demais para o alcance): usando o Teleporte dentro de `from`, virado para
   * `dir`, chega em `to`.
   */
  leaps?: { from: Box; dir: { x: number; y: number }; to: { x: number; y: number } }[];
  /** Tochas e lanternas desenhadas na arte (o ponto da chama): o cliente acende a luz delas de noite e na caverna. */
  lights?: { x: number; y: number }[];
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
  /** Monstros fixos (bonecos, chefes): renascem no mesmo ponto. `zone` = de onde ele não sai (o salão do chefe). */
  spawns?: { type: string; x: number; y: number; zone?: Box }[];
  /** Campos que drenam chakra de quem está dentro (Sala de Controle da Academia), por segundo. */
  fields?: (Box & { chakraPerSec: number })[];
}

const wall = (k: Wall['k'], x: number, y: number, w: number, h: number, s?: Wall['s']): Wall => (s ? { x, y, w, h, k, s } : { x, y, w, h, k });
const tree = (x: number, y: number, size = 2): Wall => wall('tree', x, y, size, size);
const sakura = (x: number, y: number, size = 2): Wall => wall('tree', x, y, size, size, 'sakura');
const area = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g });
const oval = (g: Area['g'], x: number, y: number, w: number, h: number): Area => ({ x, y, w, h, g, shape: 'oval' });
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
  w: 15, h: 15, doorFrom: 6, doorTo: 9, counterY: 6, npc: { x: 7.5, y: 4.6 }, front: { x: 7.5, y: 7.7 }, arrive: { x: 7.5, y: 12.8 },
  exit: { x: 5.5, y: 13.4, w: 4, h: 1.6 },
} as const;

type Point = { x: number; y: number };

/** O que o resto do jogo precisa saber da sala de uma loja: tamanho, lojista, frente do balcão, chegada e saída. */
export interface ShopRoom {
  w: number;
  h: number;
  /** O lojista, atrás do balcão. */
  npc: Point;
  /** Na frente do balcão, encostado: daqui se fala com ele. */
  front: Point;
  /** Onde se chega vindo da vila (fora da porta de saída). */
  arrive: Point;
  /** A porta de saída: empurrando para baixo dentro dela, volta para a vila. */
  exit: Box;
}

/**
 * Lojas com a sala em imagem (arte/mapas/referencia_*.jpg, docs/mapas.md 6.1): 17 x 13 casas, a proporção da
 * imagem. As paredes seguem o desenho (o balcão, as estantes e os móveis) e só dão colisão.
 */
const SHOP_ART: Partial<Record<ShopKind, ShopRoom & { art: string; walls: Wall[]; lights: Point[] }>> = {
  // Armaria: balcão em U encostado na parede das espadas (o ferreiro fica dentro do U), lanças à esquerda, escudos à
  // direita, barril no canto e a porta no meio da parede de baixo, com o capacho do lado de fora.
  weapons: {
    w: 17, h: 13, art: 'armaria', npc: { x: 8.5, y: 5 }, front: { x: 8.5, y: 7.9 }, arrive: { x: 8.5, y: 8.7 },
    exit: { x: 7.2, y: 10.2, w: 2.65, h: 2.8 },
    walls: [
      wall('iwall', 0, 0, 17, 2.9),                                            // parede das espadas
      wall('iwall', 0, 2.9, 0.85, 8.3), wall('iwall', 16.15, 2.9, 0.85, 8.3),
      wall('iwall', 0, 11.2, 7.2, 1.8), wall('iwall', 9.85, 11.2, 7.15, 1.8),  // parede de baixo (a porta no meio)
      wall('counter', 4.45, 5.8, 8.05, 1.7),                                   // balcão
      wall('counter', 4.45, 2.9, 1.35, 2.9), wall('counter', 11.2, 2.9, 1.3, 2.9),
      wall('furniture', 0.85, 3.4, 1, 5.5, 'spear_rack'), wall('furniture', 15.2, 3.7, 0.95, 5.2, 'shield_rack'),
      wall('furniture', 0.9, 9.1, 1.65, 1.9, 'barrel'),
    ],
    lights: [{ x: 2.27, y: 1.64 }, { x: 14.73, y: 1.64 }],
  },
  // Casa dos Pergaminhos: estantes na parede do fundo e um balcão comprido de lado a lado (o sábio fica atrás dele),
  // estantes estreitas nas laterais, a mesa de pergaminhos no canto e a porta no meio da parede de baixo.
  scrolls: {
    w: 17, h: 13, art: 'pergaminhos', npc: { x: 8.5, y: 4.1 }, front: { x: 8.5, y: 6.3 }, arrive: { x: 8.5, y: 10.3 },
    exit: { x: 7.2, y: 11.2, w: 2.6, h: 1.8 },
    walls: [
      wall('counter', 0, 0, 17, 5.9),                                          // estantes e o balcão comprido
      wall('iwall', 0, 5.9, 1.5, 7.1), wall('iwall', 15.5, 5.9, 1.5, 7.1),      // laterais (com as estantes estreitas)
      wall('iwall', 0, 11.8, 7.55, 1.2), wall('iwall', 9.45, 11.8, 7.55, 1.2),  // parede de baixo (a porta no meio)
      wall('furniture', 11.8, 9.5, 3.5, 2.3, 'scroll_table'),
    ],
    lights: [
      { x: 0.95, y: 1.15 }, { x: 8.48, y: 1.15 }, { x: 15.97, y: 1.15 },
      { x: 0.45, y: 2.95 }, { x: 16.55, y: 2.95 }, { x: 0.45, y: 8.1 }, { x: 16.55, y: 8.1 },
    ],
  },
};

/** A sala da loja: a planta da imagem, ou a sala 15 x 15 desenhada por código (ROOM). */
export function shopRoom(shop: ShopKind): ShopRoom {
  return SHOP_ART[shop] ?? ROOM;
}

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
  { id: 'vila_nevoa', name: 'Vila da Névoa', village: 'vila_3', theme: 'nevoa', gate: false },
  { id: 'vila_nuvem', name: 'Vila da Nuvem', village: 'vila_4', theme: 'nuvem', gate: false },
  { id: 'vila_areia', name: 'Vila da Areia', village: 'vila_5', theme: 'areia', gate: false },
];

/** Posto de Viagem de cada vila: dentro da praça, perto do portão. */
export const TRAVEL_POST = { x: 36.5, y: 73.5 } as const;

/**
 * Planta de uma vila: o que o resto do jogo precisa saber de onde as coisas ficam. As vilas desenhadas por código
 * usam todas a mesma (`BASE_PLAN`); cada vila em imagem tem a sua, medida no desenho.
 */
export interface VillagePlan {
  w: number;
  h: number;
  /** Onde se aparece ao conectar e se renasce (na frente da sede). */
  spawn: Point;
  /** O Mestre (Sala de Missões), na diagonal do renascimento. */
  sensei: Point;
  /** A praça (fim do tutorial). */
  plaza: Point;
  /** O Posto de Viagem (quem chega de viagem aparece 2,5 casas à direita e 1,5 acima dele). */
  travel: Point;
  /** O portão sul: o trecho por onde se passa para a Floresta e onde se chega voltando dela. */
  gate: { from: number; to: number; returnY: number };
  /** O prédio de cada loja e da Academia: a porta fica no meio da fachada, embaixo (`shopDoor`). */
  shops: Record<ShopKind, Box>;
  academy: Box;
  /** A área de luta da arena (dentro da cerca) e onde renasce quem perde (fora, na entrada). */
  arena: { fight: Box; respawn: Point };
  /** Zonas sem combate (a praça). */
  safe: Box[];
  /** Arco 1: o poço da praça (lacrado; leva ao Poço) e a grade onde o rio passa sob a muralha (M2). */
  well: Box;
  grate: Box;
}

/** Vila em imagem: a planta, a pasta da arte, as paredes (só colisão), as luzes do desenho e o chão (minimapa). */
interface VillageArt {
  art: string;
  plan: VillagePlan;
  walls: Wall[];
  lights: Point[];
  areas: Area[];
}

/**
 * Árvore da arte, pela caixa da copa: bloqueia o tronco e a parte de baixo da copa (60% da largura, 55% de baixo da
 * altura). Entre duas árvores vizinhas sobra passagem, e quem passa atrás de uma pisa na beirada de cima da copa.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const crown = (x: number, y: number, w: number, h: number, s?: 'sakura'): Wall =>
  wall('tree', r2(x + w * 0.2), r2(y + h * 0.45), r2(w * 0.6), r2(h * 0.55), s);

/**
 * Vila da Folha em imagem (arte/vilas/referencia_folha.jpg, ampliada 4x com o Real-ESRGAN): 78 x 60 casas, a
 * proporção do desenho. Montanha e sede em cima, hospital à esquerda, Academia à direita, o rio de lado a lado com
 * três pontes e um braço que desce pela esquerda, as três lojas no meio, a praça com o poço embaixo, a arena à direita
 * e o portão no meio da muralha de baixo. Árvores e prédios bloqueiam inteiros (copa e telhado): ninguém passa "atrás"
 * deles, porque o desenho não tem camada por cima do jogador.
 */
const FOLHA_ART: VillageArt = {
  art: 'folha',
  plan: {
    w: 78, h: 60,
    spawn: { x: 38, y: 24.4 }, sensei: { x: 40, y: 23.4 }, plaza: { x: 38, y: 45 }, travel: { x: 37, y: 51.5 },
    gate: { from: 36.5, to: 41.4, returnY: 57 },
    shops: { weapons: { x: 24.6, y: 29.4, w: 7, h: 5.6 }, clothes: { x: 46.4, y: 29.4, w: 6.8, h: 5.5 }, scrolls: { x: 58.5, y: 29.4, w: 6.5, h: 5.6 } },
    academy: { x: 50.1, y: 10.2, w: 14.5, h: 11.6 },
    arena: { fight: { x: 58.8, y: 41.5, w: 15.4, h: 11.1 }, respawn: { x: 56.6, y: 47.4 } },
    safe: [{ x: 22.3, y: 38, w: 33.4, h: 16.7 }],
    well: { x: 47.3, y: 43.8, w: 3.1, h: 3 }, grate: { x: 11.2, y: 49.4, w: 5.1, h: 3.4 },
  },
  walls: [
    // Muralha e o portão (as duas folhas abertas).
    wall('wall', 0, 0, 78, 5.5), wall('wall', 0, 5.5, 1.5, 49.2), wall('wall', 76.5, 5.5, 1.5, 49.2),
    wall('wall', 0, 54.7, 34.1, 5.3), wall('wall', 43.9, 54.7, 34.1, 5.3),
    wall('gatepost', 34.1, 55.4, 2.15, 4.6), wall('gatepost', 41.6, 55.3, 2.3, 4.7),
    // Montanha atrás da sede.
    wall('rock', 19.5, 5.5, 39, 2), wall('rock', 22, 7.5, 10, 2), wall('rock', 46.5, 7.5, 12, 4.3),
    // Prédios: sede, hospital, Academia, casas e as lojas.
    wall('house', 31.1, 5.5, 15.5, 15, 'leader'), wall('house', 18.7, 10.6, 9.1, 10.2, 'hospital'), wall('house', 50.1, 10.2, 14.5, 11.6, 'academy'),
    wall('house', 3.2, 6.5, 5.5, 14.3, 'home'), wall('house', 10.5, 5.8, 5.8, 4.9, 'hut'),
    wall('house', 62.6, 5.8, 6.65, 5.3, 'home'), wall('house', 69.25, 6.8, 5.55, 7.2, 'home'), wall('house', 70, 14, 5, 7, 'home'),
    wall('house', 2.9, 29.4, 5.6, 7.35, 'home'), wall('house', 2.9, 40, 6.7, 7.3, 'home'),
    wall('house', 24.6, 29.4, 7, 5.6, 'shop_weapon'), wall('house', 46.4, 29.4, 6.8, 5.5, 'shop_cloth'), wall('house', 58.5, 29.4, 6.5, 5.6, 'shop_scroll'),
    // Árvores, pela caixa da copa (crown: só o tronco e a parte de baixo bloqueiam).
    crown(1.8, 3.2, 3.5, 4.8), crown(5, 3, 4, 4.8), crown(17.5, 6, 4.5, 5.8), crown(14.5, 15.2, 4.2, 5.8), crown(24.5, 8.2, 4, 2.4),
    crown(27.5, 8.6, 3.5, 5), crown(28, 17.2, 4, 5.6), crown(2, 20.3, 4.3, 5.9), crown(6.3, 20.5, 4.3, 5.8), crown(10.7, 21, 4.7, 5.3),
    crown(46.6, 8.2, 4.3, 7.5), crown(46, 17.1, 4.7, 5.4), crown(58, 7.5, 3.9, 4.3), crown(59.9, 2.7, 4.2, 5.5), crown(63, 17.1, 4.6, 5.4),
    crown(70.3, 3, 4.7, 5.5), crown(71.6, 20.9, 4.4, 5.1),
    crown(6.8, 28, 4.4, 5.2), crown(1.4, 37.5, 3.6, 5.1), crown(16.25, 32.5, 4.65, 5.7), crown(16.25, 42.3, 4.65, 5.5),
    crown(1.5, 49.5, 4, 5.2), crown(4.6, 51, 4.3, 4), crown(16.7, 50.5, 3.7, 4.2), crown(22, 51, 4.6, 3.7), crown(71.4, 28.5, 5.1, 11.3),
    crown(52, 50.5, 3.6, 4.2),
    crown(19.5, 28.4, 4.8, 5.3, 'sakura'), crown(32.1, 28.9, 4.7, 5.35, 'sakura'), crown(41.2, 28.9, 4.3, 5.5, 'sakura'),   // cerejeiras
    crown(53.5, 28.4, 4.1, 5.5, 'sakura'), crown(29.5, 51.5, 4.7, 3.5, 'sakura'), crown(43.2, 51.5, 5, 3.5, 'sakura'),
    // O rio (com as três pontes de cima e a ponte do braço da esquerda) e a grade onde ele passa sob a muralha.
    wall('water', 1.5, 26.9, 15.3, 2.4), wall('water', 20.1, 26.9, 16.5, 2.4), wall('water', 41.8, 26.9, 25.6, 2.4), wall('water', 70.9, 26.9, 5.6, 2.4),
    wall('water', 11.9, 29.3, 3.7, 8.9), wall('water', 11.9, 42.1, 3.7, 12.6),
    // Miúdos: caixotes, barris, postes, placas, pedras e as lanternas da sede.
    wall('furniture', 9.6, 9.3, 1.1, 1.3, 'barrel'), wall('furniture', 16.2, 9.3, 0.8, 1.3, 'barrel'), wall('furniture', 2.3, 12.5, 1.3, 1.7, 'barrel'),
    wall('furniture', 8.6, 13.4, 0.8, 2), wall('furniture', 18.8, 20.8, 2.5, 1.9),
    wall('furniture', 32.8, 20.5, 1, 2.1), wall('furniture', 34.8, 20.5, 1.1, 2.1), wall('furniture', 41.9, 20.5, 1.1, 2), wall('furniture', 44.3, 20.5, 0.8, 2.1),
    wall('furniture', 67.8, 10.8, 1.7, 3.8), wall('rock', 64.5, 15.5, 2.1, 1.5), wall('furniture', 68.4, 19.1, 1.2, 1.4),
    wall('furniture', 8.4, 34.8, 1.4, 2.4), wall('furniture', 9.6, 44.7, 1.4, 2, 'barrel'), wall('furniture', 2.4, 46.4, 1.5, 2.2), wall('rock', 9.6, 33.4, 1.1, 1.2),
    wall('furniture', 23.6, 32, 1, 3), wall('furniture', 31.6, 33, 1.2, 1.4, 'barrel'),
    wall('furniture', 53.2, 32.3, 1.3, 2.6), wall('furniture', 45.2, 33.6, 0.9, 1.4), wall('furniture', 57.2, 33.7, 1.4, 1.8),
    wall('furniture', 65.3, 33.2, 1.5, 1.8), wall('rock', 65.6, 30.8, 1.4, 1.2),
    // Praça: vasos, bancos, lanternas de pedra e o poço.
    wall('furniture', 25.2, 39.2, 1.4, 4.1), wall('furniture', 27, 38.9, 1.6, 2.4), wall('furniture', 28.9, 39.4, 4, 2.4), wall('furniture', 33.4, 38, 1.4, 3.4),
    wall('furniture', 25.2, 48.8, 1.4, 2.4), wall('furniture', 27, 48.5, 1.6, 2.7), wall('furniture', 28.9, 49.4, 4, 1.8), wall('furniture', 33.4, 48.4, 1.4, 3),
    wall('furniture', 34.8, 52.2, 1, 1),
    wall('furniture', 43.2, 38.1, 1.4, 2.9), wall('furniture', 45.1, 39.4, 3.9, 2.4), wall('furniture', 49.4, 38.8, 1.6, 2.7), wall('furniture', 51.3, 39.2, 1.7, 3.9),
    wall('furniture', 43.2, 48.3, 1.4, 3), wall('furniture', 45.1, 49.4, 3.9, 1.8), wall('furniture', 49.4, 48.6, 1.6, 2.7), wall('furniture', 51.3, 48.9, 1.5, 2.1),
    wall('rock', 47.3, 43.8, 3.1, 3),
    // Arena: cerca (entrada só pela esquerda), os estandartes de cima e os quatro pilares de pedra.
    wall('fence', 58.2, 40.3, 16.6, 1.2), wall('fence', 58.2, 41.5, 0.6, 4.9), wall('fence', 58.2, 48.4, 0.6, 5.2),
    wall('fence', 58.2, 52.6, 16.6, 1), wall('fence', 74.2, 40.3, 0.6, 13.3), wall('furniture', 61.8, 41.5, 10.4, 1.9),
    wall('pillar', 60, 41.3, 1.6, 3.5, 'arena'), wall('pillar', 71.6, 41.3, 1.7, 3.5, 'arena'),
    wall('pillar', 60, 48.8, 1.6, 3.6, 'arena'), wall('pillar', 71.6, 48.8, 1.7, 3.6, 'arena'),
  ],
  lights: [
    { x: 33.3, y: 20.6 }, { x: 35.3, y: 20.6 }, { x: 42.4, y: 20.3 }, { x: 44.7, y: 20.7 },
    { x: 9, y: 13.6 }, { x: 68.2, y: 11 }, { x: 69, y: 12.7 }, { x: 8.9, y: 35.2 },
    { x: 34.1, y: 38.3 }, { x: 34.1, y: 48.6 }, { x: 43.9, y: 38.4 }, { x: 43.9, y: 48.6 },
  ],
  areas: [
    area('grass', 0, 0, 78, 60), area('path', 16, 22.5, 60, 4.4), area('path', 20, 35, 52, 3), area('stone', 22.3, 38, 33.4, 14.6),
    area('arena', 58.8, 41.5, 15.4, 11.1), area('water', 1.5, 26.9, 75, 2.4), area('water', 11.9, 29.3, 3.7, 25.4),
    area('bridge', 16.8, 26.9, 3.3, 2.4), area('bridge', 36.6, 26.9, 5.2, 2.4), area('bridge', 67.4, 26.9, 3.5, 2.4), area('bridge', 11.1, 38.2, 5.3, 3.9),
  ],
};

/**
 * Outra vila desenhada sobre a planta da Folha: a IA partiu do mesmo desenho, então tudo fica no mesmo lugar a menos de
 * uma escala e um deslocamento (medidos casando milhares de pontos das duas imagens: arte/mapas/alinhar.py). A planta e
 * as paredes da Folha passam pela conta; `drop` tira o que a outra vila não tem e `add` põe o que só ela tem (já em
 * casas dela).
 */
function retrace(base: VillageArt, art: string, m: { sx: number; ox: number; sy: number; oy: number }, size: { w: number; h: number },
  drop: (w: Wall) => boolean, add: Wall[], lights: Point[] = []): VillageArt {
  const X = (x: number) => r2(m.sx * x + m.ox), Y = (y: number) => r2(m.sy * y + m.oy);
  const pt = (p: Point): Point => ({ x: X(p.x), y: Y(p.y) });
  const box = <T extends Box>(b: T): T => ({ ...b, x: X(b.x), y: Y(b.y), w: r2(m.sx * b.w), h: r2(m.sy * b.h) });
  const P = base.plan;
  return {
    art,
    plan: {
      ...size, spawn: pt(P.spawn), sensei: pt(P.sensei), plaza: pt(P.plaza), travel: pt(P.travel),
      gate: { from: X(P.gate.from), to: X(P.gate.to), returnY: Y(P.gate.returnY) },
      shops: { weapons: box(P.shops.weapons), clothes: box(P.shops.clothes), scrolls: box(P.shops.scrolls) },
      academy: box(P.academy), arena: { fight: box(P.arena.fight), respawn: pt(P.arena.respawn) },
      safe: P.safe.map(box), well: box(P.well), grate: box(P.grate),
    },
    walls: [...base.walls.filter((w) => !drop(w)).map(box), ...add],
    lights: [...base.lights.map(pt), ...lights],
    areas: base.areas.map(box),
  };
}

/** Bambuzal (Névoa): bloqueia a moita inteira menos o topo das hastes. */
const bamboo = (x: number, y: number, w: number, h: number): Wall => wall('tree', x, r2(y + h * 0.3), w, r2(h * 0.7));

/**
 * Vila da Névoa (arte/vilas/referencia_nevoa.jpg, ampliada): a planta da Folha, 80 x 60, com bambuzais no lugar das
 * cerejeiras, mais bambu na beira do rio e no pé da praça, e poças (só desenho).
 */
const NEVOA_ART = retrace(FOLHA_ART, 'nevoa', { sx: 0.9875, ox: 1.49, sy: 0.994, oy: 0 }, { w: 80, h: 60 },
  (w) => w.s === 'sakura',
  [
    bamboo(21.4, 28, 3.4, 6.4), bamboo(33.6, 28, 3.8, 7.2), bamboo(42.4, 28, 4.3, 6.8), bamboo(55, 28, 3.8, 6.8),   // entre as lojas
    bamboo(3.4, 37.2, 1.2, 8.8), bamboo(8.2, 37.7, 4, 6.8), bamboo(10.3, 50.5, 2.5, 4.2),                            // à esquerda do rio
    bamboo(21.1, 48.6, 3.1, 5.4), bamboo(28.5, 49.6, 7.5, 5), bamboo(43.9, 48.8, 8.7, 5.6), bamboo(55.8, 48.8, 3, 5),  // pé da praça
  ]);

/** Vila da Nuvem (arte/vilas/referencia_nuvem.jpg, ampliada): a planta da Folha no mesmo lugar, com os mastros das bandeiras da praça. */
const NUVEM_ART = retrace(FOLHA_ART, 'nuvem', { sx: 1, ox: 0, sy: 1, oy: 0 }, { w: 78, h: 60 }, () => false, [
  wall('furniture', 24.75, 38.6, 0.5, 0.9), wall('furniture', 32.8, 39.1, 0.5, 0.9), wall('furniture', 44.55, 38.6, 0.5, 0.9), wall('furniture', 52.7, 38.8, 0.5, 0.9),
  wall('furniture', 24.75, 49.9, 0.5, 0.9), wall('furniture', 32.8, 49.9, 0.5, 0.9), wall('furniture', 44.55, 49.9, 0.5, 0.9), wall('furniture', 52.7, 50.1, 0.5, 0.9),
]);

/** As vilas em imagem (as outras usam BASE_PLAN e são desenhadas por código). */
const VILLAGE_ART: Partial<Record<MapId, VillageArt>> = { map_1: FOLHA_ART, vila_nevoa: NEVOA_ART, vila_nuvem: NUVEM_ART };

/** A planta das vilas desenhadas por código (80 x 80, a mesma nas quatro). */
const BASE_PLAN: VillagePlan = {
  w: 80, h: 80,
  spawn: { x: 40, y: 34 }, sensei: { x: 42, y: 33 }, plaza: { ...VILLAGE_PLAZA }, travel: { ...TRAVEL_POST },
  gate: { from: VILLAGE_GATE.from, to: VILLAGE_GATE.to, returnY: VILLAGE_GATE.returnY },
  shops: { weapons: SHOPS[0].building, clothes: SHOPS[1].building, scrolls: SHOPS[2].building },
  academy: ACADEMY.building,
  arena: { fight: arenaFightBox(), respawn: { ...VILLAGE_ARENA.respawn } },
  safe: [{ x: 28, y: 55, w: 24, h: 23 }],
  well: { x: 33, y: 65, w: 2, h: 2 }, grate: { x: 5.5, y: 77, w: 4, h: 1 },
};

/** A planta da vila `id` (o mapa). */
export function villagePlan(id: string): VillagePlan {
  return VILLAGE_ART[id as MapId]?.plan ?? BASE_PLAN;
}

/** Vila em imagem: as paredes, as portas e a arena saem da planta medida no desenho. */
function artVillage(def: VillageMapDef, A: VillageArt): MapLayout {
  const P = A.plan;
  const doors: Door[] = SHOPS.map((sh) => {
    const { door, outside } = shopDoor(P.shops[sh.shop]);
    return { ...door, dir: 'north' as const, map: sh.map, at: { ...shopRoom(sh.shop).arrive }, back: { ...outside } };
  });
  const academy = shopDoor(P.academy);
  doors.push({ ...academy.door, dir: 'north', map: 'academy_interior', at: { ...ACADEMY.arrive }, back: { ...academy.outside } });
  return {
    id: def.id, name: def.name, kind: 'village', village: def.village, theme: def.theme, width: P.w, height: P.h, safe: true,
    walls: [...A.walls, ...(def.gate ? [] : [wall('gate', P.gate.from, P.h - 3, P.gate.to - P.gate.from, 3)])],
    art: A.art, lights: A.lights,
    exits: def.gate ? [{ edge: 'south', from: P.gate.from, to: P.gate.to, map: 'map_2', shift: FOREST_GATE_SHIFT }] : [],
    doors,
    areas: A.areas, deco: [],
    safeZones: P.safe.map((b) => ({ ...b })),
    arenas: [{ ...P.arena.fight, village: def.village, respawn: { ...P.arena.respawn } }],
  };
}

function village(def: VillageMapDef = VILLAGE_MAPS[0]!): MapLayout {
  const A = VILLAGE_ART[def.id];
  if (A) return artVillage(def, A);
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
    wall('rock', 18, 2, 44, 10, 'mountain'),
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
    sakura(21, 47), tree(33, 47), sakura(44, 47), tree(56, 47), sakura(61, 47), tree(74, 47),
    sakura(22, 58), tree(25, 67), sakura(13, 70), tree(19, 74), sakura(53, 62), tree(53, 70),
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
    // lanternas de pedra na praça e vasos de flores na frente das lojas
    deco('toro', 29.2, 66, 1, 1.4), deco('toro', 49.8, 66, 1, 1.4), deco('toro', 36.6, 58, 1, 1.4), deco('toro', 42.4, 58, 1, 1.4),
    deco('planter', 21.4, 46.2, 1.6, 0.8), deco('planter', 32.6, 46.2, 1.6, 0.8), deco('planter', 44.4, 46.2, 1.6, 0.8),
    deco('planter', 55.6, 46.2, 1.6, 0.8), deco('planter', 61.4, 46.2, 1.6, 0.8), deco('planter', 72.6, 46.2, 1.6, 0.8),
    // Arco 1: a grade onde o rio passa por baixo da muralha (M2: "a água vem da Floresta") e a tampa lacrada do poço.
    deco('grate', BASE_PLAN.grate.x, BASE_PLAN.grate.y, BASE_PLAN.grate.w, BASE_PLAN.grate.h),
    deco('well_lid', BASE_PLAN.well.x, BASE_PLAN.well.y, BASE_PLAN.well.w, BASE_PLAN.well.h),
    deco('gate_roof', G.from - 2, H - 5, G.to - G.from + 4, 2),       // telhado do portão (desenhado por cima)
    // Arena: o círculo pintado no chão, estandartes nas duas entradas e bancos para quem assiste.
    deco('ring', arenaFightBox().x, arenaFightBox().y, arenaFightBox().w, arenaFightBox().h),
    deco('banner', VILLAGE_ARENA.north.from - 1.2, VILLAGE_ARENA.fence.y - 1.2), deco('banner', VILLAGE_ARENA.north.to + 0.2, VILLAGE_ARENA.fence.y - 1.2),
    deco('banner', VILLAGE_ARENA.fence.x - 1.7, VILLAGE_ARENA.west.from - 1.2), deco('banner', VILLAGE_ARENA.fence.x - 1.7, VILLAGE_ARENA.west.to + 0.2),
    deco('bench', 60, 74.6, 3, 1), deco('bench', 66, 74.6, 3, 1), deco('bench', 72, 74.6, 2, 1),
    // Nuvem: bandeiras da vila na praça e na entrada da avenida (só enfeite: ninguém esbarra nelas).
    ...(def.theme === 'nuvem'
      ? [deco('flag', 34.6, 56.4), deco('flag', 44.6, 56.4), deco('flag', 31.5, 71), deco('flag', 47.5, 71), deco('flag', 36.6, 49.6), deco('flag', 42.6, 49.6)]
      : []),
  ];
  // Lojas e Academia são salas compartilhadas pelas quatro vilas: a porta lembra de onde o jogador veio (`back`).
  const doors: Door[] = SHOPS.map((sh) => {
    const { door, outside } = shopDoor(sh.building);
    decos.push(deco('mat', door.x + 0.5, door.y, 2, 0.6));        // capacho na porta
    return { ...door, dir: 'north' as const, map: sh.map, at: { ...shopRoom(sh.shop).arrive }, back: { ...outside } };
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

const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

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


/**
 * Pontos da Floresta que as missões do Arco 1 usam (docs/mapas.md, 3.2): centro e raio (casas). O "IR ATÉ" do
 * sistema de história aponta para eles pelo nome. Medidos na imagem (arte/mapas/referencia_floresta.jpg).
 */
export const FOREST_POI = {
  entrada: { x: 48.5, y: 6, r: 6 },
  pedra1: { x: 14.5, y: 16.8, r: 3 },
  sumidouro: { x: 69, y: 24, r: 3 },
  encruzilhada: { x: 48, y: 35, r: 4 },
  carvalho: { x: 30, y: 45.5, r: 5 },
  pedra2: { x: 30, y: 43, r: 2.5 },
  cachoeira: { x: 77.5, y: 40, r: 4 },
  pedra3: { x: 89.3, y: 34, r: 1.8 },
  acampamento: { x: 19, y: 62.5, r: 6 },
  abismo: { x: 60, y: 47, r: 3 },
  caverna: { x: 88.5, y: 62, r: 3 },
  passagemSul: { x: 49, y: 64.5, r: 2 },
} as const;

/**
 * A beira do abismo de onde se salta: usando o Teleporte aqui, virado para o leste, chega-se na saliência da caverna,
 * do outro lado (o abismo do desenho tem umas 10 casas: nenhum nível do Teleporte alcança andando por cima dele).
 */
export const FOREST_ABYSS = { x: 58.5, y: 43, w: 3, h: 8 } as const;

/** Entre o portão da Folha e a entrada da Floresta: x da Floresta = x da Folha + isto. */
export const FOREST_GATE_SHIFT = 9.5;

/**
 * Mata fechada em casas de meia casa: tudo o que não está em `open` vira parede, juntando as casas em retângulos
 * (linhas iguais seguidas viram um retângulo só, para o layout ficar pequeno).
 */
function carve(W: number, H: number, open: readonly Box[], k: Wall['k'] = 'tree'): Wall[] {
  const C = 0.5, cols = Math.round(W / C), rows = Math.round(H / C);
  const free = (cx: number, cy: number) => open.some((b) => cx * C >= b.x - 1e-9 && (cx + 1) * C <= b.x + b.w + 1e-9 && cy * C >= b.y - 1e-9 && (cy + 1) * C <= b.y + b.h + 1e-9);
  const runsOf = (cy: number) => {
    const runs: [number, number][] = [];
    for (let cx = 0; cx < cols; cx++) {
      if (free(cx, cy)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === cx) last[1] = cx + 1; else runs.push([cx, cx + 1]);
    }
    return runs;
  };
  const out: Wall[] = [];
  let open_: { a: number; b: number; y0: number }[] = [];
  for (let cy = 0; cy <= rows; cy++) {
    const runs = cy < rows ? runsOf(cy) : [];
    const next: typeof open_ = [];
    for (const [a, b2] of runs) {
      const cont = open_.find((o) => o.a === a && o.b === b2);
      next.push(cont ?? { a, b: b2, y0: cy });
    }
    for (const o of open_) if (!next.includes(o)) out.push(wall(k, o.a * C, o.y0 * C, (o.b - o.a) * C, (cy - o.y0) * C));
    open_ = next;
  }
  return out;
}

/**
 * Floresta em imagem (arte/mapas/referencia_floresta.jpg, ampliada): 100 x 75 casas, a proporção do desenho.
 *
 *   ┌──── mata ────[ ENTRADA x 45..52 ]──── mata ─────────────────────┐
 *   │  lago da Pedra 1 (apagada)   Clareira da Entrada   ◎ sumidouro ≈≈ riacho │  y  0..25
 *   │  (mata)     ║ trilha              paredão ▓▓▓ cachoeira ▓▓ [Pedra 3] │  y 25..37
 *   │  Velho Carvalho (Pedra 2 acesa)  ╬ encruzilhada ═══ leito de pedras ═══│  y 37..43
 *   │  Acampamento Queimado            ║  beira ░░ ABISMO ░░  saliência ⌂ caverna│ y 43..67
 *   │                       [troncos]  ║                                   │
 *   └────────────────────[ SAÍDA SUL x 47..51 ]───────────────────────────┘
 *
 * O chão é o que está em `open` (clareiras e trilhas); o resto é mata (carve). Mais longe da entrada, monstros mais
 * fortes (zonas de caça).
 */
function forest(): MapLayout {
  const W = 100, H = 75;
  const village = villagePlan('map_1').gate;
  const north = { from: village.from + FOREST_GATE_SHIFT, to: village.to + FOREST_GATE_SHIFT };   // 46..50,9
  const south = { from: 47.2, to: 50.8 };                                          // passagem sul (Clareira Queimada)
  const open: Box[] = [
    { x: 45, y: 0, w: 7, h: 4 },                   // entrada
    { x: 40, y: 3, w: 22, h: 13 },                 // Clareira da Entrada
    { x: 20, y: 6, w: 20, h: 8 },                  // gramado até o lago
    { x: 5, y: 6, w: 19, h: 18.5 },                // o lago da Pedra 1
    { x: 46, y: 16, w: 8.5, h: 21 },               // trilha e o gramado ao lado
    { x: 52, y: 22.5, w: 23, h: 2.5 },             // até o sumidouro
    { x: 50, y: 36.5, w: 49, h: 6.5 },             // leito de pedras, embaixo do paredão
    { x: 87.5, y: 32.5, w: 3.5, h: 4.5 },          // a abertura da Pedra 3
    { x: 50, y: 43, w: 11.5, h: 20.5 },            // terra até a beira do abismo
    { x: 46, y: 37, w: 5.5, h: 26 },               // trilha que desce
    { x: 47, y: 63, w: 4, h: 12 },                 // passagem sul
    { x: 18, y: 41.5, w: 28, h: 9.5 },             // gramado do Velho Carvalho
    { x: 4, y: 47, w: 31, h: 21 },                 // Acampamento Queimado
    { x: 72.5, y: 52.5, w: 3.5, h: 14 },           // saliência: a faixa da esquerda (onde se chega saltando)
    { x: 76, y: 63.5, w: 2, h: 1.5 },              // a passagem entre as pedras
    { x: 78, y: 52.5, w: 17.5, h: 14.5 },          // saliência: a boca da caverna
  ];
  const walls: Wall[] = [
    ...carve(W, H, open),
    // Pedra-Selo 1 (apagada: a Tsubaki acha na M3) no meio do lago; pedras e moitas da clareira.
    wall('seal', 12.3, 9.6, 4.5, 5.7, 'out'),
    wall('rock', 20, 9, 4.5, 3.6), wall('rock', 25, 10, 2.5, 3.5), wall('rock', 6.4, 20.7, 2.7, 3.4), wall('rock', 9, 6, 4, 3),
    wall('rock', 13.5, 6, 3.5, 1.6), wall('rock', 61.5, 4.8, 2, 1.7), wall('furniture', 42.8, 5, 0.8, 1.6), wall('furniture', 49, 37.8, 0.8, 1.3),
    // O sumidouro (o riacho some aqui: é a água do canal da Vila, M2).
    wall('sink', 65, 16, 9, 6.6),
    // Velho Carvalho: o tronco e as raízes, com a Pedra-Selo 2 acesa na frente.
    wall('oak', 23.5, 37, 13, 4.5), wall('seal', 28.8, 38.5, 2.4, 3, 'lit'),
    // Pedra-Selo 3, acesa, no fundo da abertura do paredão.
    wall('seal', 88.3, 30.2, 2.2, 2.4, 'lit'),
    // Acampamento Queimado: barracas, caixotes, a fogueira e a pedra.
    wall('tent', 8, 48.6, 7.7, 7.6, 'burnt'), wall('tent', 20.5, 47.7, 7.2, 7.3, 'burnt'), wall('tent', 9.5, 61, 6.4, 6.9, 'burnt'), wall('tent', 23.6, 60.6, 7.8, 6.9, 'burnt'),
    wall('furniture', 6.4, 55.4, 3.6, 3.9, 'barrel'), wall('furniture', 15, 48.5, 3, 3, 'barrel'), wall('furniture', 29, 59.8, 2.8, 2.7, 'barrel'), wall('furniture', 16, 66.3, 2, 2.7, 'barrel'),
    wall('rock', 16.8, 57.2, 4.6, 3.2), wall('rock', 18.3, 42.8, 2.7, 2.3),
    crown(54, 51.5, 7.5, 14.5),                    // o pinheiro na beira
    // Passagem sul: troncos queimados fecham o caminho até a história abrir (M14).
    wall('logs', 45.5, 66, 7.5, 2.4),
    // Saliência: o monte de pedras da boca da caverna e as pedras soltas.
    wall('rock', 86, 51.5, 4.5, 9.5), wall('rock', 94.8, 51.5, 1.5, 10), wall('rock', 90, 51.5, 5, 3), wall('rock', 81, 55, 3.2, 3),
  ];
  return {
    id: 'map_2', name: 'Floresta', kind: 'forest', width: W, height: H, safe: false, walls, art: 'floresta',
    lights: [{ x: 30, y: 38.8 }, { x: 89.4, y: 30.8 }, { x: 58.5, y: 68.5 }],
    leaps: [
      { from: { ...FOREST_ABYSS }, dir: { x: 1, y: 0 }, to: { x: 74.4, y: 57 } },
      { from: { x: 72.8, y: 52.6, w: 3.2, h: 11 }, dir: { x: -1, y: 0 }, to: { x: 59.5, y: 47 } },
    ],
    exits: [
      // O trecho é o portão da Folha (a planta dela): fora dele, a borda não atravessa.
      { edge: 'north', from: north.from, to: north.to, map: 'map_1', shift: -FOREST_GATE_SHIFT, arrive: village.returnY },
      { edge: 'south', from: south.from, to: south.to, map: 'clareira_queimada', shift: -27, arrive: 2 },
    ],
    doors: [
      // A boca da caverna: entra-se empurrando para o norte, de frente para ela.
      { x: 90.7, y: 55, w: 4, h: 0.8, dir: 'north', map: 'caverna_lodo', at: { ...CAVE_ARRIVE } },
    ],
    areas: [
      area('trail', 45, 0, 7, 16), area('trail', 46, 16, 5.5, 47), area('trail', 47, 63, 4, 12),
      area('pebbles', 50, 36.8, 50, 6), oval('burnt', 4, 47, 31, 21), area('dirt', 72.8, 52.6, 22.7, 14.4),
    ],
    deco: [],
    safeZones: [],
    hunt: { x: 4, y: 6, w: 92, h: 61 },
    zones: [
      { name: 'lago', type: 'slime', weight: 5, x: 6, y: 7, w: 17, h: 16 },
      { name: 'carvalho', type: 'slime', weight: 4, x: 19, y: 42, w: 26, h: 8 },
      { name: 'acampamento', type: 'slime', weight: 3, x: 5, y: 48, w: 29, h: 19 },
      { name: 'leito', type: 'lodo_escuro', weight: 1, x: 64, y: 23, w: 10, h: 2 },
      { name: 'beira', type: 'lodo_escuro', weight: 2, x: 64, y: 38, w: 31, h: 4.5 },
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
    doors: [{ x: 26.5, y: 42, w: 3, h: 0.6, dir: 'south', map: 'map_2', at: { x: 92.7, y: 61.8 } }],
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
    // O Rei Lodo (chefe opcional): canto leste da câmara, ao lado do lago. O túnel leste passa por ele; o oeste, não
    // (o fundo da M11 fica longe do salão dele).
    spawns: [{ type: 'rei_lodo', x: 43, y: 11, zone: { x: 38, y: 3, w: 10, h: 13 } }],
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
    exits: [{ edge: 'north', from: 20.2, to: 23.8, map: 'map_2', shift: 27, arrive: 73 }],
    doors: [],
    areas: [area('burnt', 0, 0, W, H)],
    deco: [deco('scorch', 11, 9, 22, 19), deco('embers', 10, 12, 2, 1.4), deco('embers', 30, 24, 2, 1.4), deco('embers', 16, 28, 2, 1.4), deco('embers', 28, 9, 2, 1.4)],
    safeZones: [],
  };
}

/**
 * Poço sob a Praça (24 x 18): a cisterna debaixo da Vila (docs/mapas.md, seção 6). Desce-se pela escada do poço da
 * Praça (a tampa fica lacrada até a história abrir). Canal de água com uma ponte e, no fundo, a porta lacrada da
 * Quinta Pedra (Arco 2).
 *
 * O chão é a imagem arte/mapas/referencia_poco.jpg (`art`), e as paredes seguem o desenho dela: a parede das tochas
 * em cima com a escada no meio, o canal de lado a lado com a ponte de pilares, e embaixo o bloco de pedra com a porta
 * da chama. Os cantos de baixo (entulho à esquerda, poça à direita) são chão.
 */
function well(): MapLayout {
  const W = 24, H = 18;
  const walls: Wall[] = [
    wall('wall', 0, 0, 10.5, 3.1), wall('wall', 13.5, 0, 10.5, 3.1),        // parede das tochas
    wall('wall', 10.5, 0, 0.4, 4.3), wall('wall', 13.1, 0, 0.4, 4.3),       // batentes da escada
    wall('wall', 10.9, 0, 2.2, 1.1),                                        // topo da escada (sobe para a Praça)
    wall('wall', 0, 3.1, 0.6, H - 3.1), wall('wall', W - 0.6, 3.1, 0.6, H - 3.1),
    wall('water', 0.6, 7.1, 9.5, 3.2), wall('water', 13.9, 7.1, 9.5, 3.2),  // canal
    wall('wall', 10.1, 6, 0.7, 4.9), wall('wall', 13.2, 6, 0.7, 4.9),       // pilares da ponte
    wall('wall', 4.4, 13.8, 5.8, H - 13.8), wall('wall', 13.8, 13.8, 5.7, H - 13.8),
    wall('gate', 10.2, 13.1, 3.6, H - 13.1),                                // a porta lacrada (a chama)
    wall('wall', 0.6, H - 0.6, W - 1.2, 0.6),
  ];
  return {
    id: 'poco', name: 'Poço sob a Praça', kind: 'cave', width: W, height: H, safe: false, walls, art: 'poco',
    lights: [
      { x: 3.5, y: 1.4 }, { x: 8.55, y: 1.4 }, { x: 15.4, y: 1.4 }, { x: 20.5, y: 1.4 },
      { x: 0.95, y: 4.8 }, { x: 23.05, y: 4.8 }, { x: 0.95, y: 12.6 }, { x: 23.05, y: 12.6 },
      { x: 8.55, y: 14.5 }, { x: 15.4, y: 14.5 },
    ],
    exits: [],
    doors: [],
    areas: [area('stone', 0, 0, W, H), area('water', 1, 7, 10, 3), area('water', 14, 7, 10, 3), area('bridge', 11, 7, 2, 3)],
    deco: [],
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
  const back = shopDoor(villagePlan('map_1').shops[sh.shop]).outside;
  const A = SHOP_ART[sh.shop];
  if (A) {
    return {
      id: sh.map, name: sh.name, kind: 'interior', width: A.w, height: A.h, safe: true, walls: A.walls, art: A.art, lights: A.lights,
      exits: [],
      doors: [{ ...A.exit, dir: 'south', map: 'map_1', at: { ...back }, toBack: true }],
      areas: [area('wood', 0, 0, A.w, A.h)],
      deco: [],
      safeZones: [{ x: 0, y: 0, w: A.w, h: A.h }],
    };
  }
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
  doors.push({ x: 54.5, y: H - 1.6, w: 3, h: 1.6, dir: 'south', map: 'map_1', at: shopDoor(villagePlan('map_1').academy).outside, step: 4, toBack: true });
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
 *   Folha ──────────────────────────────── Névoa
 *     │                  ruína               │
 *   Nuvem ──────────── Renegados ────────── Areia
 */
export const CONFLICT = {
  width: 110, height: 80,
  // Os acampamentos do desenho (arte/mapas/referencia_zona_conflito.jpg): a fogueira e a bandeira de cada um.
  camps: [
    { who: 'vila_1', x: 8, y: 8 }, { who: 'vila_3', x: 89, y: 8 },
    { who: 'vila_4', x: 8, y: 59 }, { who: 'vila_5', x: 89, y: 59 }, { who: 'renegados', x: 52, y: 63 },
  ] as const,
  camp: { w: 13, h: 10 },
  ruin: { x: 45, y: 28, w: 22, h: 21 },
} as const;
export type CampOwner = (typeof CONFLICT.camps)[number]['who'];

/** Acampamento de quem chega: a área (zona segura), onde se chega e onde fica o Posto de Viagem. */
export function conflictCamp(who: CampOwner): { box: Box; arrive: { x: number; y: number }; post: { x: number; y: number } } {
  const c = CONFLICT.camps.find((k) => k.who === who)!;
  const { w, h } = CONFLICT.camp;
  return { box: { x: c.x, y: c.y, w, h }, arrive: { x: c.x + w / 2, y: c.y + h / 2 + 1 }, post: { x: c.x + 2, y: c.y + 2 } };
}

/**
 * Zona de Conflito em imagem (arte/mapas/referencia_zona_conflito.jpg, ampliada): um vale de terra fechado por
 * rochas, os cinco acampamentos com fogueira e bandeira (quatro nos cantos e o dos renegados embaixo), árvores mortas,
 * lajes de pedra caídas e a ruína de pilares no meio. O desenho é simétrico: as medidas são do quarto de cima à esquerda
 * (em casas da imagem, 107 x 80) e o resto sai espelhado; o mapa fica com 110 x 80 (a imagem esticada 2,8%).
 */
function conflictZone(): MapLayout {
  const { width: W, height: H } = CONFLICT;
  const K = W / 107;                                          // casas da imagem -> casas do mapa (largura)
  const X = (x: number) => r2(x * K);
  const box = (k: Wall['k'], x: number, y: number, w: number, h: number, st?: Wall['s']) => wall(k, X(x), y, r2(w * K), h, st);
  /** Os quatro lados: o quarto de cima à esquerda, espelhado em x (107) e em y (80). */
  const mirror = (k: Wall['k'], x: number, y: number, w: number, h: number) =>
    [box(k, x, y, w, h), box(k, 107 - x - w, y, w, h), box(k, x, 80 - y - h, w, h), box(k, 107 - x - w, 80 - y - h, w, h)];
  const walls: Wall[] = [
    // Rochas em volta (mais grossas nos cantos).
    box('rock', 0, 0, 107, 4.5), box('rock', 0, 76.5, 107, 3.5), box('rock', 0, 4.5, 3, 72), box('rock', 104, 4.5, 3, 72),
    ...mirror('rock', 3, 4.5, 3.5, 6), ...mirror('rock', 3, 17, 2.5, 18),
    // Árvores mortas (o tronco) e as lajes de pedra caídas, nos quatro quartos.
    ...mirror('tree', 31, 7, 3, 9), ...mirror('tree', 42, 8.5, 3, 7.5), ...mirror('tree', 29.5, 19, 2.5, 6),
    ...mirror('tree', 10.5, 23, 4, 10), ...mirror('tree', 15, 23.5, 3, 7.5), ...mirror('tree', 18.5, 29, 3, 7), ...mirror('tree', 23.5, 23.5, 3, 7.5),
    ...mirror('rock', 16, 9.5, 4.5, 2.5), ...mirror('rock', 34.5, 18, 5, 2.5), ...mirror('rock', 26.5, 34.5, 4.5, 2),
    ...mirror('rock', 7.5, 14.5, 2.5, 3.5), ...mirror('furniture', 9.5, 7, 0.6, 7),
  ].filter((w) => !(w.y > 55 && w.x > X(33) && w.x < X(74)));   // embaixo no meio fica o acampamento dos renegados
  walls.push(
    // A ruína do meio: os pilares (dá para passar entre eles) e as lajes caídas em volta.
    box('pillar', 43.2, 27, 1.8, 11.5), box('pillar', 43.2, 40, 1.8, 9), box('pillar', 48.5, 28.5, 1.4, 4.5), box('pillar', 48.5, 42.5, 1.4, 4.5),
    box('pillar', 57, 29.5, 1.4, 3.5), box('pillar', 57, 41.5, 1.4, 6), box('pillar', 62, 27, 1.8, 11.5), box('pillar', 62, 40, 1.8, 9),
    box('rock', 40.2, 23.2, 4.8, 2), box('rock', 61.8, 23.2, 4.8, 2), box('rock', 51, 21.2, 5, 2), box('rock', 37, 19, 4, 2), box('rock', 67.8, 19, 4, 2),
    box('rock', 37.3, 51, 4.8, 2), box('rock', 64.6, 51, 4.8, 2), box('rock', 45.5, 56.3, 4.8, 2), box('rock', 56.4, 56.3, 4.8, 2),
    // Acampamento dos renegados: a barraca, os mastros e as árvores dos lados.
    box('tent', 44.5, 66.5, 5.5, 7, 'burnt'), box('furniture', 46.5, 64, 1.2, 4), box('furniture', 60.5, 64, 0.8, 7),
    box('tree', 36.5, 62, 6, 11), box('tree', 66, 62, 9, 12), box('tree', 30.5, 64, 2.5, 9), box('tree', 76, 64, 2.5, 9),
  );
  const camps = CONFLICT.camps.map((c) => conflictCamp(c.who).box);
  return {
    id: 'zona_conflito', name: 'Zona de Conflito', kind: 'wild', theme: 'conflito', conflict: true, width: W, height: H, safe: false, walls,
    art: 'zona',
    lights: [
      { x: X(14.3), y: 13.8 }, { x: X(92.7), y: 13.8 }, { x: X(14.3), y: 66.6 }, { x: X(92.7), y: 66.6 }, { x: X(53.5), y: 70.4 },
    ],
    exits: [], doors: [],
    areas: [
      area('dirt', 0, 0, W, H), ...camps.map((c) => area('ash', c.x, c.y, c.w, c.h)),
      area('stone', CONFLICT.ruin.x, CONFLICT.ruin.y, CONFLICT.ruin.w, CONFLICT.ruin.h),
    ],
    deco: [],
    safeZones: camps,
    hunt: { x: 6, y: 18, w: W - 12, h: H - 36 },
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
  for (const [b, map, shop] of [[REFUGE.weapons, 'interior_weapons', 'weapons'], [REFUGE.scrolls, 'interior_scrolls', 'scrolls']] as const) {
    const { door, outside } = shopDoor(b);
    decos.push(deco('mat', door.x + 0.5, door.y, 2, 0.6));
    doors.push({ ...door, dir: 'north', map, at: { ...shopRoom(shop).arrive }, back: { ...outside } });
  }
  return {
    id: 'refugio', name: 'Refúgio dos Renegados', kind: 'wild', theme: 'refugio', refuge: true, width: W, height: H, safe: true, walls,
    exits: [], doors,
    areas: [area('ash', 2, 3, W - 4, H - 5), area('path', 21, 12, 6, 20)],
    deco: decos,
    safeZones: [{ x: 0, y: 0, w: W, h: H }],
  };
}

/**
 * Vale das Estátuas (44 x 36, v29): o mapa do modo rankeado, onde se encontram os ninjas de todas as vilas. No meio,
 * a arena cercada (fechada: só os dois da partida entram, levados pelo servidor); em volta, a praça de pedra onde a
 * fila espera e assiste, com as estátuas das vilas nos cantos. Tudo é zona segura, menos dentro da cerca.
 *
 *   ████████████████████████████████████████████
 *   █   ◆ estátua                    estátua ◆  █
 *   █        ┌──────── cerca ────────┐          █
 *   █        │  A      arena      B  │          █   luta 19 x 13 casas
 *   █        └───────────────────────┘          █
 *   █   ◆                                   ◆   █
 *   █              chegada  (fila)              █
 *   ████████████████████████████████████████████
 */
export const VALE = {
  width: 44, height: 36,
  fence: { x: 12, y: 8, w: 20, h: 14 },
  thickness: 0.5,
  /** Onde se chega (e para onde voltam os dois quando a partida acaba). */
  spawn: { x: 22, y: 27 },
  /** Onde cada lado começa cada rodada (dentro da cerca). */
  start: { a: { x: 15.5, y: 15 }, b: { x: 28.5, y: 15 } },
} as const;

export function valeFightBox(): Box {
  const f = VALE.fence, t = VALE.thickness;
  return { x: f.x + t, y: f.y + t, w: f.w - 2 * t, h: f.h - 2 * t };
}

function vale(): MapLayout {
  const { width: W, height: H } = VALE;
  const f = VALE.fence, t = VALE.thickness;
  const walls: Wall[] = [
    wall('rock', 0, 0, W, 2), wall('rock', 0, H - 2, W, 2), wall('rock', 0, 2, 2, H - 4), wall('rock', W - 2, 2, 2, H - 4),
    // a cerca fechada: ninguém entra nem sai andando (o servidor leva os dois da partida)
    wall('fence', f.x, f.y, f.w, t), wall('fence', f.x, f.y + f.h - t, f.w, t),
    wall('fence', f.x, f.y + t, t, f.h - 2 * t), wall('fence', f.x + f.w - t, f.y + t, t, f.h - 2 * t),
    // as estátuas das vilas nos cantos da praça
    wall('pillar', 6, 5, 1.6, 2, 'arena'), wall('pillar', 36.4, 5, 1.6, 2, 'arena'),
    wall('pillar', 6, 25, 1.6, 2, 'arena'), wall('pillar', 36.4, 25, 1.6, 2, 'arena'),
    tree(4, 31), tree(40, 31), tree(4, 12), tree(40, 12),
  ];
  const fight = valeFightBox();
  return {
    id: 'vale_estatuas', name: 'Vale das Estátuas', kind: 'wild', theme: 'folha', ranked: true, width: W, height: H, safe: true, walls,
    exits: [], doors: [],
    areas: [area('stone', 2, 2, W - 4, H - 4), area('arena', f.x, f.y, f.w, f.h)],
    deco: [
      deco('banner', f.x - 1.2, f.y - 1.2), deco('banner', f.x + f.w + 0.2, f.y - 1.2),
      deco('banner', f.x - 1.2, f.y + f.h + 0.2), deco('banner', f.x + f.w + 0.2, f.y + f.h + 0.2),
    ],
    arenas: [{ ...fight, village: 'vila_1', respawn: { ...VALE.spawn }, ranked: true }],
    // zona segura: tudo, menos dentro da cerca
    safeZones: [
      { x: 0, y: 0, w: W, h: f.y }, { x: 0, y: f.y + f.h, w: W, h: H - f.y - f.h },
      { x: 0, y: f.y, w: f.x, h: f.h }, { x: f.x + f.w, y: f.y, w: W - f.x - f.w, h: f.h },
    ],
  };
}

/** Todos os mapas, por id. */
export function buildMaps(): Record<MapId, MapLayout> {
  const [weapons, clothes, scrolls] = SHOPS;
  return {
    map_1: village(VILLAGE_MAPS[0]), map_2: forest(),
    vila_nevoa: village(VILLAGE_MAPS[1]), vila_nuvem: village(VILLAGE_MAPS[2]), vila_areia: village(VILLAGE_MAPS[3]),
    zona_conflito: conflictZone(), refugio: refuge(),
    caverna_lodo: cave(), clareira_queimada: burnedClearing(), poco: well(),
    interior_weapons: interior(weapons), interior_clothes: interior(clothes), interior_scrolls: interior(scrolls),
    academy_interior: academy(), vale_estatuas: vale(),
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
