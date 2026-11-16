import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { VALE, VALE_TRIO, valeFightBox } from '../src/realtime/maps.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/* v70: os pedidos do Victor de 17/11. */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('public/game.js');
const css = read('public/hud.css');
const html = read('public/index.html');

describe('v70: o bug de voltar ao navegador (conexão morta em silêncio)', () => {
  it('o cliente vigia a conexão: com a tela à vista e 5 s sem nada do servidor, reconecta sozinho', () => {
    assert.match(game, /const CONN_DEAD_MS = 5000;/);
    assert.match(game, /state\.lastMsgAt = performance\.now\(\);   \/\/ v70/);
    assert.match(game, /setInterval\(connWatchdog, 1000\);/);
    const fn = game.slice(game.indexOf('function connWatchdog()'), game.indexOf('\n}\n', game.indexOf('function connWatchdog()')));
    assert.match(fn, /document\.hidden/, 'em segundo plano não conta');
    assert.match(fn, /Math\.max\(state\.lastMsgAt \|\| 0, state\.visibleAt \|\| 0\)/, 'ao voltar para a aba o prazo recomeça');
    assert.match(fn, /connect\(\);/);
  });
  it('o servidor manda o "sync" a cada 2 s (é o que o vigia escuta)', () => {
    assert.equal(REALTIME.lagComp.syncEveryMs, 2000);
  });
});

describe('v70: os números', () => {
  it('Lodo Verde bate 8; a vida volta a 2/s depois de 3 s sem apanhar (com o chakra cheio)', () => {
    assert.equal(REALTIME.combat.monsters.attackDamage, 8);
    assert.equal(REALTIME.combat.player.hpRegenPerSec, 2);
    assert.equal(REALTIME.combat.player.hpRegenCalmMs, 3000);
  });

  it('o monstro de caça morto volta depois de 1 minuto (não na hora)', () => {
    assert.equal(REALTIME.combat.monsters.respawnMs, 60_000);
    const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 1, perPlayer: 0 } } };
    const { world, connect, run } = setupWorld(cfg);
    const a = connect('cacador');
    placeIn(world, a.id, 'map_2', 51, 10);
    run(1100);
    const hunt = () => (world as any).monstersIn('map_2') as { id: string }[];
    assert.equal(hunt().length, 1);
    const m = (world as any).monsters.get(hunt()[0]!.id);
    (world as any).killMonster(m, (world as any).sessions.get(a.id), (world as any).now(), 'attack');
    assert.equal(hunt().length, 0);
    run(30_000);
    assert.equal(hunt().length, 0, '30 s depois: ainda não');
    run(31_000);
    assert.equal(hunt().length, 1, 'passou 1 minuto: voltou');
  });

  it('migração v40: Fácil 50, Normal 150, Difícil 325 (sem DO $$, dentro de BEGIN/COMMIT)', () => {
    const sql = read('db/schema_v40_xp_missoes.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.doesNotMatch(sql, /DO \$\$/);
    assert.match(sql, /xp_reward = 50 +WHERE code = 'NPC_EASY'/);
    assert.match(sql, /xp_reward = 150 WHERE code = 'NPC_TRAINING'/);
    assert.match(sql, /xp_reward = 325 WHERE code = 'NPC_HARD'/);
  });
});

describe('v70: o HUD', () => {
  it('o retrato abre os atributos e mostra os pontos; o nome no lugar de "Vida"', () => {
    assert.match(html, /id="portrait-btn" class="portrait" role="button"/);
    assert.match(html, /id="portrait-points" class="portrait-points" hidden/);
    assert.match(html, /id="me-name" class="me-label">Ninja</);
    assert.doesNotMatch(html, /<span class="me-label">Vida<\/span>/);
    assert.match(game, /openStatus\(\);\n    showTab\('attrs'\);/);
    assert.match(game, /ui\.portraitPoints\.textContent = `\+\$\{pts\}`/);
  });

  it('celular: o chat no meio, acima do cargo, com a letra menor; as missões à esquerda', () => {
    const v70 = css.slice(css.indexOf('v70: pedidos do Victor de 17/11'));
    assert.match(v70, /\.chat-box \{\n    top: auto; left: 50%; translate: -50% 0;\n    bottom: calc\(var\(--safe-bottom\) \+ 30px\);/);
    assert.match(v70, /\.chat-box \.chat-feed li \{ font-size: 11px;/);
    assert.match(v70, /\.tracker \{\n    display: block;\n    right: auto; left: calc\(var\(--safe-left\) \+ 6px\);/);
  });
});

describe('v70: o rankeado 3v3 numa arena própria, maior', () => {
  const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
  function world() {
    const w = setupWorld(cfg);
    const join = (username: string) => {
      const conn = new FakeConn();
      const id = randomUUID();
      const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
      return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)) };
    };
    return { ...w, join };
  }

  it('a área de luta do 3v3 é maior que a do Vale', () => {
    const a = valeFightBox(VALE), b = valeFightBox(VALE_TRIO);
    assert.ok(b.w > a.w && b.h > a.h, `${b.w}x${b.h} > ${a.w}x${a.h}`);
    assert.ok(REALTIME.maps.vale_trio.ranked, 'é mapa do rankeado');
  });

  it('Rankeado → 3v3 leva à arena do 3v3; → 1v1 ao Vale; dá para trocar estando numa delas', () => {
    const { world: w, join } = world();
    const p = join('sora');
    p.send({ type: 'ranked', action: 'enter', mode: '3v3' });
    assert.equal((w as any).sessions.get(p.id).map, 'vale_trio');
    p.send({ type: 'ranked', action: 'enter', mode: '1v1' });
    assert.equal((w as any).sessions.get(p.id).map, 'vale_estatuas');
    p.send({ type: 'ranked', action: 'leave' });
    assert.notEqual((w as any).sessions.get(p.id).map, 'vale_estatuas', 'Voltar sai para onde estava');
  });

  it('a fila do 3v3 só na arena do 3v3; a do 1v1 só no Vale', () => {
    const { world: w, join } = world();
    const p = join('kiba');
    p.send({ type: 'ranked', action: 'enter', mode: '1v1' });
    p.send({ type: 'ranked', action: 'team3_queue' });
    assert.match(p.conn.last('notice').text, /Arena 3v3/);
    p.send({ type: 'ranked', action: 'enter', mode: '3v3' });
    p.send({ type: 'ranked', action: 'queue' });
    assert.equal((w as any).rankedQueue.length, 0, 'Desafio (1v1) não vale na arena do 3v3');
    p.send({ type: 'ranked', action: 'team3_queue' });
    assert.equal((w as any).team3Queue.length, 1);
  });

  it('cliente: Rankeado pergunta 1v1 ou 3v3; na arena do 3v3 só os botões dele', () => {
    assert.match(html, /id="mode-1v1"/);
    assert.match(html, /id="mode-3v3"/);
    assert.match(game, /modeUi\.panel\.hidden = !modeUi\.panel\.hidden;/);
    assert.match(game, /send\(\{ type: 'ranked', action: 'enter', mode \}\)/);
    assert.match(game, /ui\.duelBtn\.hidden = fighting \|\| trioArena;/);
    assert.match(game, /ui\.team3Btn\.hidden = fighting \|\| !trioArena;/);
  });
});
