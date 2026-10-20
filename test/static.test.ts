import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { configurePublicApp, DEFAULT_SETTINGS } from '../src/appSetup.js';
import { REALTIME } from '../src/realtime/config.js';
import { SKILLS } from '../src/realtime/protocol.js';
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

  it('/game.js, /targeting.js, /village.js e /styles.css com o tipo certo; If-None-Match igual ao ETag: 304', async () => {
    const pub = app();
    const cases: [string, string][] = [['/game.js', 'text/javascript; charset=utf-8'], ['/targeting.js', 'text/javascript; charset=utf-8'], ['/village.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'text/css; charset=utf-8']];
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

  it('game.js: protocolo igual ao do servidor (move dx/dy, cast com as 7 habilidades, chat)', () => {
    assert.match(js, /send\(\{ type: 'move', dx: want\.x, dy: want\.y \}\)/);
    assert.match(js, /send\(targetId \? \{ type: 'cast', skill, targetId \} : \{ type: 'cast', skill \}\)/);
    assert.match(js, /send\(\{ type: 'meditate', active: !state\.me\.meditating \}\)/);
    assert.match(js, /from '\.\/targeting\.js'/, 'foco e câmera vêm do módulo testado');
    assert.match(js, /send\(\{ type: 'chat', message \}\)/);
    for (const skill of SKILLS) assert.match(html, new RegExp(`data-skill="${skill}"`));
  });

  it('combate MOBA: ataque, 4 espaços de habilidade, 🧘, 🏃, 🔄, 🎯; o cliente só PEDE (attack/run/switch_kit/spend_point)', () => {
    for (const id of ['attack-btn', 'meditate-btn', 'run-btn', 'kit-btn', 'target-btn', 'talk-btn', 'status-toggle', 'status-panel', 'player-menu', 'eval-panel']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.equal(html.match(/class="cbtn skill" data-slot="\d"/g)?.length, 4);
    assert.match(js, /send\(state\.focusId \? \{ type: 'attack', targetId: state\.focusId \} : \{ type: 'attack' \}\)/);
    assert.match(js, /send\(\{ type: 'run', active: !state\.me\.running \}\)/);
    assert.match(js, /send\(\{ type: 'switch_kit', kit: state\.kit\.active === 'A' \? 'B' : 'A' \}\)/);
    assert.match(js, /send\(\{ type: 'spend_point', attribute: li\.dataset\.attr \}\)/);
    // O kit na tela só muda com a mensagem do servidor (welcome ou "kit"), nunca no toque.
    assert.equal(js.match(/state\.kit = /g)?.length, 2);
    assert.match(js, /case 'kit':\s+state\.kit = \{ active: msg\.active, kits: msg\.kits \};/);
    // Velocidade da previsão: a que o servidor mandou.
    assert.match(js, /const speed = state\.me\.speed \|\| state\.world\.speed;/);
    assert.match(js, /from '\.\/village\.js'/);
  });

  it('Sala de Missões: botão 📜, painel com barra de progresso e 💬 Falar; o cliente só PEDE (talk/missions)', () => {
    for (const id of ['missions-toggle', 'missions-panel', 'mission-meter', 'mission-count', 'mission-status', 'mission-reward', 'talk-btn']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /id="mission-meter"[^>]*role="progressbar"/);
    assert.match(js, /send\(\{ type: 'talk', npcId: npc\.id \}\)/);
    assert.match(js, /send\(\{ type: 'missions' \}\)/);
    // Nenhuma mensagem do cliente informa progresso ou conclusão: isso só vem do servidor.
    assert.doesNotMatch(js, /type: '(mission_progress|complete|redeem|submit)/);
    assert.match(js, /case 'mission':/);
    assert.match(js, /case 'mission_reward':/);
  });
});
