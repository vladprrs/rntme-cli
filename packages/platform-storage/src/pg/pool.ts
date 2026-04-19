import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Db = NodePgDatabase<Record<string, unknown>>;

export function createPool(databaseUrl: string, opts: { max?: number } = {}): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: opts.max ?? 10 });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool);
}
