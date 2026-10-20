import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeProgression } from '../src/realtime/progression.js';
import { createTestDatabase } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('XP do combate no banco (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('soma XP em game.players.total_xp e promove Academia -> Genin aos 100 (com histórico de rank)', async () => {
    const id = await t.createPlayer('kaito');
    const prog = makeProgression(t.db, REALTIME.combat.promotion);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await prog.grantXp(id, 20));
    assert.deepEqual(results.map((r) => [r!.totalXp, r!.rank.code, r!.promoted]), [
      [20, 'ACADEMY', false], [40, 'ACADEMY', false], [60, 'ACADEMY', false], [80, 'ACADEMY', false],
      [100, 'GENIN', true], [120, 'GENIN', false],
    ]);
    const history = await t.pool.query(
      `SELECT r.code FROM game.player_rank_changes c JOIN game.ranks r ON r.id = c.rank_id WHERE c.player_id = $1 ORDER BY c.changed_at, c.id`, [id]);
    assert.deepEqual(history.rows.map((r) => r.code), ['ACADEMY', 'GENIN'], 'trigger do schema registrou a promoção');
    const found = await makeFindPlayer(t.db)(id);
    assert.deepEqual({ ...found, attributes: undefined, kits: undefined }, {
      id, username: 'kaito', xp: 120, rank: { code: 'GENIN', name: 'Genin' }, canBeSensei: false, level: 2, statPoints: 1,
      attributes: undefined, kits: undefined,
    });
    assert.deepEqual(found!.kits, { A: ['fire', 'water', 'taijutsu', 'heal'], B: ['illusion', 'shadow', 'stone', 'heal'] });
    assert.equal(results[4]!.levelsGained, 1, 'os 100 XP também subiram o nível (trigger da v5)');
  });

  it('10 mortes ao mesmo tempo: nenhum XP perdido e UM aviso de promoção', async () => {
    const id = await t.createPlayer('mei');
    const prog = makeProgression(t.db, REALTIME.combat.promotion);
    const results = await Promise.all(Array.from({ length: 10 }, () => prog.grantXp(id, 20)));
    assert.equal(results.filter((r) => r!.promoted).length, 1);
    const row = await t.pool.query('SELECT total_xp FROM game.players WHERE id = $1', [id]);
    assert.equal(row.rows[0].total_xp, '200');
  });

  it('Chunin não é rebaixado nem promovido pelo combate; jogador inexistente: undefined', async () => {
    const id = await t.createPlayer('sensei', 'CHUNIN');
    const prog = makeProgression(t.db, REALTIME.combat.promotion);
    assert.deepEqual(await prog.grantXp(id, 500), {
      totalXp: 500, rank: { code: 'CHUNIN', name: 'Chunin' }, promoted: false, level: 3, statPoints: 2, levelsGained: 2,
    });
    assert.equal(await prog.grantXp('00000000-0000-7000-8000-000000000000', 20), undefined);
  });
});
