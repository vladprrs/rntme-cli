import type { AuditLogEntry } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface AuditRepo {
  list(
    orgId: string,
    opts: {
      resourceKind?: string;
      actorAccountId?: string;
      action?: string;
      since?: Date;
      limit: number;
    },
  ): Promise<Result<readonly AuditLogEntry[], PlatformError>>;
}
