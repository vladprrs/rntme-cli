import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { bootE2e, type E2eEnv } from './harness.js';
import { minimalValidBundle } from '../../../platform-core/test/fixtures/bundles/minimal-valid.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('validation gate', () => {
  let env: E2eEnv;
  let bearer: string;
  let slug: string;

  beforeAll(async () => {
    env = await bootE2e();
    const org = await env.deps.poolRepos.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_gate',
      slug: 'gate',
      displayName: 'Gate',
    });
    const acc = await env.deps.poolRepos.accounts.upsertFromWorkos({
      workosUserId: 'gate_user',
      email: null,
      displayName: 'G',
    });
    if (!org.ok || !acc.ok) throw new Error('seed');
    await env.deps.poolRepos.memberships.upsert({ orgId: org.value.id, accountId: acc.value.id, role: 'admin' });
    const plain = 'rntme_pat_' + 'g'.repeat(22);
    const hash = new Uint8Array(createHash('sha256').update(plain).digest());
    await env.deps.poolRepos.tokens.create({
      id: randomUUID(),
      orgId: org.value.id,
      accountId: acc.value.id,
      name: 'g',
      tokenHash: hash,
      prefix: plain.slice(0, 12),
      scopes: ['project:read', 'project:write', 'version:publish'],
      expiresAt: null,
    });
    bearer = plain;
    slug = 'gate';
    const H = { 'content-type': 'application/json', authorization: `Bearer ${bearer}` };
    await env.app.request(`/v1/orgs/${slug}/projects`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'pr', displayName: 'P' }),
    });
    await env.app.request(`/v1/orgs/${slug}/projects/pr/services`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ slug: 'sv', displayName: 'S' }),
    });
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('broken PDM -> 422 with @rntme/pdm code', async () => {
    const broken = { ...minimalValidBundle, pdm: { entities: [{ name: '!!', fields: [] }] } };
    const r = await env.app.request(`/v1/orgs/${slug}/projects/pr/services/sv/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ bundle: broken }),
    });
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body.error.code).toBe('PLATFORM_VALIDATION_BUNDLE_FAILED');
    expect(body.error.pkg).toBe('pdm');
  });
});
