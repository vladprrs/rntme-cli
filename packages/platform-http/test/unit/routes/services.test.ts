import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { FakeStore, SeededIds, ok } from '@rntme-cli/platform-core';
import { serviceRoutes } from '../../../src/routes/services.js';
import { requireAuth } from '../../../src/middleware/auth.js';

async function makeApp() {
  const store = new FakeStore();
  const ids = new SeededIds(['s-1']);
  const org = await store.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u', email: null, displayName: 'U' });
  await store.projects.create({ id: 'p-1', orgId: org.id, slug: 'pr', displayName: 'P' });
  const subject = {
    account: { id: acct.id, workosUserId: 'u', displayName: 'U', email: null },
    org: { id: org.id, workosOrgId: 'org_1', slug: 'o1' },
    role: 'member' as const,
    scopes: ['project:read', 'project:write'] as readonly string[],
    tokenId: undefined,
  };
  const fakeProvider = { name: 'api-token' as const, authenticate: async () => ok(subject as never) };
  const app = new Hono()
    .use(requireAuth([fakeProvider]))
    .route(
      '/v1/orgs/:orgSlug/projects/:projSlug/services',
      serviceRoutes({ organizations: store.organizations, projects: store.projects, services: store.services, ids }),
    );
  return { app, store };
}

describe('service routes', () => {
  it('POST creates service', async () => {
    const { app } = await makeApp();
    const r = await app.request('/v1/orgs/o1/projects/pr/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ slug: 'svc', displayName: 'S' }),
    });
    expect(r.status).toBe(201);
  });
});
