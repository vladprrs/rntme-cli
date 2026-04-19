import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { OrganizationRepo } from '../repos/org-repo.js';
import type { AccountRepo } from '../repos/account-repo.js';
import type { MembershipMirrorRepo } from '../repos/membership-mirror-repo.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { WorkosEventLogRepo } from '../repos/workos-event-log-repo.js';

type Deps = {
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    projects: ProjectRepo;
    workosEventLog: WorkosEventLogRepo;
  };
};

export type WorkosEvent =
  | { id: string; type: 'user.created' | 'user.updated'; data: { id: string; email: string | null; first_name: string; last_name: string } }
  | { id: string; type: 'user.deleted'; data: { id: string } }
  | { id: string; type: 'organization.created' | 'organization.updated'; data: { id: string; name: string; slug?: string } }
  | { id: string; type: 'organization.deleted'; data: { id: string } }
  | {
      id: string;
      type: 'organization_membership.created';
      data: { id: string; organization_id: string; user_id: string; role: { slug: string } };
    }
  | {
      id: string;
      type: 'organization_membership.deleted';
      data: { id: string; organization_id: string; user_id: string };
    };

export async function syncWorkosEvent(deps: Deps, ev: WorkosEvent): Promise<Result<void, PlatformError>> {
  const seen = await deps.repos.workosEventLog.hasProcessed(ev.id);
  if (!isOk(seen)) return seen;
  if (seen.value) return ok(undefined);

  switch (ev.type) {
    case 'user.created':
    case 'user.updated': {
      const r = await deps.repos.accounts.upsertFromWorkos({
        workosUserId: ev.data.id,
        email: ev.data.email,
        displayName: `${ev.data.first_name} ${ev.data.last_name}`.trim() || ev.data.id,
      });
      if (!isOk(r)) return r;
      break;
    }
    case 'user.deleted': {
      const r = await deps.repos.accounts.markDeleted(ev.data.id);
      if (!isOk(r)) return r;
      break;
    }
    case 'organization.created':
    case 'organization.updated': {
      const slug = ev.data.slug ?? ev.data.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
      const r = await deps.repos.organizations.upsertFromWorkos({
        workosOrganizationId: ev.data.id,
        slug,
        displayName: ev.data.name,
      });
      if (!isOk(r)) return r;
      break;
    }
    case 'organization.deleted': {
      const found = await deps.repos.organizations.findByWorkosId(ev.data.id);
      if (!isOk(found)) return found;
      if (found.value) {
        const list = await deps.repos.projects.list(found.value.id, { includeArchived: false });
        if (!isOk(list)) return list;
        for (const p of list.value) {
          const a = await deps.repos.projects.archive(found.value.id, p.id);
          if (!isOk(a)) return a;
        }
        const d = await deps.repos.organizations.archive(found.value.id);
        if (!isOk(d)) return d;
      }
      break;
    }
    case 'organization_membership.created': {
      const org = await deps.repos.organizations.findByWorkosId(ev.data.organization_id);
      const acc = await deps.repos.accounts.findByWorkosUserId(ev.data.user_id);
      if (!isOk(org)) return org;
      if (!isOk(acc)) return acc;
      if (!org.value || !acc.value) return err([{ code: 'PLATFORM_INTERNAL', message: 'membership sync: org or account missing' }]);
      const r = await deps.repos.memberships.upsert({
        orgId: org.value.id,
        accountId: acc.value.id,
        role: ev.data.role.slug,
      });
      if (!isOk(r)) return r;
      break;
    }
    case 'organization_membership.deleted': {
      const org = await deps.repos.organizations.findByWorkosId(ev.data.organization_id);
      const acc = await deps.repos.accounts.findByWorkosUserId(ev.data.user_id);
      if (!isOk(org)) return org;
      if (!isOk(acc)) return acc;
      if (org.value && acc.value) {
        const r = await deps.repos.memberships.delete(org.value.id, acc.value.id);
        if (!isOk(r)) return r;
      }
      break;
    }
  }

  const mark = await deps.repos.workosEventLog.markProcessed(ev.id, ev.type);
  if (!isOk(mark)) return mark;
  return ok(undefined);
}
