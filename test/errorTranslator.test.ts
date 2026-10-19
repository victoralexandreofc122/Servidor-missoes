import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../src/errors/AppError.js';
import { CONSTRAINT_ERRORS, SERVER_ERRORS, translateError } from '../src/errors/errorTranslator.js';
import { sendError } from '../src/errors/sendError.js';
import { FakeReply } from './support/harness.js';

const REQUIRED = [
  'rule_sensei_rank', 'rule_trainee_rank', 'rule_catalog_active', 'rule_mission_terms_immutable',
  'rule_mission_transition', 'rule_mission_incomplete', 'rule_mission_deadline', 'rule_only_sensei_evaluates',
  'rule_evaluator_rank', 'rule_evaluator_not_trainee', 'rule_evaluation_requires_submission',
  'rule_scroll_requires_approval', 'rule_redemption_requires_approval', 'ux_sensei_missions_trainee_open',
  'ux_scroll_redemptions_scroll', 'ux_mission_evaluations_one_approval',
];

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('mensagem crua do banco'), { code, constraint, severity: 'ERROR' });

const LEAK = /\b(rule_|ux_|ck_|game\.|sensei_missions|mission_evaluations|constraint)/i;

describe('errorTranslator', () => {
  it('mapeia todas as constraints exigidas', () => {
    for (const name of REQUIRED) assert.ok(CONSTRAINT_ERRORS[name], `faltou ${name}`);
  });

  it('nenhuma mensagem ou código público expõe nome de constraint', () => {
    for (const [name, e] of Object.entries(CONSTRAINT_ERRORS)) {
      assert.doesNotMatch(e.message, LEAK, name);
      assert.doesNotMatch(e.code, LEAK, name);
      assert.notEqual(e.code.toLowerCase(), name);          // código público != nome da constraint
      assert.match(e.code, /^[A-Z_]+$/, name);
    }
    for (const [name, e] of Object.entries(SERVER_ERRORS)) {
      assert.doesNotMatch(e.message, LEAK, name);
      assert.match(e.code, /^[A-Z_]+$/, name);
    }
  });

  it('traduz erro do banco pela constraint', () => {
    const e = translateError(pgError('23514', 'rule_only_sensei_evaluates'));
    assert.equal(e.status, 403);
    assert.equal(e.code, 'ONLY_SENSEI_EVALUATES');
  });

  it('constraint desconhecida cai no SQLSTATE, sem vazar o nome', () => {
    const e = translateError(pgError('23514', 'rule_que_ainda_nao_existe'));
    assert.equal(e.status, 409);
    assert.equal(e.code, 'RULE_VIOLATION');
    assert.doesNotMatch(e.message, LEAK);
  });

  it('NOT NULL violado (23502) sem constraint vira 400 INVALID_INPUT', () => {
    const e = translateError({ code: '23502', severity: 'ERROR' });
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_INPUT');
    assert.equal(e.message, 'Campo obrigatório ausente.');
  });

  it('FK sem nome (ex.: aprendiz inexistente) vira 404', () => {
    assert.equal(translateError(pgError('23503')).status, 404);
  });

  it('deadlock, serialização, lock_timeout e statement_timeout viram 503 para o cliente tentar de novo', () => {
    for (const sqlstate of ['40P01', '40001', '55P03', '57014']) {
      const e = translateError(pgError(sqlstate));
      assert.equal(e.status, 503, sqlstate);
      assert.equal(e.code, 'TRY_AGAIN', sqlstate);
    }
  });

  it('erro qualquer vira 500 genérico e guarda o original só em cause', () => {
    const original = new Error('connection refused em 10.0.0.5');
    const e = translateError(original);
    assert.equal(e.status, 500);
    assert.equal(e.cause, original);
    assert.doesNotMatch(e.message, /10\.0\.0\.5/);
  });

  it('erro do Fastify (JSON malformado) vira 400', () => {
    const e = translateError(Object.assign(new Error('x'), { statusCode: 400, code: 'FST_ERR_CTP_INVALID_JSON_BODY' }));
    assert.equal(e.status, 400);
  });

  it('AppError passa direto', () => {
    const original = new AppError(SERVER_ERRORS.rule_not_trainee);
    assert.equal(translateError(original), original);
  });

  it('sendError responde só código e mensagem, nunca o erro do banco', () => {
    const reply = new FakeReply();
    const logged: object[] = [];
    sendError(pgError('23505', 'ux_scroll_redemptions_scroll'), reply, { error() {}, info: (o) => logged.push(o) });
    assert.equal(reply.statusCode, 409);
    assert.deepEqual(reply.payload, { error: { code: 'SCROLL_ALREADY_REDEEMED', message: 'Este pergaminho já foi entregue.' } });
    assert.doesNotMatch(JSON.stringify(reply.payload), LEAK);
    assert.match(JSON.stringify(logged), /ux_scroll_redemptions_scroll/);   // o log interno tem o nome
  });
});
