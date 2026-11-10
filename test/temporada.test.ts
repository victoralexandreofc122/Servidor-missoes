import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JOUNIN_RULES, jouninFinalists, jouninPointsAfter, jouninRanking, jouninSlots } from '../src/realtime/seasonStore.js';

describe('v40 (Fase 2): regras do Torneio da Temporada', () => {
  it('vagas de Jounin: 1 a cada 50 ativos, mínimo 10 e máximo 60', () => {
    assert.deepEqual([0, 49, 499, 500, 549, 550, 1000, 2999, 3000, 3049, 50_000].map(jouninSlots), [10, 10, 10, 10, 10, 11, 20, 59, 60, 60, 60]);
    assert.equal(jouninSlots(-5), 10);
    assert.equal(jouninSlots(Number.NaN), 10);
  });

  it('fase final: 2x as vagas', () => {
    assert.deepEqual([10, 23, 60].map(jouninFinalists), [20, 46, 120]);
  });

  it('pontos: +30 na vitória, -10 na derrota, nunca abaixo de 0', () => {
    assert.equal(jouninPointsAfter(0, true), 30);
    assert.equal(jouninPointsAfter(30, false), 20);
    assert.equal(jouninPointsAfter(5, false), 0);
    assert.equal(jouninPointsAfter(0, false), 0);
    assert.deepEqual([JOUNIN_RULES.winRyo, JOUNIN_RULES.lossRyo, JOUNIN_RULES.minMatches, JOUNIN_RULES.minLevel], [100, 30, 15, 40]);
  });

  it('classificação: só quem tem 15 partidas; desempate por vitórias e por quem chegou primeiro; finalistas = 2x as vagas', () => {
    const row = (playerId: string, points: number, wins: number, losses: number, updatedAt = 0) => ({ playerId, points, wins, losses, updatedAt });
    const rows = [row('poucas', 900, 14, 0), row('b', 300, 12, 6), row('a', 300, 13, 2, 5), row('c', 300, 13, 2, 1), row('d', 100, 5, 10)];
    const r = jouninRanking(rows, 1);
    assert.deepEqual(r.map((x) => x.playerId), ['c', 'a', 'b', 'd']);
    assert.deepEqual(r.map((x) => x.finalist), [true, true, false, false]);
    assert.deepEqual(r.map((x) => x.position), [1, 2, 3, 4]);
  });
});
