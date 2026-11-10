import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bracketChampion, bracketEntrants, bracketOrder, groupCount, jouninOfEra, makeBracket, makeGroups, snakeGroup, takePending, type GroupRow } from '../src/realtime/tournament.js';

describe('v43 (Fase 2, passo 4): grupos da fase final', () => {
  it('grupos de até 5, tamanhos que diferem em no máximo 1; ninguém fica num grupo de 2 quando há 22', () => {
    assert.deepEqual([0, 1, 5, 6, 20, 22, 40, 120].map(groupCount), [0, 1, 1, 2, 4, 5, 8, 24]);
    for (const n of [6, 7, 20, 22, 23, 24, 40, 46, 120]) {
      const sizes = makeGroups(n).map((g) => g.length);
      assert.equal(sizes.reduce((a, b) => a + b, 0), n);
      assert.ok(Math.max(...sizes) <= 5 && Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}: ${sizes}`);
    }
    assert.deepEqual(makeGroups(22).map((g) => g.length), [5, 5, 4, 4, 4]);
  });

  it('cabeças de chave em cobrinha: os melhores caem em grupos diferentes', () => {
    assert.deepEqual(makeGroups(20), [[1, 8, 9, 16, 17], [2, 7, 10, 15, 18], [3, 6, 11, 14, 19], [4, 5, 12, 13, 20]]);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((s) => snakeGroup(s, 4)), [1, 2, 3, 4, 4, 3, 2, 1]);
    assert.deepEqual(makeGroups(40).map((g) => g[0]), [1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

const row = (groupNo: number, position: number, playerId: string, wins: number, seed: number, rf = wins * 2, ra = 0): GroupRow =>
  ({ groupNo, position, playerId, seed, wins, losses: 4 - wins, roundsFor: rf, roundsAgainst: ra });

describe('v43: chave da eliminatória', () => {
  it('ordem das chaves: 1 x último, 2 x penúltimo, com 1 e 2 em lados opostos', () => {
    assert.deepEqual(bracketOrder(4), [1, 4, 2, 3]);
    assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('8 grupos: chave de 16 completa, 4 rodadas; 1º de grupo enfrenta 2º de grupo', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
    const b = makeBracket(ids);
    assert.equal(b.length, 8);
    assert.ok(b.every((m) => m.round === 1 && m.rounds === 4 && m.a && m.b && !m.winner));
    assert.deepEqual([b[0]!.a, b[0]!.b], ['p1', 'p16']);
    assert.ok(b.every((m) => Number(m.a!.slice(1)) <= 8 && Number(m.b!.slice(1)) > 8), 'cada jogo: um 1º de grupo contra um 2º');
  });

  it('5 grupos (10 na chave): chave de 16 com 6 folgas para os melhores, que já esperam na 2ª rodada', () => {
    const b = makeBracket(Array.from({ length: 10 }, (_, i) => `p${i + 1}`));
    const r1 = b.filter((m) => m.round === 1), r2 = b.filter((m) => m.round === 2);
    assert.equal(r1.filter((m) => m.bye).length, 6);
    assert.deepEqual(r1.filter((m) => m.bye).map((m) => m.winner).sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    assert.equal(r1.filter((m) => !m.bye).length, 2);
    assert.deepEqual(r2.flatMap((m) => [m.a, m.b]).filter(Boolean).sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    assert.deepEqual(makeBracket(['a']), []);
    assert.deepEqual(makeBracket(['a', 'b']), [{ round: 1, slot: 1, rounds: 1, a: 'a', b: 'b', winner: null }]);
  });

  it('quem passa: os 2 primeiros de cada grupo, 1ºs antes dos 2ºs, por desempenho', () => {
    const table = [row(1, 1, 'a1', 4, 1), row(1, 2, 'a2', 3, 8), row(1, 3, 'a3', 2, 9), row(2, 1, 'b1', 3, 2), row(2, 2, 'b2', 3, 7, 7, 2), row(2, 3, 'b3', 1, 10)];
    // chave de 4: 1º x 4º e 2º x 3º. Sem a troca, a1 pegaria a2 (o mesmo grupo): os 2ºs trocam de lugar.
    const order = bracketEntrants(table).map((r) => r.playerId);
    assert.deepEqual(order, ['a1', 'b1', 'a2', 'b2']);
    const first = makeBracket(order).filter((m) => m.round === 1).map((m) => [m.a, m.b]);
    assert.deepEqual(first, [['a1', 'b2'], ['b1', 'a2']], 'ninguém reencontra o colega de grupo na 1ª rodada');
  });

  it('Jounin da era: campeão, vice, semifinalistas e, sobrando vaga, os melhores 3ºs; nunca mais que as vagas', () => {
    const table = [row(1, 1, 'a1', 4, 1), row(1, 2, 'a2', 3, 4), row(1, 3, 'a3', 2, 5), row(1, 4, 'a4', 0, 8),
      row(2, 1, 'b1', 4, 2), row(2, 2, 'b2', 3, 3), row(2, 3, 'b3', 1, 6), row(2, 4, 'b4', 0, 7)];
    // chave de 4: a1 x b2, b1 x a2; final b2 x b1; campeão b2
    const bracket = [{ round: 1, slot: 1, rounds: 2, a: 'a1', b: 'b2', winner: 'b2' }, { round: 1, slot: 2, rounds: 2, a: 'b1', b: 'a2', winner: 'b1' },
      { round: 2, slot: 1, rounds: 2, a: 'b2', b: 'b1', winner: 'b2' }];
    assert.equal(bracketChampion(bracket), 'b2');
    assert.deepEqual(jouninOfEra(10, table, bracket), ['b2', 'b1', 'a1', 'a2', 'a3', 'b3', 'b4', 'a4']);
    assert.deepEqual(jouninOfEra(5, table, bracket), ['b2', 'b1', 'a1', 'a2', 'a3']);
    assert.deepEqual(jouninOfEra(3, table, bracket), ['b2', 'b1', 'a1']);
  });
});

describe('v43: fila da fase final', () => {
  it('só une quem tem jogo pendente entre si; quem espera há mais tempo joga primeiro', () => {
    const pending = [{ a: 'x', b: 'y' }, { a: 'y', b: 'z' }];
    assert.equal(takePending(['x', 'z'], pending), null);
    assert.deepEqual(takePending(['w', 'z', 'x', 'y'], pending), { a: 'z', b: 'y', rest: ['w', 'x'] });
  });
});
