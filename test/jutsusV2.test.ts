import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FORM_OF_MECHANIC, JUTSUS, buildSkills, skillConfig } from '../src/realtime/jutsus.js';

describe('Jutsus v2, entrega 0: base nova sem mudar números', () => {
  it('os números dos jutsus de antes da v2 não mudam, menos os que viraram jutsu da adaptação (Fogo na entrega 2, as outras classes na 5)', () => {
    const before = JSON.parse(readFileSync(new URL('./fixtures/skills-antes-v2.json', import.meta.url), 'utf8'));
    const now = JSON.parse(JSON.stringify(buildSkills()));
    const changed = new Set<string>(JUTSUS.filter((j) => j.numbers).map((j) => j.code));
    for (const code of Object.keys(before)) {
      if (changed.has(code)) assert.notDeepEqual(now[code], before[code], code);
      else if (code !== 'lightning') assert.deepEqual(now[code], before[code], code);
    }
    // os tier 1 de cada classe (os jutsus de sempre) ficam iguais
    for (const c of ['fire', 'water', 'stone', 'heal', 'weapons', 'illusion', 'taijutsu', 'shadow']) assert.deepEqual(now[c], before[c], c);
    assert.deepEqual(now.lightning, { ...before.lightning, stunMs: 600 }, 'v30: a Faísca atordoa 0,6 s (era 0,4)');
  });

  it('todo jutsu tem uma forma; os sem números próprios seguem a da mecânica', () => {
    for (const j of JUTSUS) if (!j.numbers) assert.equal(j.form, FORM_OF_MECHANIC[j.mechanic], j.code);
  });

  it('um jutsu com números próprios usa os números dele (e não o tier 1 mais forte)', () => {
    const fire4 = JUTSUS.find((j) => j.code === 'fire_4')!;
    const own = skillConfig({ ...fire4, numbers: { damage: 30, radius: 1.5, cooldownMs: 9000 } });
    assert.deepEqual([own.damage, own.radius, own.cooldownMs, own.mechanic], [30, 1.5, 9000, 'fire']);
  });
});
