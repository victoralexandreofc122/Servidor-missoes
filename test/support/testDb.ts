import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createDb, type Db } from '../../src/db.js';

/**
 * Cria um banco novo só para o teste, aplica as migrações (v2, v3 login, v4 NPC Mestre, v5 atributos... v8 admin e chat, v9 visual em sprites)
 * e apaga tudo no final. TEST_DATABASE_URL precisa de um role com CREATEDB.
 * `files` permite subir um banco sem alguma migração (ex.: testar a v4 ausente).
 */
export const MIGRATIONS = ['schema_ranks_missoes_sensei.sql', 'schema_v3_auth.sql', 'schema_v4_npc_missions.sql', 'schema_v5_atributos.sql', 'schema_v6_aparencia.sql', 'schema_v7_progressao.sql', 'schema_v8_admin_chat.sql', 'schema_v9_visual_sprites.sql', 'schema_v10_design.sql', 'schema_v11_endgame.sql', 'schema_v12_sapatos.sql', 'schema_v13_sem_pedra.sql', 'schema_v14_acessorio.sql', 'schema_v15_rankeado.sql', 'schema_v16_jutsus_fogo.sql', 'schema_v17_nomes.sql', 'schema_v18_jutsus_classes.sql', 'schema_v19_clas.sql', 'schema_v20_extracao.sql', 'schema_v21_nomes_jutsus.sql'] as const;

export async function createTestDatabase(files: readonly string[] = MIGRATIONS) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error('Defina TEST_DATABASE_URL (role com CREATEDB) para os testes de integração');

  const name = `missoes_teste_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10 });
  // Mesma ordem do Neon: schema v2, migração v3 (login), migração v4 (NPC Mestre).
  // Uma migração que falha não pode deixar o banco e as conexões abertos: o processo do teste ficaria pendurado.
  try {
    for (const file of files) {
      await pool.query(readFileSync(new URL(`../../db/${file}`, import.meta.url), 'utf8'));
    }
  } catch (e) {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
    throw e;
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
