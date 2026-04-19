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
      await client.query(`SET LOCAL app.org_id = $1`, [subject.org.id]);
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
