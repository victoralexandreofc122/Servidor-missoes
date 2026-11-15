import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { CRONISTA_FRAGMENTOS, cronistaFala } from '../src/realtime/falas.js';
import { FRAGMENT_REWARD, FRAGMENT_SPOTS } from '../src/realtime/fragmentos.js';
import { CHRONICLE } from '../src/realtime/worldProgress.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * v65: as decisões do Victor (15/11/2026): os nomes da lore, os visuais do Kenji e da Mei, Pular a Academia, os fragmentos
 * da Crônica gravados no banco (migração v39) com prêmio e falas do Cronista.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const lore = await import(new URL('../public/lore.js', import.meta.url).href);

describe('v65: nomes escolhidos', () => {
  it('o jogo usa os nomes escolhidos: Lodo Verde, Pergaminho em Chamas, Pedras da Vigília, Noite das Lanternas, Rio das Raízes', () => {
    const textos = [read('src/realtime/gameWorld.ts'), read('public/game.js'), read('src/realtime/missions.ts'), read('public/index.html')].join('\n');
    assert.doesNotMatch(textos, /\d+ slimes|'slime', 'slimes'|slime: 'Slime'|derrotar slimes/);
    assert.match(textos, /\['Lodo Verde', 'Lodos Verdes'\]/);
    const frg1 = lore.FRAGMENTS.find((f: any) => f.id === 'FRG_01').text;
    assert.match(frg1, /Noite das Lanternas.*Pedras da Vigília.*Pergaminho em Chamas/);
    assert.match(CHRONICLE[1]!.text, /Primeira Guerra.*Rio das Raízes.*Lodo Ancestral.*Noite das Cinco Pedras.*Pedras da Vigília/);
    const arco = read('docs/historia/arco-1.md');
    assert.doesNotMatch(arco, /Tsubaki|Pedras?-Selo|Cerimônia da Chama/);
    assert.match(arco, /Akane/);
    assert.match(read('docs/lore/biblia-do-mundo.md'), /Promessa da Chama/);
    assert.match(read('docs/lore/propostas-de-nomes.md'), /1A, 2B, 3B, 4B, 5A, 6C, 7C, 8A, 9A, 10A, 11C, 12A/);
  });

  it('Professor Kenji com o visual masculino e Professora Mei com o feminino (estavam trocados)', () => {
    const js = read('public/game.js');
    const kenji = js.match(/  tutor_jutsu: npcLook\(\{([^}]*)\}\)/)![1]!;
    const mei = js.match(/  tutor_weapons: npcLook\(\{([^}]*)\}\)/)![1]!;
    assert.doesNotMatch(kenji, /gender: 'f'/);
    assert.match(mei, /gender: 'f'/);
  });
});

describe('v65: Pular a Academia', () => {
  function cadet(step: number) {
    const w = setupWorld();
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username: 'novato', tutorialStep: step }, conn);
    const s = (w.world as any).sessions.get(id);
    return { w, conn, s, send: (m: unknown) => h.receive(JSON.stringify(m)) };
  }

  it('da etapa 0 vai direto para a Praça, com a Kunai de Treino, num aviso só', () => {
    const { conn, s, send } = cadet(0);
    assert.equal(s.map, 'academy_interior');
    conn.clear();
    send({ type: 'tutorial_skip' });
    assert.equal(s.tutorial, 4);
    assert.equal(s.map, REALTIME.startMap);
    assert.equal(s.items.kunai_training, 1);
    const notices = conn.of('notice').map((n: any) => n.text);
    assert.equal(notices.filter((t: string) => /Academia pulada/.test(t)).length, 1);
    assert.ok(!notices.some((t: string) => /Etapa \d concluída/.test(t)), 'as etapas do meio passam sem aviso');
    assert.equal(conn.last('tutorial').step, 4);
  });

  it('do meio da Academia também; fora dela (ou já formado) não faz nada', () => {
    const { s, send } = cadet(2);
    send({ type: 'tutorial_skip' });
    assert.equal(s.tutorial, 4);
    const done = cadet(4);
    const before = { map: done.s.map, x: done.s.x };
    done.send({ type: 'tutorial_skip' });
    assert.deepEqual({ map: done.s.map, x: done.s.x }, before);
  });

  it('cliente: o botão aparece só durante a Academia e pede um segundo toque', () => {
    const js = read('public/game.js');
    assert.match(read('public/index.html'), /id="tutorial-skip"/);
    assert.match(js, /ui\.tutorialSkip\.hidden = done;/);
    assert.match(js, /Toque de novo para pular/);
    assert.match(js, /send\(\{ type: 'tutorial_skip' \}\)/);
  });
});

describe('v65: fragmentos da Crônica no servidor (migração v39)', () => {
  it('as posições do servidor são as mesmas do cliente', () => {
    assert.deepEqual(FRAGMENT_SPOTS.map((f) => [f.id, f.map, f.x, f.y]), lore.FRAGMENTS.map((f: any) => [f.id, f.map, f.x, f.y]));
  });

  it('o servidor confere o lugar: longe ou em outro mapa não conta; perto conta uma vez e paga', () => {
    const w = setupWorld();
    const a = w.connect('leitora');
    const s = (w.world as any).sessions.get(a.id);
    const spot = FRAGMENT_SPOTS.find((f) => f.id === 'FRG_06')!;
    placeIn(w.world, a.id, spot.map as 'map_2', spot.x + 6, spot.y);
    a.send({ type: 'fragment', id: 'FRG_06' });
    assert.equal(a.conn.last('fragments'), undefined, 'longe demais');
    a.send({ type: 'fragment', id: 'FRG_01' });
    assert.equal(a.conn.last('fragments'), undefined, 'outro mapa');
    Object.assign(s, { x: spot.x + 1, y: spot.y });
    a.send({ type: 'fragment', id: 'FRG_06' });
    assert.deepEqual(a.conn.last('fragments'), { type: 'fragments', found: ['FRG_06'], fresh: 'FRG_06' });
    assert.match(a.conn.last('notice').text, new RegExp(`\\+${FRAGMENT_REWARD.ryo} ryō e \\+${FRAGMENT_REWARD.xp} XP \\(1/17\\)`));
    a.conn.clear();
    a.send({ type: 'fragment', id: 'FRG_06' });
    assert.equal(a.conn.last('fragments'), undefined, 'uma vez só');
  });

  it('o Cronista conta os fragmentos achados (até 160 caracteres)', () => {
    assert.match(cronistaFala(0, 17).text, /brilho dourado/);
    assert.equal(cronistaFala(3, 17).text, 'Você já leu 3 dos 17 pedaços perdidos. Cada um conta o que os livros calam.');
    assert.match(cronistaFala(17, 17).text, /^Todos os 17\./);
    for (const f of CRONISTA_FRAGMENTOS) assert.ok(f.text.length <= 160, f.id);
    const w = setupWorld();
    const a = w.connect('ouvinte');
    const npc = REALTIME.npcs.find((n) => n.id === 'cronista')!;
    placeIn(w.world, a.id, npc.map as 'academy_interior', npc.x, npc.y + 1);
    w.clock.advance(5000);
    a.send({ type: 'talk', npcId: 'cronista' });
    assert.match(a.conn.of('npc_say').at(-1).text, /brilho dourado/);
  });

  it('cliente: avisa o servidor ao achar; com a v39 a lista do servidor vale', () => {
    const manual = read('public/manual.js');
    assert.match(manual, /api\.onFragment\?\.\(id\)/);
    assert.match(manual, /if \(msg\.type === 'fragments'\)/);
    assert.match(read('public/game.js'), /onFragment: \(id\) => send\(\{ type: 'fragment', id \}\)/);
    const sql = read('db/schema_v39_fragmentos.sql');
    assert.doesNotMatch(sql, /DO \$\$/);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS game\.player_fragments/);
  });
});

describe('v65: Painel do Admin com todos os comandos', () => {
  it('todo comando do /admin tem botão no painel (comando novo sem botão quebra este teste)', () => {
    const admin = read('src/realtime/admin.ts');
    const parse = admin.slice(admin.indexOf('export function parseAdminCommand'));
    const body = parse.slice(0, parse.indexOf('\n}\n'));
    const commands = [...body.matchAll(/^    case '([a-z]+)':/gm)].map((m) => m[1]!);
    assert.ok(commands.length >= 25, commands.join(','));
    const panel = read('public/adminPanel.js');
    for (const c of commands) assert.ok(new RegExp(`run\\((\`|')${c}\\b|=> \`${c} `).test(panel), `/admin ${c} sem botão no painel`);
  });

  it('os Titãs do painel são os do servidor, na mesma ordem', async () => {
    const { TITANS } = await import('../src/realtime/titans.js');
    const panel = read('public/adminPanel.js');
    const names = JSON.parse(panel.match(/const TITAN_NAMES = (\[[^\]]*\]);/)![1]!.replace(/'/g, '"'));
    assert.deepEqual(names, TITANS.map((t) => t.name));
  });
});
