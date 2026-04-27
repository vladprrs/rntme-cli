import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('tenant isolation', () => {
  let env: E2eEnv;

  async function seedOrgWithToken(slug: string, workosId: string, workosUser: string) {
    const org = await env.seedRepos.organizations.upsertFromWorkos({
      workosOrganizationId: workosId,
      slug,
      displayName: slug,
    });
    const acc = await env.seedRepos.accounts.upsertFromWorkos({
      workosUserId: workosUser,
      email: null,
      displayName: workosUser,
    });
    if (!org.ok || !acc.ok) throw new Error('seed');
    await env.ownerPool.query(
      `INSERT INTO membership_mirror (org_id, account_id, role)
       VALUES ($1,$2,'admin')
       ON CONFLICT (org_id, account_id) DO UPDATE SET role=EXCLUDED.role, updated_at=now()`,
      [org.value.id, acc.value.id],
    );
    const plain = 'rntme_pat_' + randomUUID().replace(/-/g, '').slice(0, 22);
    const hash = new Uint8Array(createHash('sha256').update(plain).digest());
    await env.ownerPool.query(
      `INSERT INTO api_token (id, org_id, account_id, name, token_hash, prefix, scopes, expires_at)
       VALUES ($1,$2,$3,'t',$4,$5,$6,NULL)`,
      [
        randomUUID(),
        org.value.id,
        acc.value.id,
        Buffer.from(hash),
        plain.slice(0, 12),
        ['project:read', 'project:write', 'version:publish'],
      ]
    );
    return { plain, slug };
  }

  beforeAll(async () => {
    env = await bootE2e();
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('token A cannot read/write org B projects', async () => {
    const A = await seedOrgWithToken('orga', 'org_a', 'user_a');
    const B = await seedOrgWithToken('orgb', 'org_b', 'user_b');

    // A creates project in orga
    let r = await env.app.request(`/v1/orgs/${A.slug}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${A.plain}` },
      body: JSON.stringify({ slug: 'only-a', displayName: 'A' }),
    });
    expect(r.status).toBe(201);

    // A tries to hit orgb's scope → 403
    r = await env.app.request(`/v1/orgs/${B.slug}/projects`, { headers: { authorization: `Bearer ${A.plain}` } });
    expect(r.status).toBe(403);

    // B lists its own projects → empty
    r = await env.app.request(`/v1/orgs/${B.slug}/projects`, { headers: { authorization: `Bearer ${B.plain}` } });
    expect(r.status).toBe(200);
    const list = await r.json();
    expect(Array.isArray(list.projects) ? list.projects.length : 0).toBe(0);
  });
});
