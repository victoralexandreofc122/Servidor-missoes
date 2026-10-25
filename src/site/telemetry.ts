import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { LiveStats } from '../realtime/gameWorld.js';
import type { WorldWatch } from '../realtime/watch.js';

/*
 * Saúde do servidor e alertas para o site do jogo (Floot, painel do admin).
 *
 *  - Batimento a cada 60 s (POST {SITE_URL}/_api/game/heartbeat): online por mapa, tempo do loop do jogo, atraso do
 *    event loop, memória, banco (SELECT 1 cronometrado) e erros dos últimos 5 min. O SITE vê a queda pela falta do
 *    batimento (o processo morto não avisa). Ele NÃO acorda o servidor: no Render grátis o jogo dorme depois de 15 min
 *    sem ninguém (e o Neon junto); dormir vem com o aviso "desligando" (SIGTERM) e com 0 online no último batimento.
 *  - Alerta na hora (POST /_api/game/alerts): ligou, desligando (SIGTERM do Render), erro (servidor ou cliente), lento
 *    ou instável, e comportamento suspeito. O mesmo alerta (mesma `key`) se repete em rajada: o primeiro sai na hora e
 *    os seguintes viram uma contagem, enviada no próximo batimento.
 *  - Nada de segredo sai daqui: a pilha do erro passa pelo `scrub` (URL do banco, JWT, Bearer, os segredos do .env).
 * Sem SITE_URL ou SITE_TOKEN, tudo funciona igual, só não envia.
 */

export const TELEMETRY = {
  heartbeatMs: 60_000,
  /** Mesma `key` dentro desta janela: não manda de novo, só conta. */
  burstMs: 60_000,
  sendTimeoutMs: 5_000,
  /** Alertas que não saíram (site fora) esperam até este tanto. */
  maxQueue: 100,
  /** Instável: média do tick acima desta fração do orçamento (50 ms) no último batimento. */
  tickSlowRatio: 0.7,
  /** Instável: atraso do event loop (p99) acima disto. */
  loopLagMs: 250,
  /** Memória alta (o plano grátis do Render tem 512 MB). */
  memoryMb: 420,
  /** Banco lento (SELECT 1). */
  dbSlowMs: 1_500,
} as const;

/** Limites do sentinela (comportamento suspeito). */
export const SUSPICION = {
  /** Mensagens inválidas por minuto de um jogador (cliente alterado manda lixo). */
  invalidPerMinute: 30,
  /** Ryō e XP ganhos em 10 min por monstros e chefes (o Rei Lodo dá até 200 ryō a cada 5 min). */
  ryoPer10Min: 3_000,
  xpPer10Min: 15_000,
  /** Vitórias da mesma dupla na Zona de Conflito em 24 h (o banco já para de contar na 4ª). */
  samePairPerDay: 4,
  /** Senha errada na mesma conta em 10 min. */
  failedLoginsPer10Min: 8,
  /** Erros do cliente (bugs) por jogador por minuto: acima disto, ignora. */
  clientErrorsPerMinute: 5,
} as const;

export type AlertKind = 'ligou' | 'desligando' | 'erro' | 'bug' | 'instavel' | 'suspeito';
export type Severity = 'info' | 'aviso' | 'grave';

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
  player: string | null;
  /** Igual = o mesmo problema (agrupa no site). */
  key: string;
  at: string;
  /** Quantas vezes aconteceu desde o último envio desta `key`. */
  count: number;
}

export interface Heartbeat {
  bootId: string;
  startedAt: string;
  at: string;
  uptimeS: number;
  version: string | null;
  online: number;
  byMap: Record<string, number>;
  players: LiveStats['players'];
  monsters: number;
  tick: { avgMs: number; maxMs: number; overruns: number; budgetMs: number };
  loopLagMs: { p99: number; max: number };
  memory: { rssMb: number; heapUsedMb: number };
  db: { ok: boolean; ms: number | null; error: string | null };
  errors5m: number;
}

export interface ClientErrorReport { message: string; source?: string | undefined; line?: number | undefined; stack?: string | undefined }

interface Sender {
  enabled: boolean;
  post(path: string, body: unknown): Promise<boolean>;
}

/** POST com o segredo do site e prazo curto. Falhou: false (quem chama decide se guarda para depois). */
export function makeSiteLink(url: string | undefined, token: string | undefined, fetchFn: typeof fetch = fetch): Sender {
  return {
    enabled: Boolean(url && token),
    async post(path, body) {
      if (!url || !token) return false;
      try {
        const res = await fetchFn(`${url}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-site-token': token },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TELEMETRY.sendTimeoutMs),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

/** Tira segredos de um texto (pilha de erro, mensagem do cliente) antes de sair do servidor. */
export function scrub(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('***');
  return out
    .replace(/\b(postgres(?:ql)?|redis|mysql):\/\/\S+/gi, '$1://***')
    .replace(/\bBearer\s+\S+/gi, 'Bearer ***')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1***');
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface TelemetryOptions {
  link: Sender;
  budgetMs: number;
  /** Segredos do .env que nunca podem sair num alerta. */
  secrets: readonly string[];
  version: string | null;
  live: () => LiveStats | undefined;
  /** SELECT 1 cronometrado; lança se o banco não respondeu. */
  dbPing: () => Promise<number>;
  now?: () => number;
  log?: { warn(obj: object, msg?: string): void };
}

export class Telemetry {
  readonly bootId = randomUUID();
  private readonly now: () => number;
  private readonly startedAt: number;
  private readonly loop: IntervalHistogram | undefined;
  private ticks = { n: 0, totalMs: 0, maxMs: 0, overruns: 0 };
  private lastTicks = { avgMs: 0, maxMs: 0, overruns: 0 };
  private errorTimes: number[] = [];
  private lastDb: Heartbeat['db'] = { ok: true, ms: null, error: null };
  /** Por `key`: quando saiu o último envio e quantas vezes aconteceu depois dele. */
  private bursts = new Map<string, { sentAt: number; pending: Alert | null }>();
  private queue: Alert[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> | undefined;

  constructor(private readonly opts: TelemetryOptions) {
    this.now = opts.now ?? Date.now;
    this.startedAt = this.now();
    try {
      this.loop = monitorEventLoopDelay({ resolution: 20 });
    } catch {
      this.loop = undefined;
    }
  }

  /** Liga: avisa o site que subiu e começa os batimentos. */
  start(): void {
    this.loop?.enable();
    this.alert({ kind: 'ligou', severity: 'info', title: 'Servidor ligou', detail: this.opts.version ? `Versão ${this.opts.version.slice(0, 7)}.` : 'Versão desconhecida.', key: `ligou:${this.bootId}` });
    this.timer = setInterval(() => void this.beat(), TELEMETRY.heartbeatMs);
    this.timer.unref();
  }

  /** Desligando (SIGTERM do Render, deploy): avisa e manda o que estava na fila. Espera no máximo o prazo de envio. */
  async stop(reason: string): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.alert({ kind: 'desligando', severity: 'aviso', title: 'Servidor desligando', detail: reason, key: `desligando:${this.bootId}` });
    await this.flush();
    this.loop?.disable();
  }

  recordTick(ms: number): void {
    this.ticks.n += 1;
    this.ticks.totalMs += ms;
    if (ms > this.ticks.maxMs) this.ticks.maxMs = ms;
    if (ms > this.opts.budgetMs) this.ticks.overruns += 1;
  }

  /** Erro do servidor (500, exceção, falha do banco no meio do jogo). Agrupa pela primeira linha da mensagem. */
  error(source: string, err: unknown, context?: string): void {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err) ?? String(err));
    const first = scrub(e.message || e.name, this.opts.secrets).split('\n')[0]!.slice(0, 160);
    const stack = scrub((e.stack ?? '').split('\n').slice(1, 7).join('\n'), this.opts.secrets);
    this.errorTimes.push(this.now());
    this.alert({
      kind: 'erro', severity: 'grave', title: `Erro no servidor (${source}): ${first}`,
      detail: [context ? scrub(context, this.opts.secrets) : null, stack].filter(Boolean).join('\n'), key: `erro:${source}:${first}`,
    });
  }

  /** Erro no navegador de um jogador (bug do cliente). */
  bug(username: string, report: ClientErrorReport): void {
    const message = scrub(report.message, this.opts.secrets).slice(0, 200);
    const where = report.source ? `${report.source.split('/').pop()}${report.line ? `:${report.line}` : ''}` : 'cliente';
    this.alert({
      kind: 'bug', severity: 'aviso', title: `Bug no jogo (${where}): ${message}`, player: username,
      detail: scrub(report.stack ?? '', this.opts.secrets).split('\n').slice(0, 6).join('\n'), key: `bug:${where}:${message}`,
    });
  }

  /** Um alerta: o primeiro de cada `key` sai na hora; os repetidos em seguida só somam. */
  alert(a: Omit<Alert, 'at' | 'count' | 'player'> & { player?: string | null }): void {
    const t = this.now();
    const alert: Alert = { ...a, player: a.player ?? null, at: new Date(t).toISOString(), count: 1 };
    const burst = this.bursts.get(a.key);
    if (burst && t - burst.sentAt < TELEMETRY.burstMs) {
      burst.pending = burst.pending ? { ...burst.pending, count: burst.pending.count + 1, at: alert.at } : alert;
      return;
    }
    this.bursts.set(a.key, { sentAt: t, pending: null });
    this.enqueue(alert);
    void this.flush();
  }

  private enqueue(alert: Alert): void {
    this.queue.push(alert);
    if (this.queue.length > TELEMETRY.maxQueue) this.queue.splice(0, this.queue.length - TELEMETRY.maxQueue);
  }

  /**
   * Manda a fila de alertas até esvaziar (o que chegar durante um envio vai no seguinte). Falhou: volta para a fila e
   * o próximo batimento tenta de novo.
   */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.queue.length === 0 || !this.opts.link.enabled) return;
    this.flushing = (async () => {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0);
        if (!(await this.opts.link.post('/_api/game/alerts', { bootId: this.bootId, alerts: batch }))) {
          this.queue.unshift(...batch);
          if (this.queue.length > TELEMETRY.maxQueue) this.queue.splice(0, this.queue.length - TELEMETRY.maxQueue);
          return;
        }
      }
    })().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  /** O retrato de agora (o painel do admin pede na hora; o batimento manda o mesmo). */
  current(): Omit<Heartbeat, 'db'> & { db: Heartbeat['db'] } {
    const t = this.now();
    this.errorTimes = this.errorTimes.filter((x) => t - x < 5 * 60_000);
    const live = this.opts.live() ?? { online: 0, byMap: {}, players: [], monsters: 0 };
    const mem = process.memoryUsage();
    const p99 = this.loop ? this.loop.percentile(99) / 1e6 : 0;
    const max = this.loop ? this.loop.max / 1e6 : 0;
    return {
      bootId: this.bootId, startedAt: new Date(this.startedAt).toISOString(), at: new Date(t).toISOString(),
      uptimeS: Math.round((t - this.startedAt) / 1000), version: this.opts.version,
      online: live.online, byMap: live.byMap, players: live.players, monsters: live.monsters,
      // Antes do primeiro batimento (ou logo depois dele), a janela que está correndo, se já tem 1 s de passos.
      tick: { ...(this.ticks.n >= 20 ? this.windowTicks() : this.lastTicks), budgetMs: this.opts.budgetMs },
      loopLagMs: { p99: round1(p99), max: round1(max) },
      memory: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed) },
      db: this.lastDb,
      errors5m: this.errorTimes.length,
    };
  }

  private windowTicks() {
    const { n, totalMs, maxMs, overruns } = this.ticks;
    return { avgMs: n ? round1(totalMs / n) : 0, maxMs: round1(maxMs), overruns };
  }

  /** Um batimento: mede, confere os limites (alerta de instável), manda os repetidos acumulados e o retrato. */
  async beat(): Promise<Heartbeat> {
    const n = this.ticks.n;
    this.lastTicks = this.windowTicks();
    this.ticks = { n: 0, totalMs: 0, maxMs: 0, overruns: 0 };
    try {
      const ms = await this.opts.dbPing();
      this.lastDb = { ok: true, ms: Math.round(ms), error: null };
    } catch (err) {
      this.lastDb = { ok: false, ms: null, error: scrub((err as Error)?.message ?? String(err), this.opts.secrets).slice(0, 200) };
    }
    const hb = this.current();
    this.checkLimits(hb, n);
    this.loop?.reset();
    for (const burst of this.bursts.values()) {
      if (burst.pending) {
        this.enqueue(burst.pending);
        burst.pending = null;
        burst.sentAt = this.now();
      }
    }
    await this.flush();
    if (this.opts.link.enabled) await this.opts.link.post('/_api/game/heartbeat', hb);
    return hb;
  }

  private checkLimits(hb: Heartbeat, ticks: number): void {
    const budget = this.opts.budgetMs;
    if (ticks > 0 && (hb.tick.avgMs > budget * TELEMETRY.tickSlowRatio || hb.tick.overruns > ticks * 0.1)) {
      this.alert({
        kind: 'instavel', severity: 'aviso', key: 'instavel:tick',
        title: 'O loop do jogo está lento',
        detail: `Média de ${hb.tick.avgMs} ms por passo (o limite é ${budget} ms); ${hb.tick.overruns} de ${ticks} passos passaram do limite. Com ${hb.online} online. Os jogadores sentem atraso.`,
      });
    }
    if (hb.loopLagMs.p99 > TELEMETRY.loopLagMs) {
      this.alert({
        kind: 'instavel', severity: 'aviso', key: 'instavel:loop',
        title: 'O servidor está travando', detail: `O event loop atrasou ${hb.loopLagMs.p99} ms (p99; máximo ${hb.loopLagMs.max} ms). CPU no limite ou trabalho pesado fora do loop.`,
      });
    }
    if (hb.memory.rssMb > TELEMETRY.memoryMb) {
      this.alert({
        kind: 'instavel', severity: 'grave', key: 'instavel:memoria',
        title: 'Memória alta', detail: `${hb.memory.rssMb} MB em uso (o plano grátis do Render tem 512 MB e reinicia o servidor se passar).`,
      });
    }
    if (!hb.db.ok) {
      this.alert({ kind: 'instavel', severity: 'grave', key: 'instavel:banco', title: 'O banco não respondeu', detail: `Erro: ${hb.db.error}. O Neon pode estar fora ou suspenso.` });
    } else if (hb.db.ms !== null && hb.db.ms > TELEMETRY.dbSlowMs) {
      this.alert({ kind: 'instavel', severity: 'aviso', key: 'instavel:banco-lento', title: 'Banco lento', detail: `Um SELECT 1 levou ${hb.db.ms} ms.` });
    }
  }
}

/**
 * Sentinela: sinais de trapaça ou abuso que o servidor vê. O movimento já é do servidor (não dá para correr mais
 * rápido); aqui ficam flood, cliente alterado, ganho fora do normal, troca de vitórias no PvP e chute de senha.
 * Cada sinal vira um alerta "suspeito" para o admin olhar: ninguém é punido sozinho.
 */
export class Sentinel implements WorldWatch {
  private invalid = new Map<string, number[]>();
  private gains = new Map<string, { at: number; xp: number; ryo: number }[]>();
  private pairs = new Map<string, number[]>();
  private logins = new Map<string, number[]>();
  private clientErrors = new Map<string, number[]>();

  constructor(private readonly telemetry: Telemetry, private readonly now: () => number = Date.now) {}

  tick(ms: number): void {
    this.telemetry.recordTick(ms);
  }

  /** Guarda os instantes da janela e devolve quantos sobraram (com o de agora). */
  private hit(map: Map<string, number[]>, key: string, windowMs: number): number {
    const t = this.now();
    const list = (map.get(key) ?? []).filter((x) => t - x < windowMs);
    list.push(t);
    map.set(key, list);
    return list.length;
  }

  floodKick(username: string): void {
    this.telemetry.alert({
      kind: 'suspeito', severity: 'aviso', player: username, key: `suspeito:flood:${username}`,
      title: `Flood: ${username} foi desconectado`, detail: 'Mandou mensagens demais por segundo (bot, macro ou cliente alterado).',
    });
  }

  invalidMessage(username: string): void {
    const n = this.hit(this.invalid, username, 60_000);
    if (n === SUSPICION.invalidPerMinute) {
      this.telemetry.alert({
        kind: 'suspeito', severity: 'aviso', player: username, key: `suspeito:invalidas:${username}`,
        title: `Mensagens inválidas de ${username}`, detail: `${n} mensagens fora do protocolo em 1 minuto: cliente alterado ou script.`,
      });
    }
  }

  rewards(username: string, xp: number, ryo: number): void {
    const t = this.now();
    const list = (this.gains.get(username) ?? []).filter((g) => t - g.at < 10 * 60_000);
    const before = list.reduce((s, g) => ({ xp: s.xp + g.xp, ryo: s.ryo + g.ryo }), { xp: 0, ryo: 0 });
    list.push({ at: t, xp, ryo });
    this.gains.set(username, list);
    const after = { xp: before.xp + xp, ryo: before.ryo + ryo };
    if (before.ryo <= SUSPICION.ryoPer10Min && after.ryo > SUSPICION.ryoPer10Min) {
      this.telemetry.alert({
        kind: 'suspeito', severity: 'aviso', player: username, key: `suspeito:ryo:${username}`,
        title: `Ryō rápido demais: ${username}`, detail: `${after.ryo} ryō de monstros e chefes em 10 minutos (o normal fica bem abaixo de ${SUSPICION.ryoPer10Min}). Pode ser um bug de recompensa.`,
      });
    }
    if (before.xp <= SUSPICION.xpPer10Min && after.xp > SUSPICION.xpPer10Min) {
      this.telemetry.alert({
        kind: 'suspeito', severity: 'aviso', player: username, key: `suspeito:xp:${username}`,
        title: `XP rápido demais: ${username}`, detail: `${after.xp} de XP de monstros em 10 minutos (limite de alerta: ${SUSPICION.xpPer10Min}).`,
      });
    }
  }

  pvpKill(winner: string, loser: string): void {
    const n = this.hit(this.pairs, `${winner}>${loser}`, 24 * 60 * 60_000);
    if (n === SUSPICION.samePairPerDay) {
      this.telemetry.alert({
        kind: 'suspeito', severity: 'aviso', player: winner, key: `suspeito:par:${winner}>${loser}`,
        title: `Possível troca de vitórias: ${winner} e ${loser}`, detail: `${winner} venceu ${loser} ${n} vezes em 24 h na Zona de Conflito. O ranking já para de contar na 4ª, mas vale olhar (conta alternativa?).`,
      });
    }
  }

  failedLogin(login: string): void {
    const key = login.trim().toLowerCase();
    const n = this.hit(this.logins, key, 10 * 60_000);
    if (n === SUSPICION.failedLoginsPer10Min) {
      this.telemetry.alert({
        kind: 'suspeito', severity: 'grave', player: login, key: `suspeito:senha:${key}`,
        title: `Muitas senhas erradas: ${login}`, detail: `${n} tentativas de senha errada em 10 minutos nesta conta (alguém pode estar tentando entrar nela).`,
      });
    }
  }

  clientError(username: string, report: ClientErrorReport): void {
    if (this.hit(this.clientErrors, username, 60_000) > SUSPICION.clientErrorsPerMinute) return;
    this.telemetry.bug(username, report);
  }

  serverError(source: string, err: unknown, context?: string): void {
    this.telemetry.error(source, err, context);
  }
}
