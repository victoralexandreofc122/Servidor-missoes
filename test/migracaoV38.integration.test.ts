import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { JUTSUS } from '../src/realtime/jutsus.js';
import { CLAN_NOVOS_CODES } from '../src/realtime/jutsusClasses.js';
import { RELICS } from '../src/realtime/loot.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { createTestDatabase } from './support/testDb.js';

/* Migração v38 (os 4 clãs novos e os nomes das relíquias) no banco. (O test/v38.integration.test.ts é a versão v38 do JOGO: Pergaminho do Mestre.) */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V38 = readFileSync(new URL('../db/schema_v38_clas_novos.sql', import.meta.url), 'utf8');
const V37 = readFileSync(new URL('../db/schema_v37_mundo_loot.sql', import.meta.url), 'utf8');

describe('migração v38 no banco: clãs novos e relíquias', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('os 16 jutsus dos clãs novos estão no catálogo (iguais ao código); rodar de novo não muda nada', async () => {
    const read = async () => (await t.pool.query(`SELECT code, name, clan_code, tier FROM game.jutsus WHERE code = ANY($1) ORDER BY code`, [[...CLAN_NOVOS_CODES]])).rows;
    const want = CLAN_NOVOS_CODES.map((c) => JUTSUS.find((j) => j.code === c)!).map((j) => ({ code: j.code, name: j.name, clan_code: j.clan, tier: j.tier }))
      .sort((a, b) => (a.code < b.code ? -1 : 1));
    assert.deepEqual(await read(), want);
    assert.equal((await t.pool.query('SELECT count(*)::int AS n FROM game.jutsus')).rows[0].n, JUTSUS.length);
    await t.pool.query(V38);
    await t.pool.query(V38);
    assert.deepEqual(await read(), want);
  });

  it('marca e desperta os clãs novos (as regras do banco aceitam); um clã inventado não passa', async () => {
    const store = makeNinjaStore(t.db);
    const find = makeFindPlayer(t.db);
    for (const clan of ['bastiao', 'aspide', 'garra', 'zefiro']) {
      const id = await t.createPlayer(`ninja_${clan}`);
      await store.setClanMark!(id, clan);
      await store.chooseClan!(id, clan);
      const p = await find(id);
      assert.equal(p?.clan, clan);
      assert.equal(p?.clanMark, clan);
    }
    const id = await t.createPlayer('ninja_falso');
    await assert.rejects(t.pool.query(`UPDATE game.players SET clan_mark = 'dragao' WHERE id = $1`, [id]));
  });

  it('kit com os jutsus dos clãs novos se salva; as relíquias têm os nomes da opção A (mesmo depois de rodar a v37 de novo)', async () => {
    assert.equal((await t.pool.query(`SELECT game.valid_kit($1::text[]) AS ok`, [['bastiao_muralha', 'aspide_ninho', 'garra_rei', 'zefiro_mil']])).rows[0].ok, true);
    await t.pool.query(V37);
    await t.pool.query(V38);
    const relics = (await t.pool.query(`SELECT code, name FROM game.items WHERE kind = 'relic'`)).rows;
    for (const r of RELICS) assert.equal(relics.find((x) => x.code === r.code)?.name, r.name, r.code);
  });
});
