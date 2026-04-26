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
  let orgSlug: string;
  let projectSlug: string;

  beforeAll(async () => {
    env = await bootE2e();
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('publishes, replays idempotently, lists, shows, and stores a project bundle', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    orgSlug = `upload-org-${suffix}`;
    projectSlug = `catalog-${suffix}`;
    const auth = await seedOrgWithToken(env, orgSlug, `upload_org_${suffix}`, `upload_user_${suffix}`);

    const created = await env.app.request(`/v1/orgs/${orgSlug}/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.plain}`,
      },
      body: JSON.stringify({ slug: projectSlug, displayName: 'Catalog' }),
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

    const list = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/versions`, {
      headers: { authorization: `Bearer ${auth.plain}` },
    });
    expect(list.status).toBe(200);
    const listJson = await list.json() as { versions: ProjectVersionResponse['version'][] };
    expect(listJson.versions).toHaveLength(1);
    expect(listJson.versions[0]?.bundleDigest).toBe(built.digest);

    const show = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/versions/1`, {
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
    return env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/versions`, {
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
  const org = await env.ownerPool.query<{ id: string }>(
    `INSERT INTO organization (id, workos_organization_id, slug, display_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (workos_organization_id) DO UPDATE SET slug=EXCLUDED.slug, display_name=EXCLUDED.display_name
     RETURNING id`,
    [randomUUID(), workosId, slug, slug],
  );
  const acc = await env.ownerPool.query<{ id: string }>(
    `INSERT INTO account (id, workos_user_id, email, display_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (workos_user_id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name
     RETURNING id`,
    [randomUUID(), workosUser, null, workosUser],
  );
  await env.ownerPool.query(
    `INSERT INTO membership_mirror (org_id, account_id, role)
     VALUES ($1,$2,'admin')
     ON CONFLICT (org_id, account_id) DO UPDATE SET role=EXCLUDED.role, updated_at=now()`,
    [org.rows[0]!.id, acc.rows[0]!.id],
  );
  const plain = 'rntme_pat_' + randomUUID().replace(/-/g, '').slice(0, 22);
  const hash = new Uint8Array(createHash('sha256').update(plain).digest());
  await env.ownerPool.query(
    `INSERT INTO api_token (id, org_id, account_id, name, token_hash, prefix, scopes, expires_at)
     VALUES ($1,$2,$3,'upload',$4,$5,$6,NULL)`,
    [
      randomUUID(),
      org.rows[0]!.id,
      acc.rows[0]!.id,
      Buffer.from(hash),
      plain.slice(0, 12),
      ['project:read', 'project:write', 'version:publish'],
    ],
  );
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
