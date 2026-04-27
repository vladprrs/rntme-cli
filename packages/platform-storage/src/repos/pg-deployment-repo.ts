import { Buffer } from 'node:buffer';
import type { Pool } from 'pg';
import {
  err,
  ok,
  type Deployment,
  type DeploymentLogLine,
  type DeploymentRepo,
  type DeploymentStatus,
  type PlatformError,
  type Result,
  type VerificationReport,
} from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

type DbRow = Record<string, unknown>;

const LOG_MESSAGE_LIMIT_BYTES = 8 * 1024;
const TRUNCATED_SUFFIX = '... (truncated)';

export class PgDeploymentRepo implements DeploymentRepo {
  constructor(private readonly db: PgQueryable) {}

  async create(
    args: Parameters<DeploymentRepo['create']>[0],
  ): Promise<Result<Deployment, PlatformError>> {
    try {
      return await withOptionalTransaction(this.db, async (db) => {
        const inserted = await db.query(
          `INSERT INTO deployment (
             id, project_id, org_id, project_version_id, target_id,
             config_overrides, started_by_account_id
           )
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
           RETURNING *`,
          [
            args.row.id,
            args.row.projectId,
            args.row.orgId,
            args.row.projectVersionId,
            args.row.targetId,
            jsonParam(args.row.configOverrides),
            args.row.startedByAccountId,
          ],
        );
        const row = inserted.rows[0] as DbRow;
        await audit(db, {
          orgId: args.row.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'deployment.created',
          resourceId: args.row.id,
          payload: {
            projectId: args.row.projectId,
            projectVersionId: args.row.projectVersionId,
            targetId: args.row.targetId,
          },
        });
        return ok(rowToDeployment(row));
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async getById(id: string): Promise<Result<Deployment | null, PlatformError>> {
    try {
      const row = await this.db.query(
        `SELECT * FROM deployment WHERE id=$1 LIMIT 1`,
        [id],
      );
      return ok(row.rows[0] ? rowToDeployment(row.rows[0] as DbRow) : null);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async listByProject(
    projectId: string,
    opts: { status?: DeploymentStatus[]; limit: number; cursor?: Date },
  ): Promise<Result<readonly Deployment[], PlatformError>> {
    try {
      if (opts.status && opts.status.length === 0) return ok([]);
      const where = ['project_id=$1'];
      const values: unknown[] = [projectId];
      if (opts.status) {
        values.push(opts.status);
        where.push(`status = ANY($${values.length}::deployment_status[])`);
      }
      if (opts.cursor) {
        values.push(opts.cursor);
        where.push(`queued_at < $${values.length}`);
      }
      values.push(opts.limit);
      const rows = await this.db.query(
        `SELECT * FROM deployment
         WHERE ${where.join(' AND ')}
         ORDER BY queued_at DESC, id DESC
         LIMIT $${values.length}`,
        values,
      );
      return ok(rows.rows.map((row) => rowToDeployment(row as DbRow)));
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async transition(
    id: string,
    status: 'running',
    side: { startedAt: Date },
  ): Promise<Result<void, PlatformError>> {
    try {
      const updated = await this.db.query(
        `UPDATE deployment
         SET status=$2, started_at=$3, last_heartbeat_at=$3
         WHERE id=$1 AND status='queued'
         RETURNING id, org_id, started_by_account_id`,
        [id, status, side.startedAt],
      );
      const row = updated.rows[0] as DbRow | undefined;
      if (!row) return invalidTransition(id);
      await audit(this.db, {
        orgId: row['org_id'] as string,
        actorAccountId: row['started_by_account_id'] as string,
        actorTokenId: null,
        action: 'deployment.transitioned',
        resourceId: id,
        payload: { status },
      });
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async setRenderedDigest(
    id: string,
    digest: string,
  ): Promise<Result<void, PlatformError>> {
    try {
      await this.db.query(
        `UPDATE deployment SET rendered_plan_digest=$2 WHERE id=$1`,
        [id, digest],
      );
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async setApplyResult(
    id: string,
    applyResult: Record<string, unknown>,
  ): Promise<Result<void, PlatformError>> {
    try {
      await this.db.query(`UPDATE deployment SET apply_result=$2::jsonb WHERE id=$1`, [
        id,
        jsonParam(applyResult),
      ]);
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async finalize(
    id: string,
    args: Parameters<DeploymentRepo['finalize']>[1],
  ): Promise<Result<void, PlatformError>> {
    try {
      const updated = await this.db.query(
        `UPDATE deployment
         SET status=$2,
             finished_at=now(),
             error_code=$3,
             error_message=$4,
             apply_result=COALESCE($5::jsonb, apply_result),
             verification_report=$6::jsonb,
             warnings=$7::jsonb
         WHERE id=$1
           AND status NOT IN ('succeeded','succeeded_with_warnings','failed','failed_orphaned')
         RETURNING id, org_id, started_by_account_id, status`,
        [
          id,
          args.status,
          args.errorCode ?? null,
          args.errorMessage ?? null,
          jsonParam(args.applyResult ?? null),
          jsonParam(args.verificationReport ?? null),
          jsonParam(args.warnings ?? []),
        ],
      );
      const row = updated.rows[0] as DbRow | undefined;
      if (row) {
        await audit(this.db, {
          orgId: row['org_id'] as string,
          actorAccountId: row['started_by_account_id'] as string,
          actorTokenId: null,
          action: 'deployment.finalized',
          resourceId: id,
          payload: { status: row['status'] as string },
        });
      }
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async touchHeartbeat(id: string): Promise<Result<void, PlatformError>> {
    try {
      await this.db.query(
        `UPDATE deployment SET last_heartbeat_at=now() WHERE id=$1 AND status='running'`,
        [id],
      );
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async appendLog(
    args: Parameters<DeploymentRepo['appendLog']>[0],
  ): Promise<Result<void, PlatformError>> {
    try {
      await this.db.query(
        `INSERT INTO deployment_log_line (deployment_id, org_id, level, step, message)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          args.deploymentId,
          args.orgId,
          args.level,
          args.step,
          truncateMessage(args.message),
        ],
      );
      return ok(undefined);
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async readLogs(
    args: Parameters<DeploymentRepo['readLogs']>[0],
  ): Promise<
    Result<
      { lines: readonly DeploymentLogLine[]; lastLineId: number },
      PlatformError
    >
  > {
    try {
      const rows = await this.db.query(
        `SELECT * FROM deployment_log_line
         WHERE deployment_id=$1 AND id>$2
         ORDER BY id ASC
         LIMIT $3`,
        [args.deploymentId, args.sinceLineId, args.limit],
      );
      const lines = rows.rows.map((row) => rowToLogLine(row as DbRow));
      return ok({
        lines,
        lastLineId: lines[lines.length - 1]?.id ?? args.sinceLineId,
      });
    } catch (cause) {
      return dbErr(cause);
    }
  }

  async findStaleRunning(
    staleAfterSeconds: number,
  ): Promise<Result<readonly { id: string; orgId: string }[], PlatformError>> {
    try {
      const rows = await withSystemRlsDisabled(this.db, async (db) =>
        db.query(
          `SELECT id, org_id
           FROM deployment
           WHERE status='running'
             AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - ($1 * interval '1 second'))
           ORDER BY queued_at ASC`,
          [staleAfterSeconds],
        ),
      );
      return ok(
        rows.rows.map((row) => ({
          id: row['id'] as string,
          orgId: row['org_id'] as string,
        })),
      );
    } catch (cause) {
      return dbErr(cause);
    }
  }
}

function rowToDeployment(r: DbRow): Deployment {
  return {
    id: r['id'] as string,
    projectId: r['project_id'] as string,
    orgId: r['org_id'] as string,
    projectVersionId: r['project_version_id'] as string,
    targetId: r['target_id'] as string,
    status: r['status'] as DeploymentStatus,
    configOverrides: r['config_overrides'] as Record<string, unknown>,
    renderedPlanDigest: (r['rendered_plan_digest'] ?? null) as string | null,
    applyResult: (r['apply_result'] ?? null) as Record<string, unknown> | null,
    verificationReport: (r['verification_report'] ??
      null) as VerificationReport | null,
    warnings: r['warnings'] as unknown[],
    errorCode: (r['error_code'] ?? null) as string | null,
    errorMessage: (r['error_message'] ?? null) as string | null,
    startedByAccountId: r['started_by_account_id'] as string,
    queuedAt: r['queued_at'] as Date,
    startedAt: (r['started_at'] ?? null) as Date | null,
    finishedAt: (r['finished_at'] ?? null) as Date | null,
    lastHeartbeatAt: (r['last_heartbeat_at'] ?? null) as Date | null,
  };
}

function rowToLogLine(r: DbRow): DeploymentLogLine {
  return {
    id: Number(r['id']),
    deploymentId: r['deployment_id'] as string,
    orgId: r['org_id'] as string,
    ts: r['ts'] as Date,
    level: r['level'] as 'info' | 'warn' | 'error',
    step: r['step'] as string,
    message: r['message'] as string,
  };
}

function truncateMessage(message: string): string {
  const bytes = Buffer.byteLength(message, 'utf8');
  if (bytes <= LOG_MESSAGE_LIMIT_BYTES) return message;

  let out = '';
  let used = 0;
  const payloadLimit = LOG_MESSAGE_LIMIT_BYTES - Buffer.byteLength(TRUNCATED_SUFFIX, 'utf8');
  for (const ch of message) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (used + chBytes > payloadLimit) break;
    out += ch;
    used += chBytes;
  }
  return `${out}${TRUNCATED_SUFFIX}`;
}

function jsonParam(value: unknown): string | null {
  return value === null ? null : JSON.stringify(value);
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
     VALUES ($1,$2,$3,$4,'deployment',$5,$6::jsonb)`,
    [
      args.orgId,
      args.actorAccountId,
      args.actorTokenId,
      args.action,
      args.resourceId,
      jsonParam(args.payload),
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

async function withSystemRlsDisabled<T>(
  db: PgQueryable,
  fn: (db: PgQueryable) => Promise<T>,
): Promise<T> {
  if (!isPool(db)) {
    // System sweeps run outside an org-scoped tenant transaction. This assumes
    // the caller supplied an owner/admin client that can disable RLS locally.
    await db.query('SET LOCAL row_security = off');
    return fn(db);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL row_security = off');
    const result = await fn(client);
    await client.query('COMMIT');
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

function invalidTransition(id: string): Result<never, PlatformError> {
  return err([
    {
      code: 'DEPLOYMENT_INVALID_TRANSITION',
      message: id,
    },
  ]);
}

function dbErr(cause: unknown): Result<never, PlatformError> {
  return err([
    { code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause },
  ]);
}
