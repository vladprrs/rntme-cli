import { Hono } from 'hono';
import type { Ids } from '@rntme-cli/platform-core';
import { respond } from './helpers.js';
import { isOk } from '@rntme-cli/platform-core';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import type { PoolClient } from 'pg';

export function orgRoutes(deps: {
  ids: Ids;
  resolveDeps?: (tx: PoolClient) => RequestRepos;
}): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;

  app.get('/', async (c) => {
    const repos = resolve(c.get('tx'));
    const s = c.get('subject');
    const r = await repos.organizations.listForAccount(s.account.id);
    return respond(c, r);
  });

  app.get('/:orgSlug', async (c) => {
    const repos = resolve(c.get('tx'));
    const s = c.get('subject');
    if (s.org.slug !== c.req.param('orgSlug'))
      return c.json({ error: { code: 'PLATFORM_AUTH_FORBIDDEN', message: 'org mismatch' } }, 403);
    const r = await repos.organizations.findBySlug(c.req.param('orgSlug'));
    if (!isOk(r)) return respond(c, r);
    if (!r.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_ORG_NOT_FOUND', message: c.req.param('orgSlug') } }, 404);
    return c.json({ org: r.value });
  });

  return app;
}
