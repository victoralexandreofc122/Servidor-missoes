/**
 * Regras do tempo real. Valores conservadores para o plano Free do Render;
 * mudam aqui, num lugar só.
 */
export interface RealtimeConfig {
  path: string;
  /** Subprotocolo que o servidor escolhe quando o cliente manda o token pelo cabeçalho. */
  subprotocol: string;
  world: { width: number; height: number };
  spawn: { x: number; y: number };
  speedTilesPerSecond: number;
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
}

export const REALTIME: Readonly<RealtimeConfig> = {
  /** Caminho do WebSocket: wss://<servidor>/game */
  path: '/game',
  subprotocol: 'nin.v1',

  /** Mapa em casas (tiles). Posição é contínua (com 2 casas decimais), de 0 a width / height. */
  world: { width: 100, height: 100 },
  /** Onde o jogador aparece ao conectar (a posição ainda não é salva no banco). */
  spawn: { x: 10, y: 10 },

  /**
   * Movimento autoritativo: o cliente manda só a DIREÇÃO (joystick, de -1 a 1) e o servidor
   * anda o jogador a esta velocidade a cada tick. O cliente nunca diz onde está, então
   * speed hack e teleporte não existem.
   */
  speedTilesPerSecond: 5,

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
};
