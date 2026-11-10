import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { MANUAL_CHAPTERS, chaptersOpen, manualFrom } from '../src/realtime/manual.js';
import { FEEDBACK_CATEGORIES } from '../src/realtime/protocol.js';

const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const facts = { level: 1, items: {}, learnedClassJutsu: false, classes: { primary: null }, pvpSeen: false };

describe('v38: Pergaminho do Mestre', () => {
  it('regras de desbloqueio: boas-vindas sempre; classe 10; rito 11; pergaminho com o 1º pergaminho; PvP; secundária 40', () => {
    assert.deepEqual(chaptersOpen(facts), ['boas_vindas']);
    assert.deepEqual(chaptersOpen({ ...facts, level: 10 }), ['boas_vindas', 'classe']);
    assert.deepEqual(chaptersOpen({ ...facts, level: 11 }), ['boas_vindas', 'classe', 'rito']);
    assert.deepEqual(chaptersOpen({ ...facts, items: { scroll_liso: 1 } }), ['boas_vindas', 'pergaminho']);
    assert.deepEqual(chaptersOpen({ ...facts, pvpSeen: true }), ['boas_vindas', 'pvp']);
    assert.deepEqual(chaptersOpen({ ...facts, level: 40 }), ['boas_vindas', 'classe', 'rito', 'secundaria']);
    assert.deepEqual(manualFrom({ unlocked: ['boas_vindas', 'xyz'], read: ['pvp'] }).unlocked, new Set(['boas_vindas', 'pvp']), 'lido conta como aberto; código estranho some');
  });

  it('o cliente tem os mesmos capítulos do servidor, cada um com páginas, e os botões "Próxima", "Anterior" e "Fechar (já entendi)"', async () => {
    const js = pub('manual.js');
    const codes = [...js.matchAll(/code: '([a-z_]+)', title:/g)].map((m) => m[1]);
    assert.deepEqual(codes, [...MANUAL_CHAPTERS]);
    for (const label of ['Próxima página', 'Página anterior', 'Fechar (já entendi)', 'Teste Pré-Alpha', 'Enviar Feedback', 'Entendi']) assert.ok(js.includes(label), label);
    const cats = [...js.matchAll(/\['([a-z]+)', '[A-ZÀ-ú][a-zà-ú]+'\]/g)].map((m) => m[1]);
    assert.deepEqual(cats, [...FEEDBACK_CATEGORIES]);
    const html = pub('index.html');
    assert.match(html, /id="manual-toggle"/);
    assert.match(html, /id="feedback-toggle"/);
  });
});
