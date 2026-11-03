/*
 * Modo rankeado (v29, pedido do Victor em 03/11/2026): o ninja aperta "Rankeado" e vai para o Vale das Estátuas,
 * um mapa onde se encontram os ninjas de todas as vilas. Lá ele aperta "Desafio" e entra na FILA; enquanto espera,
 * assiste à luta da arena. Ninguém sabe contra quem vai lutar até a preparação começar.
 *
 * A fila (função pura `takeMatch`):
 *  - quem apertou primeiro (a cabeça da fila) SEMPRE luta na próxima vez;
 *  - o adversário sai das próximas `window` pessoas da fila: a primeira com nível parecido (diferença até
 *    `levelGap`); se nenhuma tiver, a de nível mais perto;
 *  - quem é passado para trás ganha um "pulo"; com `maxSkips` pulos, ninguém mais passa na frente dele: ele é o
 *    próximo adversário escolhido. Assim ninguém fica muito para trás nem é passado várias vezes;
 *  - v29 (revisão EGM): a cabeça não pega de novo o último adversário se houver outra pessoa na janela.
 *
 * Contra abuso (revisão EGM): quem sai no meio perde e fica um tempo fora da fila (`leavePenaltyMs`, dobra a cada
 * saída no dia); sair na preparação cancela a partida sem pontos; partida sem dano nenhum não conta pontos.
 *
 * A partida (melhor de 3, regras do `concepts_brief.md`): preparação de 10 s, rodadas de até 50 s, 5 s entre as
 * rodadas. Cada rodada começa com vida e chakra cheios; o chakra só volta meditando (decisão do Victor, 03/11) e a
 * vida só com o chakra cheio e 7 s sem apanhar nem gastar chakra (a regra do jogo todo). Rodada que chega aos 50 s: vence quem tem mais vida em porcentagem; empate: quem causou mais dano na
 * rodada; empate de novo: a rodada se repete uma vez; depois, quem causou mais dano na partida (e, se ainda empatar,
 * quem esperava há mais tempo na fila, o lado `a`).
 *
 * Tudo aqui é puro (sem rede, sem banco): o `gameWorld.ts` só hospeda a luta e chama estas funções.
 */

export const DUEL = {
  prepMs: 10_000,
  roundMs: 50_000,
  intervalMs: 5_000,
  /** Depois da última rodada: o resultado na tela antes de os dois saírem da arena. */
  endMs: 6_000,
  roundsToWin: 2,
  /** Quantas pessoas depois da cabeça podem ser escolhidas como adversário. */
  window: 4,
  /** Quantas vezes alguém pode ser passado para trás antes de ser escolhido na marra. */
  maxSkips: 2,
  /** Diferença de nível considerada "parecida". */
  levelGap: 5,
  /** Nível mínimo para entrar na fila (com classe). */
  minLevel: 1,
  /** Castigo de quem sai da partida: 1ª saída 1 min, depois dobra (até 16 min); zera depois de 24 h. */
  leavePenaltyMs: 60_000,
  leavePenaltyMaxMs: 16 * 60_000,
  /** v29 (revisão EGM, aprovado pelo Victor): quem cai no meio da partida tem este tempo para reconectar. */
  reconnectMs: 15_000,
} as const;

export interface QueueEntry {
  id: string;
  level: number;
  joinedAt: number;
  /** Quantas vezes já foi passado para trás. */
  skips: number;
  /** O último adversário (a fila evita repetir a dupla em seguida). */
  last?: string;
}

/** Quanto tempo fora da fila depois da `n`-ésima saída (n >= 1). */
export function leavePenalty(n: number): number {
  return Math.min(DUEL.leavePenaltyMaxMs, DUEL.leavePenaltyMs * 2 ** Math.max(0, n - 1));
}

export interface MatchPick {
  /** Quem esperava há mais tempo (a cabeça da fila). */
  a: string;
  b: string;
  /** A fila que sobra (com os pulos já somados). */
  rest: QueueEntry[];
}

/** Tira da fila a próxima dupla. Sem 2 pessoas, `null`. Não muda a fila recebida. */
export function takeMatch(queue: readonly QueueEntry[], rules: Pick<typeof DUEL, 'window' | 'maxSkips' | 'levelGap'> = DUEL): MatchPick | null {
  if (queue.length < 2) return null;
  const head = queue[0]!;
  const full = queue.slice(1, 1 + rules.window);
  const fresh = full.filter((e) => e.id !== head.last && e.last !== head.id);
  const window = fresh.length > 0 ? fresh : full;
  let pick = window.findIndex((e) => e.skips >= rules.maxSkips);
  if (pick < 0) pick = window.findIndex((e) => Math.abs(e.level - head.level) <= rules.levelGap);
  if (pick < 0) {
    let best = Infinity;
    window.forEach((e, i) => {
      const d = Math.abs(e.level - head.level);
      if (d < best) { best = d; pick = i; }
    });
  }
  const b = window[pick]!;
  const rest = queue.slice(1).filter((e) => e !== b).map((e) => {
    const passed = window.indexOf(e);
    return passed >= 0 && passed < pick ? { ...e, skips: e.skips + 1 } : { ...e };
  });
  return { a: head.id, b: b.id, rest };
}

/** Posição de cada um na fila (1 = o próximo a lutar). */
export function queuePosition(queue: readonly QueueEntry[], id: string): number {
  const i = queue.findIndex((e) => e.id === id);
  return i < 0 ? 0 : i + 1;
}

// ---------------------------------------------------------------- a partida

export type DuelPhase = 'prep' | 'round' | 'interval' | 'done';
export type Side = 'a' | 'b';

export interface DuelMatch {
  id: number;
  a: string;
  b: string;
  phase: DuelPhase;
  /** Quando a fase atual acaba (relógio do servidor). */
  until: number;
  /** Rodada atual (1, 2, 3...; uma rodada repetida não conta de novo). */
  round: number;
  wins: { a: number; b: number };
  /** Dano causado por cada lado nesta rodada e na partida inteira. */
  roundDamage: { a: number; b: number };
  matchDamage: { a: number; b: number };
  /** Esta rodada já é a repetição de um empate. */
  replay: boolean;
  /** Quem venceu cada rodada (para o placar). */
  history: Side[];
  /** Quando a partida e a rodada atual começaram (para a duração gravada no banco). */
  startedAt: number;
  roundStartedAt: number;
  /** Cada rodada fechada: quem venceu, quanto durou e o dano de cada lado (vai para o banco, v15). */
  rounds: { winner: Side; ms: number; damageA: number; damageB: number }[];
  winner?: Side;
  /** Por que acabou: 'rounds' (venceu 2), 'forfeit' (o outro saiu ou desistiu). */
  reason?: 'rounds' | 'forfeit';
}

export function newMatch(id: number, a: string, b: string, now: number): DuelMatch {
  return {
    id, a, b, phase: 'prep', until: now + DUEL.prepMs, round: 1, wins: { a: 0, b: 0 },
    roundDamage: { a: 0, b: 0 }, matchDamage: { a: 0, b: 0 }, replay: false, history: [],
    startedAt: now, roundStartedAt: now, rounds: [],
  };
}

export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
export const sideOf = (m: DuelMatch, id: string): Side | null => (id === m.a ? 'a' : id === m.b ? 'b' : null);

/** Soma dano causado por `by` (já depois do escudo e da rede de segurança). */
export function addDamage(m: DuelMatch, by: Side, dmg: number): void {
  if (m.phase !== 'round' || dmg <= 0) return;
  m.roundDamage[by] += dmg;
  m.matchDamage[by] += dmg;
}

/**
 * Quem venceu a rodada que acabou no tempo: mais vida em porcentagem, depois mais dano na rodada.
 * `null` = empate de verdade (a rodada se repete uma vez).
 */
export function timeoutWinner(m: DuelMatch, hpShare: { a: number; b: number }): Side | null {
  const EPS = 1e-6;
  if (Math.abs(hpShare.a - hpShare.b) > EPS) return hpShare.a > hpShare.b ? 'a' : 'b';
  if (m.roundDamage.a !== m.roundDamage.b) return m.roundDamage.a > m.roundDamage.b ? 'a' : 'b';
  return null;
}

/**
 * Fecha a rodada. `winner` null = empate: repete a rodada uma vez; no segundo empate decide o dano da partida (e,
 * empatando de novo, o lado `a`). Devolve se a partida acabou.
 */
export function endRound(m: DuelMatch, winner: Side | null, now: number): boolean {
  if (winner === null) {
    if (!m.replay) {
      m.replay = true;
      m.roundDamage = { a: 0, b: 0 };
      m.phase = 'interval';
      m.until = now + DUEL.intervalMs;
      return false;
    }
    winner = m.matchDamage.a >= m.matchDamage.b ? 'a' : 'b';
  }
  m.wins[winner] += 1;
  m.history.push(winner);
  m.rounds.push({ winner, ms: now - m.roundStartedAt, damageA: m.roundDamage.a, damageB: m.roundDamage.b });
  m.replay = false;
  m.roundDamage = { a: 0, b: 0 };
  if (m.wins[winner] >= DUEL.roundsToWin) {
    m.winner = winner;
    m.reason = 'rounds';
    m.phase = 'done';
    m.until = now + DUEL.endMs;
    return true;
  }
  m.round += 1;
  m.phase = 'interval';
  m.until = now + DUEL.intervalMs;
  return false;
}

/** Um lado saiu ou desistiu: o outro vence na hora. */
export function forfeit(m: DuelMatch, loser: Side, now: number): void {
  if (m.phase === 'done') return;
  m.winner = other(loser);
  m.reason = 'forfeit';
  m.phase = 'done';
  m.until = now + DUEL.endMs;
}

/** Passa de fase quando o tempo acaba (preparação e intervalo viram rodada). Devolve se mudou. */
export function advance(m: DuelMatch, now: number): boolean {
  if (now < m.until) return false;
  if (m.phase === 'prep' || m.phase === 'interval') {
    m.phase = 'round';
    m.until = now + DUEL.roundMs;
    m.roundStartedAt = now;
    return true;
  }
  return false;
}
