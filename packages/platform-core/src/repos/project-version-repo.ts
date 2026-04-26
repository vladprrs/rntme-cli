import type {
  ProjectVersion,
  ProjectVersionSummary,
} from '../schemas/project-version.js';
import type { PlatformError, Result } from '../types/result.js';

export type ProjectVersionInsertRow = {
  readonly id: string;
  readonly orgId: string;
  readonly bundleDigest: string;
  readonly bundleBlobKey: string;
  readonly bundleSizeBytes: number;
  readonly summary: ProjectVersionSummary;
  readonly uploadedByAccountId: string;
};

export interface ProjectVersionRepo {
  create(args: {
    projectId: string;
    row: ProjectVersionInsertRow;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<ProjectVersion, PlatformError>>;

  findByDigest(
    projectId: string,
    bundleDigest: string,
  ): Promise<Result<ProjectVersion | null, PlatformError>>;

  getBySeq(
    projectId: string,
    seq: number,
  ): Promise<Result<ProjectVersion | null, PlatformError>>;

  getById(id: string): Promise<Result<ProjectVersion | null, PlatformError>>;

  listByProject(
    projectId: string,
    opts: { limit: number; cursor: number | undefined },
  ): Promise<Result<readonly ProjectVersion[], PlatformError>>;
}
