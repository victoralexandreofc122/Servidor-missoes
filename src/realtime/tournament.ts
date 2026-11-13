/*
 * v43 (Fase 2, passo 4; migração v28): Fase Final do Torneio da Temporada. Só contas, sem banco e sem relógio.
 *
 *  - Grupos de até 5, cabeças de chave espalhados em "cobrinha" (a MESMA conta de game.tournament_start_groups).
 *  - Passam os 2 primeiros de cada grupo. Eles formam a chave da eliminatória, com folga (bye) para os melhores quando
 *    o número não é potência de 2.
 *  - Os Jounin da era: quem entrou na chave e, se ainda sobrar vaga, os melhores terceiros (depois quartos...) dos
 *    grupos. A ordem (Rank de Jounin): campeão, vice, semifinalistas... e por fim os que não entraram na chave.
 */

export const FINAL_RULES = { groupSize: 5, advance: 2 } as const;

/** Quantos grupos para `n` finalistas (grupos de até 5; tamanhos diferem em no máximo 1). */
export const groupCount = (n: number): number => Math.max(0, Math.ceil(n / FINAL_RULES.groupSize));

/** O grupo (1..g) do cabeça de chave `seed` (1 = o melhor) em "cobrinha". */
export function snakeGroup(seed: number, groups: number): number {
  const row = Math.floor((seed - 1) / groups), col = (seed - 1) % groups;
  return row % 2 === 0 ? col + 1 : groups - col;
}

/** Os grupos de `n` finalistas: cada grupo com os seus cabeças de chave, em ordem. */
export function makeGroups(n: number): number[][] {
  const g = groupCount(n);
  const out: number[][] = Array.from({ length: g }, () => []);
  for (let seed = 1; seed <= n; seed++) out[snakeGroup(seed, g) - 1]!.push(seed);
  return out;
}

export interface GroupRow { groupNo: number; position: number; playerId: string; seed: number; wins: number; losses: number; roundsFor: number; roundsAgainst: number }

/** Ordem de desempenho entre jogadores de grupos diferentes: vitórias, saldo de rodadas, rodadas vencidas, cabeça de chave. */
const byPerformance = (a: GroupRow, b: GroupRow) =>
  b.wins - a.wins || (b.roundsFor - b.roundsAgainst) - (a.roundsFor - a.roundsAgainst) || b.roundsFor - a.roundsFor || a.seed - b.seed;

/** Quem passa dos grupos, já na ordem da chave: primeiro os 1ºs de grupo (do melhor para o pior), depois os 2ºs. */
export function bracketEntrants(table: readonly GroupRow[]): GroupRow[] {
  const at = (pos: number) => table.filter((r) => r.position === pos).sort(byPerformance);
  const firsts = at(1), seconds = at(2);
  // Na chave cheia o i-ésimo melhor 1º pega o i-ésimo pior 2º: se forem do mesmo grupo, troca esse 2º com um vizinho.
  const g = firsts.length;
  if (seconds.length === g) {
    for (let i = 0; i < g; i++) {
      const j = g - 1 - i;
      if (seconds[j]!.groupNo !== firsts[i]!.groupNo) continue;
      const k = [j - 1, j + 1].find((x) => x >= 0 && x < g && seconds[x]!.groupNo !== firsts[i]!.groupNo && seconds[j]!.groupNo !== firsts[g - 1 - x]!.groupNo);
      if (k !== undefined) [seconds[j], seconds[k]] = [seconds[k]!, seconds[j]!];
    }
  }
  return [...firsts, ...seconds].slice(0, groupCountOf(table) * FINAL_RULES.advance);
}
const groupCountOf = (table: readonly GroupRow[]) => new Set(table.map((r) => r.groupNo)).size;

/** A ordem clássica das chaves para `size` (potência de 2): [1, 4, 2, 3] para 4; 1 x último, 2 x penúltimo... */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export interface BracketMatch { round: number; slot: number; rounds: number; a: string | null; b: string | null; winner: string | null; bye?: boolean }

/**
 * A chave inicial: a 1ª rodada com `entrants` na ordem das chaves e, onde falta adversário (bye), o melhor já passa para
 * a 2ª rodada. Devolve as linhas a gravar (1ª rodada inteira e as da 2ª que já têm alguém).
 */
export function makeBracket(entrants: readonly string[]): BracketMatch[] {
  const n = entrants.length;
  if (n < 2) return [];
  let size = 2;
  while (size < n) size *= 2;
  const rounds = Math.log2(size);
  const order = bracketOrder(size);
  const out: BracketMatch[] = [];
  const next = new Map<number, BracketMatch>();
  for (let i = 0; i < size; i += 2) {
    const slot = i / 2 + 1;
    const a = entrants[order[i]! - 1] ?? null, b = entrants[order[i + 1]! - 1] ?? null;
    const bye = (a === null) !== (b === null);
    const winner = bye ? (a ?? b) : null;
    out.push({ round: 1, slot, rounds, a, b, winner, ...(bye ? { bye: true } : {}) });
    if (winner && rounds > 1) {
      const ns = Math.ceil(slot / 2);
      const m = next.get(ns) ?? { round: 2, slot: ns, rounds, a: null, b: null, winner: null };
      if (slot % 2 === 1) m.a = winner; else m.b = winner;
      next.set(ns, m);
    }
  }
  return [...out, ...[...next.values()].sort((x, y) => x.slot - y.slot)];
}

/** A chave acabou? (A final tem vencedor.) */
export const bracketChampion = (bracket: readonly BracketMatch[]): string | null =>
  bracket.find((m) => m.round === m.rounds && m.slot === 1)?.winner ?? null;

/**
 * Os Jounin da era de uma vila, na ordem do Rank de Jounin, no máximo `slots`:
 *  1. quem entrou na chave, por quão longe foi (campeão, vice, semifinalistas...), desempate pela ordem de entrada;
 *  2. sobrando vaga, os melhores 3ºs dos grupos, depois os 4ºs e os 5ºs.
 */
export function jouninOfEra(slots: number, table: readonly GroupRow[], bracket: readonly BracketMatch[]): string[] {
  const entrants = bracketEntrants(table).map((r) => r.playerId);
  const reached = (id: string) => {
    let best = 0;
    for (const m of bracket) {
      if (m.a === id || m.b === id) best = Math.max(best, m.round);
      if (m.winner === id && m.round === m.rounds) best = m.rounds + 1;
    }
    return best;
  };
  const inBracket = [...entrants].sort((x, y) => reached(y) - reached(x) || entrants.indexOf(x) - entrants.indexOf(y));
  const rest = [3, 4, 5].flatMap((pos) => table.filter((r) => r.position === pos).sort(byPerformance)).map((r) => r.playerId);
  return [...inBracket, ...rest].slice(0, Math.max(0, slots));
}

/** v55: `big` = semifinal ou final (luta sozinha na arena principal); `label` = o que aparece no painel. */
export interface PendingMatch { a: string; b: string; big?: boolean; label?: string }
/**
 * Fila da fase final: a primeira dupla, por ordem de espera, que tem um jogo pendente entre si (grupo ou chave).
 * `queue` = ids em ordem de chegada. Devolve a dupla e a fila que sobra; sem dupla possível, `null`.
 */
export function takePending(queue: readonly string[], pending: readonly PendingMatch[]): { a: string; b: string; rest: string[] } | null {
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i]!, b = queue[j]!;
      if (pending.some((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a))) return { a, b, rest: queue.filter((x) => x !== a && x !== b) };
    }
  }
  return null;
}
