import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { bootE2e, type E2eEnv } from './harness.js';
import { minimalValidBundle } from '../../../platform-core/test/fixtures/bundles/minimal-valid.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('agent workflow', () => {
  let env: E2eEnv;
  let bearer: string;
  let orgSlug: string;

  beforeAll(async () => {
    env = await bootE2e();
    // Seed: one org, one account, one membership, one admin token (bypassing WorkOS for e2e speed).
    const o = await env.deps.repos.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_e2e',
      slug: 'e2e',
      displayName: 'E2E',
    });
    const a = await env.deps.repos.accounts.upsertFromWorkos({
      workosUserId: 'user_e2e',
      email: 'e2e@example.com',
      displayName: 'E2E User',
    });
    if (!o.ok || !a.ok) throw new Error('seed org/account failed');
    await env.deps.repos.memberships.upsert({ orgId: o.value.id, accountId: a.value.id, role: 'admin' });
    const plain = 'rntme_pat_' + 'a'.repeat(22);
    const hash = new Uint8Array(createHash('sha256').update(plain).digest());
    await env.deps.repos.tokens.create({
      id: randomUUID(),
      orgId: o.value.id,
      accountId: a.value.id,
      name: 'e2e',
      tokenHash: hash,
      prefix: plain.slice(0, 12),
      scopes: ['project:read', 'project:write', 'version:publish', 'member:read', 'token:manage'],
      expiresAt: null,
    });
    bearer = plain;
    orgSlug = o.value.slug;
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('create project → service → publish → tag → republish', async () => {
    const H = { 'content-type': 'application/json', authorization: `Bearer ${bearer}` };

    // create project
    let r = await env.app.request(`/v1/orgs/${orgSlug}/projects`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'proj', displayName: 'Proj' }),
    });
    expect(r.status).toBe(201);

    // create service
    r = await env.app.request(`/v1/orgs/${orgSlug}/projects/proj/services`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'svc', displayName: 'Svc' }),
    });
    expect(r.status).toBe(201);

    // publish v1
    r = await env.app.request(`/v1/orgs/${orgSlug}/projects/proj/services/svc/versions`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ bundle: minimalValidBundle, moveTags: ['stable'] }),
    });
    expect(r.status).toBe(201);
    const v1 = await r.json();
    expect(v1.seq).toBe(1);

    // move tag stable to v1 (idempotent)
    r = await env.app.request(`/v1/orgs/${orgSlug}/projects/proj/services/svc/tags/stable`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ versionSeq: 1 }),
    });
    expect(r.status).toBe(200);

    // re-publish same bundle → 200 same seq (idempotency)
    r = await env.app.request(`/v1/orgs/${orgSlug}/projects/proj/services/svc/versions`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ bundle: minimalValidBundle }),
    });
    expect([200, 201]).toContain(r.status);
    const v2 = await r.json();
    expect(v2.seq).toBe(1);

    // list versions
    r = await env.app.request(`/v1/orgs/${orgSlug}/projects/proj/services/svc/versions`, { headers: H });
    expect(r.status).toBe(200);
    const list = await r.json();
    expect(Array.isArray(list)).toBe(true);
  });
});
