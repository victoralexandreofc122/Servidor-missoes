/*
 * O que o mundo do jogo conta para quem vigia o servidor (src/site/telemetry.ts: saúde e sentinela do site do jogo).
 * Tudo opcional e síncrono: o mundo só avisa, nunca espera. Sem vigia (testes, local sem site), nada acontece.
 */

export interface ClientError { message: string; source?: string | undefined; line?: number | undefined; stack?: string | undefined }

export interface WorldWatch {
  /** Quanto durou um passo do loop do jogo (ms). */
  tick?(ms: number): void;
  /** Derrubado por flood (mensagens demais por segundo). */
  floodKick?(username: string): void;
  /** Mandou uma mensagem fora do protocolo. */
  invalidMessage?(username: string): void;
  /** Ganhou XP e ryō de monstro ou chefe (já gravado no banco). */
  rewards?(username: string, xp: number, ryo: number): void;
  /** Venceu na Zona de Conflito. */
  pvpKill?(winner: string, loser: string): void;
  /** Erro no navegador do jogador (o cliente manda `client_error`). */
  clientError?(username: string, report: ClientError): void;
}
