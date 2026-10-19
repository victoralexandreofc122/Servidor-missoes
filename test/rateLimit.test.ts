import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configureInternalApp, configurePublicApp, type AppSettings } from '../src/appSetup.js';
import { loadConfig } from '../src/config.js';
import { makeRateLimit } from '../src/plugins/rateLimit.js';
import { casesRateLimitWiring, deps } from './support/appCases.js';
import { FakeFastify } from './support/fakeFastify.js';
import { FakeReply, JWT_SECRET, SERVICE_TOKEN } from './support/harness.js';

/** Relógio controlado pelo teste. */
const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
};
const hit = async (limit: ReturnType<typeof makeRateLimit>, ip: string, url = '/missions') => {
  const reply = new FakeReply();
  await limit({ ip, routeOptions: { url } }, reply);
  return reply.sent ? reply : null;   // null = passou
};

describe('rate limit em memória (correção 11)', () => {
  it('100 no mesmo IP+rota passam; a 101ª leva 429 com Retry-After numérico', async () => {
    const c = clock();
    const limit = makeRateLimit({ max: 100, timeWindowMs: 60_000, now: c.now });
    for (let i = 1; i <= 100; i++) {
      assert.equal(await hit(limit, '1.1.1.1'), null, `req ${i} deveria passar`);
      c.advance(100);                                    // 100 req em 10 s, bem menos de 1 min
    }
    const blocked = (await hit(limit, '1.1.1.1'))!;
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.payload.error.code, 'RATE_LIMITED');
    assert.match(blocked.headers['retry-after']!, /^\d+$/);
    assert.equal(blocked.headers['retry-after'], '50');  // janela começou há 10 s: faltam 50
    limit.close();
  });

  it('IPs diferentes e rotas diferentes não se afetam', async () => {
    const limit = makeRateLimit({ max: 2, timeWindowMs: 60_000, now: clock().now });
    await hit(limit, '1.1.1.1'); await hit(limit, '1.1.1.1');
    assert.equal((await hit(limit, '1.1.1.1'))?.statusCode, 429);
    assert.equal(await hit(limit, '2.2.2.2'), null);
    assert.equal(await hit(limit, '1.1.1.1', '/missions/:id/submit'), null);
    limit.close();
  });

  it('rota inexistente usa uma chave só (URL aleatória não enche o Map)', async () => {
    const limit = makeRateLimit({ max: 1000, timeWindowMs: 60_000, now: clock().now });
    const reply = new FakeReply();
    for (let i = 0; i < 50; i++) await limit({ ip: '1.1.1.1', routeOptions: { url: undefined } }, reply);
    assert.equal(limit.size(), 1);
    limit.close();
  });

  it('duas janelas: reseta depois da janela e a limpeza remove o que venceu', async () => {
    const c = clock();
    const limit = makeRateLimit({ max: 3, timeWindowMs: 60_000, now: c.now });
    for (let i = 0; i < 3; i++) await hit(limit, '1.1.1.1');
    await hit(limit, '9.9.9.9');
    assert.equal((await hit(limit, '1.1.1.1'))?.statusCode, 429);
    assert.equal(limit.size(), 2);

    c.advance(60_001);                                   // janela 2
    assert.equal(limit.cleanup(), 2, 'limpeza remove as duas entradas vencidas');
    assert.equal(limit.size(), 0);
    for (let i = 0; i < 3; i++) assert.equal(await hit(limit, '1.1.1.1'), null, 'contagem recomeçou');
    assert.equal((await hit(limit, '1.1.1.1'))?.statusCode, 429);
    limit.close();
  });

  it('a limpeza roda sozinha pelo setInterval (unref, não segura o processo)', async () => {
    const c = clock();
    const limit = makeRateLimit({ max: 5, timeWindowMs: 10, now: c.now, cleanupIntervalMs: 20 });
    await hit(limit, '1.1.1.1');
    c.advance(11);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(limit.size(), 0);
    limit.close();
  });

  it('montagem: POST /missions bate 10 antes do global de 100; /internal sem limite', async () => {
    await casesRateLimitWiring((settings: AppSettings) => {
      const pub = new FakeFastify();
      const internal = new FakeFastify();
      configurePublicApp(pub as unknown as FastifyInstance, deps, settings);
      configureInternalApp(internal as unknown as FastifyInstance, deps, settings);
      return { pub, internal };
    });
  });

  it('config: padrões 100 / 10 / 60000 e valores do ambiente', () => {
    const base = { DATABASE_URL: 'postgres://x', JWT_SECRET, SERVICE_TOKEN };
    const d = loadConfig(base as NodeJS.ProcessEnv);
    assert.deepEqual([d.RATE_LIMIT_GLOBAL_MAX, d.RATE_LIMIT_SENSITIVE_MAX, d.RATE_LIMIT_WINDOW_MS], [100, 10, 60_000]);
    const c = loadConfig({ ...base, RATE_LIMIT_GLOBAL_MAX: '50', RATE_LIMIT_SENSITIVE_MAX: '5', RATE_LIMIT_WINDOW_MS: '30000' } as NodeJS.ProcessEnv);
    assert.deepEqual([c.RATE_LIMIT_GLOBAL_MAX, c.RATE_LIMIT_SENSITIVE_MAX, c.RATE_LIMIT_WINDOW_MS], [50, 5, 30_000]);
  });
});
