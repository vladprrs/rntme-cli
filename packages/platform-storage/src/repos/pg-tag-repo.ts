import type { Pool } from 'pg';
import { ok, err, type Result, type PlatformError, type TagRepo, type ArtifactTag } from '@rntme-cli/platform-core';

export class PgTagRepo implements TagRepo {
  constructor(private readonly pool: Pool) {}

  async list(serviceId: string): Promise<Result<readonly ArtifactTag[], PlatformError>> {
    try {
      const r = await this.pool.query(`SELECT * FROM artifact_tag WHERE service_id=$1`, [serviceId]);
      return ok(r.rows as unknown as ArtifactTag[]);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async move(a: {
    serviceId: string;
    name: string;
    versionId: string;
    updatedByAccountId: string;
  }): Promise<Result<ArtifactTag, PlatformError>> {
    try {
      const r = await this.pool.query(
        `INSERT INTO artifact_tag (service_id, name, version_id, updated_by_account_id) VALUES ($1,$2,$3,$4)
         ON CONFLICT (service_id, name) DO UPDATE SET version_id=EXCLUDED.version_id, updated_at=now(), updated_by_account_id=EXCLUDED.updated_by_account_id
         RETURNING *`,
        [a.serviceId, a.name, a.versionId, a.updatedByAccountId],
      );
      return ok(r.rows[0] as unknown as ArtifactTag);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async delete(serviceId: string, name: string, _actorAccountId: string): Promise<Result<void, PlatformError>> {
    try {
      await this.pool.query(`DELETE FROM artifact_tag WHERE service_id=$1 AND name=$2`, [serviceId, name]);
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
