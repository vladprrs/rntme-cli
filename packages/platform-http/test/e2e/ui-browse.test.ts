import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('UI browse pages', () => {
  let env: E2eEnv;
  let bearer: string;
  let orgSlug: string;

  beforeAll(async () => {
    env = await bootE2e();
    const o = await env.deps.poolRepos.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_ui',
      slug: 'ui-org',
      displayName: 'UI Org',
    });
    const a = await env.deps.poolRepos.accounts.upsertFromWorkos({
      workosUserId: 'user_ui',
      email: 'ui@example.com',
      displayName: 'UI User',
    });
    if (!o.ok || !a.ok) throw new Error('seed failed');
    await env.deps.poolRepos.memberships.upsert({ orgId: o.value.id, accountId: a.value.id, role: 'admin' });
    const plain = 'rntme_pat_' + 'b'.repeat(22);
    const hash = new Uint8Array(createHash('sha256').update(plain).digest());
    await env.deps.poolRepos.tokens.create({
      id: randomUUID(),
      orgId: o.value.id,
      accountId: a.value.id,
      name: 'ui-test',
      tokenHash: hash,
      prefix: plain.slice(0, 12),
      scopes: ['project:read', 'project:write', 'version:publish', 'member:read', 'token:manage'],
      expiresAt: null,
    });
    bearer = plain;
    orgSlug = o.value.slug;

    // seed a project via API
    const H = { 'content-type': 'application/json', authorization: `Bearer ${bearer}` };
    await env.app.request(`/v1/orgs/${orgSlug}/projects`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'proj-a', displayName: 'Project A' }),
    });
    await env.app.request(`/v1/orgs/${orgSlug}/projects/proj-a/services`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'svc-x', displayName: 'Service X' }),
    });
    const minimal = (await import('../../../platform-core/test/fixtures/bundles/minimal-valid.js')).minimalValidBundle;
    await env.app.request(`/v1/orgs/${orgSlug}/projects/proj-a/services/svc-x/versions`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ bundle: minimal, moveTags: ['stable'] }),
    });
  }, 300_000);

  afterAll(async () => env.teardown());

  it('GET /{orgSlug} authed → 200 with project slug', async () => {
    const r = await env.app.request(`/${orgSlug}`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('proj-a');
    expect(body).toContain('Project A');
  });

  it('GET /{wrongOrg} authed → 403 HTML', async () => {
    const r = await env.app.request('/some-other-org', {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('GET /{orgSlug} unauth → 302 /login', async () => {
    const r = await env.app.request(`/${orgSlug}`);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });

  it('GET /{orgSlug}/projects/{projSlug} → 200 with services', async () => {
    const r = await env.app.request(`/${orgSlug}/projects/proj-a`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Project A');
    expect(body).toContain('svc-x');
    expect(body).toContain('Service X');
  });

  it('GET /{orgSlug}/projects/{projSlug}/services/{svcSlug} → 200 with version', async () => {
    const r = await env.app.request(`/${orgSlug}/projects/proj-a/services/svc-x`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Service X');
    expect(body).toContain('#1');
    expect(body).toContain('stable');
  });

  it('GET /{orgSlug}/projects/missing → 404 HTML', async () => {
    const r = await env.app.request(`/${orgSlug}/projects/nope`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('GET /{orgSlug}/audit → 200 HTML', async () => {
    const r = await env.app.request(`/${orgSlug}/audit`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('Audit');
  });
});
