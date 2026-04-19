import type { Pool, PoolClient } from 'pg';

export type TxClient = PoolClient & { __tx: true };

export async function withTransaction<T>(
  pool: Pool,
  orgId: string | null,
  fn: (client: TxClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL only accepts literal constants, not bound parameters.
    // set_config(name, value, is_local=true) is the equivalent that
    // does accept parameters.
    if (orgId) await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
    const out = await fn(client as TxClient);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
