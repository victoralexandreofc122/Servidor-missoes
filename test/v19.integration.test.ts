import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { createTestDatabase } from './support/testDb.js';

/*
 * v19 no PostgreSQL de verdade: o /admin pvp lê as lutas da Zona de Conflito (game.pvp_matches) por classe Primária.
 * Só leitura: sem migração nova.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('v19 no banco: PvP por classe (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('soma vitórias e derrotas por classe Primária nos últimos N dias; sem classe vira "sem_classe"', async () => {
    const fogo = await t.createPlayer('fogo19');
    const agua = await t.createPlayer('agua19');
    const novato = await t.createPlayer('novato19');
    await t.pool.query(`INSERT INTO game.player_classes (player_id, primary_class) VALUES ($1, 'fire'), ($2, 'water')`, [fogo, agua]);
    const match = (w: string, l: string, daysAgo = 0) =>
      t.pool.query(`INSERT INTO game.pvp_matches (winner_id, loser_id, counted, at) VALUES ($1, $2, false, now() - make_interval(days => $3))`, [w, l, daysAgo]);
    await match(fogo, agua);
    await match(fogo, agua);
    await match(agua, fogo);
    await match(fogo, novato);
    await match(agua, fogo, 10);                                   // fora da janela de 7 dias
    const store = makeAdminStore(t.db);
    assert.deepEqual(await store.pvpByClass!(7), [
      { code: 'fire', wins: 3, losses: 1 },
      { code: 'water', wins: 1, losses: 2 },
      { code: 'sem_classe', wins: 0, losses: 1 },
    ]);
    assert.deepEqual((await store.pvpByClass!(30)).find((r) => r.code === 'water'), { code: 'water', wins: 2, losses: 2 });
  });
});
