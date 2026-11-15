import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/*
 * v66: o guia de UI, UX e HUD (docs/ui/estrutura-ui-ux-hud.md) como regra do jogo. Medidas no navegador (alvo de toque,
 * contraste, cobertura) ficam no script scripts/auditar-hud.ts; aqui, as regras que dá para conferir no código.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('public/game.js');
const css = read('public/hud.css');
const html = read('public/index.html');

/** Tira uma função de cima a baixo do game.js (até a linha "}" sozinha) para testar sem o navegador. */
function fnSource(name: string): string {
  const start = game.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return game.slice(start, game.indexOf('\n}\n', start) + 2);
}

describe('v66: guia de UI, UX e HUD', () => {
  it('o documento canônico existe e cobre as partes do guia', () => {
    const doc = read('docs/ui/estrutura-ui-ux-hud.md');
    for (const parte of ['Taxonomia', 'Zona do polegar', 'Hierarquia', 'Matriz de estados', 'Cinco regras', 'Checklist', 'Auditoria']) {
      assert.match(doc, new RegExp(parte, 'i'), parte);
    }
  });

  it('respostas diretas: todo motivo de "não deu" do servidor tem texto no cliente, com a causa', () => {
    const proto = read('src/realtime/protocol.ts');
    const reasons = [...proto.match(/export type CastFailReason = ([^;]+);/)![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
    const table = game.slice(game.indexOf('const CAST_FAIL_TEXT = {'), game.indexOf('};', game.indexOf('const CAST_FAIL_TEXT = {')));
    for (const r of reasons) assert.match(table, new RegExp(`\\b${r}: '`), `CAST_FAIL_TEXT sem ${r}`);
    assert.doesNotMatch(game, /CAST_FAIL_TEXT\[msg\.reason\] \|\| 'Não deu'/, 'os avisos passam por castFailText');
  });

  it('respostas diretas: sem chakra diz o custo e o saldo; recarga diz quanto falta', () => {
    const src = `${fnSource('castFailText')}; return castFailText;`;
    const cooldowns = { fireball: { until: 3400, ms: 5000 } };
    const env = { skillPrice: () => ({ cost: 20 }), state: { me: { chakra: 12.7 } }, cooldowns, performance: { now: () => 1000 }, CAST_FAIL_TEXT: { COOLDOWN: 'Recarregando…' } };
    const castFailText = new Function(...Object.keys(env), src)(...Object.values(env));
    assert.equal(castFailText({ reason: 'NO_CHAKRA', skill: 'fireball' }), 'Chakra: custa 20, você tem 12');
    assert.equal(castFailText({ reason: 'COOLDOWN', skill: 'fireball' }), 'Recarregando: 2,4 s');
  });

  it('avisos (toasts) ficam entre 2 e 5 s, pelo tamanho do texto', () => {
    const readMs = new Function('TOAST_MIN_MS', 'TOAST_MAX_MS', `${fnSource('readMs')}; return readMs;`)(2000, 5000);
    assert.equal(readMs('Ok'), 2000);
    assert.equal(readMs('x'.repeat(500)), 5000);
    const mid = readMs('Fragmento da Crônica guardado! +30 ryō e +60 XP (1/17).');
    assert.ok(mid > 2000 && mid < 5000, String(mid));
    for (const m of game.matchAll(/showToast\([^;]*?, (\d+)\);/g)) {
      const ms = Number(m[1]);
      assert.ok(ms === 0 || (ms >= 2000 && ms <= 5000), `showToast com ${ms} ms`);
    }
  });

  it('alvos de toque de 44 px e texto do HUD de pelo menos 12 px', () => {
    const v66 = css.slice(css.indexOf('v66: o guia de UI'));
    assert.match(v66, /@media \(pointer: coarse\) \{[^}]*height: 44px/);
    assert.match(v66, /\.chat-min::after \{ content: ""; position: absolute; inset: -12px -9px; \}/);
    for (const [, size] of v66.matchAll(/font-size: (\d+)px/g)) assert.ok(Number(size) >= 12, `${size}px`);
  });

  it('HUD de combate: some o que não é da luta, nunca na zona segura nem na Academia, e dá para desligar', () => {
    assert.match(css, /body\.combat-hud \.tracker, body\.combat-hud \.mm-wrap \.pill \{ opacity: 0; pointer-events: none; \}/);
    const upd = fnSource('updateCombatHud');
    assert.match(upd, /!state\.inSafeZone/);
    assert.match(upd, /state\.mapId !== 'academy_interior'/);
    assert.match(html, /id="combat-hud-opt" type="checkbox" checked/);
    assert.match(game, /localStorage\.setItem\('nin\.combatHud'/);
    for (const hook of ["startCooldown('attack', msg.cd); markCombat();", 'if (mine && !heal) markCombat();']) assert.ok(game.includes(hook), hook);
  });

  it('previsibilidade: todos os botões do menu usam o mesmo ícone em círculo (SVG)', () => {
    const grid = html.slice(html.indexOf('<nav id="menu-grid"'), html.indexOf('</nav>', html.indexOf('<nav id="menu-grid"')));
    const buttons = [...grid.matchAll(/<button id="([a-z-]+)" class="menu-btn[^>]*>(.*?)<\/button>/g)];
    assert.ok(buttons.length >= 12);
    for (const [, id, inner] of buttons) assert.match(inner!, /<svg class="ico-svg"/, `${id} sem o ícone padrão`);
  });
});
