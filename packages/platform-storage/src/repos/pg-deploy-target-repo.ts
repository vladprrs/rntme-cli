import type { Buffer } from 'node:buffer';
import type { Pool } from 'pg';
import {
  err,
  ok,
  type DeployTarget,
  type DeployTargetRepo,
  type DeployTargetWithSecret,
  type EventBusConfig,
  type PlatformError,
  type PolicyValues,
  type Result,
} from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

type DbRow = Record<string, unknown>;

export class PgDeployTargetRepo implements DeployTargetRepo {
  constructor(private readonly db: PgQueryable) {}

  async create(
    args: Parameters<DeployTargetRepo['create']>[0],
  ): Promise<Result<DeployTarget, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        if (args.row.isDefault) {
          await db.query(`UPDATE deploy_target SET is_default=false, updated_at=now() WHERE org_id=$1`, [
            args.row.orgId,
          ]);
        }

        const inserted = await db.query(
          `INSERT INTO deploy_target (
             id, org_id, slug, display_name, kind, dokploy_url, public_base_url,
             dokploy_project_id, dokploy_project_name, allow_create_project,
             api_token_ciphertext, api_token_nonce, api_token_key_version,
             event_bus_config, policy_values, is_default
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            args.row.id,
            args.row.orgId,
            args.row.slug,
            args.row.displayName,
            args.row.kind,
            args.row.dokployUrl,
            args.row.publicBaseUrl,
            args.row.dokployProjectId,
            args.row.dokployProjectName,
            args.row.allowCreateProject,
            args.row.apiTokenCiphertext,
            args.row.apiTokenNonce,
            args.row.apiTokenKeyVersion,
            args.row.eventBusConfig,
            args.row.policyValues,
            args.row.isDefault,
          ],
        );
        const row = inserted.rows[0] as DbRow;
        await audit(db, {
          orgId: args.row.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deploy_target.created',
          resourceId: row['id'] as string,
          payload: { slug: args.row.slug, isDefault: args.row.isDefault },
        });
        return ok(rowToTarget(row));
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async update(
    args: Parameters<DeployTargetRepo['update']>[0],
  ): Promise<Result<DeployTarget, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        const current = await db.query(
          `SELECT id FROM deploy_target WHERE org_id=$1 AND slug=$2 LIMIT 1 FOR UPDATE`,
          [args.orgId, args.slug],
        );
        const targetId = current.rows[0]?.['id'] as string | undefined;
        if (!targetId) return notFound(args.slug);

        if (args.patch.isDefault === true) {
          await db.query(`UPDATE deploy_target SET is_default=false, updated_at=now() WHERE org_id=$1 AND id<>$2`, [
            args.orgId,
            targetId,
          ]);
        }

        const sets: string[] = ['updated_at=now()'];
        const values: unknown[] = [];
        addSet(sets, values, 'display_name', args.patch.displayName);
        addSet(sets, values, 'dokploy_url', args.patch.dokployUrl);
        addSet(sets, values, 'public_base_url', args.patch.publicBaseUrl);
        addSet(sets, values, 'dokploy_project_id', args.patch.dokployProjectId);
        addSet(sets, values, 'dokploy_project_name', args.patch.dokployProjectName);
        addSet(sets, values, 'allow_create_project', args.patch.allowCreateProject);
        addSet(sets, values, 'event_bus_config', args.patch.eventBusConfig);
        addSet(sets, values, 'policy_values', args.patch.policyValues);
        addSet(sets, values, 'is_default', args.patch.isDefault);
        values.push(targetId);

        const updated = await db.query(
          `UPDATE deploy_target SET ${sets.join(', ')} WHERE id=$${values.length} RETURNING *`,
          values,
        );
        const row = updated.rows[0] as DbRow | undefined;
        if (!row) return notFound(args.slug);

        await audit(db, {
          orgId: args.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deploy_target.updated',
          resourceId: targetId,
          payload: { slug: args.slug, fields: Object.keys(args.patch) },
        });
        return ok(rowToTarget(row));
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async rotateApiToken(
    args: Parameters<DeployTargetRepo['rotateApiToken']>[0],
  ): Promise<Result<DeployTarget, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        const updated = await db.query(
          `UPDATE deploy_target
           SET api_token_ciphertext=$1, api_token_nonce=$2, api_token_key_version=$3, updated_at=now()
           WHERE org_id=$4 AND slug=$5
           RETURNING *`,
          [args.ciphertext, args.nonce, args.keyVersion, args.orgId, args.slug],
        );
        const row = updated.rows[0] as DbRow | undefined;
        if (!row) return notFound(args.slug);
        await audit(db, {
          orgId: args.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deploy_target.api_token_rotated',
          resourceId: row['id'] as string,
          payload: { slug: args.slug, keyVersion: args.keyVersion },
        });
        return ok(rowToTarget(row));
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async setDefault(
    args: Parameters<DeployTargetRepo['setDefault']>[0],
  ): Promise<Result<DeployTarget, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        const current = await db.query(
          `SELECT * FROM deploy_target WHERE org_id=$1 AND slug=$2 LIMIT 1 FOR UPDATE`,
          [args.orgId, args.slug],
        );
        const row = current.rows[0] as DbRow | undefined;
        if (!row) return notFound(args.slug);
        const targetId = row['id'] as string;

        await db.query(`UPDATE deploy_target SET is_default=false, updated_at=now() WHERE org_id=$1 AND id<>$2`, [
          args.orgId,
          targetId,
        ]);
        const updated = await db.query(
          `UPDATE deploy_target SET is_default=true, updated_at=now() WHERE id=$1 RETURNING *`,
          [targetId],
        );
        const defaultRow = updated.rows[0] as DbRow;
        await audit(db, {
          orgId: args.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deploy_target.set_default',
          resourceId: targetId,
          payload: { slug: args.slug },
        });
        return ok(rowToTarget(defaultRow));
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async delete(args: Parameters<DeployTargetRepo['delete']>[0]): Promise<Result<void, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        const current = await db.query(
          `SELECT id FROM deploy_target WHERE org_id=$1 AND slug=$2 LIMIT 1 FOR UPDATE`,
          [args.orgId, args.slug],
        );
        const targetId = current.rows[0]?.['id'] as string | undefined;
        if (!targetId) return notFound(args.slug);

        const active = await db.query(
          `SELECT count(*)::int AS count FROM deployment WHERE target_id=$1 AND status IN ('queued','running')`,
          [targetId],
        );
        if (Number(active.rows[0]?.['count'] ?? 0) > 0) {
          return err([{ code: 'DEPLOY_TARGET_IN_USE', message: args.slug }]);
        }

        await db.query(`DELETE FROM deploy_target WHERE id=$1`, [targetId]);
        await audit(db, {
          orgId: args.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deploy_target.deleted',
          resourceId: targetId,
          payload: { slug: args.slug },
        });
        return ok(undefined);
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async list(orgId: string): Promise<Result<readonly DeployTarget[], PlatformError>> {
    try {
      const rows = await this.db.query(
        `SELECT * FROM deploy_target WHERE org_id=$1 ORDER BY slug ASC`,
        [orgId],
      );
      return ok(rows.rows.map((row) => rowToTarget(row as DbRow)));
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async getBySlug(orgId: string, slug: string): Promise<Result<DeployTarget | null, PlatformError>> {
    try {
      const row = await this.db.query(
        `SELECT * FROM deploy_target WHERE org_id=$1 AND slug=$2 LIMIT 1`,
        [orgId, slug],
      );
      return ok(row.rows[0] ? rowToTarget(row.rows[0] as DbRow) : null);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async getDefault(orgId: string): Promise<Result<DeployTarget | null, PlatformError>> {
    try {
      const row = await this.db.query(
        `SELECT * FROM deploy_target WHERE org_id=$1 AND is_default=true LIMIT 1`,
        [orgId],
      );
      return ok(row.rows[0] ? rowToTarget(row.rows[0] as DbRow) : null);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async getWithSecretById(id: string): Promise<Result<DeployTargetWithSecret | null, PlatformError>> {
    try {
      const context = await this.db.query<{ org_id: string | null }>(
        `SELECT NULLIF(current_setting('app.org_id', true), '') AS org_id`,
      );
      const orgId = context.rows[0]?.org_id;
      if (!orgId) {
        return err([
          {
            code: 'PLATFORM_STORAGE_RLS_CONTEXT_REQUIRED',
            message: 'app.org_id is required before reading deploy target secrets',
            stage: 'storage',
          },
        ]);
      }

      const row = await this.db.query(`SELECT * FROM deploy_target WHERE id=$1 AND org_id=$2 LIMIT 1`, [id, orgId]);
      return ok(row.rows[0] ? rowToTargetWithSecret(row.rows[0] as DbRow) : null);
    } catch (cause) {
      return dbErr(cause);
    }
  }
}

function rowToTarget(r: DbRow): DeployTarget {
  return {
    id: r['id'] as string,
    orgId: r['org_id'] as string,
    slug: r['slug'] as string,
    displayName: r['display_name'] as string,
    kind: r['kind'] as 'dokploy',
    dokployUrl: r['dokploy_url'] as string,
    publicBaseUrl: (r['public_base_url'] ?? null) as string | null,
    dokployProjectId: (r['dokploy_project_id'] ?? null) as string | null,
    dokployProjectName: (r['dokploy_project_name'] ?? null) as string | null,
    allowCreateProject: r['allow_create_project'] as boolean,
    apiTokenRedacted: '***',
    eventBus: r['event_bus_config'] as EventBusConfig,
    policyValues: r['policy_values'] as PolicyValues,
    isDefault: r['is_default'] as boolean,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  };
}

function rowToTargetWithSecret(r: DbRow): DeployTargetWithSecret {
  const target = rowToTarget(r);
  return {
    id: target.id,
    orgId: target.orgId,
    slug: target.slug,
    displayName: target.displayName,
    kind: target.kind,
    dokployUrl: target.dokployUrl,
    publicBaseUrl: target.publicBaseUrl,
    dokployProjectId: target.dokployProjectId,
    dokployProjectName: target.dokployProjectName,
    allowCreateProject: target.allowCreateProject,
    eventBus: target.eventBus,
    policyValues: target.policyValues,
    isDefault: target.isDefault,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    apiTokenCiphertext: r['api_token_ciphertext'] as Buffer,
    apiTokenNonce: r['api_token_nonce'] as Buffer,
    apiTokenKeyVersion: Number(r['api_token_key_version']),
  };
}

function addSet(sets: string[], values: unknown[], column: string, value: unknown): void {
  if (value === undefined) return;
  values.push(value);
  sets.push(`${column}=$${values.length}`);
}

async function audit(
  db: PgQueryable,
  args: {
    orgId: string;
    actorAccountId: string;
    actorTokenId: string | null;
    action: string;
    resourceId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (org_id, actor_account_id, actor_token_id, action, resource_kind, resource_id, payload)
     VALUES ($1,$2,$3,$4,'deploy_target',$5,$6::jsonb)`,
    [
      args.orgId,
      args.actorAccountId,
      args.actorTokenId,
      args.action,
      args.resourceId,
      JSON.stringify(args.payload),
    ],
  );
}

async function withOptionalTransaction<T>(
  db: PgQueryable,
  fn: (db: PgQueryable) => Promise<Result<T, PlatformError>>,
): Promise<Result<T, PlatformError>> {
  if (!isPool(db)) return fn(db);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    if (result.ok) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
    return result;
  } catch (cause) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failures and return the original error below
    }
    throw cause;
  } finally {
    client.release();
  }
}

function isPool(db: PgQueryable): db is Pool {
  return typeof (db as { release?: unknown }).release !== 'function';
}

function notFound(slug: string): Result<never, PlatformError> {
  return err([{ code: 'DEPLOY_TARGET_NOT_FOUND', message: slug }]);
}

function dbErr(cause: unknown): Result<never, PlatformError> {
  return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
}
