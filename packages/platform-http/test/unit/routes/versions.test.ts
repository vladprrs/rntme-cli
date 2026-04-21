import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { SeededIds, ok } from '@rntme-cli/platform-core';
import { FakeStore } from '@rntme-cli/platform-core/testing';
import { versionRoutes } from '../../../src/routes/versions.js';
import { requireAuth } from '../../../src/middleware/auth.js';
import { minimalValidBundle } from '../../../../platform-core/test/fixtures/bundles/minimal-valid.js';

async function makeApp() {
  const store = new FakeStore();
  const ids = new SeededIds(['v-1', 'v-2', 'v-3']);
  const org = await store.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u', email: null, displayName: 'U' });
  const proj = await store.projects.create({ id: 'p-1', orgId: org.id, slug: 'pr', displayName: 'P' });
  if (!proj.ok) throw new Error('seed');
  const svc = await store.services.create({
    id: 's-1',
    orgId: org.id,
    projectId: proj.value.id,
    slug: 'sv',
    displayName: 'S',
  });
  if (!svc.ok) throw new Error('seed');
  const subject = {
    account: { id: acct.id, workosUserId: 'u', displayName: 'U', email: null },
    org: { id: org.id, workosOrgId: 'org_1', slug: 'o1' },
    role: 'member' as const,
    scopes: ['project:read', 'project:write', 'version:publish'] as readonly string[],
    tokenId: undefined,
  };
  const resolveDeps = () =>
    ({
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
      workosEventLog: store.workosEventLog,
      projects: store.projects,
      services: store.services,
      artifacts: store.artifacts,
      tags: store.tags,
      tokens: store.tokensRepo,
      audit: store.auditRepo,
      outbox: store.outboxRepo,
    }) as never;
  const app = new Hono()
    .use(requireAuth([{ name: 'api-token', authenticate: async () => ok(subject as never) }]))
    .route(
      '/v1/orgs/:orgSlug/projects/:projSlug/services/:svcSlug',
      versionRoutes({ blob: store.blob, ids, resolveDeps }),
    );
  return { app, store };
}

describe('version routes', () => {
  it('POST /versions publishes seq=1', async () => {
    const { app } = await makeApp();
    const r = await app.request('/v1/orgs/o1/projects/pr/services/sv/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ bundle: minimalValidBundle }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { version: { seq: number } };
    expect(body.version.seq).toBe(1);
  });
  it('PUT /tags/:name creates tag', async () => {
    const { app } = await makeApp();
    await app.request('/v1/orgs/o1/projects/pr/services/sv/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ bundle: minimalValidBundle }),
    });
    const r = await app.request('/v1/orgs/o1/projects/pr/services/sv/tags/stable', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: 'Bearer rntme_pat_x' },
      body: JSON.stringify({ versionSeq: 1 }),
    });
    expect(r.status).toBe(200);
  });
});
