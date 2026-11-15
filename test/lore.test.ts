import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { TUTOR_BARKS, TUTOR_STEP, todasAsFalas, tutorFala } from '../src/realtime/falas.js';
import { blocked } from '../src/realtime/movement.js';
import { CHRONICLE } from '../src/realtime/worldProgress.js';
import { loadPublicFiles } from '../src/web/staticFiles.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * v64: lore e tutorial (docs/lore/). A planilha de diálogos é a do jogo; as falas cabem na caixa; os fragmentos ficam em
 * chão livre, no lugar certo; nenhum nome da série; as dicas e os fragmentos chegam ao cliente.
 */
const lore = await import(new URL('../public/lore.js', import.meta.url).href);
const { buildCsv } = await import(new URL('../scripts/gerar-dialogos.ts', import.meta.url).href);
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PROIBIDOS = ['sharingan', 'chidori', 'rasengan', 'akatsuki', 'uchiha', 'tsunade', 'hokage', 'naruto', 'konoha', 'kage bunshin', 'jiraiya'];

describe('v64: planilha de diálogos (docs/lore/dialogos.csv)', () => {
  it('é igual ao jogo (gere de novo com npx tsx scripts/gerar-dialogos.ts) e cada ID é único', async () => {
    const csv = await buildCsv();
    assert.equal(read('docs/lore/dialogos.csv'), csv, 'a planilha está desatualizada');
    const ids = csv.trim().split('\n').slice(1).map((l: string) => l.split(',')[0]);
    assert.equal(new Set(ids).size, ids.length, 'ID repetido');
    assert.ok(ids.length >= 60);
  });

  it('falas curtas: professores, lojistas e dicas até 160 caracteres (3 linhas na caixa)', () => {
    const falas = [...todasAsFalas(), ...Object.values(lore.SHOP_BARKS as Record<string, { id: string; text: string }[]>).flat(), ...lore.HINTS];
    for (const f of falas) assert.ok(f.text.length <= 160, `${f.id}: ${f.text.length} caracteres`);
  });

  it('nenhum texto novo usa nome da série', () => {
    const tudo = [...todasAsFalas().map((f) => f.text), ...lore.FRAGMENTS.map((f: any) => `${f.title} ${f.por} ${f.text}`),
      ...Object.values(lore.SHOP_BARKS as Record<string, { text: string }[]>).flat().map((b) => b.text), ...lore.HINTS.map((h: any) => h.text),
      ...CHRONICLE.map((c) => c.text), read('docs/lore/biblia-do-mundo.md')].join(' ').toLowerCase();
    for (const p of PROIBIDOS) assert.ok(!tudo.includes(p), p);
  });
});

describe('v64: fragmentos da Crônica', () => {
  it('17 fragmentos, em chão livre, no mapa e com o nome do lugar iguais ao servidor', () => {
    assert.equal(lore.FRAGMENTS.length, 17);
    assert.equal(new Set(lore.FRAGMENTS.map((f: any) => f.id)).size, 17);
    for (const f of lore.FRAGMENTS) {
      const m = REALTIME.maps[f.map as 'map_1'];
      assert.ok(m, `${f.id}: mapa ${f.map}`);
      assert.equal(f.lugar, m.name, f.id);
      assert.ok(f.x > 1 && f.y > 1 && f.x < m.width - 1 && f.y < m.height - 1, `${f.id} fora do mapa`);
      assert.ok(!blocked(f.x, f.y, m.walls), `${f.id} dentro de parede`);
      assert.ok(f.text.length > 80 && f.text.length <= 380, `${f.id}: ${f.text.length}`);
      assert.ok(f.title && f.por, f.id);
      // não abre sozinho ao nascer: longe dos pontos onde se nasce (o jogador vê o brilho e vai até ele)
      for (const p of [REALTIME.spawn, REALTIME.tutorialEnd]) if (f.map === REALTIME.startMap) assert.ok(Math.hypot(f.x - p.x, f.y - p.y) > 4, `${f.id} em cima de onde se nasce`);
    }
  });

  it('cliente: brilha no chão, acha ao chegar perto (só depois da Academia) e guarda no Manual; os arquivos são servidos', () => {
    const js = read('public/game.js');
    assert.match(js, /function drawFragments\(/);
    assert.match(js, /manualUI\.discover\(f\.id\)/);
    assert.match(js, /const fragmentsOn = \(\) => \(state\.ninja\.tutorialStep \?\? 4\) >= 4;/);
    const manual = read('public/manual.js');
    assert.match(manual, /function openCodex\(/);
    assert.match(manual, /function openControls\(/);
    assert.match(manual, /localStorage\.setItem\(CODEX_KEY/);
    const served = loadPublicFiles().map((f) => f.route);
    for (const f of ['/lore.js', '/dicas.js']) assert.ok(served.includes(f), f);
  });
});

describe('v64: tutorial (método em 3 etapas) e falas dos professores', () => {
  it('cada fala de etapa apresenta, diz que é seguro e aponta a porta; depois da Academia, rodízio com a voz do professor', () => {
    assert.match(TUTOR_STEP.tutor_dummies!.now.text, /não revida.*porta abre/);
    assert.match(TUTOR_STEP.tutor_meditation!.now.text, /nada te fere.*porta abre/);
    assert.match(TUTOR_STEP.tutor_jutsu!.now.text, /^Olha onde vai pousar!/);     // o bordão do Kenji (Arco 1)
    assert.equal(tutorFala('tutor_jutsu', 2).id, 'TUT_KENJI_01');
    assert.equal(tutorFala('tutor_jutsu', 3).id, 'TUT_KENJI_02');
    const turns = [0, 1, 2, 3].map((t) => tutorFala('tutor_jutsu', 4, t).id);
    assert.deepEqual(turns, [...TUTOR_BARKS.tutor_jutsu!.map((b) => b.id), TUTOR_BARKS.tutor_jutsu![0]!.id]);
    assert.ok(TUTOR_BARKS.tutor_jutsu!.some((b) => /tronco no seu lugar/.test(b.text)), 'a pista do prólogo do Arco 1');
  });

  it('no jogo: falar com o professor depois da Academia troca a fala a cada conversa', () => {
    const w = setupWorld();
    const a = w.connect('kaito');
    const world = w.world as any;
    const npc = REALTIME.npcs.find((n) => n.id === 'tutor_weapons')!;
    placeIn(w.world, a.id, 'academy_interior', npc.x - 1, npc.y);
    const said = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      w.clock.advance(5000);
      a.send({ type: 'talk', npcId: npc.id });
      said.add(a.conn.last('npc_say')?.text);
    }
    assert.equal(said.size, 3, [...said].join(' | '));
    assert.ok([...said].every((t) => TUTOR_BARKS.tutor_weapons!.some((b) => b.text === t)));
    void world;
  });

  it('cartão do tutorial: o que fazer, que é seguro e o que abre a porta; dicas na hora e folha de controles', () => {
    const js = read('public/game.js');
    assert.match(js, /Eles não revidam: erre à vontade\. No 3º, a porta abre\./);
    assert.match(js, /function hintsFor\(msg\)/);
    const triggers = js + read('public/manual.js');   // (a dica do fragmento sai quando ele é guardado, no Manual)
    for (const h of lore.HINTS) assert.ok(triggers.includes(`'${h.id}'`), `${h.id} sem gatilho no cliente`);
    const dicas = read('public/dicas.js');
    assert.match(dicas, /Desligar dicas/);
    assert.match(dicas, /localStorage/);
    assert.ok(lore.CONTROLS.length >= 10 && lore.CONTROLS.every((r: string[]) => r.length === 3));
    assert.equal(lore.personalize('Oi, {garoto} e {querido}', 'f'), 'Oi, garota e querida');
    assert.equal(lore.personalize('Oi, {garoto}', 'm'), 'Oi, garoto');
  });

  it('a Crônica (capítulo II) combina com o Arco 1, com os nomes escolhidos (v65): Primeira Guerra, Rio das Raízes, Noite das Cinco Pedras', () => {
    assert.match(CHRONICLE[1]!.text, /Primeira Guerra.*envenenou o Rio das Raízes/);
    assert.match(CHRONICLE[1]!.text, /cinquenta anos, na Noite das Cinco Pedras/);
    assert.match(CHRONICLE[1]!.text, /Pedras da Vigília/);
    assert.match(CHRONICLE[1]!.text, /Lodo Ancestral/);
  });
});
