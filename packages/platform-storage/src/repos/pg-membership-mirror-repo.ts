import { and, eq } from 'drizzle-orm';
import { ok, err, type Result, type PlatformError, type MembershipMirrorRepo, type MembershipMirror } from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { membershipMirror } from '../schema/identity.js';

function toMem(r: typeof membershipMirror.$inferSelect): MembershipMirror {
  return { orgId: r.orgId, accountId: r.accountId, role: r.role, updatedAt: r.updatedAt! };
}

export class PgMembershipMirrorRepo implements MembershipMirrorRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async find(o: string, a: string): Promise<Result<MembershipMirror | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(membershipMirror)
        .where(and(eq(membershipMirror.orgId, o), eq(membershipMirror.accountId, a)))
        .limit(1);
      return ok(rows[0] ? toMem(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async upsert(row: { orgId: string; accountId: string; role: string }): Promise<Result<MembershipMirror, PlatformError>> {
    try {
      const rows = await this.db
        .insert(membershipMirror)
        .values(row)
        .onConflictDoUpdate({
          target: [membershipMirror.orgId, membershipMirror.accountId],
          set: { role: row.role, updatedAt: new Date() },
        })
        .returning();
      return ok(toMem(rows[0]!));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async delete(o: string, a: string): Promise<Result<void, PlatformError>> {
    try {
      await this.db
        .delete(membershipMirror)
        .where(and(eq(membershipMirror.orgId, o), eq(membershipMirror.accountId, a)));
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async listForAccount(a: string): Promise<Result<readonly MembershipMirror[], PlatformError>> {
    try {
      const rows = await this.db.select().from(membershipMirror).where(eq(membershipMirror.accountId, a));
      return ok(rows.map(toMem));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
