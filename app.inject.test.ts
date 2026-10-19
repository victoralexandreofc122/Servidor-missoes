import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SETTINGS, type AppSettings } from '../src/appSetup.js';
import {
  caseErrorHandlerOnBoth, caseInternalHookIsGlobal, casePublicHasNoInternal, casesCors, casesRateLimitWiring, deps,
} from './support/appCases.js';

/*
 * Mesmos casos dos testes com FakeFastify, agora com o Fastify REAL (fastify.inject),
 * mais o que só o Fastify real sabe fazer (request.ip com trustProxy).
 * Se o Fastify não puder ser carregado (ex.: sem `npm install`), os testes são pulados.
 */
let appModule: typeof import('../src/app.js') | undefined;
let unavailable: string | false = false;
try {
  appModule = await import('../src/app.js');
} catch (err) {
  unavailable = `Fastify não pôde ser carregado (${(err as Error).message.split('\n')[0]}). Rode npm install.`;
}

const opened: { close(): Promise<unknown> }[] = [];
const build = (settings: AppSettings = DEFAULT_SETTINGS) => {
  const pub = appModule!.buildPublicApp(deps, settings, { logger: false });
  const internal = appModule!.buildInternalApp(deps, settings, { logger: false });
  opened.push(pub, internal);
  return { pub, internal };
};
const closeAll = () => Promise.all(opened.splice(0).map((a) => a.close()));

describe('montagem das instâncias com Fastify real (inject)', { skip: unavailable }, () => {
  it('(a) token de serviço é hook global da instância interna', async () => {
    await caseInternalHookIsGlobal(build().internal);
    await closeAll();
  });

  it('(b) a instância pública não tem /internal', async () => {
    await casePublicHasNoInternal(build().pub);
    await closeAll();
  });

  it('(c) setErrorHandler nas duas instâncias', async () => {
    const { pub, internal } = build();
    await caseErrorHandlerOnBoth(pub, internal);
    await closeAll();
  });

  it('CORS (correção 9)', async () => {
    await casesCors(build);
    await closeAll();
  });

  it('trustProxy (correção 10): request.ip respeita X-Forwarded-For', async () => {
    for (const [trustProxy, expected] of [[true, '203.0.113.7'], [false, '10.0.0.9']] as const) {
      const { pub } = build({ ...DEFAULT_SETTINGS, trustProxy });
      pub.get('/meu-ip', async (request: any, reply: any) => reply.send({ ip: request.ip }));
      const r = await pub.inject({ method: 'GET', url: '/meu-ip', remoteAddress: '10.0.0.9', headers: { 'x-forwarded-for': '203.0.113.7' } });
      assert.equal(r.json().ip, expected, `trustProxy=${trustProxy}`);
    }
    await closeAll();
  });

  it('rate limit (correção 11)', async () => {
    await casesRateLimitWiring(build);
    await closeAll();
  });
});
