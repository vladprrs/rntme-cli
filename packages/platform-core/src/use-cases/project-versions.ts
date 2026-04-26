import { gzipSync } from 'node:zlib';
import type { BlobStore } from '../blob/store.js';
import type { Ids } from '../ids.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { ProjectVersionRepo } from '../repos/project-version-repo.js';
import type {
  ProjectVersion,
  ProjectVersionSummary,
} from '../schemas/project-version.js';
import { isOk, ok, type PlatformError, type Result } from '../types/result.js';

type Deps = {
  repos: {
    projects: ProjectRepo;
    projectVersions: ProjectVersionRepo;
  };
  blob: BlobStore;
  ids: Ids;
};

export type PublishProjectVersionInput = {
  readonly orgId: string;
  readonly projectId: string;
  readonly accountId: string;
  readonly tokenId: string | null;
  readonly bundleBytes: Buffer;
  readonly bundleDigest: string;
  readonly summary: ProjectVersionSummary;
};

export async function publishProjectVersion(
  deps: Deps,
  input: PublishProjectVersionInput,
): Promise<Result<ProjectVersion, PlatformError>> {
  const existing = await deps.repos.projectVersions.findByDigest(
    input.projectId,
    input.bundleDigest,
  );
  if (!isOk(existing)) return existing;
  if (existing.value) return ok(existing.value);

  const blobKey = projectVersionBlobKey(input.projectId, input.bundleDigest);
  const upload = await deps.blob.putIfAbsent(blobKey, gzipSync(input.bundleBytes));
  if (!isOk(upload)) return upload;

  return deps.repos.projectVersions.create({
    projectId: input.projectId,
    row: {
      id: deps.ids.uuid(),
      orgId: input.orgId,
      bundleDigest: input.bundleDigest,
      bundleBlobKey: blobKey,
      bundleSizeBytes: input.bundleBytes.byteLength,
      summary: input.summary,
      uploadedByAccountId: input.accountId,
    },
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export function projectVersionBlobKey(projectId: string, digest: string): string {
  const hex = digest.startsWith('sha256:') ? digest.slice(7) : digest;
  return `projects/${projectId}/versions/sha256-${hex}.json.gz`;
}

export async function listProjectVersions(
  deps: { repos: { projectVersions: ProjectVersionRepo } },
  input: { projectId: string; limit: number; cursor: number | undefined },
): Promise<Result<readonly ProjectVersion[], PlatformError>> {
  return deps.repos.projectVersions.listByProject(input.projectId, {
    limit: input.limit,
    cursor: input.cursor,
  });
}

export async function getProjectVersion(
  deps: { repos: { projectVersions: ProjectVersionRepo } },
  input: { projectId: string; seq: number },
): Promise<Result<ProjectVersion | null, PlatformError>> {
  return deps.repos.projectVersions.getBySeq(input.projectId, input.seq);
}
