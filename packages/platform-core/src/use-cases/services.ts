import { ok, isOk, type Result, type PlatformError } from '../types/result.js';
import type { Service, ArtifactVersion, ArtifactTag } from '../schemas/entities.js';
import type { ServiceRepo } from '../repos/service-repo.js';
import type { Ids } from '../ids.js';

type Deps = { repos: { services: ServiceRepo } };

export async function createService(
  deps: Deps & { ids: Ids },
  input: { orgId: string; projectId: string; slug: string; displayName: string },
): Promise<Result<Service, PlatformError>> {
  return deps.repos.services.create({
    id: deps.ids.uuid(),
    orgId: input.orgId,
    projectId: input.projectId,
    slug: input.slug,
    displayName: input.displayName,
  });
}

export async function listServices(
  deps: Deps,
  input: { orgId: string; projectId: string },
): Promise<Result<readonly Service[], PlatformError>> {
  return deps.repos.services.list(input.orgId, input.projectId);
}

export async function getServiceDetail(
  deps: Deps,
  input: { orgId: string; id: string },
): Promise<
  Result<
    { service: Service; latestVersion: ArtifactVersion | null; tags: readonly ArtifactTag[] },
    PlatformError
  >
> {
  const r = await deps.repos.services.detailWithLatest(input.orgId, input.id);
  if (!isOk(r)) return r;
  return ok(r.value);
}

export async function patchService(
  deps: Deps,
  input: { orgId: string; id: string; displayName: string },
): Promise<Result<Service, PlatformError>> {
  return deps.repos.services.patch(input.orgId, input.id, { displayName: input.displayName });
}

export async function archiveService(
  deps: Deps,
  input: { orgId: string; id: string },
): Promise<Result<Service, PlatformError>> {
  return deps.repos.services.archive(input.orgId, input.id);
}
