import { ok, err, type Result, type PlatformError, type AuditRepo, type AuditLogEntry } from '@rntme-cli/platform-core';
import type { PgQueryable } from '../pg/pool.js';

function row(r: Record<string, unknown>): AuditLogEntry {
  const idVal = r['id'];
  return {
    id: typeof idVal === 'bigint' ? idVal : BigInt(String(idVal)),
    orgId: r['org_id'] as string,
    actorAccountId: r['actor_account_id'] as string,
    actorTokenId: (r['actor_token_id'] as string | null) ?? null,
    action: r['action'] as string,
    resourceKind: r['resource_kind'] as string,
    resourceId: r['resource_id'] as string,
    payload: r['payload'] as Record<string, unknown>,
    createdAt: r['created_at'] as Date,
  };
}

export class PgAuditRepo implements AuditRepo {
  constructor(private readonly db: PgQueryable) {}

  async list(
    orgId: string,
    opts: { resourceKind?: string; actorAccountId?: string; action?: string; since?: Date; limit: number },
  ): Promise<Result<readonly AuditLogEntry[], PlatformError>> {
    try {
      const where: string[] = ['org_id=$1'];
      const vals: unknown[] = [orgId];
      let i = 2;
      if (opts.resourceKind) {
        where.push(`resource_kind=$${i++}`);
        vals.push(opts.resourceKind);
      }
      if (opts.actorAccountId) {
        where.push(`actor_account_id=$${i++}`);
        vals.push(opts.actorAccountId);
      }
      if (opts.action) {
        where.push(`action=$${i++}`);
        vals.push(opts.action);
      }
      if (opts.since) {
        where.push(`created_at >= $${i++}`);
        vals.push(opts.since);
      }
      vals.push(opts.limit);
      const q = await this.db.query(
        `SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i}`,
        vals,
      );
      return ok(q.rows.map((r) => row(r as Record<string, unknown>)));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
