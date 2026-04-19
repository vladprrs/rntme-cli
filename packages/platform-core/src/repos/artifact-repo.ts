import type { ArtifactVersion } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export type PublishInsertRow = Omit<ArtifactVersion, 'id' | 'seq' | 'publishedAt'> & { id: string };

export interface ArtifactRepo {
  findByDigest(serviceId: string, bundleDigest: string): Promise<Result<ArtifactVersion | null, PlatformError>>;
  latestSeq(serviceId: string): Promise<Result<number, PlatformError>>;

  publish(args: {
    serviceId: string;
    expectedPreviousSeq: number | undefined;
    row: PublishInsertRow;
    outboxPayload: Record<string, unknown>;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
    moveTags: readonly { name: string; updatedByAccountId: string }[];
  }): Promise<Result<ArtifactVersion, PlatformError>>;

  listBySeq(
    serviceId: string,
    opts: { limit: number; cursor: number | undefined },
  ): Promise<Result<readonly ArtifactVersion[], PlatformError>>;
  getBySeq(serviceId: string, seq: number): Promise<Result<ArtifactVersion | null, PlatformError>>;
}
