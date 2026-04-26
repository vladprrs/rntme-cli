import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  canonicalBundleDigest,
  canonicalize,
  isOk,
  type CanonicalBundle,
} from '@rntme-cli/platform-core';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('project version upload flow', () => {
  let env: E2eEnv;

  beforeAll(async () => {
    env = await bootE2e();
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('publishes, replays idempotently, lists, shows, and stores a project bundle', async () => {
    const auth = await seedOrgWithToken(env, 'upload-org', 'upload_org', 'upload_user');

    const created = await env.app.request('/v1/orgs/upload-org/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.plain}`,
      },
      body: JSON.stringify({ slug: 'catalog', displayName: 'Catalog' }),
    });
    expect(created.status).toBe(201);

    const built = buildBundle(resolve(process.cwd(), '../../../packages/blueprint/test/fixtures/product-catalog-project'));
    expect(built.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const first = await publish(auth.plain, built.bytes);
    expect(first.status).toBe(201);
    const firstJson = await first.json() as ProjectVersionResponse;
    expect(firstJson.version.seq).toBe(1);
    expect(firstJson.version.bundleDigest).toBe(built.digest);
    expect(firstJson.version.bundleSizeBytes).toBe(Buffer.byteLength(built.bytes));
    expect(firstJson.version.summary.projectName).toBe('product-catalog');

    const replay = await publish(auth.plain, built.bytes);
    expect(replay.status).toBe(200);
    const replayJson = await replay.json() as ProjectVersionResponse;
    expect(replayJson.version.seq).toBe(1);
    expect(replayJson.version.id).toBe(firstJson.version.id);

    const list = await env.app.request('/v1/orgs/upload-org/projects/catalog/versions', {
      headers: { authorization: `Bearer ${auth.plain}` },
    });
    expect(list.status).toBe(200);
    const listJson = await list.json() as { versions: ProjectVersionResponse['version'][] };
    expect(listJson.versions).toHaveLength(1);
    expect(listJson.versions[0]?.bundleDigest).toBe(built.digest);

    const show = await env.app.request('/v1/orgs/upload-org/projects/catalog/versions/1', {
      headers: { authorization: `Bearer ${auth.plain}` },
    });
    expect(show.status).toBe(200);
    const showJson = await show.json() as ProjectVersionResponse;
    expect(showJson.version.bundleBlobKey).toBe(firstJson.version.bundleBlobKey);

    const stored = await env.deps.blob.getRaw(firstJson.version.bundleBlobKey);
    expect(isOk(stored)).toBe(true);
    if (isOk(stored)) {
      expect(stored.value.toString('utf8')).toBe(built.bytes);
    }
  });

  async function publish(token: string, bytes: string): Promise<Response> {
    return env.app.request('/v1/orgs/upload-org/projects/catalog/versions', {
      method: 'POST',
      headers: {
        'content-type': 'application/rntme-project-bundle+json',
        authorization: `Bearer ${token}`,
      },
      body: bytes,
    });
  }
});

async function seedOrgWithToken(
  env: E2eEnv,
  slug: string,
  workosId: string,
  workosUser: string,
): Promise<{ plain: string }> {
  const org = await env.deps.poolRepos.organizations.upsertFromWorkos({
    workosOrganizationId: workosId,
    slug,
    displayName: slug,
  });
  const acc = await env.deps.poolRepos.accounts.upsertFromWorkos({
    workosUserId: workosUser,
    email: null,
    displayName: workosUser,
  });
  if (!org.ok || !acc.ok) throw new Error('seed');
  await env.deps.poolRepos.memberships.upsert({ orgId: org.value.id, accountId: acc.value.id, role: 'admin' });
  const plain = 'rntme_pat_' + randomUUID().replace(/-/g, '').slice(0, 22);
  const hash = new Uint8Array(createHash('sha256').update(plain).digest());
  await env.deps.poolRepos.tokens.create({
    id: randomUUID(),
    orgId: org.value.id,
    accountId: acc.value.id,
    name: 'upload',
    tokenHash: hash,
    prefix: plain.slice(0, 12),
    scopes: ['project:read', 'project:write', 'version:publish'],
    expiresAt: null,
  });
  return { plain };
}

function buildBundle(root: string): { bytes: string; digest: string } {
  const files: Record<string, unknown> = {};
  for (const relPath of collectJsonFiles(root)) {
    files[relPath] = JSON.parse(readFileSync(resolve(root, relPath), 'utf8'));
  }
  const bundle: CanonicalBundle = { version: 1, files };
  return { bytes: canonicalize(bundle), digest: canonicalBundleDigest(bundle) };
}

function collectJsonFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = resolve(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
      } else if (st.isFile() && name.endsWith('.json')) {
        out.push(relative(root, abs).split(sep).join('/'));
      }
    }
  }
  walk(root);
  return out.sort();
}

type ProjectVersionResponse = {
  version: {
    id: string;
    seq: number;
    bundleDigest: string;
    bundleBlobKey: string;
    bundleSizeBytes: number;
    summary: {
      projectName: string;
      services: string[];
    };
  };
};
