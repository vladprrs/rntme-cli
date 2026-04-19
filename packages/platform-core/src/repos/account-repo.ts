import type { Account } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface AccountRepo {
  findByWorkosUserId(workosUserId: string): Promise<Result<Account | null, PlatformError>>;
  upsertFromWorkos(args: {
    workosUserId: string;
    email: string | null;
    displayName: string;
  }): Promise<Result<Account, PlatformError>>;
  markDeleted(workosUserId: string): Promise<Result<void, PlatformError>>;
}
