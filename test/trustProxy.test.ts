import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseFastifyOptions, DEFAULT_SETTINGS, toFastifyTrustProxy } from '../src/appSetup.js';
import { loadConfig, trustProxyWarning } from '../src/config.js';
import { JWT_SECRET, SERVICE_TOKEN } from './support/harness.js';

const env = (extra: Record<string, string>) =>
  ({ DATABASE_URL: 'postgres://x', JWT_SECRET, SERVICE_TOKEN, ...extra }) as NodeJS.ProcessEnv;

describe('trustProxy (correção 10)', () => {
  it('as DUAS instâncias recebem trustProxy (padrão true)', () => {
    assert.equal(DEFAULT_SETTINGS.trustProxy, true);
    assert.equal(baseFastifyOptions('public', DEFAULT_SETTINGS).trustProxy, true);
    assert.equal(baseFastifyOptions('internal', DEFAULT_SETTINGS).trustProxy, true);
  });

  it('TRUST_PROXY: padrão true; aceita false, nº de proxies e IPs', () => {
    assert.equal(loadConfig(env({})).TRUST_PROXY, true);
    assert.equal(loadConfig(env({ TRUST_PROXY: 'false' })).TRUST_PROXY, false);
    assert.equal(loadConfig(env({ TRUST_PROXY: '1' })).TRUST_PROXY, 1);
    assert.equal(loadConfig(env({ TRUST_PROXY: '10.0.0.1,10.0.0.2' })).TRUST_PROXY, '10.0.0.1,10.0.0.2');
  });

  it('TRUST_PROXY numérico vira a função de saltos do Fastify (confia nos N primeiros)', () => {
    const fn = toFastifyTrustProxy(1) as (address: string, hop: number) => boolean;
    assert.equal(typeof fn, 'function');
    assert.equal(fn('10.0.0.1', 0), true);
    assert.equal(fn('203.0.113.7', 1), false);
    assert.equal(toFastifyTrustProxy(true), true);
    assert.equal(toFastifyTrustProxy('10.0.0.1'), '10.0.0.1');
  });

  it('aviso de boot só em produção com trustProxy=false', () => {
    assert.match(trustProxyWarning({ NODE_ENV: 'production', TRUST_PROXY: false })!, /TRUST_PROXY=false em produção/);
    assert.equal(trustProxyWarning({ NODE_ENV: 'production', TRUST_PROXY: true }), undefined);
    assert.equal(trustProxyWarning({ NODE_ENV: 'development', TRUST_PROXY: false }), undefined);
  });
});
