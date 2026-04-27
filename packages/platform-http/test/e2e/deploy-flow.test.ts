import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  canonicalBundleDigest,
  canonicalize,
  isOk,
  type CanonicalBundle,
} from '@rntme-cli/platform-core';
import { createDokployClientFactory } from '../../src/deploy/dokploy-client-factory.js';
import { runDeployment } from '../../src/deploy/executor.js';
import { SmokeVerifier } from '../../src/deploy/smoke-verifier.js';
import { resolveDeps } from '../../src/resolve-deps.js';
import { createMockDokployApp } from '../fixtures/mock-dokploy.js';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('deploy flow', () => {
  let env: E2eEnv;
  const scheduled: { deploymentId: string; orgId: string }[] = [];

  beforeAll(async () => {
    env = await bootE2e({
      scheduleDeployment: (deploymentId, orgId) => {
        scheduled.push({ deploymentId, orgId });
      },
    });
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('queues and executes a happy-path Dokploy deployment', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    const orgSlug = `deploy-org-${suffix}`;
    const projectSlug = `catalog-${suffix}`;
    const auth = await seedOrgWithToken(env, orgSlug, `deploy_org_${suffix}`, `deploy_user_${suffix}`);

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
    const published = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/versions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/rntme-project-bundle+json',
        authorization: `Bearer ${auth.plain}`,
      },
      body: built.bytes,
    });
    expect(published.status).toBe(201);

    const target = await env.app.request(`/v1/orgs/${orgSlug}/deploy-targets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.plain}`,
      },
      body: JSON.stringify({
        slug: 'preview',
        displayName: 'Preview',
        kind: 'dokploy',
        dokployUrl: 'http://mock-dokploy.local/api',
        dokployProjectName: `rntme-${suffix}`,
        allowCreateProject: true,
        apiToken: 'dokploy-token',
        eventBus: {
          kind: 'kafka',
          mode: 'external',
          brokers: ['redpanda:9092'],
        },
        policyValues: {
          requestContext: {
            default: {
              requestIdHeader: 'x-request-id',
              correlationIdHeader: 'x-correlation-id',
            },
          },
        },
        isDefault: true,
      }),
    });
    expect(target.status).toBe(201);

    const queued = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/deployments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.plain}`,
      },
      body: JSON.stringify({
        projectVersionSeq: 1,
        targetSlug: 'preview',
        configOverrides: {
          integrationModuleImages: {
            'mod-workos': 'ghcr.io/rntme/mod-workos:test',
          },
        },
      }),
    });
    expect(queued.status).toBe(202);
    const queuedJson = await queued.json() as { deployment: { id: string; status: string } };
    expect(queuedJson.deployment.status).toBe('queued');
    expect(scheduled).toContainEqual({ deploymentId: queuedJson.deployment.id, orgId: auth.orgId });

    const mockDokploy = createMockDokployApp();
    const dokployClientFactory = createDokployClientFactory(env.deps.cipher!, async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      return mockDokploy.app.request(url.pathname, init);
    });

    await runDeployment(queuedJson.deployment.id, auth.orgId, {
      blob: env.deps.blob,
      withOrgTx: async (orgId, fn) => {
        const client = await env.deps.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
          const result = await fn(resolveDeps(client));
          await client.query('COMMIT');
          return result;
        } catch (cause) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw cause;
        } finally {
          client.release();
        }
      },
      orgSlugFor: async () => orgSlug,
      dokployClientFactory,
      smoker: new SmokeVerifier(async () => ({ status: 200, latencyMs: 1, body: 'ok' })),
      logger: env.deps.logger,
      heartbeatMs: 20,
    });

    const show = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/deployments/${queuedJson.deployment.id}`, {
      headers: { authorization: `Bearer ${auth.plain}` },
    });
    expect(show.status).toBe(200);
    const showJson = await show.json() as { deployment: { status: string; renderedPlanDigest: string | null } };
    expect(showJson.deployment.status).toBe('succeeded');
    expect(showJson.deployment.renderedPlanDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(mockDokploy.applications.size).toBeGreaterThan(0);

    const logs = await env.app.request(`/v1/orgs/${orgSlug}/projects/${projectSlug}/deployments/${queuedJson.deployment.id}/logs`, {
      headers: { authorization: `Bearer ${auth.plain}` },
    });
    expect(logs.status).toBe(200);
    const logsJson = await logs.json() as { lines: { step: string; message: string }[] };
    expect(logsJson.lines.map((line) => line.step)).toEqual(
      expect.arrayContaining(['init', 'plan', 'render', 'apply', 'verify']),
    );

    const stored = await env.deps.blob.getRaw((await published.json() as ProjectVersionResponse).version.bundleBlobKey);
    expect(isOk(stored)).toBe(true);
    if (isOk(stored)) expect(gunzipSync(stored.value).toString('utf8')).toBe(built.bytes);
  });
});

async function seedOrgWithToken(
  env: E2eEnv,
  slug: string,
  workosId: string,
  workosUser: string,
): Promise<{ plain: string; orgId: string }> {
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
     VALUES ($1,$2,$3,'deploy',$4,$5,$6,NULL)`,
    [
      randomUUID(),
      org.rows[0]!.id,
      acc.rows[0]!.id,
      Buffer.from(hash),
      plain.slice(0, 12),
      ['project:read', 'project:write', 'version:publish', 'deploy:target:manage', 'deploy:execute'],
    ],
  );
  return { plain, orgId: org.rows[0]!.id };
}

function buildBundle(root: string): { bytes: string; digest: string } {
  const files: Record<string, unknown> = {};
  for (const relPath of collectJsonFiles(root)) {
    files[relPath] = JSON.parse(readFileSync(resolve(root, relPath), 'utf8'));
  }
  files['project.json'] = deployableProjectJson(files['project.json']);
  const bundle: CanonicalBundle = { version: 1, files };
  return { bytes: canonicalize(bundle), digest: canonicalBundleDigest(bundle) };
}

function deployableProjectJson(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const middleware = isRecord(input.middleware)
    ? Object.fromEntries(Object.entries(input.middleware).filter(([, value]) => {
      return !isRecord(value) || value.kind !== 'auth';
    }))
    : input.middleware;
  const mounts = Array.isArray(input.mounts)
    ? input.mounts.map((mount) => {
      if (!isRecord(mount) || !Array.isArray(mount.use)) return mount;
      return {
        ...mount,
        use: mount.use.filter((name) => name !== 'auth'),
      };
    })
    : input.mounts;
  return { ...input, middleware, mounts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    bundleBlobKey: string;
  };
};
