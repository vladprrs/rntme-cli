import {
  err,
  ok,
  type PlatformError,
  type ProjectVersion,
  type ProjectVersionRepo,
  type ProjectVersionSummary,
  type Result,
} from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

export class PgProjectVersionRepo implements ProjectVersionRepo {
  constructor(private readonly db: PgQueryable) {}

  async create(
    args: Parameters<ProjectVersionRepo['create']>[0],
  ): Promise<Result<ProjectVersion, PlatformError>> {
    try {
      const dup = await this.db.query(
        `SELECT * FROM project_version WHERE project_id=$1 AND bundle_digest=$2 LIMIT 1`,
        [args.projectId, args.row.bundleDigest],
      );
      if (dup.rows[0]) return ok(rowToVersion(dup.rows[0] as Record<string, unknown>));

      await this.db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [args.projectId]);
      const last = await this.db.query(
        `SELECT COALESCE(MAX(seq),0)::bigint AS seq FROM project_version WHERE project_id=$1`,
        [args.projectId],
      );
      const nextSeq = Number(last.rows[0].seq) + 1;

      const ins = await this.db.query(
        `INSERT INTO project_version (
           id, org_id, project_id, seq, bundle_digest, bundle_blob_key, bundle_size_bytes,
           summary, uploaded_by_account_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          args.row.id,
          args.row.orgId,
          args.projectId,
          nextSeq,
          args.row.bundleDigest,
          args.row.bundleBlobKey,
          args.row.bundleSizeBytes,
          args.row.summary,
          args.row.uploadedByAccountId,
        ],
      );
      const inserted = ins.rows[0] as Record<string, unknown>;
      await this.db.query(
        `INSERT INTO audit_log (org_id, actor_account_id, actor_token_id, action, resource_kind, resource_id, payload)
         VALUES ($1,$2,$3,'project_version.published','project_version',$4,$5)`,
        [
          args.row.orgId,
          args.auditActorAccountId,
          args.auditActorTokenId,
          inserted['id'],
          { seq: nextSeq, digest: args.row.bundleDigest },
        ],
      );

      return ok(rowToVersion(inserted));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByDigest(
    projectId: string,
    bundleDigest: string,
  ): Promise<Result<ProjectVersion | null, PlatformError>> {
    try {
      const r = await this.db.query(
        `SELECT * FROM project_version WHERE project_id=$1 AND bundle_digest=$2 LIMIT 1`,
        [projectId, bundleDigest],
      );
      return ok(r.rows[0] ? rowToVersion(r.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async getBySeq(
    projectId: string,
    seq: number,
  ): Promise<Result<ProjectVersion | null, PlatformError>> {
    try {
      const r = await this.db.query(
        `SELECT * FROM project_version WHERE project_id=$1 AND seq=$2 LIMIT 1`,
        [projectId, seq],
      );
      return ok(r.rows[0] ? rowToVersion(r.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async getById(id: string): Promise<Result<ProjectVersion | null, PlatformError>> {
    try {
      const r = await this.db.query(`SELECT * FROM project_version WHERE id=$1 LIMIT 1`, [id]);
      return ok(r.rows[0] ? rowToVersion(r.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async listByProject(
    projectId: string,
    opts: { limit: number; cursor: number | undefined },
  ): Promise<Result<readonly ProjectVersion[], PlatformError>> {
    try {
      if (opts.cursor !== undefined) {
        const r = await this.db.query(
          `SELECT * FROM project_version WHERE project_id=$1 AND seq<$2 ORDER BY seq DESC LIMIT $3`,
          [projectId, opts.cursor, opts.limit],
        );
        return ok(r.rows.map((row) => rowToVersion(row as Record<string, unknown>)));
      }
      const r = await this.db.query(
        `SELECT * FROM project_version WHERE project_id=$1 ORDER BY seq DESC LIMIT $2`,
        [projectId, opts.limit],
      );
      return ok(r.rows.map((row) => rowToVersion(row as Record<string, unknown>)));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}

function rowToVersion(r: Record<string, unknown>): ProjectVersion {
  return {
    id: r['id'] as string,
    orgId: r['org_id'] as string,
    projectId: r['project_id'] as string,
    seq: Number(r['seq']),
    bundleDigest: r['bundle_digest'] as string,
    bundleBlobKey: r['bundle_blob_key'] as string,
    bundleSizeBytes: Number(r['bundle_size_bytes']),
    summary: r['summary'] as ProjectVersionSummary,
    uploadedByAccountId: r['uploaded_by_account_id'] as string,
    createdAt: r['created_at'] as Date,
  };
}
