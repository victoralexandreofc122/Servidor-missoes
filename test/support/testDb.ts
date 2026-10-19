import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createDb, type Db } from '../../src/db.js';

/**
 * Cria um banco novo só para o teste, aplica db/schema_ranks_missoes_sensei.sql + db/schema_v3_auth.sql
 * e apaga tudo no final. TEST_DATABASE_URL precisa de um role com CREATEDB.
 */
export async function createTestDatabase() {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error('Defina TEST_DATABASE_URL (role com CREATEDB) para os testes de integração');

  const name = `missoes_teste_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10 });
  // Mesma ordem do Neon: schema v2, depois a migração v3 (login).
  for (const file of ['schema_ranks_missoes_sensei.sql', 'schema_v3_auth.sql']) {
    await pool.query(readFileSync(new URL(`../../db/${file}`, import.meta.url), 'utf8'));
  }

  const db: Db = createDb(pool);

  async function createPlayer(username: string, rankCode = 'ACADEMY'): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO game.players (username, current_rank_id)
       VALUES ($1, (SELECT id FROM game.ranks WHERE code = $2)) RETURNING id`,
      [username, rankCode],
    );
    return rows[0]!.id;
  }

  async function setRank(playerId: string, rankCode: string) {
    await pool.query(`UPDATE game.players SET current_rank_id = (SELECT id FROM game.ranks WHERE code = $2) WHERE id = $1`, [playerId, rankCode]);
  }

  async function drop() {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  }

  return { db, pool, url: url.toString(), createPlayer, setRank, drop };
}
