import type { Result, PlatformError } from '../types/result.js';

export interface OutboxRepo {
  // publish() does nothing standalone — outbox rows are inserted inside ArtifactRepo.publish()'s transaction.
  // This interface exists so application code can peek/deliver if desired (delivery is a future task).
  pending(
    limit: number,
  ): Promise<Result<readonly { id: bigint; eventType: string; payload: Record<string, unknown> }[], PlatformError>>;
  markDelivered(id: bigint): Promise<Result<void, PlatformError>>;
}
