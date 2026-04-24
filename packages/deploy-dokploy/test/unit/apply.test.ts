import { describe, expect, it } from 'vitest';
import { applyDokployPlan } from '../../src/apply.js';
import type { DokployClient, DokployProjectRef } from '../../src/client.js';
import type { RenderedDokployPlan, RenderedDokployResource } from '../../src/render.js';

const rendered: RenderedDokployPlan = {
  target: { kind: 'dokploy', endpoint: 'https://dokploy.example.com' },
  targetProject: { mode: 'existing', projectId: 'project_123' },
  resources: [
    {
      logicalId: 'catalog',
      kind: 'application',
      workloadKind: 'domain-service',
      workloadSlug: 'catalog',
      name: 'rntme-acme-commerce-catalog',
      image: 'rntme-runtime',
      env: [
        { name: 'RNTME_EVENT_BUS_BROKERS', value: 'redpanda.internal:9092', secret: false },
      ],
      labels: { 'rntme.workload': 'catalog' },
    },
  ],
  urls: {
    projectUrl: 'https://commerce.example.com',
    publicRoutes: [{ routeId: 'http:/api/catalog', url: 'https://commerce.example.com/api/catalog' }],
  },
  digest: 'sha256:abc',
  warnings: [],
};

describe('applyDokployPlan', () => {
  it('creates missing resources and returns structured result', async () => {
    const client = new FakeDokployClient();
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources).toEqual([
      {
        logicalId: 'catalog',
        workloadSlug: 'catalog',
        kind: 'domain-service',
        targetResourceId: 'app_1',
        targetResourceName: 'rntme-acme-commerce-catalog',
        action: 'created',
      },
    ]);
    expect(r.value.urls.publicRoutes[0]?.url).toBe('https://commerce.example.com/api/catalog');
    expect(client.createCalls).toEqual([
      {
        projectId: 'project_123',
        resource: expect.objectContaining({
          name: 'rntme-acme-commerce-catalog',
          labels: { 'rntme.workload': 'catalog' },
        }),
      },
    ]);
    expect(r.value.verificationHints.healthUrl).toBe('https://commerce.example.com/health');
    expect(r.value.verificationHints.uiUrl).toBeUndefined();
    expect(JSON.stringify(r.value)).not.toContain('token');
  });

  it('joins trailing slash project URLs for health checks and includes UI hints when present', async () => {
    const client = new FakeDokployClient();
    const r = await applyDokployPlan(
      {
        ...rendered,
        urls: {
          ...rendered.urls,
          projectUrl: 'https://commerce.example.com/',
          uiUrl: 'https://commerce.example.com/app',
        },
      },
      client,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.verificationHints.healthUrl).toBe('https://commerce.example.com/health');
    expect(r.value.verificationHints.uiUrl).toBe('https://commerce.example.com/app');
  });

  it('updates existing resources by name and labels', async () => {
    const client = new FakeDokployClient([
      {
        id: 'app_existing',
        name: 'rntme-acme-commerce-catalog',
      },
    ]);
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0]).toMatchObject({
      targetResourceId: 'app_existing',
      action: 'updated',
    });
    expect(client.updateCalls).toEqual([
      {
        applicationId: 'app_existing',
        resource: expect.objectContaining({
          labels: { 'rntme.workload': 'catalog' },
        }),
      },
    ]);
  });

  it('returns partial failure metadata with applied resources and retry safety', async () => {
    const client = new FakeDokployClient(
      [{ id: 'app_existing', name: 'rntme-acme-commerce-billing' }],
      { failFindFor: 'rntme-acme-commerce-search' },
    );
    const r = await applyDokployPlan(
      {
        ...rendered,
        resources: [
          resource({ logicalId: 'catalog', workloadSlug: 'catalog', name: 'rntme-acme-commerce-catalog' }),
          resource({ logicalId: 'billing', workloadSlug: 'billing', name: 'rntme-acme-commerce-billing' }),
          resource({ logicalId: 'search', workloadSlug: 'search', name: 'rntme-acme-commerce-search' }),
        ],
      },
      client,
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
          message: 'failed while applying resource "rntme-acme-commerce-search"',
          resource: 'rntme-acme-commerce-search',
          partialFailure: {
            createdResources: [
              {
                logicalId: 'catalog',
                workloadSlug: 'catalog',
                kind: 'domain-service',
                targetResourceId: 'app_1',
                targetResourceName: 'rntme-acme-commerce-catalog',
                action: 'created',
              },
            ],
            updatedResources: [
              {
                logicalId: 'billing',
                workloadSlug: 'billing',
                kind: 'domain-service',
                targetResourceId: 'app_existing',
                targetResourceName: 'rntme-acme-commerce-billing',
                action: 'updated',
              },
            ],
            failedStep: {
              action: 'find',
              resourceName: 'rntme-acme-commerce-search',
              workloadSlug: 'search',
            },
            retrySafe: true,
          },
        }),
      );
      expect(JSON.stringify(r.errors)).not.toContain('dokploy-token-secret');
    }
  });

  it('reports create as the failed step when application creation fails', async () => {
    const client = new FakeDokployClient([], { failCreateFor: 'rntme-acme-commerce-catalog' });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
          resource: 'rntme-acme-commerce-catalog',
          partialFailure: expect.objectContaining({
            failedStep: {
              action: 'create',
              resourceName: 'rntme-acme-commerce-catalog',
              workloadSlug: 'catalog',
            },
            retrySafe: true,
          }),
        }),
      );
      expect(JSON.stringify(r.errors)).not.toContain('dokploy-token-secret');
    }
  });

  it('reports update as the failed step when application update fails', async () => {
    const client = new FakeDokployClient(
      [{ id: 'app_existing', name: 'rntme-acme-commerce-catalog' }],
      { failUpdateFor: 'rntme-acme-commerce-catalog' },
    );
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
          resource: 'rntme-acme-commerce-catalog',
          partialFailure: expect.objectContaining({
            failedStep: {
              action: 'update',
              resourceName: 'rntme-acme-commerce-catalog',
              workloadSlug: 'catalog',
            },
            retrySafe: true,
          }),
        }),
      );
      expect(JSON.stringify(r.errors)).not.toContain('dokploy-token-secret');
    }
  });

  it('returns project initialization failures with a sanitized cause', async () => {
    const client = new FakeDokployClient([], { failProject: true });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_APPLY_DOKPLOY_API_ERROR',
        }),
      );
      expect(JSON.stringify(r.errors)).not.toContain('dokploy-token-secret');
    }
  });
});

class FakeDokployClient implements DokployClient {
  private readonly apps = new Map<string, { id: string; name: string }>();
  readonly createCalls: Array<{
    readonly projectId: string;
    readonly resource: RenderedDokployResource;
  }> = [];
  readonly updateCalls: Array<{
    readonly applicationId: string;
    readonly resource: RenderedDokployResource;
  }> = [];

  private next = 1;

  constructor(
    existing: Array<{ id: string; name: string }> = [],
    private readonly failures: {
      readonly failProject?: boolean;
      readonly failFindFor?: string;
      readonly failCreateFor?: string;
      readonly failUpdateFor?: string;
    } = {},
  ) {
    for (const app of existing) this.apps.set(app.name, app);
  }

  async ensureProject(ref: DokployProjectRef): Promise<{ projectId: string }> {
    if (this.failures.failProject === true) throw secretError('project failed');
    if (ref.mode === 'existing') return { projectId: ref.projectId };
    return { projectId: 'project_created' };
  }

  async findApplicationByName(
    projectId: string,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    void projectId;
    if (this.failures.failFindFor === name) throw secretError('find failed');
    return this.apps.get(name) ?? null;
  }

  async createApplication(
    projectId: string,
    input: RenderedDokployResource,
  ): Promise<{ id: string; name: string }> {
    if (this.failures.failCreateFor === input.name) throw secretError('create failed');
    this.createCalls.push({ projectId, resource: input });
    const app = { id: `app_${this.next++}`, name: input.name };
    this.apps.set(app.name, app);
    return app;
  }

  async updateApplication(
    id: string,
    input: RenderedDokployResource,
  ): Promise<{ id: string; name: string }> {
    if (this.failures.failUpdateFor === input.name) throw secretError('update failed');
    this.updateCalls.push({ applicationId: id, resource: input });
    const app = { id, name: input.name };
    this.apps.set(input.name, app);
    return app;
  }
}

function resource(overrides: Partial<RenderedDokployResource>): RenderedDokployResource {
  return {
    ...rendered.resources[0],
    ...overrides,
    labels: { 'rntme.workload': overrides.workloadSlug ?? rendered.resources[0].workloadSlug },
  };
}

function secretError(message: string): Error & { readonly token: string } {
  return Object.assign(new Error(`${message}: dokploy-token-secret`), {
    token: 'dokploy-token-secret',
  });
}
