import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configureInternalApp, configurePublicApp, type AppSettings } from '../src/appSetup.js';
import { loadConfig } from '../src/config.js';
import { decideCors } from '../src/plugins/cors.js';
import { casesCors, deps } from './support/appCases.js';
import { FakeFastify } from './support/fakeFastify.js';
import { JWT_SECRET, SERVICE_TOKEN } from './support/harness.js';

const fakeBuild = (settings: AppSettings) => {
  const pub = new FakeFastify();
  const internal = new FakeFastify();
  configurePublicApp(pub as unknown as FastifyInstance, deps, settings);
  configureInternalApp(internal as unknown as FastifyInstance, deps, settings);
  return { pub, internal };
};

const env = (extra: Record<string, string>) =>
  ({ DATABASE_URL: 'postgres://x', JWT_SECRET, SERVICE_TOKEN, ...extra }) as NodeJS.ProcessEnv;

describe('CORS nativo (correção 9)', () => {
  it('regra pura: lista vazia desliga; origem exata ou nada', () => {
    const list = new Set(['https://app.exemplo.com']);
    assert.deepEqual(decideCors('https://app.exemplo.com', 'GET', new Set()), { kind: 'off' });
    assert.deepEqual(decideCors(undefined, 'GET', list), { kind: 'no-origin' });
    assert.deepEqual(decideCors('https://app.exemplo.com', 'OPTIONS', list), { kind: 'allowed', origin: 'https://app.exemplo.com', preflight: true });
    assert.deepEqual(decideCors('https://app.exemplo.com.malicioso.com', 'GET', list), { kind: 'forbidden' });
    assert.deepEqual(decideCors('http://app.exemplo.com', 'GET', list), { kind: 'forbidden' });   // esquema diferente
  });

  it('lista vazia: zero hooks, nenhum header; lista: headers exatos, 403, preflight 204, interna também', async () => {
    const empty = fakeBuild({ allowedOrigins: [], trustProxy: true, rateLimit: { globalMax: 100, sensitiveMax: 10, windowMs: 60_000 } });
    assert.ok(!empty.pub.hooks.some((h) => h.name === 'onSend'), 'sem lista não registra onSend');
    assert.deepEqual(empty.internal.hooks.map((h) => h.name), ['onRequest'], 'interna sem lista: só o token de serviço');
    await casesCors(fakeBuild);
  });

  it('no preflight o handler não é chamado', async () => {
    const { pub } = fakeBuild({ allowedOrigins: ['https://app.exemplo.com'], trustProxy: true, rateLimit: { globalMax: 100, sensitiveMax: 10, windowMs: 60_000 } });
    const r = await pub.inject({ method: 'OPTIONS', url: '/missions', headers: { origin: 'https://app.exemplo.com' } });
    assert.equal(r.statusCode, 204);
    assert.equal(r.handlerCalled, false);
  });

  it('ALLOWED_ORIGINS: CSV com espaços; padrão vazio; recusa origem com "/" ou caminho', () => {
    assert.deepEqual(loadConfig(env({})).ALLOWED_ORIGINS, []);
    assert.deepEqual(loadConfig(env({ ALLOWED_ORIGINS: ' https://a.com , http://localhost:5173 ' })).ALLOWED_ORIGINS, ['https://a.com', 'http://localhost:5173']);
    assert.throws(() => loadConfig(env({ ALLOWED_ORIGINS: 'https://a.com/' })), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig(env({ ALLOWED_ORIGINS: 'https://a.com/jogo' })), /ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig(env({ ALLOWED_ORIGINS: '*' })), /ALLOWED_ORIGINS/);
  });
});
