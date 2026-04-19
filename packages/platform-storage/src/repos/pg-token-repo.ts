import { Buffer } from 'node:buffer';
import type { PgQueryable } from '../pg/pool.js';
import { ok, err, type Result, type PlatformError, type TokenRepo, type ApiToken, type Scope } from '@rntme-cli/platform-core';

function row(r: Record<string, unknown>): ApiToken {
  return {
    id: r['id'] as string,
    orgId: r['org_id'] as string,
    accountId: r['account_id'] as string,
    name: r['name'] as string,
    tokenHash: new Uint8Array(r['token_hash'] as Buffer),
    prefix: r['prefix'] as string,
    scopes: r['scopes'] as Scope[],
    lastUsedAt: (r['last_used_at'] as Date | null) ?? null,
    expiresAt: (r['expires_at'] as Date | null) ?? null,
    revokedAt: (r['revoked_at'] as Date | null) ?? null,
    createdAt: r['created_at'] as Date,
  };
}

export class PgTokenRepo implements TokenRepo {
  constructor(private readonly pool: PgQueryable) {}

  async create(r: {
    id: string;
    orgId: string;
    accountId: string;
    name: string;
    tokenHash: Uint8Array;
    prefix: string;
    scopes: readonly Scope[];
    expiresAt: Date | null;
  }): Promise<Result<ApiToken, PlatformError>> {
    try {
      const q = await this.pool.query(
        `INSERT INTO api_token (id, org_id, account_id, name, token_hash, prefix, scopes, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [r.id, r.orgId, r.accountId, r.name, Buffer.from(r.tokenHash), r.prefix, r.scopes, r.expiresAt],
      );
      return ok(row(q.rows[0] as Record<string, unknown>));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async findByPrefix(prefix: string): Promise<Result<ApiToken | null, PlatformError>> {
    try {
      const q = await this.pool.query(
        `SELECT * FROM api_token WHERE prefix=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
        [prefix],
      );
      return ok(q.rows[0] ? row(q.rows[0] as Record<string, unknown>) : null);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async list(orgId: string): Promise<Result<readonly ApiToken[], PlatformError>> {
    try {
      const q = await this.pool.query(`SELECT * FROM api_token WHERE org_id=$1 ORDER BY created_at DESC`, [orgId]);
      return ok(q.rows.map((x) => row(x as Record<string, unknown>)));
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async revoke(orgId: string, id: string): Promise<Result<void, PlatformError>> {
    try {
      await this.pool.query(`UPDATE api_token SET revoked_at=now() WHERE org_id=$1 AND id=$2`, [orgId, id]);
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }

  async touchLastUsed(id: string): Promise<Result<void, PlatformError>> {
    try {
      await this.pool.query(`UPDATE api_token SET last_used_at=now() WHERE id=$1`, [id]);
      return ok(undefined);
    } catch (cause) {
      return err([{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE', message: String(cause), cause }]);
    }
  }
}
