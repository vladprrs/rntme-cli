import { eq } from 'drizzle-orm';
import { ok, err, type Result, type PlatformError, type AccountRepo, type Account } from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { account } from '../schema/identity.js';
import { randomUUID } from 'node:crypto';

function toAccount(r: typeof account.$inferSelect): Account {
  return {
    id: r.id,
    workosUserId: r.workosUserId,
    email: r.email,
    displayName: r.displayName,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt!,
    updatedAt: r.updatedAt!,
  };
}

export class PgAccountRepo implements AccountRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async findById(id: string): Promise<Result<Account | null, PlatformError>> {
    try {
      const rows = await this.db.select().from(account).where(eq(account.id, id)).limit(1);
      return ok(rows[0] ? toAccount(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByWorkosUserId(wid: string): Promise<Result<Account | null, PlatformError>> {
    try {
      const rows = await this.db.select().from(account).where(eq(account.workosUserId, wid)).limit(1);
      return ok(rows[0] ? toAccount(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async upsertFromWorkos(a: {
    workosUserId: string;
    email: string | null;
    displayName: string;
  }): Promise<Result<Account, PlatformError>> {
    try {
      const rows = await this.db
        .insert(account)
        .values({ id: randomUUID(), workosUserId: a.workosUserId, email: a.email, displayName: a.displayName })
        .onConflictDoUpdate({
          target: account.workosUserId,
          set: { email: a.email, displayName: a.displayName, updatedAt: new Date() },
        })
        .returning();
      return ok(toAccount(rows[0]!));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async markDeleted(wid: string): Promise<Result<void, PlatformError>> {
    try {
      await this.db.update(account).set({ deletedAt: new Date() }).where(eq(account.workosUserId, wid));
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
