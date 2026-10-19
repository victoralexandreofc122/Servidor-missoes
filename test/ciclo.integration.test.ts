import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { makeRequireServiceToken, SERVICE_TOKEN_HEADER } from '../src/auth/requireServiceToken.js';
import { createDb, createPool } from '../src/db.js';
import { makeAddProgress } from '../src/missions/handlers/addProgress.js';
import { makeCreateMission } from '../src/missions/handlers/createMission.js';
import { makeEvaluateMission } from '../src/missions/handlers/evaluateMission.js';
import { makeRedeemScroll } from '../src/missions/handlers/redeemScroll.js';
import { makeSubmitMission } from '../src/missions/handlers/submitMission.js';
import { call, JWT_SECRET, playerToken, SERVICE_TOKEN, spyDb } from './support/harness.js';
import { createTestDatabase } from './support/testDb.js';

const LEAK = /\b(rule_|ux_|ck_|game\.|constraint|violates|sensei_missions)/i;
const authenticate = makeAuthenticate({ secret: JWT_SECRET });
const requireServiceToken = makeRequireServiceToken(SERVICE_TOKEN);

// Sem TEST_DATABASE_URL (ex.: no build do Render, que não tem banco de teste) o grupo é pulado,
// com o motivo no relatório. Localmente/CI com PostgreSQL: TEST_DATABASE_URL=... npm test
const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('ciclo da missão de sensei pela API (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const ids: Record<string, string> = {};
  const bodies: unknown[] = [];

  // Atalhos: chamar um handler como um jogador logado (hook authenticate + handler)
  const as = async (player: string) => ({ authorization: `Bearer ${await playerToken(ids[player]!)}` });
  async function asPlayer(player: string | null, handler: any, params: object = {}, body: object = {}) {
    const headers = player ? await as(player) : {};
    const res = await call(handler, { headers, params, body }, [authenticate]);
    bodies.push(res.body);
    return res;
  }
  async function asService(handler: any, params: object, body: object, headers: Record<string, string> = { [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN }) {
    const res = await call(handler, { headers, params, body }, [requireServiceToken]);
    bodies.push(res.body);
    return res;
  }

  let create: any, progress: any, submit: any, evaluate: any, redeem: any;
  let m1: string, m2: string, scroll1: string;

  before(async () => {
    t = await createTestDatabase();
    for (const [name, rank] of [['kaito', 'CHUNIN'], ['mei', 'CHUNIN'], ['rin', 'GENIN'], ['intruso', 'GENIN'], ['yuki', 'ACADEMY']] as const) {
      ids[name] = await t.createPlayer(name, rank);
    }
    const deps = { db: t.db };
    create = makeCreateMission(deps);
    progress = makeAddProgress(deps);
    submit = makeSubmitMission(deps);
    evaluate = makeEvaluateMission(deps);
    redeem = makeRedeemScroll(deps);
  });

  after(async () => {
    await t?.drop();
  });

  describe('1. POST /missions', () => {
    it('sem token: 401', async () => {
      const r = await asPlayer(null, create, {}, {});
      assert.equal(r.status, 401);
    });

    it('Genin não cria: 403 SENSEI_RANK_REQUIRED', async () => {
      const r = await asPlayer('rin', create, {}, { trainee_id: ids.yuki, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'SENSEI_RANK_REQUIRED');
    });

    it('sensei vem do JWT; sensei_id, XP e status do corpo são ignorados', async () => {
      const r = await asPlayer('kaito', create, {}, {
        trainee_id: ids.rin, mission_type: 'COLLECT_RESOURCE', difficulty: 'ADVANCED', target_code: 'erva_lunar', target_quantity: 20,
        expires_in_minutes: 60,
        sensei_id: ids.mei, xp_reward: 999999, status: 'completed', reward_title_id: randomUUID(),
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.mission.sensei_id, ids.kaito);
      assert.equal(r.body.mission.xp_reward, 500);
      assert.equal(r.body.mission.status, 'active');
      m1 = r.body.mission.id;
    });

    it('aprendiz já ocupado: 409 TRAINEE_BUSY', async () => {
      const r = await asPlayer('mei', create, {}, { trainee_id: ids.rin, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'TRAINEE_BUSY');
    });

    it('dificuldade que não existe: 422 MISSION_OPTION_UNAVAILABLE', async () => {
      const r = await asPlayer('mei', create, {}, { trainee_id: ids.yuki, mission_type: 'DEFEAT_BOSS', difficulty: 'NAO_EXISTE', target_code: 'boss_x' });
      assert.equal(r.status, 422);
      assert.equal(r.body.error.code, 'MISSION_OPTION_UNAVAILABLE');
    });

    it('aprendiz que não existe: 404', async () => {
      const r = await asPlayer('mei', create, {}, { trainee_id: randomUUID(), mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' });
      assert.equal(r.status, 404);
      assert.equal(r.body.error.code, 'REFERENCE_NOT_FOUND');
    });

    it('corpo inválido: 400 com o campo problemático', async () => {
      const r = await asPlayer('mei', create, {}, { trainee_id: 'nao-e-uuid', mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x', target_quantity: -1 });
      assert.equal(r.status, 400);
      assert.deepEqual(r.body.error.details.map((d: any) => d.field).sort(), ['target_quantity', 'trainee_id']);
    });
  });

  describe('3. POST /missions/:id/submit (antes do progresso)', () => {
    it('outro jogador: 403 NOT_MISSION_TRAINEE e nenhum UPDATE chega ao banco', async () => {
      const spy = spyDb(t.db);
      const r = await call(makeSubmitMission({ db: spy.db }), { headers: await as('intruso'), params: { id: m1 } }, [authenticate]);
      bodies.push(r.body);
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'NOT_MISSION_TRAINEE');
      assert.equal(spy.statements.length, 1);
      assert.match(spy.statements[0]!, /^SELECT trainee_id FROM game\.sensei_missions/);
      const { rows } = await t.pool.query('SELECT status FROM game.sensei_missions WHERE id = $1', [m1]);
      assert.equal(rows[0].status, 'active');
    });

    it('objetivo incompleto: 409 MISSION_INCOMPLETE', async () => {
      const r = await asPlayer('rin', submit, { id: m1 });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'MISSION_INCOMPLETE');
    });

    it('id que não é UUID: 400', async () => {
      const r = await asPlayer('rin', submit, { id: '123' });
      assert.equal(r.status, 400);
    });

    it('missão inexistente: 404', async () => {
      const r = await asPlayer('rin', submit, { id: randomUUID() });
      assert.equal(r.status, 404);
      assert.equal(r.body.error.code, 'MISSION_NOT_FOUND');
    });
  });

  describe('2. PATCH /internal/missions/:id/progress', () => {
    it('sem token de serviço: 401', async () => {
      const r = await asService(progress, { id: m1 }, { amount: 5 }, {});
      assert.equal(r.status, 401);
    });

    it('JWT de jogador não serve na rota interna: 401', async () => {
      const r = await asService(progress, { id: m1 }, { amount: 5 }, await as('rin'));
      assert.equal(r.status, 401);
      assert.equal(r.body.error.code, 'SERVICE_UNAUTHORIZED');
    });

    it('incrementa e limita ao alvo', async () => {
      const a = await asService(progress, { id: m1 }, { amount: 7 });
      assert.equal(a.body.mission.progress_quantity, 7);
      const b = await asService(progress, { id: m1 }, { amount: 50 });
      assert.equal(b.status, 200);
      assert.equal(b.body.mission.progress_quantity, 20);
    });

    it('amount inválido: 400; missão inexistente: 404', async () => {
      assert.equal((await asService(progress, { id: m1 }, { amount: 0 })).status, 400);
      assert.equal((await asService(progress, { id: randomUUID() }, { amount: 1 })).status, 404);
    });
  });

  describe('3. submit (com objetivo completo)', () => {
    it('aprendiz entrega: 200 submitted', async () => {
      const r = await asPlayer('rin', submit, { id: m1 });
      assert.equal(r.status, 200);
      assert.equal(r.body.mission.status, 'submitted');
    });

    it('duplo clique: a 2ª entrega não toca a linha e responde 409 INVALID_MISSION_STATE', async () => {
      const before = (await t.pool.query('SELECT submitted_at FROM game.sensei_missions WHERE id = $1', [m1])).rows[0];
      const spy = spyDb(t.db);
      const r = await call(makeSubmitMission({ db: spy.db }), { headers: await as('rin'), params: { id: m1 } }, [authenticate]);
      bodies.push(r.body);
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'INVALID_MISSION_STATE');
      assert.match(spy.statements[1]!, /WHERE id = \$1 AND status = 'active'/);
      const after = (await t.pool.query('SELECT status, submitted_at FROM game.sensei_missions WHERE id = $1', [m1])).rows[0];
      assert.equal(after.status, 'submitted');
      assert.deepEqual(after.submitted_at, before.submitted_at);
    });

    it('evento de progresso atrasado numa missão já completa não muda nada (fica 20/20)', async () => {
      // LEAST mantém 20, então o banco não vê mudança. O 409 de missão fora de andamento é testado em "estados".
      const r = await asService(progress, { id: m1 }, { amount: 1 });
      assert.equal(r.status, 200);
      assert.equal(r.body.mission.progress_quantity, 20);
    });
  });

  describe('4. POST /missions/:id/evaluate', () => {
    it('outro Chunin com o sensei ainda no rank: 403 ONLY_SENSEI_EVALUATES', async () => {
      const r = await asPlayer('mei', evaluate, { id: m1 }, { approved: true, score: 5 });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'ONLY_SENSEI_EVALUATES');
    });

    it('aprendiz tentando se avaliar: 403 CANNOT_EVALUATE_OWN_MISSION', async () => {
      const r = await asPlayer('rin', evaluate, { id: m1 }, { approved: true, score: 5 });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'CANNOT_EVALUATE_OWN_MISSION');
    });

    it('sensei aprova; evaluated_by do corpo é ignorado e o pergaminho volta', async () => {
      const r = await asPlayer('kaito', evaluate, { id: m1 }, { approved: true, score: 5, feedback: 'Boa', evaluated_by: ids.mei, evaluated_at: '2000-01-01' });
      assert.equal(r.status, 201);
      assert.equal(r.body.evaluation.evaluated_by, ids.kaito);
      assert.notEqual(r.body.evaluation.evaluated_at.slice(0, 4), '2000');
      assert.ok(r.body.scroll?.id);
      scroll1 = r.body.scroll.id;
    });

    it('avaliar de novo: 409 MISSION_NOT_SUBMITTED', async () => {
      const r = await asPlayer('kaito', evaluate, { id: m1 }, { approved: true, score: 4 });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'MISSION_NOT_SUBMITTED');
    });

    it('nota fora de 1..5: 400', async () => {
      const r = await asPlayer('kaito', evaluate, { id: m1 }, { approved: true, score: 9 });
      assert.equal(r.status, 400);
    });
  });

  describe('5. POST /scrolls/:id/redeem', () => {
    it('outro jogador: 403 NOT_MISSION_TRAINEE com 1 SELECT só e nenhum INSERT de resgate', async () => {
      const spy = spyDb(t.db);
      const r = await call(makeRedeemScroll({ db: spy.db }), { headers: await as('intruso'), params: { id: scroll1 } }, [authenticate]);
      bodies.push(r.body);
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'NOT_MISSION_TRAINEE');
      assert.equal(spy.statements.length, 1, spy.statements.join('\n'));
      assert.match(spy.statements[0]!, /^SELECT sm\.trainee_id, sm\.id AS mission_id FROM game\.completion_scrolls/);
      const { rows } = await t.pool.query('SELECT count(*)::int AS n FROM game.scroll_redemptions');
      assert.equal(rows[0].n, 0);
    });

    it('aprendiz resgata: 201 com XP e título creditados pelo banco (1 ida ao banco antes da transação)', async () => {
      const spy = spyDb(t.db);
      const r = await call(makeRedeemScroll({ db: spy.db }), { headers: await as('rin'), params: { id: scroll1 } }, [authenticate]);
      bodies.push(r.body);
      assert.equal(r.status, 201);
      const beforeTx = spy.statements.slice(0, spy.statements.indexOf('BEGIN'));
      assert.equal(beforeTx.length, 1, beforeTx.join('\n'));
      assert.deepEqual(spy.statements.slice(-1), ['COMMIT']);
      assert.equal(r.body.reward.xp_awarded, 500);
      assert.equal(r.body.reward.total_xp, '500');            // bigint chega como string
      assert.equal(r.body.reward.title_code, 'DEDICATED_PUPIL');
    });

    it('resgatar de novo: 409 SCROLL_ALREADY_REDEEMED', async () => {
      const r = await asPlayer('rin', redeem, { id: scroll1 });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'SCROLL_ALREADY_REDEEMED');
    });

    it('pergaminho inexistente: 404 SCROLL_NOT_FOUND', async () => {
      const r = await asPlayer('rin', redeem, { id: randomUUID() });
      assert.equal(r.status, 404);
      assert.equal(r.body.error.code, 'SCROLL_NOT_FOUND');
    });
  });

  describe('sensei rebaixado: substituto Chunin+ avalia', () => {
    it('prepara: missão Kaito -> Yuki entregue', async () => {
      const c = await asPlayer('kaito', create, {}, { trainee_id: ids.yuki, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_raposa' });
      assert.equal(c.status, 201);
      m2 = c.body.mission.id;
      assert.equal((await asService(progress, { id: m2 }, { amount: 1 })).status, 200);
      assert.equal((await asPlayer('yuki', submit, { id: m2 })).status, 200);
      await t.setRank(ids.kaito!, 'GENIN');
    });

    it('sensei rebaixado: 403 EVALUATOR_RANK_REQUIRED', async () => {
      const r = await asPlayer('kaito', evaluate, { id: m2 }, { approved: true, score: 4 });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'EVALUATOR_RANK_REQUIRED');
    });

    it('substituto Genin: 403 EVALUATOR_RANK_REQUIRED', async () => {
      const r = await asPlayer('rin', evaluate, { id: m2 }, { approved: true, score: 4 });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'EVALUATOR_RANK_REQUIRED');
    });

    it('Mei (Chunin) avalia no lugar: 201, evaluated_by = Mei', async () => {
      const r = await asPlayer('mei', evaluate, { id: m2 }, { approved: true, score: 4 });
      assert.equal(r.status, 201);
      assert.equal(r.body.evaluation.evaluated_by, ids.mei);
      assert.ok(r.body.scroll?.id);
    });
  });

  describe('estados', () => {
    it('avaliar missão ainda em andamento: 409 MISSION_NOT_SUBMITTED', async () => {
      const c = await asPlayer('mei', create, {}, { trainee_id: ids.rin, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' });
      assert.equal(c.status, 201);
      const r = await asPlayer('mei', evaluate, { id: c.body.mission.id }, { approved: true, score: 3 });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'MISSION_NOT_SUBMITTED');

      await t.pool.query(`UPDATE game.sensei_missions SET status = 'cancelled' WHERE id = $1`, [c.body.mission.id]);
      const p = await asService(progress, { id: c.body.mission.id }, { amount: 1 });
      assert.equal(p.status, 409);
      assert.equal(p.body.error.code, 'MISSION_NOT_IN_PROGRESS');

      // com a guarda no UPDATE, missão cancelada continua 409 (não vira 404 "não encontrada")
      const s = await asPlayer('rin', submit, { id: c.body.mission.id });
      assert.equal(s.status, 409);
      assert.equal(s.body.error.code, 'INVALID_MISSION_STATE');
    });
  });

  describe('timeouts do pool', () => {
    it('trava presa vira 503 TRY_AGAIN em ~3 s, em vez de segurar a requisição', async () => {
      const c = await asPlayer('mei', create, {}, { trainee_id: ids.intruso, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' });
      assert.equal(c.status, 201);
      const missionId = c.body.mission.id;

      const locker = await t.pool.connect();                  // outra sessão segura a linha da missão
      await locker.query('BEGIN');
      await locker.query('SELECT 1 FROM game.sensei_missions WHERE id = $1 FOR UPDATE', [missionId]);

      const pool = createPool(t.url, { onIdleClientError: () => {} });   // pool de produção, com DB_TIMEOUTS
      try {
        const started = Date.now();
        const r = await call(makeSubmitMission({ db: createDb(pool) }), { headers: await as('intruso'), params: { id: missionId } }, [authenticate]);
        bodies.push(r.body);
        const waited = Date.now() - started;
        assert.equal(r.status, 503);
        assert.equal(r.body.error.code, 'TRY_AGAIN');
        assert.ok(waited >= 2_900 && waited < 4_500, `esperou ${waited} ms`);
      } finally {
        await locker.query('ROLLBACK');
        locker.release();
        await pool.end();
      }
    });
  });

  it('nenhuma resposta expõe nome de constraint, tabela ou mensagem crua do banco', () => {
    assert.ok(bodies.length > 30);
    for (const body of bodies) assert.doesNotMatch(JSON.stringify(body), LEAK);
  });
});
