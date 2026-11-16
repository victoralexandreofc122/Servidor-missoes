import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { FakeConn, setupWorld } from './support/world.js';

/*
 * v69: polimento do rankeado (CLAUDE.md, "Próximas entregas" 2; revisões de jogabilidade, estilo e celular, rodada 5).
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('public/game.js');
const css = read('public/hud.css');
const art = read('public/mapArt.js');
const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };

function world() {
  const w = setupWorld(cfg);
  const join = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    const send = (msg: unknown) => h.receive(JSON.stringify(msg));
    send({ type: 'ranked', action: 'enter' });
    return { id, conn, send };
  };
  return { ...w, join };
}

describe('v69: "Próximo: X × Y" e "você é o próximo" (servidor)', () => {
  it('com as 4 arenas ocupadas, a próxima dupla vai para todos; para ela, com "me"', () => {
    const { join, run } = world();
    const watcher = join('plateia');
    const fighters = Array.from({ length: 8 }, (_, i) => join(`lutador${i}`));
    for (const p of fighters) p.send({ type: 'ranked', action: 'queue' });
    run(REALTIME.tickMs);
    const [x, y] = [join('sora'), join('kiba')];
    x.send({ type: 'ranked', action: 'queue' });
    y.send({ type: 'ranked', action: 'queue' });
    run(REALTIME.tickMs);
    assert.deepEqual(watcher.conn.last('duel_queue').next, { a: 'sora', b: 'kiba', me: false });
    assert.deepEqual(x.conn.last('duel_queue').next, { a: 'sora', b: 'kiba', me: true });
    assert.equal(y.conn.last('duel_queue').next.me, true);
  });

  it('quem começou a lutar numa arena de fora do Vale recebe a fila nova (sem o "Próximo" velho)', () => {
    const { join, run } = world();
    const [a, b, c, d] = ['kaito', 'mei', 'rin', 'sora'].map((n) => join(n));
    a!.send({ type: 'ranked', action: 'queue' });
    b!.send({ type: 'ranked', action: 'queue' });
    run(REALTIME.tickMs);
    c!.send({ type: 'ranked', action: 'queue' });
    d!.send({ type: 'ranked', action: 'queue' });
    assert.equal(c!.conn.last('duel_queue').next?.me, true, 'na fila: é o próximo');
    run(REALTIME.tickMs);
    assert.equal(c!.conn.last('duel_state').arena, 'arena_2');
    const q = c!.conn.last('duel_queue');
    assert.equal(q.queued, false);
    assert.equal(q.next, undefined, 'saiu da fila: o "Próximo" some');
  });
});

describe('v69: cliente', () => {
  it('a tela do resultado: selo redondo da faixa e "faltam N pontos" para a próxima', () => {
    const tiers = game.slice(game.indexOf('const RANK_TIERS'), game.indexOf('\n', game.indexOf('const RANK_TIERS')));
    const gap = game.slice(game.indexOf('function tierGapText('), game.indexOf('\n}\n', game.indexOf('function tierGapText(')) + 2);
    const tierGapText = new Function(`${tiers}; ${gap}; return tierGapText;`)();
    assert.equal(tierGapText(1055), 'Faltam 95 pontos para OURO');
    assert.equal(tierGapText(1000), 'Faltam 50 pontos para PRATA');
    assert.equal(tierGapText(1600), '', 'Lenda é a última');
    assert.match(game, /paintTierSeal\(ui\.duelBannerSeal, msg\.mmr\);/);
    assert.match(css, /\.tier-seal \{[^}]*width: 48px; height: 48px; border-radius: 50%;/);
    assert.match(css, /clip-path: polygon\(0 0, 100% 0, calc\(100% - 18px\) 50%/, 'a faixa em forma de fita');
    assert.match(css, /\.duel-banner \{\n  top: calc\(24% \+ 14px\);/, 'mais baixa: não cobre o placar');
  });

  it('"Próximo" no placar só para quem não está lutando; "você é o próximo" com som e vibração', () => {
    assert.match(game, /const showNext = !!nx && !!d && d\.phase !== 'idle' && !inFight && !duelFighting\(\) && state\.mapId !== 'vale_trio';/);
    assert.match(game, /showToast\('⚔️ Você é o próximo! Fique perto da arena\.'\);/);
    assert.match(game, /navigator\.vibrate\?\.\(150\)/);
  });

  it('nomes colados: conta pela largura das plaquinhas e empilha mais de dois', () => {
    assert.match(game, /if \(Math\.abs\(q\.x - p\.x\) \* T < \(myW \+ qw\) \/ 2 \+ 14\) stack \+= 1;/);
    assert.match(game, /const crowd = stack \* \(fontSize \+ 6\);/);
  });

  it('o status do minimapa curto (sem "online", zona segura em 🕊️)', () => {
    assert.doesNotMatch(game, /`online · \$\{where/);
    assert.match(game, /state\.inSafeZone \? '🕊️ · '/);
  });

  it('arte: degraus com face e sombra, assentos em blocos, estátua com borda de volume, mureta em blocos, rochas redondas', () => {
    const stands = art.slice(art.indexOf('function drawStandsSide('), art.indexOf('\n}\n', art.indexOf('function drawStandsSide(')));
    assert.match(stands, /FACE = 5, SHADE = 3\.5/);
    assert.match(stands, /assentos de madeira: blocos de 1 casa com contorno/);
    assert.match(stands, /rgba\(0, 0, 0, 0\.35\)/);
    assert.match(art, /const RIM = 1\.3;/);
    assert.match(art, /a sombra sob a bandana/);
    assert.match(art, /function drawValeRocks\(/);
    assert.match(art, /duas fiadas de blocos desencontrados/);
    assert.match(read('src/realtime/maps.ts'), /wall\('rock', 0, 3\.2, 2, H - 3\.2, 'vale'\)/);
    assert.match(game, /if \(skyClock\(\)\?\.phase === 'dia'\) ctx\.globalAlpha = 0\.25;/, 'holofote mais fraco de dia');
  });
});
