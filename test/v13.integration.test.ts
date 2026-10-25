import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { createTestDatabase } from './support/testDb.js';

/*
 * v13 no PostgreSQL de verdade: a Vila da Pedra (vila_2) sai do jogo. O banco de teste já sobe sem ela (a v11 não a
 * cria mais); aqui ela volta com tudo que um banco antigo poderia ter (ninjas, Kage, eleição com votos, diplomacia,
 * evento, registro do Kage e denúncia) e a migração tem que limpar sem quebrar nenhuma chave.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

const V13 = readFileSync(new URL('../db/schema_v13_sem_pedra.sql', import.meta.url), 'utf8');

describe('v13 no banco: a Vila da Pedra sai', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const count = async (sql: string, p: unknown[] = []) => Number((await one(sql, p)).n);

  it('banco novo: só Folha, Névoa, Nuvem e Areia', async () => {
    assert.deepEqual((await t.pool.query('SELECT code FROM game.villages ORDER BY sort_order')).rows.map((r) => r.code),
      ['vila_1', 'vila_3', 'vila_4', 'vila_5']);
  });

  it('banco antigo com a Pedra em uso: os ninjas vão para a Folha com a troca de volta; o resto da Pedra some', async () => {
    await t.pool.query(`INSERT INTO game.villages (code, name, sort_order) VALUES ('vila_2', 'Pedra', 2)`);
    const iwa = await t.createPlayer('iwa', 'GENIN');
    const voter = await t.createPlayer('eleitor_pedra', 'GENIN');
    const ren = await t.createPlayer('fugitivo', 'GENIN');
    const nevoa = await t.createPlayer('mizu', 'GENIN');
    await t.pool.query(`UPDATE game.players SET village = 'vila_2', village_switches = 1,
                          appearance = '{"v":2,"gender":"m","skin":"canela","hairStyle":"espetado","hairColor":"preto","eyeStyle":"masculino","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho","pantsColor":"cinza","bandana":true,"village":"vila_2"}'::jsonb
                         WHERE id = ANY($1)`, [[iwa, voter]]);
    await t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [nevoa]);
    await t.pool.query(`UPDATE game.players SET village = NULL, renegade_at = now(), renegade_from = 'vila_2' WHERE id = $1`, [ren]);
    await t.pool.query(`INSERT INTO game.village_kages (village, player_id, term_ends_at) VALUES ('vila_2', $1, now() + interval '28 days')`, [iwa]);
    const election = (await one(`INSERT INTO game.kage_elections (village, closes_at) VALUES ('vila_2', now() + interval '1 day') RETURNING id`)).id;
    await t.pool.query(`INSERT INTO game.kage_votes (election_id, voter_id, candidate_id) VALUES ($1, $2, $3)`, [election, voter, iwa]);
    await t.pool.query(`INSERT INTO game.village_relations (village_a, village_b, state, declared_by) VALUES ('vila_1', 'vila_2', 'guerra', 'vila_2'), ('vila_3', 'vila_4', 'alianca', 'vila_3')`);
    await t.pool.query(`INSERT INTO game.village_pair_changes (village_a, village_b, last_change_at) VALUES ('vila_2', 'vila_3', now())`);
    await t.pool.query(`INSERT INTO game.diplomacy_proposals (kind, from_village, to_village, expires_at) VALUES ('paz', 'vila_1', 'vila_2', now() + interval '1 day')`);
    await t.pool.query(`INSERT INTO game.world_events (kind, village_a, village_b, ends_at) VALUES ('guerra', 'vila_2', 'vila_5', now() + interval '1 day'), ('tregua', NULL, NULL, now() + interval '1 day')`);
    await t.pool.query(`INSERT INTO game.kage_actions (village, kage_id, action, target_village) VALUES ('vila_2', $1, 'guerra', 'vila_1'), ('vila_5', NULL, 'guerra', 'vila_2'), ('vila_3', NULL, 'alianca', 'vila_4')`, [iwa]);
    await t.pool.query(`INSERT INTO game.village_reports (village, reporter_id, target_id, reason) VALUES ('vila_2', $1, $2, 'motivo de teste com mais de dez letras')`, [voter, iwa]);

    await t.pool.query(V13);

    assert.deepEqual((await t.pool.query('SELECT code FROM game.villages ORDER BY sort_order')).rows.map((r) => r.code),
      ['vila_1', 'vila_3', 'vila_4', 'vila_5']);
    for (const id of [iwa, voter]) {
      const p = await one(`SELECT village, village_switches, appearance ->> 'village' AS look FROM game.players WHERE id = $1`, [id]);
      assert.deepEqual(p, { village: 'vila_1', village_switches: 0, look: 'vila_1' }, 'Folha, troca de volta e a bandana da Folha');
    }
    assert.equal((await one('SELECT renegade_from FROM game.players WHERE id = $1', [ren])).renegade_from, 'vila_1');
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [nevoa])).village, 'vila_3', 'quem não era da Pedra não muda');
    assert.equal(await count(`SELECT count(*) AS n FROM game.village_kages`), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM game.kage_elections`), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM game.kage_votes`), 0);
    assert.deepEqual((await t.pool.query(`SELECT village_a, village_b FROM game.village_relations`)).rows, [{ village_a: 'vila_3', village_b: 'vila_4' }]);
    assert.equal(await count(`SELECT count(*) AS n FROM game.village_pair_changes`), 0);
    assert.equal(await count(`SELECT count(*) AS n FROM game.diplomacy_proposals`), 0);
    assert.deepEqual((await t.pool.query(`SELECT kind FROM game.world_events`)).rows, [{ kind: 'tregua' }], 'a trégua de todas fica');
    assert.deepEqual((await t.pool.query(`SELECT village FROM game.kage_actions`)).rows, [{ village: 'vila_3' }]);
    assert.equal(await count(`SELECT count(*) AS n FROM game.village_reports`), 0);
    await assert.rejects(t.pool.query(`SELECT game.choose_village($1, 'vila_2')`, [nevoa]), /Vila inválida/);

    await t.pool.query(V13);                                                   // pode rodar de novo
    assert.equal(await count(`SELECT count(*) AS n FROM game.villages`), 4);
  });

  it('nenhuma chave estrangeira aponta para uma vila que não existe', async () => {
    const fks = (await t.pool.query(`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'game.villages'::regclass`)).rows as { tbl: string; col: string }[];
    assert.ok(fks.length >= 10, `${fks.length} colunas apontam para game.villages`);
    for (const { tbl, col } of fks) {
      assert.equal(await count(`SELECT count(*) AS n FROM ${tbl} WHERE ${col} IS NOT NULL AND ${col} NOT IN (SELECT code FROM game.villages)`), 0, `${tbl}.${col}`);
    }
  });
});
