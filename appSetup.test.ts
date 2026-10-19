import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configureInternalApp, configurePublicApp } from '../src/appSetup.js';
import { caseErrorHandlerOnBoth, caseInternalHookIsGlobal, casePublicHasNoInternal, deps } from './support/appCases.js';
import { FakeFastify } from './support/fakeFastify.js';

const build = () => {
  const pub = new FakeFastify();
  const internal = new FakeFastify();
  configurePublicApp(pub as unknown as FastifyInstance, deps);
  configureInternalApp(internal as unknown as FastifyInstance, deps);
  return { pub, internal };
};

describe('montagem das instâncias (sem Fastify instalado)', () => {
  it('(a) token de serviço é hook onRequest GLOBAL da instância interna, não por rota', async () => {
    const { internal } = build();
    assert.deepEqual(internal.hooks.map((h) => h.name), ['onRequest']);
    assert.equal(internal.hooks[0]!.fn, deps.requireServiceToken);
    assert.ok(internal.routes.every((r) => r.preHandler.length === 0), 'nenhuma rota interna depende de hook próprio');
    await caseInternalHookIsGlobal(internal);
  });

  it('(b) a instância pública não registra nada em /internal', async () => {
    const { pub } = build();
    assert.deepEqual(pub.routes.map((r) => `${r.method} ${r.url}`).sort(), [
      'GET /health', 'POST /missions', 'POST /missions/:id/evaluate', 'POST /missions/:id/submit', 'POST /scrolls/:id/redeem',
    ]);
    const gameRoutes = pub.routes.filter((r) => r.url !== '/health');   // /health é o único sem JWT, de propósito
    assert.ok(gameRoutes.every((r) => r.preHandler.includes(deps.authenticate)), 'toda rota do jogo exige JWT');
    await casePublicHasNoInternal(pub);
  });

  it('(c) setErrorHandler e setNotFoundHandler estão nas DUAS instâncias', async () => {
    const { pub, internal } = build();
    for (const app of [pub, internal]) {
      assert.ok(app.errorHandler, 'sem setErrorHandler');
      assert.ok(app.notFoundHandler, 'sem setNotFoundHandler');
    }
    await caseErrorHandlerOnBoth(pub, internal);
  });
});
