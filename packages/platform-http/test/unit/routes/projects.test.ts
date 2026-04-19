import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { FakeStore, SeededIds } from '@rntme-cli/platform-core';
import { projectRoutes } from '../../../src/routes/projects.js';
import { requireAuth } from '../../../src/middleware/auth.js';
import { ok } from '@rntme-cli/platform-core';

async function makeApp() {
  const store = new FakeStore();
  const ids = new SeededIds(['p-1']);
  const org = await store.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u', email: null, displayName: 'U' });
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
    .route('/v1/orgs/:orgSlug/projects', projectRoutes({ organizations: store.organizations, projects: store.projects, ids }));
  return { app, store };
}

describe('project routes', () => {
  it('POST creates project', async () => {
    const { app } = await makeApp();
    const r = await app.request('/v1/orgs/o1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ slug: 'proj', displayName: 'P' }),
    });
    expect(r.status).toBe(201);
  });
  it('GET lists projects', async () => {
    const { app } = await makeApp();
    await app.request('/v1/orgs/o1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ slug: 'proj', displayName: 'P' }),
    });
    const r = await app.request('/v1/orgs/o1/projects', { headers: { authorization: 'Bearer rntme_pat_x' } });
    expect(r.status).toBe(200);
  });
  it('cross-org access 403', async () => {
    const { app } = await makeApp();
    const r = await app.request('/v1/orgs/other-org/projects', { headers: { authorization: 'Bearer rntme_pat_x' } });
    expect(r.status).toBe(403);
  });
});
