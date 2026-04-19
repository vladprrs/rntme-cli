import { eq } from 'drizzle-orm';
import { ok, err, type Result, type PlatformError, type WorkosEventLogRepo } from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { workosEventLog } from '../schema/identity.js';

export class PgWorkosEventLogRepo implements WorkosEventLogRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async hasProcessed(eventId: string): Promise<Result<boolean, PlatformError>> {
    try {
      const rows = await this.db.select().from(workosEventLog).where(eq(workosEventLog.eventId, eventId)).limit(1);
      return ok(rows.length > 0);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async markProcessed(eventId: string, eventType: string): Promise<Result<void, PlatformError>> {
    try {
      await this.db
        .insert(workosEventLog)
        .values({ eventId, eventType })
        .onConflictDoNothing({ target: workosEventLog.eventId });
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
