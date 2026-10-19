import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPool, DB_TIMEOUTS, withTransaction, type Db, type TxClient } from '../src/db.js';

function fakeDb(failOn: string[]): Db & { log: string[] } {
  const log: string[] = [];
  const client: TxClient = {
    async query(text: string) {
      log.push(text);
      if (failOn.includes(text)) throw new Error(`falhou: ${text}`);
      return { rows: [], rowCount: 0 };
    },
    release(destroy?: boolean) {
      log.push(`release(${destroy === true ? 'destroy' : 'reuse'})`);
    },
  };
  return { log, query: client.query, connect: async () => client };
}

describe('withTransaction', () => {
  it('sucesso: BEGIN, trabalho, COMMIT e devolve a conexão ao pool', async () => {
    const db = fakeDb([]);
    const out = await withTransaction(db, async (tx) => {
      await tx.query('SELECT 1');
      return 42;
    });
    assert.equal(out, 42);
    assert.deepEqual(db.log, ['BEGIN', 'SELECT 1', 'COMMIT', 'release(reuse)']);
  });

  it('erro no trabalho: ROLLBACK e devolve a conexão (ela está sã)', async () => {
    const db = fakeDb(['SELECT 1']);
    await assert.rejects(withTransaction(db, (tx) => tx.query('SELECT 1')), /falhou: SELECT 1/);
    assert.deepEqual(db.log, ['BEGIN', 'SELECT 1', 'ROLLBACK', 'release(reuse)']);
  });

  it('ROLLBACK também falha: propaga o erro original e DESCARTA a conexão', async () => {
    const db = fakeDb(['SELECT 1', 'ROLLBACK']);
    await assert.rejects(withTransaction(db, (tx) => tx.query('SELECT 1')), /falhou: SELECT 1/);
    assert.deepEqual(db.log, ['BEGIN', 'SELECT 1', 'ROLLBACK', 'release(destroy)']);
  });
});

describe('createPool', () => {
  it('registra handler de erro de conexão ociosa e aplica os timeouts', async () => {
    const seen: Error[] = [];
    const pool = createPool('postgres://ninguem@127.0.0.1:1/nada', { onIdleClientError: (e) => seen.push(e) });
    assert.equal(pool.listenerCount('error'), 1);
    pool.emit('error', new Error('conexão caiu'));          // sem o handler isto derrubaria o processo
    assert.equal(seen.length, 1);
    const opts = (pool as unknown as { options: Record<string, unknown> }).options;
    for (const [k, v] of Object.entries(DB_TIMEOUTS)) assert.equal(opts[k], v, k);
    await pool.end();
  });
});
