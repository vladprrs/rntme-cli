import { ok, err, type Result, type PlatformError, type OutboxRepo } from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

export class PgOutboxRepo implements OutboxRepo {
  constructor(private readonly db: PgQueryable) {}

  async pending(limit: number): Promise<
    Result<readonly { id: bigint; eventType: string; payload: Record<string, unknown> }[], PlatformError>
  > {
    try {
      const q = await this.db.query(
        `SELECT id, event_type, payload FROM event_outbox WHERE delivered_at IS NULL ORDER BY id ASC LIMIT $1`,
        [limit],
      );
      return ok(
        q.rows.map((r) => ({
          id: typeof r.id === 'bigint' ? r.id : BigInt(String(r.id)),
          eventType: r.event_type as string,
          payload: r.payload as Record<string, unknown>,
        })),
      );
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async markDelivered(id: bigint): Promise<Result<void, PlatformError>> {
    try {
      await this.db.query(`UPDATE event_outbox SET delivered_at=now() WHERE id=$1`, [id]);
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
