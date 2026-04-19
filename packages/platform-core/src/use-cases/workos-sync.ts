import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { OrganizationRepo } from '../repos/org-repo.js';
import type { AccountRepo } from '../repos/account-repo.js';
import type { MembershipMirrorRepo } from '../repos/membership-mirror-repo.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { TokenRepo } from '../repos/token-repo.js';
import type { WorkosEventLogRepo } from '../repos/workos-event-log-repo.js';
import { archiveOrgCascade } from './archive-org-cascade.js';

/**
 * A minimal transaction port. The caller (HTTP layer) injects a function that
 * opens a pg transaction, SET LOCAL app.org_id, and passes an opaque `TxHandle`
 * into `fn`. The same handle is then passed to `makeTxRepos` to build
 * TX-scoped repos. This keeps `platform-core` free of any `pg` import while
 * still letting the `organization.deleted` branch run atomically.
 *
 * `fn` may return a sentinel so the caller can distinguish "claimed" vs
 * "already processed" deliveries. Throwing from `fn` must trigger ROLLBACK.
 */
export type OrgTxRunner<THandle> = <T>(
  orgId: string,
  fn: (tx: THandle) => Promise<T>,
) => Promise<T>;

export type TxCascadeRepos = {
  organizations: OrganizationRepo;
  projects: ProjectRepo;
  tokens: TokenRepo;
};

/**
 * Claim the workos_event_log row INSIDE the TX. Returns true iff this caller
 * won the race (INSERT actually wrote the row).
 */
export type ClaimWorkosEvent<THandle> = (
  tx: THandle,
  eventId: string,
  eventType: string,
) => Promise<boolean>;

type Deps<THandle> = {
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    projects: ProjectRepo;
    tokens: TokenRepo;
    workosEventLog: WorkosEventLogRepo;
  };
  /** Opens an org-scoped TX. Required for the `organization.deleted` branch. */
  withOrgTx?: OrgTxRunner<THandle>;
  /** Builds TX-scoped cascade repos from a handle. Required if `withOrgTx` set. */
  makeTxCascadeRepos?: (tx: THandle) => TxCascadeRepos;
  /** Atomic idempotency claim inside the TX. Required if `withOrgTx` set. */
  claimWorkosEvent?: ClaimWorkosEvent<THandle>;
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

export async function syncWorkosEvent<THandle = unknown>(
  deps: Deps<THandle>,
  ev: WorkosEvent,
): Promise<Result<void, PlatformError>> {
  // `organization.deleted` has its OWN idempotency claim inside the TX — skip
  // the outer hasProcessed short-circuit so two concurrent deliveries race on
  // the INSERT, not on this check.
  if (ev.type !== 'organization.deleted') {
    const seen = await deps.repos.workosEventLog.hasProcessed(ev.id);
    if (!isOk(seen)) return seen;
    if (seen.value) return ok(undefined);
  }

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
      // Use the including-archived finder so re-deliveries after the org is
      // already archived still locate it (and then no-op via the claim).
      const found = await deps.repos.organizations.findByWorkosIdIncludingArchived(ev.data.id);
      if (!isOk(found)) return found;
      if (!found.value) {
        // Nothing to cascade. Still record the event in the log so retries are
        // cheap. Safe via the outer markProcessed below.
        const mark = await deps.repos.workosEventLog.markProcessed(ev.id, ev.type);
        if (!isOk(mark)) return mark;
        return ok(undefined);
      }
      if (!deps.withOrgTx || !deps.makeTxCascadeRepos || !deps.claimWorkosEvent) {
        return err([
          {
            code: 'PLATFORM_INTERNAL',
            message:
              'organization.deleted handler requires withOrgTx + makeTxCascadeRepos + claimWorkosEvent',
          },
        ]);
      }
      const orgIdResolved = found.value.id;
      try {
        await deps.withOrgTx(orgIdResolved, async (tx) => {
          const claimed = await deps.claimWorkosEvent!(tx, ev.id, ev.type);
          if (!claimed) return;
          const repos = deps.makeTxCascadeRepos!(tx);
          const cascade = await archiveOrgCascade({ repos }, { orgId: orgIdResolved });
          if (!isOk(cascade)) {
            throw new Error(`cascade failed: ${JSON.stringify(cascade.errors)}`);
          }
        });
      } catch (cause) {
        return err([{ code: 'PLATFORM_INTERNAL', message: String(cause), cause }]);
      }
      // Claim lives inside the TX; skip the outer markProcessed for this branch.
      return ok(undefined);
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
