import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { VILLAGE_INFO } from '../src/realtime/villages.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/* Migração v22: Nuvem (vila_4) = Vento Cortante e Areia (vila_5) = Rocha Antiga; os códigos e quem é de onde não mudam. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V22 = readFileSync(new URL('../db/schema_v22_aldeias.sql', import.meta.url), 'utf8');
const names = async (t: Awaited<ReturnType<typeof createTestDatabase>>) =>
  (await t.pool.query('SELECT code, name FROM game.villages ORDER BY sort_order')).rows;

describe('v22 no banco: as aldeias Nuvem e Areia', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('o código diz Nuvem = Vento Cortante e Areia = Rocha Antiga (o documento canônico)', () => {
    assert.deepEqual([VILLAGE_INFO.vila_4.name, VILLAGE_INFO.vila_4.oldName], ['Vento Cortante', 'nuvem']);
    assert.deepEqual([VILLAGE_INFO.vila_5.name, VILLAGE_INFO.vila_5.oldName], ['Rocha Antiga', 'areia']);
  });

  it('de um banco que já rodou a v17 antiga (trocada): a v22 corrige, ninguém muda de vila e rodar de novo não muda nada', async () => {
    const id = await t.createPlayer('nuvem');
    await t.pool.query(`UPDATE game.players SET village = 'vila_4' WHERE id = $1`, [id]);
    // o que a v17 antiga deixou no Neon (Nuvem = Rocha Antiga, Areia = Vento Cortante); o nome é único, então passa por um temporário
    await t.pool.query(`UPDATE game.villages SET name = 'tmp' WHERE code = 'vila_4'`);
    await t.pool.query(`UPDATE game.villages SET name = 'Vento Cortante' WHERE code = 'vila_5'`);
    await t.pool.query(`UPDATE game.villages SET name = 'Rocha Antiga' WHERE code = 'vila_4'`);
    assert.deepEqual((await names(t)).map((r) => r.name), ['Chama Eterna', 'Maré Oculta', 'Rocha Antiga', 'Vento Cortante']);
    await t.pool.query(V22);
    await t.pool.query(V22);
    assert.deepEqual(await names(t), (['vila_1', 'vila_3', 'vila_4', 'vila_5'] as const).map((code) => ({ code, name: VILLAGE_INFO[code].name })));
    assert.equal((await t.pool.query('SELECT village FROM game.players WHERE id = $1', [id])).rows[0].village, 'vila_4');
  });

  it('banco sem a v11 (o caso do Neon do Victor): roda sem erro e não faz nada', async () => {
    const semV11 = await createTestDatabase(MIGRATIONS.filter((f) => !['schema_v11_endgame.sql', 'schema_v27_temporadas.sql', 'schema_v28_fase_final.sql', 'schema_v13_sem_pedra.sql', 'schema_v17_nomes.sql', 'schema_v22_aldeias.sql', 'schema_v33_pvp_torneio.sql'].includes(f)));
    try {
      assert.equal((await semV11.pool.query(`SELECT to_regclass('game.villages') AS t`)).rows[0].t, null);
      await semV11.pool.query(V22);
      assert.equal((await semV11.pool.query(`SELECT to_regproc('game._migrar_v22') AS f`)).rows[0].f, null, 'a função temporária foi apagada');
    } finally { await semV11.drop(); }
  });
});
