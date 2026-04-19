import type { MembershipMirror } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface MembershipMirrorRepo {
  find(orgId: string, accountId: string): Promise<Result<MembershipMirror | null, PlatformError>>;
  upsert(row: { orgId: string; accountId: string; role: string }): Promise<Result<MembershipMirror, PlatformError>>;
  delete(orgId: string, accountId: string): Promise<Result<void, PlatformError>>;
  listForAccount(accountId: string): Promise<Result<readonly MembershipMirror[], PlatformError>>;
}
