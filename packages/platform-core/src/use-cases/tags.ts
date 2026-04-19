import { err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { ArtifactTag } from '../schemas/entities.js';
import type { TagRepo } from '../repos/tag-repo.js';
import type { ArtifactRepo } from '../repos/artifact-repo.js';

type Deps = { repos: { tags: TagRepo; artifacts?: ArtifactRepo } };

export async function listTags(
  deps: Deps,
  input: { serviceId: string },
): Promise<Result<readonly ArtifactTag[], PlatformError>> {
  return deps.repos.tags.list(input.serviceId);
}

export async function moveTag(
  deps: { repos: { tags: TagRepo; artifacts: ArtifactRepo } },
  input: { serviceId: string; name: string; versionSeq: number; updatedByAccountId: string },
): Promise<Result<ArtifactTag, PlatformError>> {
  const ver = await deps.repos.artifacts.getBySeq(input.serviceId, input.versionSeq);
  if (!isOk(ver)) return ver;
  if (!ver.value) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: `version seq ${input.versionSeq} missing` }]);
  return deps.repos.tags.move({
    serviceId: input.serviceId,
    name: input.name,
    versionId: ver.value.id,
    updatedByAccountId: input.updatedByAccountId,
  });
}

export async function deleteTag(
  deps: Deps,
  input: { serviceId: string; name: string; actorAccountId: string },
): Promise<Result<void, PlatformError>> {
  return deps.repos.tags.delete(input.serviceId, input.name, input.actorAccountId);
}
