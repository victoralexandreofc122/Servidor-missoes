import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeChampionStore } from '../src/realtime/championStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { makeTournamentLike } from './support/championFlow.js';
import { createTestDatabase } from './support/testDb.js';

/* Migração v33 (db/schema_v33_pvp_torneio.sql): Torneio dos Heróis e dos Vilões no banco. */

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V33 = readFileSync(new URL('../db/schema_v33_pvp_torneio.sql', import.meta.url), 'utf8');
type Db = Awaited<ReturnType<typeof createTestDatabase>>;
const one = async (t: Db, sql: string, params: unknown[] = []) => (await t.pool.query(sql, params)).rows[0];

describe('v33 no banco: Torneio dos Heróis e dos Vilões', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); await t.pool.query(V33); });   // rodar de novo não quebra
  after(async () => { await t?.drop(); });

  async function ninja(name: string, rank: string, village: string | null) {
    const id = await t.createPlayer(name, rank);
    await t.pool.query('UPDATE game.players SET village = $2, renegade_at = CASE WHEN $2::text IS NULL THEN now() END WHERE id = $1', [id, village]);
    return id;
  }

  it('quem pode entrar: Jounin da vila (menos o Kage) nos Heróis; renegado nos Vilões; Chunin em nenhum', async () => {
    const store = makeChampionStore(t.db);
    const jounin = await ninja('heroi_a', 'JONIN', 'vila_1');
    const kage = await ninja('o_kage', 'JONIN', 'vila_3');
    await t.pool.query(`INSERT INTO game.village_kages (village, player_id, term_ends_at) VALUES ('vila_3', $1, now() + interval '28 days') ON CONFLICT DO NOTHING`, [kage]);
    const chunin = await ninja('chunin_a', 'CHUNIN', 'vila_1');
    const renegado = await ninja('vilao_a', 'CHUNIN', null);
    assert.equal(await store.slot(jounin, 'herois'), 'vila_1');
    assert.equal(await store.slot(kage, 'herois'), null, 'o Kage não entra');
    assert.equal(await store.slot(chunin, 'herois'), null);
    assert.equal(await store.slot(renegado, 'viloes'), '');
    assert.equal(await store.slot(jounin, 'viloes'), null);
    assert.deepEqual(await store.join(chunin, 'herois', new Date()), { ok: false, code: 'not_eligible' });
  });

  it('inscrição, chave de 3 (folga para o melhor), resultados e o título "Herói da <vila>" para o campeão', async () => {
    const store = makeChampionStore(t.db);
    const era = (await one(t, 'SELECT id FROM game.seasons WHERE closed_at IS NULL')).id;
    const ids = [await ninja('heroi1', 'JONIN', 'vila_4'), await ninja('heroi2', 'JONIN', 'vila_4'), await ninja('heroi3', 'ANBU', 'vila_4')];
    await makeProgression(t.db).grantXp(ids[2]!, levelStart(50));   // o melhor cabeça de chave
    for (const id of ids) assert.deepEqual(await store.join(id, 'herois', new Date()), { ok: true, village: 'vila_4' });
    const flow = makeTournamentLike(store, era);
    const entrants = await store.entries(era, 'herois', 'vila_4');
    assert.equal(entrants[0], ids[2], 'nível maior = cabeça de chave 1');
    await flow.bracket('herois', 'vila_4', entrants);
    assert.deepEqual(await store.join(ids[0]!, 'herois', new Date()), { ok: false, code: 'closed' }, 'inscrições fecharam');
    let pend = (await store.pending(era)).filter((m) => m.village === 'vila_4');
    assert.equal(pend.length, 1, 'o 1º passa direto (folga); os outros dois jogam');
    assert.equal(await store.result('herois', pend[0]!.a, pend[0]!.b, 2, 1, 'rounds', new Date()), null, 'a chave continua');
    pend = (await store.pending(era)).filter((m) => m.village === 'vila_4');
    assert.equal(pend.length, 1, 'a final');
    assert.equal(pend[0]!.round, pend[0]!.rounds);
    const champ = await store.result('herois', ids[2]!, pend[0]!.a === ids[2] ? pend[0]!.b : pend[0]!.a, 2, 0, 'rounds', new Date());
    assert.equal(champ, ids[2]);
    const title = await one(t, `SELECT ti.name FROM game.player_titles pt JOIN game.titles ti ON ti.id = pt.title_id WHERE pt.player_id = $1 AND ti.code LIKE 'HEROI_%'`, [ids[2]]);
    assert.match(title.name, /^Herói da /);
    assert.deepEqual((await store.champions(era)).find((c) => c.village === 'vila_4')?.username, 'heroi3');
    assert.equal(await store.result('herois', ids[0]!, ids[1]!, 2, 0, 'rounds', new Date()), undefined, 'sem jogo pendente: nada gravado');
  });

  it('Vilões: inscrito sozinho vira campeão direto; título "Vilão Mais Forte da Era"', async () => {
    const store = makeChampionStore(t.db);
    const era = (await one(t, 'SELECT id FROM game.seasons WHERE closed_at IS NULL')).id;
    const v = await ninja('so_um_vilao', 'GENIN', null);
    await store.join(v, 'viloes', new Date());
    await store.saveBracket(era, 'viloes', '', [], new Date());
    await store.crown(era, 'viloes', '', v, new Date());
    const title = await one(t, `SELECT ti.name FROM game.player_titles pt JOIN game.titles ti ON ti.id = pt.title_id WHERE pt.player_id = $1`, [v]);
    assert.equal(title.name, 'Vilão Mais Forte da Era');
  });
});

describe('v33 no banco: rankeado 3v3', { skip: noDatabase }, () => {
  let t: Db;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('Elo K=24 com a média do time: cada vencedor ganha o mesmo, cada perdedor perde o mesmo; 30/10 ryō; admin no meio não conta', async () => {
    const ids = [];
    for (const n of ['t3a1', 't3a2', 't3a3', 't3b1', 't3b2', 't3b3']) ids.push(await t.createPlayer(n));
    const w = ids.slice(0, 3), l = ids.slice(3);
    const r = await one(t, 'SELECT * FROM game.ranked3_result($1::uuid[], $2::uuid[], 2, 1, $3, 60000)', [w, l, 'rounds']);
    assert.equal(r.counted, true);
    assert.ok(r.winner_delta > 0 && r.loser_delta < 0);
    const rows = (await t.pool.query('SELECT player_id, mmr, wins, losses FROM game.ranked3_ratings')).rows;
    for (const id of w) assert.equal(rows.find((x) => x.player_id === id).mmr, 1000 + r.winner_delta);
    for (const id of l) assert.equal(rows.find((x) => x.player_id === id).mmr, 1000 + r.loser_delta);
    assert.equal((await one(t, 'SELECT ryo FROM game.players WHERE id = $1', [w[0]])).ryo, '30');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [w[0]]);
    const r2 = await one(t, 'SELECT * FROM game.ranked3_result($1::uuid[], $2::uuid[], 2, 0, $3, 1000)', [w, l, 'rounds']);
    assert.equal(r2.counted, false);
    await assert.rejects(t.pool.query('SELECT * FROM game.ranked3_result($1::uuid[], $2::uuid[], 2, 0, $3, 1000)', [w, w, 'rounds']));
  });
});
