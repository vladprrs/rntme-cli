import { Hono } from 'hono';
import type { Pool, PoolClient } from 'pg';
import type { WorkOSClient } from '../auth/workos-client.js';
import {
  syncWorkosEvent,
  type OrganizationRepo,
  type AccountRepo,
  type MembershipMirrorRepo,
  type ProjectRepo,
  type TokenRepo,
  type WorkosEventLogRepo,
  isOk,
} from '@rntme-cli/platform-core';
import { withTransaction, PgOrganizationRepo, PgProjectRepo, PgTokenRepo } from '@rntme-cli/platform-storage';

export function webhookWorkosRoute(deps: {
  workos: WorkOSClient;
  secret: string;
  pool: Pool;
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    projects: ProjectRepo;
    tokens: TokenRepo;
    workosEventLog: WorkosEventLogRepo;
  };
}): Hono {
  const app = new Hono();

  // Self-heal helper: organization_membership.* events reference org and
  // account mirrors. If the predecessor organization.created / user.created
  // webhook was missed (e.g. the entity predates this service's deploy),
  // pull the authoritative record from WorkOS and upsert the mirror before
  // syncWorkosEvent runs — otherwise the membership sync returns 500, WorkOS
  // retries, and we never converge.
  async function ensureOrgMirror(workosOrgId: string): Promise<void> {
    const existing = await deps.repos.organizations.findByWorkosId(workosOrgId);
    if (isOk(existing) && existing.value) return;
    try {
      const wosOrg = await deps.workos.organizations.getOrganization(workosOrgId);
      const name = wosOrg.name ?? workosOrgId;
      const derivedSlug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || workosOrgId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
      const slug = wosOrg.slug ?? derivedSlug;
      await deps.repos.organizations.upsertFromWorkos({
        workosOrganizationId: workosOrgId,
        slug,
        displayName: name,
      });
    } catch {
      /* best-effort — the event will 500 and retry */
    }
  }

  async function ensureAccountMirror(workosUserId: string): Promise<void> {
    const existing = await deps.repos.accounts.findByWorkosUserId(workosUserId);
    if (isOk(existing) && existing.value) return;
    try {
      const user = await deps.workos.userManagement.getUser(workosUserId);
      await deps.repos.accounts.upsertFromWorkos({
        workosUserId,
        email: user.email ?? null,
        displayName:
          `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || workosUserId,
      });
    } catch {
      /* best-effort */
    }
  }

  app.post('/workos', async (c) => {
    const sig = c.req.header('workos-signature') ?? '';
    const rawBody = await c.req.text();
    let event: unknown;
    try {
      const payload = JSON.parse(rawBody) as unknown;
      event = await deps.workos.webhooks.constructEvent({ payload, sigHeader: sig, secret: deps.secret });
    } catch (cause) {
      return c.json({ error: { code: 'PLATFORM_WORKOS_WEBHOOK_INVALID', message: String(cause) } }, 400);
    }

    const typed = event as { event?: string; data?: { organization_id?: string; user_id?: string } };
    if (
      typed.event === 'organization_membership.created' ||
      typed.event === 'organization_membership.deleted'
    ) {
      if (typed.data?.organization_id) await ensureOrgMirror(typed.data.organization_id);
      if (typed.data?.user_id) await ensureAccountMirror(typed.data.user_id);
    }

    const r = await syncWorkosEvent(
      {
        repos: deps.repos,
        withOrgTx: <T>(orgId: string, fn: (tx: PoolClient) => Promise<T>) =>
          withTransaction(deps.pool, orgId, fn),
        makeTxCascadeRepos: (tx: PoolClient) => ({
          organizations: new PgOrganizationRepo(tx),
          projects: new PgProjectRepo(tx),
          tokens: new PgTokenRepo(tx),
        }),
        claimWorkosEvent: async (tx, eventId, eventType) => {
          const res = await tx.query(
            `INSERT INTO workos_event_log (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
            [eventId, eventType],
          );
          return (res.rowCount ?? 0) > 0;
        },
      },
      event as never,
    );
    if (!isOk(r)) return c.json({ error: r.errors[0] }, 500);
    return c.json({ ok: true });
  });
  return app;
}
