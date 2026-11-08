import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { VILLAGE_INFO } from '../src/realtime/villages.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v17 (Fase 1, nomes): as vilas viram as aldeias de Herança do Fogo; os códigos e quem é de onde não mudam. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V17 = readFileSync(new URL('../db/schema_v17_nomes.sql', import.meta.url), 'utf8');

describe('v17 no banco: os nomes das aldeias', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v17_nomes.sql')); });
  after(async () => { await t?.drop(); });

  it('troca os nomes (iguais aos do servidor), ninguém muda de vila e rodar de novo não muda nada', async () => {
    const id = await t.createPlayer('nevoeiro');
    await t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [id]);
    await t.pool.query(V17);
    await t.pool.query(V17);
    const rows = (await t.pool.query('SELECT code, name FROM game.villages ORDER BY sort_order')).rows;
    assert.deepEqual(rows, (['vila_1', 'vila_3', 'vila_4', 'vila_5'] as const).map((code) => ({ code, name: VILLAGE_INFO[code].name })));
    assert.equal((await t.pool.query('SELECT village FROM game.players WHERE id = $1', [id])).rows[0].village, 'vila_3');
  });
});
