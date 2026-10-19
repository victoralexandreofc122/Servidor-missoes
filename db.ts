import pg from 'pg';

/** O mínimo que os handlers precisam do banco. Facilita testar com um banco falso. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface TxClient extends Queryable {
  /** `destroy = true` descarta a conexão em vez de devolvê-la ao pool (conexão em estado incerto). */
  release(destroy?: boolean): void;
}

export interface Db extends Queryable {
  connect(): Promise<TxClient>;
}

/** Adapta um Pool do `pg` para a interface Db. */
export function createDb(pool: pg.Pool): Db {
  return {
    async query<R>(text: string, values?: readonly unknown[]) {
      const res = await pool.query(text, values as unknown[] | undefined);
      return { rows: res.rows as R[], rowCount: res.rowCount };
    },
    async connect() {
      const client = await pool.connect();
      return {
        async query<R>(text: string, values?: readonly unknown[]) {
          const res = await client.query(text, values as unknown[] | undefined);
          return { rows: res.rows as R[], rowCount: res.rowCount };
        },
        release: (destroy?: boolean) => client.release(destroy),
      };
    },
  };
}

export interface PoolOptions {
  /** Chamado quando uma conexão OCIOSA do pool cai (ex.: banco reiniciou). Sem isso o processo morre. */
  onIdleClientError: (err: Error) => void;
  max?: number;
}

/**
 * Limites de tempo: os triggers usam FOR UPDATE / FOR SHARE, então uma requisição
 * pode esperar trava. Melhor falhar rápido (503 "tente de novo") do que segurar
 * conexão e jogador indefinidamente.
 */
export const DB_TIMEOUTS = {
  connectionTimeoutMillis: 5_000,            // esperar conexão livre no pool
  lock_timeout: 3_000,                       // esperar trava de linha (SQLSTATE 55P03)
  statement_timeout: 5_000,                  // comando inteiro (SQLSTATE 57014)
  idle_in_transaction_session_timeout: 10_000, // transação esquecida aberta
} as const;

export function createPool(connectionString: string, options: PoolOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 20,
    idleTimeoutMillis: 30_000,
    ...DB_TIMEOUTS,
  });
  pool.on('error', options.onIdleClientError);
  return pool;
}

/** Roda `fn` numa transação: COMMIT se der certo, ROLLBACK se lançar erro. */
export async function withTransaction<T>(db: Db, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;   // ROLLBACK falhou: conexão em estado desconhecido, não volta para o pool
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
