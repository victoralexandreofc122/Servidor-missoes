import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOrThrow } from '../src/http.js';
import { CreateMissionBody, EvaluateBody, IdParams } from '../src/missions/schemas.js';

function problems(fn: () => unknown): { field: string; problem: string }[] {
  try {
    fn();
  } catch (err: any) {
    assert.equal(err.code, 'INVALID_INPUT');
    return err.details;
  }
  assert.fail('esperava INVALID_INPUT');
}

const ENGLISH = /\b(Expected|Required|Invalid|received|String must|Number must)\b/;

describe('parseOrThrow (validação de entrada)', () => {
  it('mensagens de validação saem em português', () => {
    const details = problems(() => parseOrThrow(CreateMissionBody, { target_quantity: 'muitos', target_code: '' }));
    assert.ok(details.length >= 4);
    for (const d of details) assert.doesNotMatch(d.problem, ENGLISH, `${d.field}: ${d.problem}`);
    const byField = Object.fromEntries(details.map((d) => [d.field, d.problem]));
    assert.equal(byField.trainee_id, 'campo obrigatório');
    assert.match(byField.target_quantity!, /^tipo inválido/);
    assert.match(byField.target_code!, /^mínimo de 1/);
  });

  it('mensagem definida no schema tem prioridade', () => {
    const details = problems(() => parseOrThrow(IdParams, { id: 'abc' }));
    assert.deepEqual(details, [{ field: 'id', problem: 'precisa ser um UUID' }]);
  });

  it('corpo ausente aponta para "(corpo)"', () => {
    const details = problems(() => parseOrThrow(EvaluateBody, undefined));
    assert.deepEqual(details, [{ field: '(corpo)', problem: 'campo obrigatório' }]);
  });

  it('feedback conta caracteres como o banco: 500 emojis passam, 501 não', () => {
    assert.equal(parseOrThrow(EvaluateBody, { approved: true, score: 5, feedback: '🔥'.repeat(500) }).feedback?.length, 1000);
    const details = problems(() => parseOrThrow(EvaluateBody, { approved: true, score: 5, feedback: '🔥'.repeat(501) }));
    assert.deepEqual(details, [{ field: 'feedback', problem: 'máximo de 500 caracteres' }]);
  });
});
