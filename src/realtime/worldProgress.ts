/*
 * v62 (migração v37): Progressão de Mundo. O mundo cresce com a população ativa (jogadores que entraram nos últimos 7
 * dias, game.active_population). O marco alcançado não volta atrás (o mundo não "encolhe").
 *
 *   0    a Aldeia, a Academia e as outras vilas
 *   30   Floresta e Rei Lodo (Caverna do Lodo, Clareira Queimada, Poço)
 *   60   Zona de Conflito e PvP Livre
 *   100  Refúgio dos Renegados e Eleição de Kage
 *   150  Terra Sem Lei e o Evento dos Titãs
 *   250  Mapas de Expansão (Ilhas, Cavernas Profundas)
 *
 * Terra Sem Lei, Ilhas e Cavernas Profundas ainda não existem no jogo: o marco fica pronto para quando existirem.
 * Mapa trancado: some do Posto de Viagem e a saída para ele vira uma névoa que não deixa passar (movement.ts).
 * O admin força um marco com /admin mundo <0|30|60|100|150|250> e volta à regra com /admin mundo auto.
 */

export const STAGES = [0, 30, 60, 100, 150, 250] as const;
export type Stage = (typeof STAGES)[number];

export type WorldFeature = 'rei_lodo' | 'pvp_livre' | 'kage' | 'titas' | 'expansao';

interface StageInfo { min: Stage; maps: readonly string[]; features: readonly WorldFeature[]; label: string }

export const STAGE_INFO: readonly StageInfo[] = [
  { min: 0, maps: [], features: [], label: 'A Aldeia' },
  { min: 30, maps: ['map_2', 'caverna_lodo', 'clareira_queimada', 'poco'], features: ['rei_lodo'], label: 'Floresta e Rei Lodo' },
  { min: 60, maps: ['zona_conflito'], features: ['pvp_livre'], label: 'Zona de Conflito e PvP Livre' },
  { min: 100, maps: ['refugio'], features: ['kage'], label: 'Refúgio dos Renegados e Eleição de Kage' },
  { min: 150, maps: ['terra_sem_lei'], features: ['titas'], label: 'Terra Sem Lei e os Titãs' },
  { min: 250, maps: ['ilhas', 'cavernas_profundas'], features: ['expansao'], label: 'Ilhas e Cavernas Profundas' },
];

/** O marco para uma população (o maior que ela alcança). */
export function stageFor(population: number): Stage {
  let s: Stage = 0;
  for (const st of STAGES) if (population >= st) s = st;
  return s;
}

/** Os mapas ainda trancados neste marco. */
export function lockedMaps(stage: number): string[] {
  return STAGE_INFO.filter((i) => i.min > stage).flatMap((i) => [...i.maps]);
}

export function featureOpen(stage: number, f: WorldFeature): boolean {
  const info = STAGE_INFO.find((i) => i.features.includes(f));
  return !info || stage >= info.min;
}

/** O próximo marco (para o Cronista contar quanto falta). */
export function nextStage(stage: number): StageInfo | undefined {
  return STAGE_INFO.find((i) => i.min > stage);
}

/**
 * O Cronista (Academia): a Crônica das Eras, contada em capítulos que se abrem com os marcos. Capítulo de marco ainda
 * não alcançado: "os pergaminhos estão borrados".
 */
// v64: o capítulo II foi alinhado com o Arco 1 (docs/lore/biblia-do-mundo.md, seção 9): a Primeira Guerra envenenou o Rio das
// Raízes, do rio nasceu o Lodo Ancestral, e há 50 anos (a Noite das Cinco Pedras) a geração que fundou a Academia o selou
// com as cinco Pedras da Vigília. v65: os nomes escolhidos pelo Victor (15/11/2026).
export const CHRONICLE: readonly { min: Stage; title: string; text: string }[] = [
  { min: 0, title: 'I. A Primeira Chama', text: 'Antes das aldeias, havia só a Chama. Os quatro clãs fundadores a dividiram em quatro heranças, e cada herança virou uma aldeia: a Chama Eterna, a Maré Oculta, o Vento Cortante e a Rocha Antiga. A Academia guarda a brasa que sobrou.' },
  { min: 30, title: 'II. O Lodo sob as Raízes', text: 'A Primeira Guerra, entre os fundadores, envenenou o Rio das Raízes, que corre sob a Floresta, e do rio nasceu o Lodo Ancestral. Há cinquenta anos, na Noite das Cinco Pedras, ele foi selado pelas Pedras da Vigília. Os lodos da mata são o chakra que vaza pelo selo; o Rei Lodo, o maior pedaço que escapou.' },
  { min: 60, title: 'III. A Fronteira que Sangra', text: 'Entre as heranças ficou uma terra que ninguém aceitou dividir. Ali, a lei das aldeias não chega: só a lâmina decide. Os antigos a chamaram de Zona de Conflito, e cada Era ela pede o seu preço.' },
  { min: 100, title: 'IV. Os que Riscaram a Bandana', text: 'Nem todos aceitaram a Chama dividida. Os que riscaram a bandana fugiram para o Refúgio, e as aldeias passaram a escolher um Kage para guardar a herança. Toda escolha divide; toda divisão faz renegados.' },
  { min: 150, title: 'V. O Cinturão da Era', text: 'Abaixo da terra dormem dez Titãs, as forças que os fundadores prenderam para fazer o mundo. A cada Era eles acordam, um por dia, e testam os vivos. Quem fere mais um Titã carrega um pedaço dele até a Era acabar: os Portadores.' },
  { min: 250, title: 'VI. Além do Mar e Abaixo da Pedra', text: 'Os Titãs caídos abriram passagens que estavam fechadas desde a Primeira Chama: ilhas que surgiram da maré e cavernas que descem até onde a pedra ainda é quente. O mundo é maior do que as aldeias contaram.' },
];

export const BLURRED = 'Os pergaminhos estão borrados. Esta parte da Crônica ainda não pode ser lida: o mundo precisa crescer.';
