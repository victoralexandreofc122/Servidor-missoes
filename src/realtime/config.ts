/**
 * Regras do tempo real. Valores conservadores para o plano Free do Render;
 * mudam aqui, num lugar só.
 */
import { buildSkills, type JutsuCode, type Mechanic } from './jutsus.js';
import type { AttributeRules } from './stats.js';
import {
  ACADEMY, CONFLICT, REFUGE, ROOM, SHOPS, TRAVEL_POST, VILLAGE_MAPS, VILLAGE_PLAZA, WORLD_MAPS, conflictCamp, type MapId, type MapLayout, type ShopKind,
} from './maps.js';
import type { EndgameModule } from './endgame.js';

/** Números de cada habilidade. Só os campos que a habilidade usa vêm preenchidos. */
export interface SkillConfig {
  cost: number;            // chakra
  cooldownMs: number;
  damage?: number;
  radius?: number;         // círculo (casas): a explosão do Fogo, a Ilusão em volta, o golpe do Taijutsu, a Cura
  range?: number;          // alcance (casas): até onde a linha, o projétil ou o cone vão
  coneDeg?: number;        // abertura do cone
  /** Projétil (Fogo, Kunais): velocidade em casas/s. Sem `speed`, a linha é instantânea. */
  speed?: number;
  /** Kunais: quantos projéteis e a abertura total do leque (graus). */
  shots?: number;
  fanDeg?: number;
  stunMs?: number;
  rootMs?: number;
  reduction?: number;      // escudo: fração do dano que some (0.5 = metade)
  heal?: number;
  /** Qual atributo escala o dano: 'taijutsu' (corpo a corpo), 'ninjutsu' (elemental) ou 'weapons'. Padrão: ninjutsu. */
  scaling?: 'taijutsu' | 'ninjutsu' | 'weapons';
  /** Efeito que dura (Substituição: 5 s esperando o próximo golpe). */
  durationMs?: number;
}

/** Tipo de monstro. O slime é o de caça; os bonecos da Academia ficam parados e renascem rápido. */
export interface MonsterType {
  maxHp: number;
  xp: number;
  attackRange: number;
  attackDamage: number;
  attackEveryMs: number;
  /** Não anda (bonecos de treino). */
  stationary: boolean;
  /** Renasce no mesmo lugar depois deste tempo (bonecos fixos do mapa). */
  respawnMs: number;
}

export interface CombatConfig {
  player: {
    /** Vida e chakra BASE (sem atributos). */
    maxHp: number; maxChakra: number;
    /** Vida por segundo, SÓ com o chakra no máximo. */
    hpRegenPerSec: number;
    /** Base do chakra. O chakra NÃO regenera sozinho: só meditando, a base x o multiplicador. */
    chakraRegenPerSec: number;
    respawnMs: number;
    meditationRegenMultiplier: number;
  };
  /**
   * Ataque básico: não gasta chakra. Mira no alvo focado (se no alcance) ou no mais perto e
   * acerta todo mundo no ARCO (raio `range`, abertura `arcDeg`) na direção dele.
   */
  basicAttack: { damage: number; range: number; arcDeg: number; cooldownMs: number };
  /**
   * PvP ABERTO (os mapas de fronteira do Arco 2): as hitboxes também acertam outros jogadores fora da zona
   * segura e fora da Academia. Nunca vale em mapa de vila. Desligado, fora das arenas todo jogador é aliado
   * (a Cura pega os outros).
   */
  pvp: boolean;
  /**
   * Arena de cada vila (maps.ts): ali o PvP de treino vale sempre, só entre os ninjas da vila dona.
   * Perder renasce na entrada depois de `respawnMs`; quem renasce (em qualquer lugar) fica `protectMs` sem apanhar de jogador.
   */
  arena: { respawnMs: number; protectMs: number };
  /**
   * Teto de controle em jogadores (design 7.2): atordoar ou prender o MESMO jogador de novo dentro de
   * `windowMs` da última vez dura a metade, depois um quarto, e na 4ª ele fica imune até a janela passar.
   */
  controlDr: { windowMs: number; factors: readonly number[] };
  /**
   * XP por participação (design 8.4): quem causou pelo menos esta fração da vida do monstro ganha o XP, o
   * ryō, a chance de pergaminho e o abate da missão (quem deu o último golpe ganha sempre).
   */
  participation: number;
  /** Quanto cada ponto de atributo vale (com rendimento decrescente) e o custo de redefinir. */
  attributes: AttributeRules;
  monsters: {
    count: number; type: string; maxHp: number; xp: number; stepMs: number;
    attackRange: number; attackDamage: number; attackEveryMs: number;
    /** `count` = monstros em CADA mapa de caça (os que têm `hunt`); nascem longe dos jogadores. */
    minPlayerDistance: number;
    /**
     * Densidade (design 8.4): com N jogadores no mapa, o alvo é `count + perPlayer x N`, até `maxCount`. Faltando,
     * nasce 1 a cada `spawnEveryMs`; sobrando (gente saiu), some 1 a cada `spawnEveryMs`, longe de todo mundo.
     */
    perPlayer: number;
    maxCount: number;
    spawnEveryMs: number;
  };
  /** Bonecos da Academia (tipos além do slime, que usa `monsters`). */
  monsterTypes: Readonly<Record<string, MonsterType>>;
  /** Níveis dos ranks (v7): Genin pela Missão de Genin, Chunin pelo Exame Chunin, candidatura a Kage. */
  rankLevels: { genin: number; chunin: number; kage: number };
  /** HP e chakra do próprio jogador: no máximo 1 atualização a cada X ms (regeneração). */
  statsEveryMs: number;
  /** Todos os jutsus (catálogo em jutsus.ts): números de combate + a mecânica. */
  skills: Readonly<Record<JutsuCode, SkillConfig & { mechanic: Mechanic }>>;
}

export type NpcRole = 'sensei' | 'travel' | 'shop' | 'tutor' | 'director';
export interface NpcConfig { id: string; name: string; map: MapId; x: number; y: number; range: number; role: NpcRole; shop?: ShopKind }

export interface EndgameConfig {
  /** Jogadores ativos (na semana) para cada módulo ligar sozinho. */
  thresholds: Readonly<Record<EndgameModule, number>>;
  /** "Ativo" = entrou nos últimos N dias. */
  populationDays: number;
  /** De quanto em quanto tempo o servidor confere a população e roda a manutenção (eleições, temporadas...). */
  tickMs: number;
  /** Viagem para vila aliada (ryō). */
  allyTravelRyo: number;
  /** Quem vira renegado: a recompensa aparece sobre o nome a partir disto (ryō). */
  showBountyFrom: number;
}

export interface RealtimeConfig {
  path: string;
  /** Subprotocolo que o servidor escolhe quando o cliente manda o token pelo cabeçalho. */
  subprotocol: string;
  /** Mapas (salas): layout, paredes e saídas. Ver maps.ts. */
  maps: Readonly<Record<MapId, MapLayout>>;
  /** Onde se entra e se renasce: mapa e posição. */
  startMap: MapId;
  spawn: { x: number; y: number };
  tutorialEnd: { x: number; y: number };
  /** Andando (sem atributo). */
  speedTilesPerSecond: number;
  /** Correndo (botão 🏃 ligado). */
  runSpeedTilesPerSecond: number;
  tickMs: number;
  maxTickDtMs: number;
  messageBurst: number;
  messagesPerSecond: number;
  maxDroppedPerSecond: number;
  chatBurst: number;
  chatPerSecond: number;
  chatMaxLength: number;
  maxPayloadBytes: number;
  maxBufferedBytes: number;
  maxPlayers: number;
  heartbeatMs: number;
  combat: CombatConfig;
  /**
   * NPCs parados no mapa. `range` = distância máxima para conversar (casas). `role`: o que ele faz ao conversar
   * (Mestre = Sala de Missões; travel = Posto de Viagem; shop = loja; tutor/director = Academia).
   */
  npcs: readonly NpcConfig[];
  /** Fim de jogo (docs/endgame.md): população que liga cada módulo, a janela de "ativo" e o ritmo da manutenção. */
  endgame: EndgameConfig;
  /** Pedidos ao banco de missões (falar com NPC, abrir a Sala): no máximo 1 a cada X ms por jogador. */
  missionRequestEveryMs: number;
  /**
   * Movimento com predição: o cliente manda ENTRADAS numeradas, cada uma vale 1 tick (50 ms).
   * O servidor aplica cada entrada uma vez só, e no máximo o tempo real que passou: um
   * cliente que mande entradas a mais (speed hack) não anda mais rápido. `inputBufferMs` é a
   * folga para a rede (rajadas de pacotes atrasados); `maxQueuedInputs` o tamanho da fila.
   */
  inputBufferMs: number;
  maxQueuedInputs: number;
  /** Missões entre jogadores: distância para criar/entregar e quantidades aceitas. */
  playerMissions: { range: number; quantities: readonly number[]; targetCode: string; missionType: string };
  /** Salvar kits / gastar ponto: no máximo 1 gravação a cada X ms por jogador. */
  profileRequestEveryMs: number;
}

export const REALTIME: Readonly<RealtimeConfig> = {
  /** Caminho do WebSocket: wss://<servidor>/game */
  path: '/game',
  subprotocol: 'nin.v1',

  /**
   * Dois mapas: Vila (map_1, 80x80, sem monstros) e Floresta (map_2, 100x100, caça). Posição em
   * casas, contínua (3 casas decimais), de 0 a width / height do mapa onde o jogador está.
   */
  maps: WORLD_MAPS,
  /** Avenida da Vila, em frente à sede: onde o jogador aparece ao conectar e renasce (a posição ainda não é salva). */
  startMap: 'map_1',
  spawn: { x: 40, y: 34 },
  /** Fim do tutorial da Academia: a Praça da Vila (zona segura), já no mundo aberto. */
  tutorialEnd: { ...VILLAGE_PLAZA },

  /**
   * Movimento autoritativo: o cliente manda só a DIREÇÃO (joystick, de -1 a 1) e o servidor
   * anda o jogador a esta velocidade a cada tick. O cliente nunca diz onde está, então
   * speed hack e teleporte não existem.
   */
  speedTilesPerSecond: 5,
  runSpeedTilesPerSecond: 8,

  /** Game loop: a cada 50 ms (20 vezes por segundo) move quem está andando e envia as posições. */
  tickMs: 50,
  /** Se o processo travar, um tick nunca anda mais que 250 ms de uma vez (sem "pulo"). */
  maxTickDtMs: 250,

  /** Anti-flood, por conexão: rajada de 30 mensagens, 20 por segundo sustentadas. */
  messageBurst: 30,
  messagesPerSecond: 20,
  /** Mais de 100 mensagens descartadas em 1 s: a conexão é fechada (código 1008). */
  maxDroppedPerSecond: 100,

  /** Chat: rajada de 3, depois 1 mensagem por segundo; até 200 caracteres. */
  chatBurst: 3,
  chatPerSecond: 1,
  chatMaxLength: 200,

  /** Tamanho máximo de uma mensagem recebida (bytes). Maior que isso: conexão fechada (1009). */
  maxPayloadBytes: 1024,
  /** Cliente que não consome o que enviamos (fila > 1 MiB) é desconectado. */
  maxBufferedBytes: 1024 * 1024,
  /** Jogadores online ao mesmo tempo nesta instância. */
  maxPlayers: 500,

  /** Ping a cada 30 s (recomendação do Render); sem pong até o próximo ping, a conexão cai. */
  heartbeatMs: 30_000,

  /** Combate PvE. O servidor decide tudo: dano, acerto, morte e XP. */
  combat: {
    // Chakra só volta meditando: 5 x 3 = 15/s. Vida volta 1/s só com o chakra cheio.
    player: { maxHp: 100, maxChakra: 100, hpRegenPerSec: 1, chakraRegenPerSec: 5, respawnMs: 5000, meditationRegenMultiplier: 3 },
    basicAttack: { damage: 12, range: 1.6, arcDeg: 90, cooldownMs: 600 },
    pvp: false,
    arena: { respawnMs: 3000, protectMs: 5000 },
    controlDr: { windowMs: 8000, factors: [1, 0.5, 0.25, 0] },
    participation: 0.2,
    attributes: {
      // Sem teto de pontos (v8): o ponto investido com n pontos já no atributo vale base / (1 + n x 0,05).
      // Vitalidade: 1º ponto +10 de vida, 10º +6,9, 50º +2,9 (59 pontos = +279, e não +590).
      softCap: 0.05,
      // vitalidade +10 vida · chakra +10 de chakra máximo (e +1/s meditando, abaixo) · agilidade +0,5 velocidade
      // taijutsu +5% no corpo a corpo (Ataque Básico e o soco 👊) · ninjutsu +5% nos jutsus elementais
      // armas +5% no dano da arma equipada (Kunai: +10 de base) e nos jutsus da classe Armas
      perPoint: { vitality: 10, chakra: 10, agility: 0.5, taijutsu: 0.05, ninjutsu: 0.05, weapons: 0.05 },
      chakraRegenPerPoint: 1,
      // Agilidade também acelera o Ataque Básico: -4% de recarga por ponto efetivo (até 60% da base).
      agilityAttackSpeed: 0.04,
      minAttackCooldownFactor: 0.6,
      // Velocidade: no máximo +5 casas/s (o mesmo dos 10 pontos de antes, com o soft cap ~12 pontos).
      maxSpeedBonus: 5,
      resetCostRyo: 500,
    },
    monsters: {
      // 10 slimes na Floresta (+3 por jogador lá, até 40); a Vila é área segura (nenhum monstro).
      count: 10, type: 'slime', maxHp: 60, xp: 20, stepMs: 1000,
      attackRange: 1.2, attackDamage: 10, attackEveryMs: 2000,
      minPlayerDistance: 3,
      perPlayer: 3, maxCount: 40, spawnEveryMs: 1000,
    },
    monsterTypes: {
      // Sala 1: destruir 3 com o Ataque Básico (2 golpes cada). Não batem.
      dummy: { maxHp: 24, xp: 0, attackRange: 0, attackDamage: 0, attackEveryMs: 1e9, stationary: true, respawnMs: 2500 },
      // Sala de Jutsus: ARMADILHA de lâminas que bate (fraco) em quem chega perto: treina a Substituição.
      sparring: { maxHp: 400, xp: 0, attackRange: 1.6, attackDamage: 6, attackEveryMs: 1800, stationary: true, respawnMs: 2500 },
      // Zona de Conflito: lodo sombrio, mais forte que o slime (para quem já é Chunin).
      lodo_sombrio: { maxHp: 150, xp: 60, attackRange: 1.3, attackDamage: 18, attackEveryMs: 1800, stationary: false, respawnMs: 0 },
    },
    rankLevels: { genin: 11, chunin: 40, kage: 60 },
    statsEveryMs: 200,
    // 38 jutsus (9 classes x 4 tiers + 2 da Academia): números gerados do catálogo em jutsus.ts.
    skills: buildSkills(),
  },

  /**
   * O Mestre (sensei NPC) fica na avenida da Vila, em frente à sede, ao lado do renascimento
   * (2,2 casas, na diagonal). A Vila não tem monstros. Quem renasce já pode falar com ele.
   * Na diagonal e não 2 casas ao norte: com o celular deitado, o "!" sobre ele ficaria
   * embaixo da barra de cima. Conversar: até 2,5 casas de distância.
   */
  npcs: [
    { id: 'sensei', name: 'Mestre', map: 'map_1', x: 42, y: 33, range: 2.5, role: 'sensei' },
    // As outras vilas têm o seu Mestre no mesmo lugar (a mesma Sala de Missões).
    ...VILLAGE_MAPS.slice(1).map((v): NpcConfig => ({ id: `sensei_${v.id}`, name: 'Mestre', map: v.id, x: 42, y: 33, range: 2.5, role: 'sensei' })),
    // Postos de Viagem (fim de jogo): na praça de cada vila, na clareira da Floresta, nos acampamentos da Zona de
    // Conflito e no Refúgio. Levam para a própria vila, a Floresta, a Zona e as vilas aliadas.
    ...VILLAGE_MAPS.map((v): NpcConfig => ({ id: `travel_${v.id}`, name: 'Posto de Viagem', map: v.id, x: TRAVEL_POST.x, y: TRAVEL_POST.y, range: 2.5, role: 'travel' })),
    { id: 'travel_map_2', name: 'Posto de Viagem', map: 'map_2', x: 46, y: 6, range: 2.5, role: 'travel' },
    ...CONFLICT.camps.map((c): NpcConfig => ({ id: `travel_zona_${c.who}`, name: 'Posto de Viagem', map: 'zona_conflito', ...conflictCamp(c.who).post, range: 2.5, role: 'travel' })),
    { id: 'travel_refugio', name: 'Posto de Viagem', map: 'refugio', x: REFUGE.post.x, y: REFUGE.post.y, range: 2.5, role: 'travel' },
    // Lojistas: cada um atrás do balcão da sua loja (só existem dentro do interior). Alcance 3,3
    // casas: dá para falar com ele da frente do balcão, sem passar para trás.
    ...SHOPS.map((sh): NpcConfig => ({ id: `shop_${sh.shop}`, name: sh.keeper, map: sh.map, x: ROOM.npc.x, y: ROOM.npc.y, range: 3.3, role: 'shop', shop: sh.shop })),
    // Academia (v8): um Professor em cada etapa (dica do passo) e o Diretor na sala 4
    // (Missão de Genin, classe Secundária e candidatura a Kage). O da Sala de Jutsus fica ao
    // SUL do vão, perto de onde se nasce; o da Sala de Armas, longe do canto seguro do Diretor.
    { id: 'tutor_dummies', name: 'Professora Aya', map: 'academy_interior', x: 13, y: 4, range: 2.5, role: 'tutor' },
    { id: 'tutor_meditation', name: 'Professor Daichi', map: 'academy_interior', x: 29.5, y: 4, range: 2.5, role: 'tutor' },
    { id: 'tutor_jutsu', name: 'Professor Kenji', map: 'academy_interior', x: 44.5, y: 12, range: 2.5, role: 'tutor' },
    { id: 'tutor_weapons', name: 'Professora Mei', map: 'academy_interior', x: 61, y: 10, range: 2.5, role: 'tutor' },
    { id: 'director', name: 'Diretor da Academia', map: 'academy_interior', x: ACADEMY.director.x, y: ACADEMY.director.y, range: 3, role: 'director' },
  ],
  endgame: {
    thresholds: { vilas: 30, pvp: 60, renegados: 100, akatsuki: 150 },
    populationDays: 7,
    tickMs: 60_000,
    allyTravelRyo: 50,
    showBountyFrom: 1,
  },
  missionRequestEveryMs: 400,

  inputBufferMs: 250,
  maxQueuedInputs: 20,
  playerMissions: { range: 3, quantities: [3, 5, 10], targetCode: 'slime', missionType: 'DEFEAT_MONSTER' },
  profileRequestEveryMs: 250,
};
