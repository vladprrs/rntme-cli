import { Hono } from 'hono';
import type { WorkOSClient } from '../auth/workos-client.js';
import {
  syncWorkosEvent,
  type OrganizationRepo,
  type AccountRepo,
  type MembershipMirrorRepo,
  type ProjectRepo,
  type WorkosEventLogRepo,
  isOk,
} from '@rntme-cli/platform-core';

export function webhookWorkosRoute(deps: {
  workos: WorkOSClient;
  secret: string;
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    projects: ProjectRepo;
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
    const r = await syncWorkosEvent({ repos: deps.repos }, event as never);
    if (!isOk(r)) return c.json({ error: r.errors[0] }, 500);
    return c.json({ ok: true });
  });
  return app;
}
