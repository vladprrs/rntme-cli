import { and, eq, isNull } from 'drizzle-orm';
import { ok, err, type Result, type PlatformError } from '@rntme-cli/platform-core';
import type { OrganizationRepo } from '@rntme-cli/platform-core';
import type { Organization } from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { organization, membershipMirror } from '../schema/identity.js';
import { randomUUID } from 'node:crypto';

function rowToOrg(r: typeof organization.$inferSelect): Organization {
  return {
    id: r.id,
    workosOrganizationId: r.workosOrganizationId,
    slug: r.slug,
    displayName: r.displayName,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt!,
    updatedAt: r.updatedAt!,
  };
}

export class PgOrganizationRepo implements OrganizationRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async findById(id: string): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(organization)
        .where(and(eq(organization.id, id), isNull(organization.archivedAt)))
        .limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByIdIncludingArchived(id: string): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db.select().from(organization).where(eq(organization.id, id)).limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findBySlug(slug: string): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(organization)
        .where(and(eq(organization.slug, slug), isNull(organization.archivedAt)))
        .limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findBySlugIncludingArchived(slug: string): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db.select().from(organization).where(eq(organization.slug, slug)).limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByWorkosId(workosId: string): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(organization)
        .where(and(eq(organization.workosOrganizationId, workosId), isNull(organization.archivedAt)))
        .limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByWorkosIdIncludingArchived(
    workosId: string,
  ): Promise<Result<Organization | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(organization)
        .where(eq(organization.workosOrganizationId, workosId))
        .limit(1);
      return ok(rows[0] ? rowToOrg(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async listForAccount(accountId: string): Promise<Result<readonly Organization[], PlatformError>> {
    try {
      const rows = await this.db
        .select({ o: organization })
        .from(organization)
        .innerJoin(membershipMirror, eq(membershipMirror.orgId, organization.id))
        .where(and(eq(membershipMirror.accountId, accountId), isNull(organization.archivedAt)));
      return ok(rows.map((r) => rowToOrg(r.o)));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async upsertFromWorkos(a: {
    workosOrganizationId: string;
    slug: string;
    displayName: string;
  }): Promise<Result<Organization, PlatformError>> {
    try {
      const id = randomUUID();
      const rows = await this.db
        .insert(organization)
        .values({ id, workosOrganizationId: a.workosOrganizationId, slug: a.slug, displayName: a.displayName })
        .onConflictDoUpdate({
          target: organization.workosOrganizationId,
          set: { slug: a.slug, displayName: a.displayName, updatedAt: new Date() },
        })
        .returning();
      return ok(rowToOrg(rows[0]!));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async archive(id: string): Promise<Result<void, PlatformError>> {
    try {
      await this.db
        .update(organization)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(organization.id, id));
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
