import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('UI tokens page', () => {
  let env: E2eEnv;
  let bearer: string;
  let readOnlyBearer: string;
  let orgSlug: string;

  beforeAll(async () => {
    env = await bootE2e();
    const o = await env.seedRepos.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_tok',
      slug: 'tok-org',
      displayName: 'Tok Org',
    });
    const a = await env.seedRepos.accounts.upsertFromWorkos({
      workosUserId: 'user_tok',
      email: 'tok@example.com',
      displayName: 'Tok User',
    });
    if (!o.ok || !a.ok) throw new Error('seed failed');
    const membership = await env.seedRepos.memberships.upsert({ orgId: o.value.id, accountId: a.value.id, role: 'admin' });
    if (!membership.ok) throw new Error('membership seed failed');

    const admin = 'rntme_pat_' + 'c'.repeat(22);
    const adminToken = await env.seedRepos.tokens.create({
      id: randomUUID(),
      orgId: o.value.id,
      accountId: a.value.id,
      name: 'admin',
      tokenHash: new Uint8Array(createHash('sha256').update(admin).digest()),
      prefix: admin.slice(0, 12),
      scopes: ['project:read', 'project:write', 'version:publish', 'member:read', 'token:manage'],
      expiresAt: null,
    });
    if (!adminToken.ok) throw new Error('admin token seed failed');
    bearer = admin;

    const ro = 'rntme_pat_' + 'd'.repeat(22);
    const readOnlyToken = await env.seedRepos.tokens.create({
      id: randomUUID(),
      orgId: o.value.id,
      accountId: a.value.id,
      name: 'readonly',
      tokenHash: new Uint8Array(createHash('sha256').update(ro).digest()),
      prefix: ro.slice(0, 12),
      scopes: ['project:read'],
      expiresAt: null,
    });
    if (!readOnlyToken.ok) throw new Error('read-only token seed failed');
    readOnlyBearer = ro;
    orgSlug = o.value.slug;
  }, 300_000);

  afterAll(async () => env.teardown());

  it('GET /{orgSlug}/tokens with token:manage → 200, shows form', async () => {
    const r = await env.app.request(`/${orgSlug}/tokens`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain(`hx-post="/${orgSlug}/tokens"`);
    expect(body).toContain('admin');
  });

  it('GET /{orgSlug}/tokens without token:manage → 200, no form', async () => {
    const r = await env.app.request(`/${orgSlug}/tokens`, {
      headers: { authorization: `Bearer ${readOnlyBearer}` },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain(`hx-post="/${orgSlug}/tokens"`);
    // list still visible
    expect(body).toContain('admin');
  });

  it('POST /{orgSlug}/tokens with same-origin + token:manage → 200 fragment', async () => {
    const body = new URLSearchParams({
      name: 'ci-test',
      scopes: 'project:read,project:write',
    });
    const r = await env.app.request(`/${orgSlug}/tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/x-www-form-urlencoded',
        Origin: 'http://localhost',
      },
      body: body.toString(),
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('ci-test');
    expect(html).toContain('rntme_pat_');
    expect(html).toContain('hx-swap-oob');
  });

  it('POST /{orgSlug}/tokens from foreign Origin → 403', async () => {
    const body = new URLSearchParams({ name: 'evil', scopes: 'project:read' });
    const r = await env.app.request(`/${orgSlug}/tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/x-www-form-urlencoded',
        Origin: 'https://evil.example',
      },
      body: body.toString(),
    });
    expect(r.status).toBe(403);
  });

  it('POST /{orgSlug}/tokens without token:manage → 403', async () => {
    const body = new URLSearchParams({ name: 'ro-attempt', scopes: 'project:read' });
    const r = await env.app.request(`/${orgSlug}/tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${readOnlyBearer}`,
        'content-type': 'application/x-www-form-urlencoded',
        Origin: 'http://localhost',
      },
      body: body.toString(),
    });
    expect(r.status).toBe(403);
  });

  it('DELETE /{orgSlug}/tokens/{id} with same-origin + token:manage → 200 fragment with revoked badge', async () => {
    // Create a token to revoke.
    const created = await env.app.request(`/${orgSlug}/tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/x-www-form-urlencoded',
        Origin: 'http://localhost',
      },
      body: new URLSearchParams({ name: 'to-revoke', scopes: 'project:read' }).toString(),
    });
    expect(created.status).toBe(200);
    const html = await created.text();
    const idMatch = html.match(/id="token-([^"]+)"/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1];

    const r = await env.app.request(`/${orgSlug}/tokens/${id}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${bearer}`,
        Origin: 'http://localhost',
      },
    });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('revoked');
    expect(body).toContain(`id="token-${id}"`);
  });

  it('DELETE /{orgSlug}/tokens/{id} from foreign Origin → 403', async () => {
    const r = await env.app.request(`/${orgSlug}/tokens/does-not-matter`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${bearer}`,
        Origin: 'https://evil.example',
      },
    });
    expect(r.status).toBe(403);
  });
});
