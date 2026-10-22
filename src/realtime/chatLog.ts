import type { Queryable } from '../db.js';
import type { ChatChannel, ChatEntry } from './protocol.js';

/*
 * Histórico do chat: as mensagens ficam 24 h (game.chat_logs, migração v8) e o jogador vê as
 * últimas 100 ao abrir o jogo ou tocar no 🕘 Histórico.
 *
 * O que entra no histórico de um jogador:
 *   global .... todas (são para todo mundo);
 *   sussurro .. só as que ele mandou ou recebeu;
 *   local ..... as faladas no mapa onde ele está agora (a "conversa da sala").
 *
 * Gravar nunca segura o jogo: o tick e o envio do chat não esperam o banco (falhou, fica no log).
 * Sem banco (testes, jogo local), memoryChatLog guarda o mesmo em memória.
 */

export const CHAT_HISTORY = {
  /** Mensagens no histórico de um jogador. */
  limit: 100,
  /** Retenção (ms): 24 h. */
  retentionMs: 24 * 60 * 60 * 1000,
  /** Limpeza das mensagens antigas (ms). */
  purgeEveryMs: 10 * 60 * 1000,
  /** Pedido de histórico: no máximo 1 a cada X ms por jogador. */
  requestEveryMs: 2000,
} as const;

export interface ChatRecord {
  channel: ChatChannel;
  senderId: string;
  senderName: string;
  recipientId?: string;
  recipientName?: string;
  /** Mapa (só a fala local). */
  map?: string;
  message: string;
}

export interface ChatLog {
  record(entry: ChatRecord): Promise<void>;
  /** Últimas mensagens (até `limit`) do histórico do jogador, da mais antiga para a mais nova. */
  history(playerId: string, map: string, limit?: number): Promise<ChatEntry[]>;
  /** Apaga o que passou da retenção. Devolve quantas linhas saíram. */
  purge(): Promise<number>;
}

const COLUMNS = `id, channel, sender_id, sender_name, recipient_name, message, created_at`;
const RECENT = `created_at > now() - interval '24 hours'`;

export const CHAT_SQL = {
  record: `
    INSERT INTO game.chat_logs (channel, sender_id, sender_name, recipient_id, recipient_name, map, message)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  /**
   * Quatro buscas pelos índices parciais da v8 (global, local do mapa, sussurros enviados e
   * recebidos), cada uma com o limite, e as `$3` mais novas do conjunto.
   */
  history: `
    SELECT ${COLUMNS} FROM (
      (SELECT ${COLUMNS} FROM game.chat_logs WHERE channel = 'global' AND ${RECENT} ORDER BY id DESC LIMIT $3)
      UNION ALL
      (SELECT ${COLUMNS} FROM game.chat_logs WHERE channel = 'local' AND map = $2 AND ${RECENT} ORDER BY id DESC LIMIT $3)
      UNION ALL
      (SELECT ${COLUMNS} FROM game.chat_logs WHERE channel = 'whisper' AND sender_id = $1 AND ${RECENT} ORDER BY id DESC LIMIT $3)
      UNION ALL
      (SELECT ${COLUMNS} FROM game.chat_logs WHERE channel = 'whisper' AND recipient_id = $1 AND ${RECENT} ORDER BY id DESC LIMIT $3)
    ) h
    ORDER BY id DESC
    LIMIT $3`,
  purge: `SELECT game.purge_chat_logs() AS n`,
  /** Checagem de boot: a migração v8 (chat_logs) foi aplicada? */
  bootCheck: `SELECT id FROM game.chat_logs LIMIT 0`,
} as const;

interface Row {
  id: string;
  channel: ChatChannel;
  sender_id: string;
  sender_name: string;
  recipient_name: string | null;
  message: string;
  created_at: Date;
}

const toEntry = (r: Row): ChatEntry => ({
  channel: r.channel, playerId: r.sender_id, username: r.sender_name,
  ...(r.recipient_name ? { to: r.recipient_name } : {}),
  message: r.message, at: r.created_at.toISOString(),
});

export function makeChatLog(db: Queryable): ChatLog {
  return {
    async record(e) {
      await db.query(CHAT_SQL.record, [e.channel, e.senderId, e.senderName, e.recipientId ?? null, e.recipientName ?? null, e.map ?? null, e.message]);
    },
    async history(playerId, map, limit = CHAT_HISTORY.limit) {
      const { rows } = await db.query<Row>(CHAT_SQL.history, [playerId, map, limit]);
      return rows.reverse().map(toEntry);   // da mais antiga para a mais nova
    },
    async purge() {
      return (await db.query<{ n: number }>(CHAT_SQL.purge)).rows[0]?.n ?? 0;
    },
  };
}

/** Mesmo comportamento, em memória (sem banco). Guarda no máximo `max` mensagens no total. */
export function memoryChatLog(now: () => number = Date.now, max = 5000): ChatLog {
  const log: (ChatRecord & { at: number })[] = [];
  const fresh = () => {
    const cutoff = now() - CHAT_HISTORY.retentionMs;
    let drop = 0;
    while (drop < log.length && log[drop]!.at <= cutoff) drop += 1;
    if (drop > 0) log.splice(0, drop);
    return drop;
  };
  return {
    async record(e) {
      log.push({ ...e, at: now() });
      if (log.length > max) log.splice(0, log.length - max);
    },
    async history(playerId, map, limit = CHAT_HISTORY.limit) {
      fresh();
      const mine = log.filter((e) => e.channel === 'global'
        || (e.channel === 'local' && e.map === map)
        || (e.channel === 'whisper' && (e.senderId === playerId || e.recipientId === playerId)));
      return mine.slice(-limit).map((e) => ({
        channel: e.channel, playerId: e.senderId, username: e.senderName,
        ...(e.recipientName ? { to: e.recipientName } : {}),
        message: e.message, at: new Date(e.at).toISOString(),
      }));
    },
    async purge() {
      return fresh();
    },
  };
}
