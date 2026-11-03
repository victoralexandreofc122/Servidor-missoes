import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DUEL, addDamage, advance, endRound, forfeit, newMatch, queuePosition, takeMatch, timeoutWinner, type QueueEntry } from '../src/realtime/duel.js';

const q = (...levels: number[]): QueueEntry[] => levels.map((level, i) => ({ id: `p${i}`, level, joinedAt: i, skips: 0 }));

describe('fila do rankeado (v29)', () => {
  it('menos de 2 na fila: ninguém luta', () => {
    assert.equal(takeMatch([]), null);
    assert.equal(takeMatch(q(10)), null);
  });

  it('a cabeça da fila sempre luta; com nível parecido, pega o primeiro da fila', () => {
    const m = takeMatch(q(20, 22, 20))!;
    assert.deepEqual([m.a, m.b], ['p0', 'p1']);
    assert.deepEqual(m.rest.map((e) => e.id), ['p2']);
    assert.equal(m.rest[0]!.skips, 0);
  });

  it('pula quem tem nível muito diferente e soma um pulo nele', () => {
    const m = takeMatch(q(20, 50, 21))!;
    assert.deepEqual([m.a, m.b], ['p0', 'p2']);
    assert.deepEqual(m.rest.map((e) => [e.id, e.skips]), [['p1', 1]]);
  });

  it('sem ninguém parecido na janela, escolhe o nível mais perto', () => {
    const m = takeMatch(q(20, 60, 40, 55))!;
    assert.equal(m.b, 'p2');
  });

  it('só olha as próximas pessoas da janela (ninguém do fim da fila fura a fila)', () => {
    const levels = [20, 60, 60, 60, 60, 20];
    const m = takeMatch(q(...levels))!;
    assert.notEqual(m.b, 'p5');
  });

  it(`quem foi passado ${DUEL.maxSkips} vezes é escolhido na marra`, () => {
    const queue = q(20, 50, 21, 22);
    queue[1]!.skips = DUEL.maxSkips;
    assert.equal(takeMatch(queue)!.b, 'p1');
  });

  it('ninguém é passado para trás mais que o limite, nem fica para sempre na fila', () => {
    // fila longa e sempre chegando gente nova de nível parecido com a cabeça; o de nível 59 tem que lutar logo
    let queue: QueueEntry[] = [{ id: 'velho', level: 59, joinedAt: 0, skips: 0 }];
    let next = 1;
    const fought: string[] = [];
    for (let turn = 0; turn < 30 && !fought.includes('velho'); turn++) {
      while (queue.length < 6) queue.push({ id: `n${next}`, level: 10, joinedAt: next++, skips: 0 });
      if (turn === 0) queue = [queue[1]!, queue[0]!, ...queue.slice(2)];   // o velho não está na cabeça
      const m = takeMatch(queue)!;
      fought.push(m.a, m.b);
      queue = m.rest;
      const v = queue.find((e) => e.id === 'velho');
      if (v) assert.ok(v.skips <= DUEL.maxSkips, 'passou do limite de pulos');
    }
    assert.ok(fought.includes('velho'), 'o de nível diferente nunca lutou');
  });

  it('posição na fila', () => {
    const queue = q(1, 2, 3);
    assert.equal(queuePosition(queue, 'p0'), 1);
    assert.equal(queuePosition(queue, 'p2'), 3);
    assert.equal(queuePosition(queue, 'x'), 0);
  });
});

describe('partida do rankeado (melhor de 3)', () => {
  it('preparação, rodada, intervalo e fim depois de 2 vitórias', () => {
    const m = newMatch(1, 'A', 'B', 0);
    assert.equal(m.phase, 'prep');
    assert.equal(advance(m, DUEL.prepMs - 1), false);
    assert.equal(advance(m, DUEL.prepMs), true);
    assert.equal(m.phase, 'round');
    assert.equal(endRound(m, 'a', 20_000), false);
    assert.equal(m.phase, 'interval');
    advance(m, 20_000 + DUEL.intervalMs);
    assert.equal(m.round, 2);
    assert.equal(endRound(m, 'a', 40_000), true);
    assert.equal(m.winner, 'a');
    assert.equal(m.reason, 'rounds');
    assert.deepEqual(m.history, ['a', 'a']);
  });

  it('rodada no tempo: mais vida em %, depois mais dano na rodada', () => {
    const m = newMatch(1, 'A', 'B', 0);
    advance(m, DUEL.prepMs);
    assert.equal(timeoutWinner(m, { a: 0.4, b: 0.6 }), 'b');
    addDamage(m, 'a', 30);
    addDamage(m, 'b', 10);
    assert.equal(timeoutWinner(m, { a: 0.5, b: 0.5 }), 'a');
  });

  it('empate repete a rodada uma vez; o segundo empate decide pelo dano da partida', () => {
    const m = newMatch(1, 'A', 'B', 0);
    advance(m, DUEL.prepMs);
    addDamage(m, 'b', 5);
    assert.equal(endRound(m, null, 60_000), false);
    assert.equal(m.round, 1, 'a repetição não conta como rodada nova');
    advance(m, 60_000 + DUEL.intervalMs);
    endRound(m, null, 120_000);
    assert.deepEqual(m.wins, { a: 0, b: 1 });
  });

  it('dano fora da rodada não conta', () => {
    const m = newMatch(1, 'A', 'B', 0);
    addDamage(m, 'a', 50);
    assert.equal(m.matchDamage.a, 0);
  });

  it('quem sai perde na hora', () => {
    const m = newMatch(1, 'A', 'B', 0);
    advance(m, DUEL.prepMs);
    forfeit(m, 'b', 15_000);
    assert.equal(m.winner, 'a');
    assert.equal(m.reason, 'forfeit');
    assert.equal(m.phase, 'done');
  });
});
