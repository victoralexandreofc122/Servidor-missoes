import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  AppearanceSchema, CLOTH_BASE, DEFAULT_APPEARANCE, HAIR_BASE, SKIN_BASE, SKIN_TONES, fromLegacy, nearestName, normalizeAppearance,
} from '../src/realtime/appearance.js';
import { describeBootError } from '../src/bootErrors.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { MISSING_V9, bootCheckV9, makeProfile, type Profile } from '../src/realtime/profile.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';
import { setupWorld } from './support/world.js';

const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12 } } };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const OLD = { skin: '#8d5524', hair: '#e8c547', shirt: '#ff7700', pants: '#1f2a44', cape: '#2e8b57' };
const LOOK = {
  v: 2, gender: 'f', skin: 'canela', hairStyle: 'longo_lateral', hairColor: 'preto', eyeStyle: 'cilios', eyeColor: 'verde',
  outfit: 'vila', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_4',
} as const;

describe('v9: visual em sprites (nomes de paleta)', () => {
  it('o visual padrão é válido e usa só nomes da paleta', () => {
    assert.equal(AppearanceSchema.safeParse(DEFAULT_APPEARANCE).success, true);
    assert.equal(AppearanceSchema.safeParse(LOOK).success, true);
  });

  it('pele: 10 tons reais, do mais escuro ao mais claro (a luminância só sobe)', () => {
    assert.equal(SKIN_TONES.length, 10);
    const lum = SKIN_TONES.map((n) => {
      const v = parseInt(SKIN_BASE[n].slice(1), 16);
      return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
    });
    for (let i = 1; i < lum.length; i++) assert.ok(lum[i]! > lum[i - 1]!, `${SKIN_TONES[i]} mais claro que ${SKIN_TONES[i - 1]}`);
  });

  it('visual antigo (5 cores) vira o novo com a cor da paleta mais parecida; a capa some', () => {
    assert.equal(nearestName(SKIN_BASE, '#fdddb8'), 'claro');
    assert.equal(nearestName(HAIR_BASE, '#111111'), 'preto');
    assert.equal(nearestName(CLOTH_BASE, '#2f5d8a'), 'azul_marinho');
    const v = fromLegacy(OLD);
    assert.equal(AppearanceSchema.safeParse(v).success, true);
    assert.deepEqual(
      { skin: v.skin, hairColor: v.hairColor, shirtColor: v.shirtColor, pantsColor: v.pantsColor },
      { skin: 'castanho', hairColor: 'loiro', shirtColor: 'laranja', pantsColor: 'preto' },   // #1f2a44: marinho quase preto
    );
    assert.equal('cape' in v, false);
    assert.deepEqual(normalizeAppearance(LOOK), LOOK, 'o novo passa direto');
    assert.equal(normalizeAppearance({ skin: 'red' }), null);
    assert.equal(normalizeAppearance('texto'), null);
  });

  it('set_appearance com o formato antigo (cliente em cache): aceito e gravado já no formato novo', async () => {
    const saved: unknown[] = [];
    const profile: Profile = {
      async spendPoint() { return { ok: false, reason: 'NO_POINTS' }; },
      async saveLoadout() {},
      async saveAppearance(_id, a) { saved.push(a); },
      async resetAttributes() { return { ok: false, text: 'sem banco' }; },
    };
    const { connect } = setupWorld(config, undefined, undefined, profile);
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'set_appearance', appearance: { ...OLD, skin: '#8D5524' } });
    await flush();
    assert.deepEqual(saved, [fromLegacy(OLD)]);
    assert.deepEqual(b.conn.last('player_appearance').appearance, fromLegacy(OLD));
  });

  it('boot sem a migração v9: aponta o arquivo certo', () => {
    const msg = describeBootError({ code: MISSING_V9, message: 'x' });
    assert.match(msg, /db\/schema_v9_visual_sprites\.sql/);
    assert.match(msg, /Manual Deploy/);
  });
});

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('v9 no banco: visual novo e antigo (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('grava e lê o visual novo; o antigo continua aceito e volta convertido; formato errado: recusado', async () => {
    const id = await t.createPlayer('kaito');
    const find = makeFindPlayer(t.db);
    await makeProfile(t.db).saveAppearance(id, LOOK);
    assert.deepEqual((await find(id))!.appearance, LOOK);
    await t.pool.query('UPDATE game.players SET appearance = $2::jsonb WHERE id = $1', [id, JSON.stringify(OLD)]);
    assert.deepEqual((await find(id))!.appearance, fromLegacy(OLD), 'visual da v6 convertido ao entrar');
    for (const bad of [{ ...LOOK, skin: 'Red!' }, { ...LOOK, extra: 'x' }, { ...LOOK, bandana: 1 }, { ...LOOK, gender: 'x' },
      { ...OLD, cape: 'red' }, { ...OLD, extra: '#000000' }]) {
      await assert.rejects(
        t.pool.query('UPDATE game.players SET appearance = $2::jsonb WHERE id = $1', [id, JSON.stringify(bad)]),
        (e: { constraint?: string }) => e.constraint === 'ck_players_appearance',
        JSON.stringify(bad),
      );
    }
  });

  it('checagem de subida: passa com a v9 e pode rodar a migração de novo', async () => {
    await bootCheckV9(t.db);
    const { readFileSync } = await import('node:fs');
    await t.pool.query(readFileSync(new URL('../db/schema_v9_visual_sprites.sql', import.meta.url), 'utf8'));
    await bootCheckV9(t.db);
  });
});

describe('v9 ausente no banco: o servidor não sobe (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v9_visual_sprites.sql')); });
  after(async () => { await t?.drop(); });

  it('sem a v9 a checagem falha com MISSING_V9 (o Render mantém a versão anterior)', async () => {
    await assert.rejects(bootCheckV9(t.db), (e: { code?: string }) => e.code === MISSING_V9);
  });
});
