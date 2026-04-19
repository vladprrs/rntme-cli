import type { ApiToken } from '../schemas/entities.js';
import type { Scope } from '../auth/scopes.js';
import type { Result, PlatformError } from '../types/result.js';

export interface TokenRepo {
  create(row: {
    id: string;
    orgId: string;
    accountId: string;
    name: string;
    tokenHash: Uint8Array;
    prefix: string;
    scopes: readonly Scope[];
    expiresAt: Date | null;
  }): Promise<Result<ApiToken, PlatformError>>;
  findByPrefix(prefix: string): Promise<Result<ApiToken | null, PlatformError>>;
  list(orgId: string): Promise<Result<readonly ApiToken[], PlatformError>>;
  revoke(orgId: string, id: string): Promise<Result<void, PlatformError>>;
  touchLastUsed(id: string): Promise<Result<void, PlatformError>>;
}
