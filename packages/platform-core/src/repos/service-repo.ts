import type { Service, ArtifactVersion, ArtifactTag } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface ServiceRepo {
  create(row: {
    id: string;
    orgId: string;
    projectId: string;
    slug: string;
    displayName: string;
  }): Promise<Result<Service, PlatformError>>;
  findBySlug(projectId: string, slug: string): Promise<Result<Service | null, PlatformError>>;
  findById(orgId: string, id: string): Promise<Result<Service | null, PlatformError>>;
  list(orgId: string, projectId: string): Promise<Result<readonly Service[], PlatformError>>;
  patch(orgId: string, id: string, patch: { displayName: string }): Promise<Result<Service, PlatformError>>;
  archive(orgId: string, id: string): Promise<Result<Service, PlatformError>>;
  detailWithLatest(orgId: string, id: string): Promise<
    Result<
      {
        service: Service;
        latestVersion: ArtifactVersion | null;
        tags: readonly ArtifactTag[];
      },
      PlatformError
    >
  >;
}
