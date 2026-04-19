import { ok, isOk, type Result, type PlatformError } from '../types/result.js';
import type { OrganizationRepo } from '../repos/org-repo.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { TokenRepo } from '../repos/token-repo.js';

export type ArchiveOrgCascadeDeps = {
  repos: {
    organizations: OrganizationRepo;
    projects: ProjectRepo;
    tokens: TokenRepo;
  };
};

export type ArchiveOrgCascadeOutput = {
  projectsArchived: number;
  tokensRevoked: number;
};

/**
 * Atomic org archive cascade — expected to run inside a caller-provided
 * transaction (e.g. `withTransaction`). Archives every live project, revokes
 * every live API token, and marks the org itself archived. The caller is
 * responsible for wrapping the repos in a single-TX client so partial failures
 * roll back.
 */
export async function archiveOrgCascade(
  deps: ArchiveOrgCascadeDeps,
  input: { orgId: string },
): Promise<Result<ArchiveOrgCascadeOutput, PlatformError>> {
  const projList = await deps.repos.projects.list(input.orgId, { includeArchived: false });
  if (!isOk(projList)) return projList;
  let projectsArchived = 0;
  for (const p of projList.value) {
    const a = await deps.repos.projects.archive(input.orgId, p.id);
    if (!isOk(a)) return a;
    projectsArchived++;
  }
  const rev = await deps.repos.tokens.revokeAllForOrg(input.orgId);
  if (!isOk(rev)) return rev;
  const arc = await deps.repos.organizations.archive(input.orgId);
  if (!isOk(arc)) return arc;
  return ok({ projectsArchived, tokensRevoked: rev.value });
}
