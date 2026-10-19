import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configurePublicApp, DEFAULT_SETTINGS, HEALTH_PATH } from '../src/appSetup.js';
import { describeBootError } from '../src/bootErrors.js';
import { loadConfig } from '../src/config.js';
import { deps } from './support/appCases.js';
import { FakeFastify } from './support/fakeFastify.js';
import { JWT_SECRET, SERVICE_TOKEN } from './support/harness.js';

const env = (extra: Record<string, string>) =>
  ({ DATABASE_URL: 'postgres://x', JWT_SECRET, SERVICE_TOKEN, ...extra }) as NodeJS.ProcessEnv;

describe('preparação para o Render', () => {
  it('PORT do ambiente vira a porta pública; padrões 3000 e 3001; as duas não podem coincidir', () => {
    assert.equal(loadConfig(env({})).PORT, 3000);
    assert.equal(loadConfig(env({})).INTERNAL_PORT, 3001);
    assert.equal(loadConfig(env({ PORT: '10000' })).PORT, 10000);       // o que o Render injeta
    assert.equal(loadConfig(env({})).PUBLIC_HOST, '0.0.0.0');          // o Render exige 0.0.0.0
    assert.equal(loadConfig(env({})).INTERNAL_HOST, '127.0.0.1');      // interna nunca exposta
    assert.throws(() => loadConfig(env({ PORT: '3001' })), /PORT e INTERNAL_PORT/);
  });

  it('GET /health responde 200 { status: "ok" } sem banco e sem JWT', async () => {
    let dbCalls = 0;
    const db = { ...deps.db, query: async () => { dbCalls += 1; return { rows: [], rowCount: 0 }; } };
    const app = new FakeFastify();
    configurePublicApp(app as unknown as FastifyInstance, { ...deps, db }, DEFAULT_SETTINGS);
    const r = await app.inject({ method: 'GET', url: HEALTH_PATH });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { status: 'ok' });
    assert.equal(dbCalls, 0);
  });

  it('health check não conta no rate limit (o Render chama de poucos IPs, sem parar)', async () => {
    const app = new FakeFastify();
    configurePublicApp(app as unknown as FastifyInstance, deps, { ...DEFAULT_SETTINGS, rateLimit: { globalMax: 2, sensitiveMax: 1, authMax: 1, windowMs: 60_000 } });
    for (let i = 0; i < 10; i++) assert.equal((await app.inject({ method: 'GET', url: HEALTH_PATH, remoteAddress: '10.0.0.1' })).statusCode, 200);
  });

  it('falha de boot vira instrução clara no log', () => {
    assert.match(describeBootError({ code: '3F000', message: 'schema "game" does not exist' }), /rode o arquivo db\/schema_ranks_missoes_sensei\.sql/);
    assert.match(describeBootError({ code: '42P01', message: 'relation "game.ranks" does not exist' }), /SQL Editor do Neon/);
    assert.match(describeBootError(new Error('unsupported startup parameter: statement_timeout')), /desligue "Connection pooling"/);
    assert.match(describeBootError({ code: '28P01', message: 'password authentication failed' }), /usuário ou senha/);
    assert.match(describeBootError(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' })), /alcançar o banco/);
    assert.match(describeBootError(new Error('timeout exceeded when trying to connect')), /alcançar o banco/);
    assert.match(describeBootError(new Error('self-signed certificate in certificate chain')), /SSL/);
    assert.match(describeBootError(new Error('outra coisa')), /^Falha ao iniciar: outra coisa$/);
  });

  it('render.yaml bate com o projeto e não carrega segredo', () => {
    const y = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
    assert.match(y, /buildCommand: npm install --include=dev && npm run verify/);
    assert.match(y, /startCommand: npm start/);
    assert.match(y, new RegExp(`healthCheckPath: ${HEALTH_PATH}\\b`));
    assert.match(y, /plan: free/);
    assert.match(y, /- key: DATABASE_URL\s+sync: false/);
    assert.match(y, /- key: JWT_SECRET\s+generateValue: true/);
    assert.match(y, /- key: SERVICE_TOKEN\s+generateValue: true/);
    assert.doesNotMatch(y, /key: PORT\b/, 'PORT é do Render, não do blueprint');
    assert.doesNotMatch(y, /postgres(ql)?:\/\//, 'nenhuma connection string no arquivo');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.ok(pkg.scripts.verify.includes('npm test') && pkg.scripts.verify.includes('npm run build'));
  });

  it('package.json: runtime em dependencies, build em devDependencies, start aponta para dist/server.js', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['fastify', 'jose', 'pg', 'zod']);
    assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/node', '@types/pg', 'tsx', 'typescript']);
    assert.equal(pkg.scripts.start, 'node dist/server.js');
    assert.equal(pkg.type, 'module');
    assert.equal(readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim(), '22');
    const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
    for (const entry of ['node_modules/', 'dist/', '.env']) assert.ok(ignore.split('\n').includes(entry), entry);
  });
});
