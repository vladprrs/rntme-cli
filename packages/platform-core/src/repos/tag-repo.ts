import type { ArtifactTag } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface TagRepo {
  list(serviceId: string): Promise<Result<readonly ArtifactTag[], PlatformError>>;
  move(args: {
    serviceId: string;
    name: string;
    versionId: string;
    updatedByAccountId: string;
  }): Promise<Result<ArtifactTag, PlatformError>>;
  delete(serviceId: string, name: string, actorAccountId: string): Promise<Result<void, PlatformError>>;
}
