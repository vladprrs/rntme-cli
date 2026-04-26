import type { Context } from 'hono';
import { isOk } from '@rntme-cli/platform-core';
import type { Result, PlatformError } from '@rntme-cli/platform-core';
import type { OrganizationRepo, ProjectRepo } from '@rntme-cli/platform-core';
import { errorEnvelope, statusForCode } from '../middleware/error-handler.js';

export function respond<T>(
  c: Context,
  r: Result<T, PlatformError>,
  okStatus = 200,
  wrapKey?: string,
) {
  if (isOk(r)) {
    const body = wrapKey ? { [wrapKey]: r.value } : r.value;
    return c.json(body as never, okStatus as never);
  }
  const first = r.errors[0] ?? { code: 'PLATFORM_INTERNAL' as const, message: 'unknown' };
  return c.json(errorEnvelope(r.errors), statusForCode(first.code) as never);
}

export async function resolveProject(
  repos: { organizations: OrganizationRepo; projects: ProjectRepo },
  orgSlug: string,
  projSlug: string,
) {
  const org = await repos.organizations.findBySlug(orgSlug);
  if (!isOk(org)) return org;
  if (!org.value) return { ok: false as const, errors: [{ code: 'PLATFORM_TENANCY_ORG_NOT_FOUND' as const, message: orgSlug }] };
  const proj = await repos.projects.findBySlug(org.value.id, projSlug);
  if (!isOk(proj)) return proj;
  if (!proj.value)
    return { ok: false as const, errors: [{ code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND' as const, message: projSlug }] };
  if (proj.value.archivedAt)
    return { ok: false as const, errors: [{ code: 'PLATFORM_TENANCY_RESOURCE_ARCHIVED' as const, message: projSlug }] };
  return { ok: true as const, value: { org: org.value, project: proj.value } };
}
