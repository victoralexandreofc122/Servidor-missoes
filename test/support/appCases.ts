import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeAuthenticate } from '../../src/auth/authenticate.js';
import { makeRequireServiceToken, SERVICE_TOKEN_HEADER } from '../../src/auth/requireServiceToken.js';
import type { Db } from '../../src/db.js';
import { JWT_SECRET, playerToken, SERVICE_TOKEN } from './harness.js';

/** Interface comum entre FakeFastify e o FastifyInstance real, só o que os casos usam. */
export interface Injectable {
  inject(opts: { method: string; url: string; headers?: Record<string, string>; payload?: unknown; remoteAddress?: string }): Promise<{
    statusCode: number;
    headers: Record<string, unknown>;
    json(): any;
  }>;
  get(url: string, handler: (req: any, reply: any) => Promise<unknown>): unknown;
}

export type Builder = (settings: import('../../src/appSetup.js').AppSettings) => { pub: Injectable; internal: Injectable };

const ALLOWED = 'https://app.exemplo.com';
const corsHeaderNames = (h: Record<string, unknown>) => Object.keys(h).filter((k) => k.toLowerCase().startsWith('access-control-'));
const settingsWith = (allowedOrigins: string[], rate = { globalMax: 100, sensitiveMax: 10, windowMs: 60_000 }) =>
  ({ allowedOrigins, trustProxy: true, rateLimit: rate });

/** Correção 9: sem ALLOWED_ORIGINS nada muda; com a lista, só a origem exata recebe CORS. */
export async function casesCors(build: Builder) {
  // --- lista vazia: zero mudança
  {
    const { pub } = build(settingsWith([]));
    pub.get('/ping', async (_req, reply) => reply.code(200).send({ ok: true }));
    const variants: Record<string, string>[] = [{}, { origin: ALLOWED }, { origin: 'https://malicioso.com' }];
    for (const headers of variants) {
      const r = await pub.inject({ method: 'GET', url: '/ping', headers });
      assert.equal(r.statusCode, 200, JSON.stringify(headers));
      assert.deepEqual(corsHeaderNames(r.headers), [], JSON.stringify(headers));
      assert.equal(r.headers.vary, undefined);
    }
  }
  // --- lista com uma origem
  const { pub, internal } = build(settingsWith([ALLOWED]));
  pub.get('/ping', async (_req, reply) => reply.code(200).send({ ok: true }));

  const ok = await pub.inject({ method: 'GET', url: '/ping', headers: { origin: ALLOWED } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['access-control-allow-origin'], ALLOWED);          // exata, nunca "*"
  assert.equal(ok.headers['access-control-allow-credentials'], 'true');
  assert.equal(ok.headers['access-control-allow-headers'], 'Authorization, Content-Type');
  assert.equal(ok.headers['access-control-allow-methods'], 'GET, POST, PATCH, OPTIONS');
  assert.equal(ok.headers.vary, 'Origin');

  const bad = await pub.inject({ method: 'GET', url: '/ping', headers: { origin: 'https://malicioso.com' } });
  assert.equal(bad.statusCode, 403);
  assert.equal(bad.json().error.code, 'CORS_FORBIDDEN');
  assert.deepEqual(corsHeaderNames(bad.headers), []);

  const noOrigin = await pub.inject({ method: 'GET', url: '/ping' });
  assert.equal(noOrigin.statusCode, 200);
  assert.deepEqual(corsHeaderNames(noOrigin.headers), []);

  // --- preflight
  const pre = await pub.inject({ method: 'OPTIONS', url: '/missions', headers: { origin: ALLOWED, 'access-control-request-method': 'POST' } });
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers['access-control-allow-origin'], ALLOWED);
  const preBad = await pub.inject({ method: 'OPTIONS', url: '/missions', headers: { origin: 'https://malicioso.com' } });
  assert.equal(preBad.statusCode, 403);
  assert.deepEqual(corsHeaderNames(preBad.headers), []);

  // --- instância interna: preflight responde antes do token; origem bloqueada antes do token
  const preInternal = await internal.inject({ method: 'OPTIONS', url: progressUrl, headers: { origin: ALLOWED } });
  assert.equal(preInternal.statusCode, 204);
  const noToken = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 }, headers: { origin: ALLOWED } });
  assert.equal(noToken.statusCode, 401);
  assert.equal(noToken.headers['access-control-allow-origin'], ALLOWED);    // o navegador consegue ler o erro
  const badInternal = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 }, headers: { origin: 'https://malicioso.com', ...service } });
  assert.equal(badInternal.statusCode, 403);
}

/** Correção 11: limite sensível em POST /missions bate antes do global; /internal não tem limite. */
export async function casesRateLimitWiring(build: Builder) {
  const { pub, internal } = build(settingsWith([], { globalMax: 100, sensitiveMax: 10, windowMs: 60_000 }));

  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) statuses.push((await pub.inject({ method: 'POST', url: '/missions', payload: {}, remoteAddress: '10.0.0.1' })).statusCode);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));             // passam pelo limite e caem no JWT
  assert.deepEqual(statuses.slice(10), [429, 429]);                         // 11ª: limite sensível (10), não o global (100)
  const limited = await pub.inject({ method: 'POST', url: '/missions', payload: {}, remoteAddress: '10.0.0.1' });
  assert.match(String(limited.headers['retry-after']), /^\d+$/);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');

  // mesma rota, outro IP: não afetado; rota não sensível do mesmo IP: só o global
  assert.equal((await pub.inject({ method: 'POST', url: '/missions', payload: {}, remoteAddress: '10.0.0.2' })).statusCode, 401);
  const submitUrl = `/missions/${MISSION_ID}/submit`;
  const submits: number[] = [];
  for (let i = 0; i < 101; i++) submits.push((await pub.inject({ method: 'POST', url: submitUrl, remoteAddress: '10.0.0.1' })).statusCode);
  assert.ok(submits.slice(0, 100).every((s) => s === 401), 'as 100 primeiras passam pelo limite');
  assert.equal(submits[100], 429);

  // interna: 150 chamadas do mesmo IP, nenhuma 429
  for (let i = 0; i < 150; i++) {
    const r = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 }, headers: service, remoteAddress: '10.0.0.1' });
    assert.notEqual(r.statusCode, 429, `interna limitada na chamada ${i + 1}`);
  }
}

export const MISSION_ID = randomUUID();

/** Db falso: o /progress devolve uma linha; nenhum caso aqui precisa do banco real. */
export const fakeDb: Db = {
  async query<R>() {
    return { rows: [{ id: MISSION_ID, status: 'active', progress_quantity: 1, target_quantity: 20 }] as R[], rowCount: 1 };
  },
  async connect() { throw new Error('não usado'); },
};

export const deps = {
  db: fakeDb,
  authenticate: makeAuthenticate({ secret: JWT_SECRET }),
  requireServiceToken: makeRequireServiceToken(SERVICE_TOKEN),
};

const progressUrl = `/internal/missions/${MISSION_ID}/progress`;
const service = { [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN };

/** (a) token de serviço é hook GLOBAL: rota nova, sem hook explícito, também exige token. */
export async function caseInternalHookIsGlobal(internal: Injectable) {
  internal.get('/internal/rota-nova', async (_req, reply) => reply.code(200).send({ ok: true }));   // sem preHandler

  const semToken = await internal.inject({ method: 'GET', url: '/internal/rota-nova' });
  assert.equal(semToken.statusCode, 401);
  assert.equal(semToken.json().error.code, 'SERVICE_UNAUTHORIZED');

  const comToken = await internal.inject({ method: 'GET', url: '/internal/rota-nova', headers: service });
  assert.equal(comToken.statusCode, 200);

  const progressSemToken = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 } });
  assert.equal(progressSemToken.statusCode, 401);

  // até rota que não existe responde 401 antes de 404: quem não tem token não descobre o mapa de rotas
  const inexistente = await internal.inject({ method: 'GET', url: '/internal/nao-existe' });
  assert.equal(inexistente.statusCode, 401);

  const jwtDeJogador = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 }, headers: { authorization: `Bearer ${await playerToken(randomUUID())}` } });
  assert.equal(jwtDeJogador.statusCode, 401);

  const ok = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 1 }, headers: service });
  assert.equal(ok.statusCode, 200);
}

/** (b) a instância pública não tem /internal: 404 mesmo com token de serviço válido. */
export async function casePublicHasNoInternal(pub: Injectable) {
  for (const method of ['GET', 'PATCH']) {
    const r = await pub.inject({ method, url: progressUrl, headers: service, ...(method === 'GET' ? {} : { payload: { amount: 1 } }) });
    assert.equal(r.statusCode, 404, method);
    assert.equal(r.json().error.code, 'NOT_FOUND', method);
  }
}

/** (c) setErrorHandler nas DUAS: erro sai no formato público { error: { code, message } }. */
export async function caseErrorHandlerOnBoth(pub: Injectable, internal: Injectable) {
  const p = await pub.inject({ method: 'POST', url: '/missions', payload: {} });   // sem JWT
  assert.equal(p.statusCode, 401);
  assert.deepEqual(Object.keys(p.json().error).sort(), ['code', 'message']);

  const i = await internal.inject({ method: 'PATCH', url: progressUrl, payload: { amount: 0 }, headers: service });   // corpo inválido
  assert.equal(i.statusCode, 400);
  assert.equal(i.json().error.code, 'INVALID_INPUT');
}
