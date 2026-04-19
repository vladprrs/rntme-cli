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
    if (orgId) await client.query(`SET LOCAL app.org_id = $1`, [orgId]);
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
