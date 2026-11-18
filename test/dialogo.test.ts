import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/* v71 (pedido do Victor, 17/11): a conversa com o NPC numa caixa embaixo, no meio da tela, no lugar do balão. */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('public/game.js');
const css = read('public/hud.css');
const html = read('public/index.html');
const fn = (name: string) => { const i = game.indexOf(`function ${name}(`); return game.slice(i, game.indexOf('\n}\n', i)); };

describe('v71: a caixa de conversa', () => {
  it('existe no HUD: nome, texto, página, ▼ e o ✕ de fechar; o retrato é um canvas ao lado', () => {
    assert.match(html, /<section id="dialog" class="dialog" hidden role="dialog"/);
    for (const id of ['dialog-face', 'dialog-name', 'dialog-text', 'dialog-page', 'dialog-next', 'dialog-close']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /id="dialog-close"[^>]*aria-label="Fechar a conversa"/);
  });
  it('a fala do NPC abre a caixa (não mais o balão) e continua no chat em uma linha', () => {
    const say = game.slice(game.indexOf("case 'npc_say': {"), game.indexOf("case 'mission_reward'"));
    assert.match(say, /openDialog\(npc, msg\.text\)/);
    assert.doesNotMatch(say, /npc\.bubble = /);
    assert.match(say, /addChatLine\(npc \? npc\.name : 'NPC', msg\.text\.replace/);
  });
  it('páginas de até 3 linhas; uma linha em branco no texto força página nova', () => {
    assert.match(game, /const DIALOG_LINES = 3;/);
    const p = fn('paginateDialog');
    assert.match(p, /split\(\/\\n\\s\*\\n\/\)/);
    assert.match(p, /measureText/);
  });
  it('o toque termina a página que está aparecendo, depois passa de página e, na última, fecha', () => {
    const a = fn('advanceDialog');
    assert.ok(a.indexOf('dialog.shown < page.length') < a.indexOf('dialog.i++'));
    assert.ok(a.indexOf('dialog.i++') < a.indexOf('closeDialog()'));
  });
  it('se afastar do NPC, morrer ou mudar de mapa fecha a conversa', () => {
    const near = fn('updateNpcProximity');
    assert.match(near, /if \(dialog\.npc\)/);
    assert.match(near, /n\.range \+ 1\.5\) closeDialog\(\)/);
  });
  it('no teclado: Espaço, Enter e E passam a página; Esc fecha; andar continua valendo', () => {
    const k = game.slice(game.indexOf("window.addEventListener('keydown'"), game.indexOf("window.addEventListener('keyup'"));
    assert.match(k, /if \(dialog\.npc && \(e\.key === ' ' \|\| e\.key === 'Enter' \|\| e\.key === 'e'/);
    assert.ok(k.indexOf('dialog.npc &&') < k.indexOf('KEYMAP[e.code]'), 'tratado antes do combate');
  });
  it('o retrato é uma opção no ⚙️ (ligado por padrão, para testar com e sem)', () => {
    assert.match(html, /<input id="pref-dlg-portrait" type="checkbox" checked>/);
    assert.match(game, /dlgPortrait: true \};/);
    assert.match(game, /\['pref-dlg-portrait', 'dlgPortrait'\]/);
    assert.match(fn('openDialog'), /drawBust\(dlgEl\.face, npcLookOf\(npc\)\)/);
  });
  it('guia de UI: o ✕ tem 44 px, o texto 15 a 16 px e nada abaixo de 12 px; embaixo e no meio, depois do joystick no celular', () => {
    const block = css.slice(css.indexOf('/*\n * v71'));
    assert.match(block, /\.dialog-close \{[^}]*width: 44px; height: 44px;/);
    assert.match(block, /\.dialog-text \{[^}]*font-size: 16px;/);
    for (const m of block.matchAll(/font-size: (\d+)px/g)) assert.ok(Number(m[1]) >= 12, `fonte ${m[1]}px`);
    assert.match(block, /left: 50%; transform: translateX\(-50%\);/);
    assert.match(block, /@media \(pointer: coarse\), \(max-height: 430px\) \{\n  \.dialog \{\n    left: calc\(var\(--safe-left, 0px\) \+ 168px\)/);
  });
  it('enquanto conversa, os botões de luta ficam apagados e sem toque (vence a transparência do ⚙️) e o chat some', () => {
    assert.match(css, /body\.dialog-open \.combat \{ opacity: 0\.18 !important; pointer-events: none; \}/);
    assert.match(css, /body\.dialog-open \.combat \.cbtn \{ pointer-events: none; \}/);
    assert.match(css, /body\.dialog-open \.chat-box \{ visibility: hidden; \}/);
  });
});
