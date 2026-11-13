import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CALENDAR, DAY_MS, calendarStep, championPhase, type EraView } from '../src/realtime/calendar.js';

/* v55: o calendário automático da Era (60 dias): Torneio da Temporada na semana 3 e 4, Era nova no dia 60. */

const T0 = Date.UTC(2026, 10, 1);
const day = (d: number) => T0 + d * DAY_MS;
const era = (over: Partial<EraView> = {}): EraView => ({ startsAt: T0, endsAt: day(60), jounin: null, stage: 'pontos', finalReady: true, pending: 0, ...over });
const points = { startsAt: day(14), endsAt: day(24) };

describe('v55: calendário automático do Torneio da Temporada', () => {
  it('semanas 1 e 2: nada; semana 3 (dia 14): abre a fase de pontos por 10 dias', () => {
    assert.equal(calendarStep(era(), day(3)), null);
    assert.equal(calendarStep(era(), day(13.9)), null);
    assert.deepEqual(calendarStep(era(), day(14)), { kind: 'open_points', endsAt: day(24) });
    assert.deepEqual(calendarStep(era(), day(20)), { kind: 'open_points', endsAt: day(24) }, 'o servidor caiu no dia 14: abre quando voltar');
    assert.equal(calendarStep(era(), day(25)), null, 'passou da janela: não abre atrasado');
  });

  it('fase de pontos aberta: espera; no fim (dia 24) monta os grupos da Fase Final', () => {
    assert.equal(calendarStep(era({ jounin: points }), day(20)), null);
    assert.deepEqual(calendarStep(era({ jounin: points }), day(24)), { kind: 'start_groups' });
    assert.equal(calendarStep(era({ jounin: points, finalReady: false }), day(24)), null, 'sem a v28: nada da Fase Final');
  });

  it('grupos: passa para as chaves quando os jogos acabam ou em 3 dias', () => {
    assert.equal(calendarStep(era({ jounin: points, stage: 'grupos', pending: 4 }), day(25)), null);
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'grupos', pending: 0 }), day(25)), { kind: 'start_bracket' });
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'grupos', pending: 4 }), day(24 + CALENDAR.groupsDays)), { kind: 'start_bracket' });
  });

  it('chaves: encerra quando todas têm campeão; no prazo (3 dias), W.O. no que faltou', () => {
    assert.equal(calendarStep(era({ jounin: points, stage: 'chaves', pending: 2 }), day(28)), null);
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'chaves', pending: 0 }), day(28)), { kind: 'finish', wo: false });
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'chaves', pending: 2 }), day(30)), { kind: 'finish', wo: true });
  });

  it('dia 60: a Era fecha (antes, termina a Fase Final que ainda estiver aberta)', () => {
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'encerrado' }), day(60)), { kind: 'close_era' });
    assert.deepEqual(calendarStep(era({ jounin: points, stage: 'chaves', pending: 1 }), day(60)), { kind: 'finish', wo: true });
    assert.deepEqual(calendarStep(era(), day(61)), { kind: 'close_era' }, 'Era sem Torneio também vira');
  });
});

describe('v55: Torneio dos Heróis e dos Vilões no calendário', () => {
  it('abrem com a Fase Final: 1 dia de inscrições, depois até 5 dias de chaves', () => {
    assert.equal(championPhase(era({ jounin: points }), null, false, day(20)), 'fechado', 'na fase de pontos ainda não');
    assert.equal(championPhase(era({ jounin: points, stage: 'grupos' }), null, false, day(24)), 'inscricoes');
    assert.equal(championPhase(era({ jounin: points, stage: 'grupos' }), day(24), false, day(24.5)), 'inscricoes');
    assert.equal(championPhase(era({ jounin: points, stage: 'grupos' }), day(24), false, day(25)), 'chaves');
    assert.equal(championPhase(era({ jounin: points, stage: 'chaves' }), day(24), false, day(30)), 'encerrado', 'prazo');
    assert.equal(championPhase(era({ jounin: points, stage: 'chaves' }), day(24), true, day(26)), 'encerrado', 'já tem campeão');
  });
});
