import { ok, err, type Result, type PlatformError, type ArtifactRepo, type ArtifactVersion } from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

export class PgArtifactRepo implements ArtifactRepo {
  constructor(private readonly db: PgQueryable) {}

  async findByDigest(serviceId: string, bundleDigest: string): Promise<Result<ArtifactVersion | null, PlatformError>> {
    try {
      const r = await this.db.query(`SELECT * FROM artifact_version WHERE service_id=$1 AND bundle_digest=$2 LIMIT 1`, [
        serviceId,
        bundleDigest,
      ]);
      return ok(r.rows[0] ? rowToVersion(r.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async latestSeq(serviceId: string): Promise<Result<number, PlatformError>> {
    try {
      const r = await this.db.query(`SELECT COALESCE(MAX(seq),0)::int AS seq FROM artifact_version WHERE service_id=$1`, [
        serviceId,
      ]);
      return ok(r.rows[0].seq);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async publish(args: Parameters<ArtifactRepo['publish']>[0]): Promise<Result<ArtifactVersion, PlatformError>> {
    try {
      const dup = await this.db.query(`SELECT * FROM artifact_version WHERE service_id=$1 AND bundle_digest=$2`, [
        args.serviceId,
        args.row.bundleDigest,
      ]);
      if (dup.rows[0]) return ok(rowToVersion(dup.rows[0] as Record<string, unknown>));
      await this.db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [args.serviceId]);
      const last = await this.db.query(
        `SELECT COALESCE(MAX(seq),0)::int AS seq, (SELECT id FROM artifact_version WHERE service_id=$1 ORDER BY seq DESC LIMIT 1) AS id FROM artifact_version WHERE service_id=$1`,
        [args.serviceId],
      );
      const latestSeq = last.rows[0].seq as number;
      const latestId = last.rows[0].id as string | null;
      if (args.expectedPreviousSeq !== undefined && args.expectedPreviousSeq !== latestSeq) {
        return err([
          {
            code: 'PLATFORM_CONCURRENCY_VERSION_CONFLICT',
            message: `expected ${args.expectedPreviousSeq} but latest ${latestSeq}`,
          },
        ]);
      }
      const ins = await this.db.query(
        `INSERT INTO artifact_version (
           id, org_id, service_id, seq, bundle_digest, previous_version_id,
           manifest_digest, pdm_digest, qsm_digest, graph_ir_digest, bindings_digest, ui_digest, seed_digest,
           validation_snapshot, published_by_account_id, published_by_token_id, message
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
         ) RETURNING *`,
        [
          args.row.id,
          args.row.orgId,
          args.serviceId,
          latestSeq + 1,
          args.row.bundleDigest,
          latestId,
          args.row.manifestDigest,
          args.row.pdmDigest,
          args.row.qsmDigest,
          args.row.graphIrDigest,
          args.row.bindingsDigest,
          args.row.uiDigest,
          args.row.seedDigest,
          args.row.validationSnapshot,
          args.row.publishedByAccountId,
          args.row.publishedByTokenId,
          args.row.message,
        ],
      );
      const inserted = ins.rows[0] as Record<string, unknown>;
      for (const t of args.moveTags) {
        await this.db.query(
          `INSERT INTO artifact_tag (service_id, name, version_id, updated_by_account_id) VALUES ($1,$2,$3,$4)
           ON CONFLICT (service_id, name) DO UPDATE SET version_id=EXCLUDED.version_id, updated_at=now(), updated_by_account_id=EXCLUDED.updated_by_account_id`,
          [args.serviceId, t.name, inserted['id'], t.updatedByAccountId],
        );
        await this.db.query(
          `INSERT INTO audit_log (org_id, actor_account_id, actor_token_id, action, resource_kind, resource_id, payload)
           VALUES ($1,$2,$3,'tag.moved','tag',$4,$5)`,
          [args.row.orgId, args.auditActorAccountId, args.auditActorTokenId, t.name, { versionSeq: latestSeq + 1 }],
        );
      }
      await this.db.query(
        `INSERT INTO audit_log (org_id, actor_account_id, actor_token_id, action, resource_kind, resource_id, payload)
         VALUES ($1,$2,$3,'version.published','version',$4,$5)`,
        [args.row.orgId, args.auditActorAccountId, args.auditActorTokenId, inserted['id'], { seq: latestSeq + 1 }],
      );
      await this.db.query(`INSERT INTO event_outbox (org_id, event_type, payload) VALUES ($1,'artifact.version.published',$2)`, [
        args.row.orgId,
        args.outboxPayload,
      ]);
      return ok(rowToVersion(inserted));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async listBySeq(
    serviceId: string,
    opts: { limit: number; cursor: number | undefined },
  ): Promise<Result<readonly ArtifactVersion[], PlatformError>> {
    try {
      if (opts.cursor !== undefined) {
        const r = await this.db.query(
          `SELECT * FROM artifact_version WHERE service_id=$1 AND seq<$2 ORDER BY seq DESC LIMIT $3`,
          [serviceId, opts.cursor, opts.limit],
        );
        return ok(r.rows.map((row) => rowToVersion(row as Record<string, unknown>)));
      }
      const r = await this.db.query(`SELECT * FROM artifact_version WHERE service_id=$1 ORDER BY seq DESC LIMIT $2`, [
        serviceId,
        opts.limit,
      ]);
      return ok(r.rows.map((row) => rowToVersion(row as Record<string, unknown>)));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async getBySeq(serviceId: string, seq: number): Promise<Result<ArtifactVersion | null, PlatformError>> {
    try {
      const r = await this.db.query(`SELECT * FROM artifact_version WHERE service_id=$1 AND seq=$2`, [serviceId, seq]);
      return ok(r.rows[0] ? rowToVersion(r.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}

function rowToVersion(r: Record<string, unknown>): ArtifactVersion {
  return {
    id: r['id'] as string,
    orgId: r['org_id'] as string,
    serviceId: r['service_id'] as string,
    seq: r['seq'] as number,
    bundleDigest: r['bundle_digest'] as string,
    previousVersionId: (r['previous_version_id'] as string | null) ?? null,
    manifestDigest: r['manifest_digest'] as string,
    pdmDigest: r['pdm_digest'] as string,
    qsmDigest: r['qsm_digest'] as string,
    graphIrDigest: r['graph_ir_digest'] as string,
    bindingsDigest: r['bindings_digest'] as string,
    uiDigest: r['ui_digest'] as string,
    seedDigest: r['seed_digest'] as string,
    validationSnapshot: r['validation_snapshot'] as Record<string, unknown>,
    publishedByAccountId: r['published_by_account_id'] as string,
    publishedByTokenId: (r['published_by_token_id'] as string | null) ?? null,
    publishedAt: r['published_at'] as Date,
    message: (r['message'] as string | null) ?? null,
  };
}
