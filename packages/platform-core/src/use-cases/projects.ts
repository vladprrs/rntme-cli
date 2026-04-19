import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { Project } from '../schemas/entities.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { Ids } from '../ids.js';

type Deps = { repos: { projects: ProjectRepo }; ids?: Ids };

export async function createProject(
  deps: Deps & { ids: Ids },
  input: { orgId: string; slug: string; displayName: string },
): Promise<Result<Project, PlatformError>> {
  const id = deps.ids.uuid();
  return deps.repos.projects.create({ id, orgId: input.orgId, slug: input.slug, displayName: input.displayName });
}

export async function listProjects(
  deps: Deps,
  input: { orgId: string; includeArchived: boolean },
): Promise<Result<readonly Project[], PlatformError>> {
  return deps.repos.projects.list(input.orgId, { includeArchived: input.includeArchived });
}

export async function getProject(
  deps: Deps,
  input: { orgId: string; id: string },
): Promise<Result<Project, PlatformError>> {
  const r = await deps.repos.projects.findById(input.orgId, input.id);
  if (!isOk(r)) return r;
  if (!r.value) return err([{ code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: input.id }]);
  return ok(r.value);
}

export async function patchProject(
  deps: Deps,
  input: { orgId: string; id: string; displayName: string },
): Promise<Result<Project, PlatformError>> {
  return deps.repos.projects.patch(input.orgId, input.id, { displayName: input.displayName });
}

export async function archiveProject(
  deps: Deps,
  input: { orgId: string; id: string },
): Promise<Result<Project, PlatformError>> {
  return deps.repos.projects.archive(input.orgId, input.id);
}
