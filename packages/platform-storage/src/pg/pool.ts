import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

export type Db = NodePgDatabase<Record<string, unknown>>;

/** Pool or a transaction client — both work with Drizzle `node-postgres` driver. */
export type PgQueryable = pg.Pool | PoolClient;

export function createPool(databaseUrl: string, opts: { max?: number } = {}): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: opts.max ?? 10 });
}

export function createDb(pool: PgQueryable): Db {
  return drizzle(pool);
}
