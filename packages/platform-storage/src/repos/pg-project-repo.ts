import { and, count, eq, isNull } from 'drizzle-orm';
import { ok, err, type Result, type PlatformError, type ProjectRepo, type Project } from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { project, service } from '../schema/projects.js';

function toP(r: typeof project.$inferSelect): Project {
  return {
    id: r.id,
    orgId: r.orgId,
    slug: r.slug,
    displayName: r.displayName,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt!,
    updatedAt: r.updatedAt!,
  };
}

export class PgProjectRepo implements ProjectRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async create(row: { id: string; orgId: string; slug: string; displayName: string }): Promise<Result<Project, PlatformError>> {
    try {
      const rows = await this.db.insert(project).values(row).returning();
      return ok(toP(rows[0]!));
    } catch (cause) {
      const msg = String(cause);
      if (/project_org_slug_uq/.test(msg)) return err([{ code: 'PLATFORM_CONFLICT_SLUG_TAKEN', message: row.slug, cause }]);
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: msg, cause }]);
    }
  }

  async findBySlug(orgId: string, slug: string): Promise<Result<Project | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(project)
        .where(and(eq(project.orgId, orgId), eq(project.slug, slug)))
        .limit(1);
      return ok(rows[0] ? toP(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findById(orgId: string, id: string): Promise<Result<Project | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(project)
        .where(and(eq(project.orgId, orgId), eq(project.id, id)))
        .limit(1);
      return ok(rows[0] ? toP(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async list(orgId: string, opts: { includeArchived: boolean }): Promise<Result<readonly Project[], PlatformError>> {
    try {
      const cond = opts.includeArchived
        ? eq(project.orgId, orgId)
        : and(eq(project.orgId, orgId), isNull(project.archivedAt));
      const rows = await this.db.select().from(project).where(cond!);
      return ok(rows.map(toP));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async patch(orgId: string, id: string, patch: { displayName: string }): Promise<Result<Project, PlatformError>> {
    try {
      const rows = await this.db
        .update(project)
        .set({ displayName: patch.displayName, updatedAt: new Date() })
        .where(and(eq(project.orgId, orgId), eq(project.id, id)))
        .returning();
      if (!rows[0]) return err([{ code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: id }]);
      return ok(toP(rows[0]));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async archive(orgId: string, id: string): Promise<Result<Project, PlatformError>> {
    try {
      const rows = await this.db
        .update(project)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(project.orgId, orgId), eq(project.id, id)))
        .returning();
      if (!rows[0]) return err([{ code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: id }]);
      return ok(toP(rows[0]));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async countServices(orgId: string, id: string): Promise<Result<number, PlatformError>> {
    try {
      const r = await this.db
        .select({ c: count() })
        .from(service)
        .where(
          and(eq(service.orgId, orgId), eq(service.projectId, id), isNull(service.archivedAt)),
        );
      return ok(Number(r[0]?.c ?? 0));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
