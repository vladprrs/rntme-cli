import { and, desc, eq } from 'drizzle-orm';
import {
  ok,
  err,
  type Result,
  type PlatformError,
  type ServiceRepo,
  type Service,
  type ArtifactVersion,
  type ArtifactTag,
} from '@rntme-cli/platform-core';
import { createDb, type Db, type PgQueryable } from '../pg/pool.js';
import { service } from '../schema/projects.js';
import { artifactVersion, artifactTag } from '../schema/artifacts.js';

function toS(r: typeof service.$inferSelect): Service {
  return {
    id: r.id,
    orgId: r.orgId,
    projectId: r.projectId,
    slug: r.slug,
    displayName: r.displayName,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt!,
    updatedAt: r.updatedAt!,
  };
}

function toArtifactVersion(r: typeof artifactVersion.$inferSelect): ArtifactVersion {
  return {
    id: r.id,
    orgId: r.orgId,
    serviceId: r.serviceId,
    seq: r.seq,
    bundleDigest: r.bundleDigest,
    previousVersionId: r.previousVersionId,
    manifestDigest: r.manifestDigest,
    pdmDigest: r.pdmDigest,
    qsmDigest: r.qsmDigest,
    graphIrDigest: r.graphIrDigest,
    bindingsDigest: r.bindingsDigest,
    uiDigest: r.uiDigest,
    seedDigest: r.seedDigest,
    validationSnapshot: r.validationSnapshot as Record<string, unknown>,
    publishedByAccountId: r.publishedByAccountId,
    publishedByTokenId: r.publishedByTokenId,
    publishedAt: r.publishedAt!,
    message: r.message,
  };
}

function toArtifactTag(r: typeof artifactTag.$inferSelect): ArtifactTag {
  return {
    serviceId: r.serviceId,
    name: r.name,
    versionId: r.versionId,
    updatedAt: r.updatedAt!,
    updatedByAccountId: r.updatedByAccountId,
  };
}

export class PgServiceRepo implements ServiceRepo {
  private readonly db: Db;
  constructor(pool: PgQueryable) {
    this.db = createDb(pool);
  }

  async create(row: {
    id: string;
    orgId: string;
    projectId: string;
    slug: string;
    displayName: string;
  }): Promise<Result<Service, PlatformError>> {
    try {
      const rows = await this.db.insert(service).values(row).returning();
      return ok(toS(rows[0]!));
    } catch (cause) {
      const msg = String(cause);
      if (/service_project_slug_uq/.test(msg)) return err([{ code: 'PLATFORM_CONFLICT_SLUG_TAKEN', message: row.slug, cause }]);
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: msg, cause }]);
    }
  }

  async findBySlug(projectId: string, slug: string): Promise<Result<Service | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(service)
        .where(and(eq(service.projectId, projectId), eq(service.slug, slug)))
        .limit(1);
      return ok(rows[0] ? toS(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findById(orgId: string, id: string): Promise<Result<Service | null, PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(service)
        .where(and(eq(service.orgId, orgId), eq(service.id, id)))
        .limit(1);
      return ok(rows[0] ? toS(rows[0]) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async list(orgId: string, projectId: string): Promise<Result<readonly Service[], PlatformError>> {
    try {
      const rows = await this.db
        .select()
        .from(service)
        .where(and(eq(service.orgId, orgId), eq(service.projectId, projectId)));
      return ok(rows.map(toS));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async patch(orgId: string, id: string, patch: { displayName: string }): Promise<Result<Service, PlatformError>> {
    try {
      const rows = await this.db
        .update(service)
        .set({ displayName: patch.displayName, updatedAt: new Date() })
        .where(and(eq(service.orgId, orgId), eq(service.id, id)))
        .returning();
      if (!rows[0]) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: id }]);
      return ok(toS(rows[0]));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async archive(orgId: string, id: string): Promise<Result<Service, PlatformError>> {
    try {
      const rows = await this.db
        .update(service)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(service.orgId, orgId), eq(service.id, id)))
        .returning();
      if (!rows[0]) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: id }]);
      return ok(toS(rows[0]));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async detailWithLatest(
    orgId: string,
    id: string,
  ): Promise<Result<{ service: Service; latestVersion: ArtifactVersion | null; tags: readonly ArtifactTag[] }, PlatformError>> {
    try {
      const svcRows = await this.db
        .select()
        .from(service)
        .where(and(eq(service.orgId, orgId), eq(service.id, id)))
        .limit(1);
      if (!svcRows[0]) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: id }]);
      const latest = await this.db
        .select()
        .from(artifactVersion)
        .where(eq(artifactVersion.serviceId, id))
        .orderBy(desc(artifactVersion.seq))
        .limit(1);
      const tagRows = await this.db.select().from(artifactTag).where(eq(artifactTag.serviceId, id));
      return ok({
        service: toS(svcRows[0]),
        latestVersion: latest[0] ? toArtifactVersion(latest[0]) : null,
        tags: tagRows.map(toArtifactTag),
      });
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
