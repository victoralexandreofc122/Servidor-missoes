import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeProgression } from '../src/realtime/progression.js';
import { createTestDatabase } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('XP e ryō do combate no banco (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('soma XP e ryō em game.players; v7: o XP NÃO promove (Genin só pela Missão de Genin)', async () => {
    const id = await t.createPlayer('kaito');
    const prog = makeProgression(t.db);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await prog.grantXp(id, 20, 7));
    assert.deepEqual(results.map((r) => [r!.totalXp, r!.rank.code, r!.promoted, r!.ryo]), [
      [20, 'ACADEMY', false, 7], [40, 'ACADEMY', false, 14], [60, 'ACADEMY', false, 21], [80, 'ACADEMY', false, 28],
      [100, 'ACADEMY', false, 35], [120, 'ACADEMY', false, 42],
    ]);
    assert.equal(results[4]!.levelsGained, 1, 'os 100 XP subiram o nível (trigger)');
    const history = await t.pool.query(
      `SELECT r.code FROM game.player_rank_changes c JOIN game.ranks r ON r.id = c.rank_id WHERE c.player_id = $1 ORDER BY c.changed_at, c.id`, [id]);
    assert.deepEqual(history.rows.map((r) => r.code), ['ACADEMY'], 'nenhuma promoção pelo XP');
  });

  it('conta nova (v7): tutorial no passo 0, os 2 jutsus da Academia no kit, sem ryō e sem classe', async () => {
    const id = await t.createPlayer('novato');
    const found = await makeFindPlayer(t.db)(id);
    assert.deepEqual({
      tutorialStep: found!.tutorialStep, jutsus: found!.jutsus, kits: found!.kits, ryo: found!.ryo, items: found!.items,
      equipped: found!.equipped, classes: found!.classes, hokage: found!.hokageCandidate, weapons: found!.attributes!.weapons,
    }, {
      tutorialStep: 0, jutsus: { teleport: 0, substitution: 0 }, kits: { A: ['teleport', 'substitution'], B: [] }, ryo: 0, items: {},
      equipped: null, classes: { primary: null, secondary: null }, hokage: false, weapons: 0,
    });
  });

  it('10 mortes ao mesmo tempo: nenhum XP nem ryō perdido', async () => {
    const id = await t.createPlayer('mei');
    const prog = makeProgression(t.db);
    await Promise.all(Array.from({ length: 10 }, () => prog.grantXp(id, 20, 10)));
    const row = await t.pool.query('SELECT total_xp, ryo FROM game.players WHERE id = $1', [id]);
    assert.deepEqual(row.rows[0], { total_xp: '200', ryo: '100' });
  });

  it('Chunin não é rebaixado pelo combate; nível pela curva nova; jogador inexistente: undefined', async () => {
    const id = await t.createPlayer('sensei', 'CHUNIN');
    const prog = makeProgression(t.db);
    assert.deepEqual(await prog.grantXp(id, 500), {
      totalXp: 500, rank: { code: 'CHUNIN', name: 'Chunin' }, promoted: false, level: 3, statPoints: 2, levelsGained: 2, ryo: 0,
    });
    assert.equal(await prog.grantXp('00000000-0000-7000-8000-000000000000', 20), undefined);
  });
});
