import type { MiddlewareHandler } from 'hono';
import type { Pool, PoolClient } from 'pg';

declare module 'hono' {
  interface ContextVariableMap {
    tx: PoolClient;
  }
}

export function openOrgScopedTx(pool: Pool): MiddlewareHandler {
  return async (c, next) => {
    const subject = c.get('subject');
    const client = await pool.connect();
    let finalized = false;
    try {
      await client.query('BEGIN');
      // Postgres SET LOCAL does not accept bound parameters — the parser
      // rejects `$1` with a 42601 syntax error. `set_config(name, value,
      // is_local=true)` is the equivalent that does accept parameters.
      // See packages/platform-storage/src/pg/tx.ts for the matching fix
      // applied 2026-04-19 (rntme-cli 5426e8a).
      await client.query(`SELECT set_config('app.org_id', $1, true)`, [subject.org.id]);
      c.set('tx', client);
      await next();
      if (c.error) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }
      finalized = true;
    } finally {
      if (!finalized) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
      }
      client.release();
    }
  };
}
