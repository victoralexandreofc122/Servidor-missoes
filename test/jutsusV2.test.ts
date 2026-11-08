import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FORM_OF_MECHANIC, JUTSUS, buildSkills, skillConfig } from '../src/realtime/jutsus.js';

describe('Jutsus v2, entrega 0: base nova sem mudar números', () => {
  it('os números de todos os jutsus são os mesmos de antes da v2 (menos os tiers 2 a 4 do Fogo, de propósito, na entrega 2)', () => {
    const before = JSON.parse(readFileSync(new URL('./fixtures/skills-antes-v2.json', import.meta.url), 'utf8'));
    const now = JSON.parse(JSON.stringify(buildSkills()));
    for (const code of Object.keys(before)) {
      if (['fire_2', 'fire_3', 'fire_4'].includes(code)) assert.notDeepEqual(now[code], before[code], code);
      else assert.deepEqual(now[code], before[code], code);
    }
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
