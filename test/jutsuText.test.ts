import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { JUTSUS } from '../src/realtime/jutsus.js';
import { JUTSU_TEXT, jutsuDescription, jutsuNumber } from '../src/realtime/jutsuText.js';
import { setupWorld } from './support/world.js';

/* v46: cada jutsu com o seu ícone (nenhum repetido) e a descrição com os números de verdade. */
const SK = REALTIME.combat.skills;
const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

describe('v46: ícone e descrição de cada jutsu', () => {
  it('os 100 jutsus têm ícone e descrição; nenhum ícone se repete', () => {
    assert.deepEqual(Object.keys(JUTSU_TEXT).sort(), JUTSUS.map((j) => j.code).sort());
    const seen = new Map<string, string>();
    for (const [code, t] of Object.entries(JUTSU_TEXT)) {
      assert.ok(t.icon.length > 0 && t.text.length > 20, code);
      assert.equal(seen.get(t.icon), undefined, `${code} e ${seen.get(t.icon)} com o mesmo ícone ${t.icon}`);
      seen.set(t.icon, code);
    }
    assert.equal(seen.size, 182);
  });

  it('toda {chave} da descrição existe no jutsu: o texto mostra o número que o servidor usa', () => {
    for (const j of JUTSUS) {
      const keys = [...JUTSU_TEXT[j.code]!.text.matchAll(/\{([a-zA-Z.]+)\}/g)].map((m) => m[1]!);
      for (const k of keys) assert.ok(jutsuNumber(SK[j.code], k) !== undefined, `${j.code}: {${k}} não existe`);
      const d = jutsuDescription(j.code, SK[j.code]);
      assert.doesNotMatch(d, /[{}?]|undefined|NaN/, `${j.code}: ${d}`);
      assert.ok(d.length <= 190, `${j.code}: descrição longa demais (${d.length})`);
    }
  });

  it('exemplos: segundos com vírgula, porcentagem e números da zona', () => {
    assert.equal(jutsuDescription('illusion_estaca', SK.illusion_estaca), 'Estaca em linha (6 casas): fere e prende o primeiro inimigo por 1,6 s.');
    assert.equal(jutsuDescription('wind_veu', SK.wind_veu), 'Escudo de vento: absorve dano até 12% da sua vida por 3 s.');
    assert.match(jutsuDescription('shadow_armadilha', SK.shadow_armadilha), /por 10 s: .* preso por 1,3 s\./);
    assert.match(jutsuDescription('stone_4', SK.stone_4), /perde 80% da força/);
    assert.match(jutsuDescription('shadow_recuo', SK.shadow_recuo), /Salta 3 casas para trás/);
  });

  it('o welcome manda o ícone e a descrição de cada jutsu; o cliente usa nos botões, na aba Kits e na Loja de Pergaminhos', () => {
    const w = setupWorld();
    const a = w.connect('kaito');
    const skills = a.conn.last('welcome').world.skills;
    for (const j of JUTSUS) {
      assert.equal(skills[j.code].icon, JUTSU_TEXT[j.code]!.icon, j.code);
      assert.equal(skills[j.code].desc, jutsuDescription(j.code, SK[j.code]), j.code);
    }
    const js = pub('game.js');
    assert.match(js, /icon: w\.icon \|\| ui\.icon/);
    assert.match(js, /function renderExtractCatalog\(/);
    assert.match(js, /function jutsuCard\(/);
    assert.match(pub('index.html'), /id="extract-catalog"/);
  });
});
