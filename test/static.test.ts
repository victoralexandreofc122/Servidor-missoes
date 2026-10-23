import { readFileSync } from 'node:fs';
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
const html = byRoute('/').body as string;
const js = byRoute('/game.js').body as string;

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

  it('v9: sprites do personagem (módulos e os 2 atlas PNG) com o tipo certo e ETag', async () => {
    const pub = app();
    for (const [url, type] of [['/sprites.js', 'text/javascript; charset=utf-8'], ['/spriteData.js', 'text/javascript; charset=utf-8'],
      ['/sprites/chibi_m.png', 'image/png'], ['/sprites/chibi_f.png', 'image/png']] as const) {
      const r = await pub.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 200, url);
      assert.equal(r.headers['content-type'], type, url);
      const again = await pub.inject({ method: 'GET', url, headers: { 'if-none-match': String(r.headers.etag) } });
      assert.equal(again.statusCode, 304, url);
    }
    const png = byRoute('/sprites/chibi_f.png').body;
    assert.ok(Buffer.isBuffer(png), 'PNG lido como bytes (não como texto)');
    assert.deepEqual([...(png as Buffer).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'assinatura PNG intacta');
  });

  it('/game.js, /targeting.js, /world.js e /styles.css com o tipo certo; If-None-Match igual ao ETag: 304', async () => {
    const pub = app();
    const cases: [string, string][] = [['/game.js', 'text/javascript; charset=utf-8'], ['/targeting.js', 'text/javascript; charset=utf-8'], ['/world.js', 'text/javascript; charset=utf-8'], ['/character.js', 'text/javascript; charset=utf-8'], ['/movement.js', 'text/javascript; charset=utf-8'], ['/prediction.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'text/css; charset=utf-8']];
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

  it('game.js: protocolo igual ao do servidor (entradas numeradas, cast dos jutsus, chat)', () => {
    assert.match(js, /from '\.\/prediction\.js'/, 'movimento pela predição testada');
    assert.match(js, /for \(const msg of pred\.advance\([^)]*\)\) send\(msg\)/);
    assert.match(js, /pred\.reconcile\(state\.serverMap, msg\.x, msg\.y, msg\.a, predWorld\)/);
    assert.match(js, /pred\.reconcile\(msg\.map, msg\.x, msg\.y, msg\.a, predWorld\)/, 'map_changed também reconcilia');
    assert.doesNotMatch(js, /type: 'move'/, 'sem a direção segurada antiga');
    const p = readFileSync(new URL('../public/prediction.js', import.meta.url), 'utf8');
    assert.match(p, /type: 'input', seq: this\.outbox\[0\]\.seq, inputs:/);
    assert.match(js, /send\(targetId \? \{ type: 'cast', skill, targetId \} : \{ type: 'cast', skill \}\)/);
    assert.match(js, /send\(\{ type: 'meditate', active: !state\.me\.meditating \}\)/);
    assert.match(js, /from '\.\/targeting\.js'/, 'foco e câmera vêm do módulo testado');
    assert.match(js, /send\(\{ type: 'chat', message \}\)/);
    // Loja: o cliente só PEDE (talk); o painel abre quando o servidor manda shop_open.
    assert.match(js, /send\(\{ type: 'talk', npcId: npc\.id \}\)/);
    assert.match(js, /case 'shop_open':\s+openShop\(msg\.shop, msg\.npcId\)/);
    assert.match(html, /id="shop-panel"[^>]*role="dialog"/);
    // v7: a lista do kit é montada com os jutsus APRENDIDOS (o servidor recusa kit com jutsu não aprendido).
    assert.match(html, /id="kit-list"/);
    assert.match(js, /function learnedJutsus\(\)/);
    assert.ok(SKILLS.length === 38);
  });

  it('v7: Academia, inventário, loja com Extração, classe e Hokage: o cliente só PEDE (sorteio, preço e passo são do servidor)', () => {
    for (const id of ['tutorial-card', 'inv-toggle', 'inv-panel', 'extract-box', 'extract-go', 'class-panel', 'class-confirm', 'hokage-panel', 'tab-jutsus', 'jutsu-list']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /data-attr="weapons"/);
    assert.match(js, /send\(\{ type: 'extract', class: extractChoice\.cls, level: extractChoice\.level \}\)/);
    assert.match(js, /send\(\{ type: 'buy', item: item\.code, qty: 1 \}\)/);
    assert.match(js, /send\(\{ type: 'equip', item: on \? null : code \}\)/);
    assert.match(js, /send\(\{ type: 'choose_class', class: classChoice\.picked \}\)/);
    assert.match(js, /send\(\{ type: 'hokage_apply' \}\)/);
    // Nada de sorteio, chance, preço, passo do tutorial ou uso de jutsu saindo do cliente.
    assert.doesNotMatch(js, /type: '(tutorial|advance_tutorial|jutsu_level|extract_result|set_ryo|learn)'/);
    assert.doesNotMatch(js, /Math\.random\(\)[^\n]*send\(/);
    // Portas da Academia: a predição usa o MESMO passo que o servidor manda.
    assert.match(js, /pred\.gates\.tutorial = msg\.step;/);
    const p = readFileSync(new URL('../public/prediction.js', import.meta.url), 'utf8');
    assert.match(p, /moveStep\(world\.maps, this\.map, this\.x, this\.y, dx, dy, input\.dist, this\.gates\)/);
    assert.match(p, /replay\(world\.maps, map, sx, sy, this\.pending, \(p\) => p\.dist, this\.gates\)/);
  });

  it('v6/v9: Criador (paletas, sem cor livre), ⚙️ com sliders, modo "Editar layout" que trava o combate, visual só muda pelo servidor', () => {
    for (const id of ['creator', 'creator-save', 'creator-options', 'creator-canvas', 'settings-toggle', 'settings-panel', 'edit-layout', 'edit-banner', 'edit-done', 'btn-scale', 'btn-opacity', 'bar-scale', 'bar-opacity']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.doesNotMatch(html, /type="color"/, 'v9: nada de cor livre (só as paletas)');
    for (const field of ['gender', 'skin', 'hairStyle', 'hairColor', 'eyeStyle', 'eyeColor', 'village', 'outfit', 'shirtColor', 'pantsColor', 'bandana']) {
      assert.match(js, new RegExp(`\\['${field}', '`), `campo ${field} no Criador`);
    }
    assert.match(js, /send\(\{ type: 'set_appearance', appearance: \{ \.\.\.creatorLook \} \}\)/);
    // Toque nos botões não faz nada no modo edição (não dá para mexer no layout sem querer, nem atacar arrastando).
    assert.match(js, /if \(hud\.editing\) return;\s+\/\/ modo "Editar layout"/);
    // Layout guardado só no aparelho, com try/catch (modo privado não quebra o jogo).
    assert.match(js, /localStorage\.setItem\(HUD_KEY/);
    assert.match(js, /from '\.\/character\.js'/);
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
    assert.match(js, /from '\.\/world\.js'/, 'chão e paredes vêm dos layouts do servidor');
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
