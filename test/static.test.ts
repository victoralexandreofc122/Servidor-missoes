import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configurePublicApp, DEFAULT_SETTINGS } from '../src/appSetup.js';
import { REALTIME } from '../src/realtime/config.js';
import { CONTENT_SECURITY_POLICY, loadPublicFiles } from '../src/web/staticFiles.js';
import { deps } from './support/appCases.js';
import { FakeFastify } from './support/fakeFastify.js';

const files = loadPublicFiles();
const byRoute = (route: string) => files.find((f) => f.route === route)!;
const html = byRoute('/').body;
const js = byRoute('/game.js').body;

function app() {
  const pub = new FakeFastify();
  configurePublicApp(pub as unknown as FastifyInstance, { ...deps, publicFiles: files }, DEFAULT_SETTINGS);
  return pub;
}

describe('cliente web servido pelo Fastify', () => {
  it('GET / devolve o index.html com CSP, nosniff e sem cache velho', async () => {
    const r = await app().inject({ method: 'GET', url: '/' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(r.headers['content-security-policy'], CONTENT_SECURITY_POLICY);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.match(String(r.json()), /<canvas id="game"/);
  });

  it('/game.js e /style.css com o tipo certo; If-None-Match igual ao ETag: 304', async () => {
    const pub = app();
    const cases: [string, string][] = [['/game.js', 'text/javascript; charset=utf-8'], ['/style.css', 'text/css; charset=utf-8']];
    for (const [url, type] of cases) {
      const r = await pub.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 200, url);
      assert.equal(r.headers['content-type'], type);
      const again = await pub.inject({ method: 'GET', url, headers: { 'if-none-match': String(r.headers.etag) } });
      assert.equal(again.statusCode, 304, url);
    }
  });

  it('só a lista fechada existe: caminhos com ../ ou arquivos do servidor dão 404', async () => {
    const pub = app();
    for (const url of ['/../package.json', '/.env', '/public/game.js', '/src/server.ts', '/index.html.bak']) {
      assert.equal((await pub.inject({ method: 'GET', url })).statusCode, 404, url);
    }
  });

  it('sem publicFiles (testes antigos), a API sobe só com as rotas JSON', async () => {
    const pub = new FakeFastify();
    configurePublicApp(pub as unknown as FastifyInstance, deps, DEFAULT_SETTINGS);
    assert.equal((await pub.inject({ method: 'GET', url: '/' })).statusCode, 404);
  });
});

describe('garantias do cliente (public/)', () => {
  it('index.html: zoom bloqueado, nada inline (a CSP bloquearia) e scripts só do próprio servidor', () => {
    assert.match(html, /user-scalable=no/);
    assert.match(html, /maximum-scale=1/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'nenhum <script> inline');
    assert.doesNotMatch(html, /\sstyle=/, 'nenhum style= inline');
    assert.doesNotMatch(html, /\son[a-z]+=/i, 'nenhum onclick= etc.');
    assert.doesNotMatch(html, /(src|href)="https?:/, 'nada de CDN externa');
  });

  it('game.js: token nunca na URL (vai no subprotocolo), chat nunca vira HTML', () => {
    assert.doesNotMatch(js, /\?token=/);
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    assert.match(js, /new WebSocket\(WS_URL, \[SUBPROTOCOL, `jwt\.\$\{token\}`\]\)/);
    assert.match(js, new RegExp(`const SUBPROTOCOL = '${REALTIME.subprotocol.replace('.', '\\.')}'`));
    assert.doesNotMatch(js, /console\.(log|info|warn|error)\([^)]*token/i, 'token nunca no console');
  });

  it('game.js: protocolo igual ao do servidor (move dx/dy, cast com as 4 habilidades, chat)', () => {
    assert.match(js, /send\(\{ type: 'move', dx: want\.x, dy: want\.y \}\)/);
    assert.match(js, /send\(\{ type: 'cast', skill \}\)/);
    assert.match(js, /send\(\{ type: 'chat', message \}\)/);
    for (const skill of ['fire', 'taijutsu', 'illusion', 'water']) assert.match(html, new RegExp(`data-skill="${skill}"`));
  });
});
