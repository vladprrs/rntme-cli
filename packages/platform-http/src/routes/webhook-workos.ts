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
  app.post('/workos', async (c) => {
    const sig = c.req.header('workos-signature') ?? '';
    const payload = await c.req.text();
    let event: unknown;
    try {
      event = await deps.workos.webhooks.constructEvent({ payload, sigHeader: sig, secret: deps.secret });
    } catch (cause) {
      return c.json({ error: { code: 'PLATFORM_WORKOS_WEBHOOK_INVALID', message: String(cause) } }, 400);
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
