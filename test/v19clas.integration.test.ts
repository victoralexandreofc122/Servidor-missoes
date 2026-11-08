import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { createTestDatabase } from './support/testDb.js';

/* Migração v19 (db/schema_v19_clas.sql): a linhagem do ninja e os jutsus do Clã Rubro. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V19 = readFileSync(new URL('../db/schema_v19_clas.sql', import.meta.url), 'utf8');

describe('v19 no banco: os clãs', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('roda de novo sem erro; os jutsus do Clã Rubro sem classe (4 da v19 + 2 do nível 60 da v20); a Extração não os vê', async () => {
    await t.pool.query(V19);
    await t.pool.query(V19);
    const rows = (await t.pool.query(`SELECT code, class_code, clan_code, tier FROM game.jutsus WHERE clan_code = 'rubro' ORDER BY tier, code`)).rows;
    assert.deepEqual(rows.map((r) => [r.code, r.class_code, r.tier]), [['rubro_olho', null, 1], ['rubro_transe', null, 2], ['rubro_chamas', null, 3],
      ['rubro_completo', null, 4], ['rubro_guardiao', null, 4], ['rubro_lua', null, 4]]);
    await assert.rejects(t.pool.query(`INSERT INTO game.jutsus (code, name, class_code, clan_code, tier) VALUES ('x_sem_nada', 'X', NULL, NULL, 2)`));
  });

  it('a linhagem é gravada uma vez só, volta ao entrar, e os jutsus do clã ficam aprendidos', async () => {
    const id = await t.createPlayer('herdeiro');
    const store = makeNinjaStore(t.db);
    await store.chooseClan!(id, 'rubro');
    await store.chooseClan!(id, 'umbra');                              // não troca
    await store.learnJutsus!(id, ['rubro_olho', 'rubro_olho']);
    const p = await makeFindPlayer(t.db)(id);
    assert.equal(p!.clan, 'rubro');
    assert.ok('rubro_olho' in p!.jutsus!);
    await assert.rejects(t.pool.query(`UPDATE game.players SET clan = 'lua' WHERE id = $1`, [id]));
  });
});
