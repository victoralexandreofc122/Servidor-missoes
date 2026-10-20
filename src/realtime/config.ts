/**
 * Regras do tempo real. Valores conservadores para o plano Free do Render;
 * mudam aqui, num lugar só.
 */
import type { Skill } from './protocol.js';
import type { AttributeRules } from './stats.js';

/** Números de cada habilidade. Só os campos que a habilidade usa vêm preenchidos. */
export interface SkillConfig {
  cost: number;            // chakra
  cooldownMs: number;
  damage?: number;
  radius?: number;         // área em volta do jogador (casas)
  range?: number;          // alcance (casas)
  coneDeg?: number;        // abertura do cone
  stunMs?: number;
  rootMs?: number;
  reduction?: number;      // escudo: fração do dano que some (0.5 = metade)
  heal?: number;
  /** Qual atributo escala o dano: 'taijutsu' (corpo a corpo) ou 'ninjutsu' (elemental). Padrão: ninjutsu. */
  scaling?: 'taijutsu' | 'ninjutsu';
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
  /** Ataque básico: não gasta chakra. Acerta o alvo focado (se no alcance) ou o mais perto. */
  basicAttack: { damage: number; range: number; cooldownMs: number };
  /** Quanto cada ponto de atributo vale e o máximo por atributo. */
  attributes: AttributeRules;
  monsters: {
    count: number; type: string; maxHp: number; xp: number; stepMs: number;
    attackRange: number; attackDamage: number; attackEveryMs: number;
    /** Zona de caça: anel em volta do centro do mapa (fora da área segura do renascimento). */
    zoneRadius: number; safeRadius: number; minPlayerDistance: number;
  };
  promotion: { fromRank: string; toRank: string; xp: number };
  /** HP e chakra do próprio jogador: no máximo 1 atualização a cada X ms (regeneração). */
  statsEveryMs: number;
  skills: Record<Skill, SkillConfig>;
}

export interface RealtimeConfig {
  path: string;
  /** Subprotocolo que o servidor escolhe quando o cliente manda o token pelo cabeçalho. */
  subprotocol: string;
  world: { width: number; height: number };
  spawn: { x: number; y: number };
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
  /** NPCs parados no mapa. `range` = distância máxima para conversar (casas). */
  npcs: readonly { id: string; name: string; x: number; y: number; range: number }[];
  /** Pedidos ao banco de missões (falar com NPC, abrir a Sala): no máximo 1 a cada X ms por jogador. */
  missionRequestEveryMs: number;
  /** Vila de pedra no centro (só visual e área segura: os monstros ficam fora). */
  village: { radius: number };
  /** Missões entre jogadores: distância para criar/entregar e quantidades aceitas. */
  playerMissions: { range: number; quantities: readonly number[]; targetCode: string; missionType: string };
  /** Salvar kits / gastar ponto: no máximo 1 gravação a cada X ms por jogador. */
  profileRequestEveryMs: number;
}

export const REALTIME: Readonly<RealtimeConfig> = {
  /** Caminho do WebSocket: wss://<servidor>/game */
  path: '/game',
  subprotocol: 'nin.v1',

  /** Mapa em casas (tiles). Posição é contínua (com 2 casas decimais), de 0 a width / height. */
  world: { width: 100, height: 100 },
  /** Centro do mapa: onde o jogador aparece ao conectar e renasce (a posição ainda não é salva). */
  spawn: { x: 50, y: 50 },

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
    basicAttack: { damage: 12, range: 1.6, cooldownMs: 600 },
    attributes: {
      maxPoints: 10,
      // vitalidade +10 vida · chakra máximo +10 · regen +1/s meditando · agilidade +0,5 velocidade
      // taijutsu +5% no corpo a corpo (Ataque Básico e o soco 👊) · ninjutsu +5% nos jutsus elementais
      perPoint: { vitality: 10, chakraMax: 10, chakraRegen: 1, agility: 0.5, taijutsu: 0.05, ninjutsu: 0.05 },
      // Agilidade também acelera o Ataque Básico: -4% de recarga por ponto (10 pontos: 600 -> 360 ms).
      agilityAttackSpeed: 0.04,
      minAttackCooldownFactor: 0.6,
    },
    monsters: {
      count: 5, type: 'slime', maxHp: 60, xp: 20, stepMs: 1000,
      attackRange: 1.2, attackDamage: 10, attackEveryMs: 2000,
      // A vila (raio 10) é área segura: os monstros andam no anel de 11 a 20 casas.
      zoneRadius: 20, safeRadius: 11, minPlayerDistance: 3,
    },
    promotion: { fromRank: 'ACADEMY', toRank: 'GENIN', xp: 100 },
    statsEveryMs: 200,
    skills: {
      fire: { cost: 20, cooldownMs: 1500, damage: 25, radius: 3 },               // área em volta
      water: { cost: 15, cooldownMs: 1000, damage: 20, range: 4, coneDeg: 90 },  // cone na frente
      taijutsu: { cost: 5, cooldownMs: 500, damage: 35, range: 1.5, scaling: 'taijutsu' },   // soco: escala com Taijutsu
      illusion: { cost: 30, cooldownMs: 4000, range: 5, stunMs: 3000 },          // atordoa: não anda nem ataca
      shadow: { cost: 25, cooldownMs: 6000, range: 5, rootMs: 5000 },            // prende: não anda (ainda ataca)
      stone: { cost: 15, cooldownMs: 6000, reduction: 0.5 },                     // escudo: próximo dano pela metade
      heal: { cost: 30, cooldownMs: 4000, heal: 30 },
    },
  },

  /**
   * O Mestre (sensei NPC) fica ao lado do renascimento (2,2 casas, na diagonal), dentro da área
   * segura (monstros só andam a 5+ casas do centro). Quem renasce já pode falar com ele.
   * Na diagonal e não 2 casas ao norte: com o celular deitado, o "!" sobre ele ficaria
   * embaixo da barra de cima. Conversar: até 2,5 casas de distância.
   */
  npcs: [{ id: 'sensei', name: 'Mestre', x: 52, y: 49, range: 2.5 }],
  missionRequestEveryMs: 400,
  village: { radius: 10 },
  playerMissions: { range: 3, quantities: [3, 5, 10], targetCode: 'slime', missionType: 'DEFEAT_MONSTER' },
  profileRequestEveryMs: 250,
};
