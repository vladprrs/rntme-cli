import { describe, expect, it } from 'vitest';
import { applyDokployPlan } from '../../src/apply.js';
import type { DokployApplication, DokployClient, DokployProjectRef } from '../../src/client.js';
import type { RenderedDokployPlan, RenderedDokployResource } from '../../src/render.js';

const rendered: RenderedDokployPlan = {
  target: { kind: 'dokploy', endpoint: 'https://dokploy.example.com' },
  targetProject: { mode: 'existing', projectId: 'project_123' },
  deployment: {
    orgSlug: 'acme',
    projectSlug: 'commerce',
    environment: 'default',
    mode: 'preview',
  },
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
    expect(r.value.deployment).toEqual({
      orgSlug: 'acme',
      projectSlug: 'commerce',
      environment: 'default',
      mode: 'preview',
    });
    expect(r.value.urls.publicRoutes[0]?.url).toBe('https://commerce.example.com/api/catalog');
    expect(client.createCalls).toEqual([
      {
        environmentId: 'env_default',
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

  it('configures and deploys created applications before returning success', async () => {
    const client = new FakeDokployClient();
    const resourceWithRuntimeConfig = resource({
      build: {
        kind: 'domain-service-artifact',
        baseImage: 'rntme-runtime',
        image: 'rntme-acme-commerce-catalog:artifact',
        artifact: { source: 'composed-project', serviceSlug: 'catalog' },
        context: {
          kind: 'generated',
          serviceSlug: 'catalog',
          files: ['Dockerfile', 'artifacts/catalog/manifest.json'],
        },
      },
      image: 'rntme-acme-commerce-catalog:artifact',
      ports: [{ containerPort: 8080, protocol: 'http' }],
      ingress: {
        publicBaseUrl: 'https://commerce.example.com',
        containerPort: 8080,
        healthPath: '/health',
        routes: [
          {
            routeId: 'ui:/',
            path: '/',
            url: 'https://commerce.example.com/',
          },
        ],
      },
      files: { '/etc/rntme/generated.json': '{"ok":true}' },
    });

    const r = await applyDokployPlan({ ...rendered, resources: [resourceWithRuntimeConfig] }, client);

    expect(r.ok).toBe(true);
    expect(client.lifecycleCalls).toEqual([
      'create:rntme-acme-commerce-catalog',
      'configure:app_1:rntme-acme-commerce-catalog',
      'deploy:app_1',
    ]);
    expect(client.configureCalls).toEqual([
      {
        applicationId: 'app_1',
        resource: expect.objectContaining({
          build: resourceWithRuntimeConfig.build,
          ports: resourceWithRuntimeConfig.ports,
          ingress: resourceWithRuntimeConfig.ingress,
          files: resourceWithRuntimeConfig.files,
        }),
      },
    ]);
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

  it('leaves existing resources unchanged when comparable current state matches', async () => {
    const client = new FakeDokployClient([
      {
        id: 'app_existing',
        name: 'rntme-acme-commerce-catalog',
        image: 'rntme-runtime',
        env: rendered.resources[0].env,
        labels: { 'rntme.workload': 'catalog' },
      },
    ]);
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0]).toEqual({
      logicalId: 'catalog',
      workloadSlug: 'catalog',
      kind: 'domain-service',
      targetResourceId: 'app_existing',
      targetResourceName: 'rntme-acme-commerce-catalog',
      action: 'unchanged',
    });
    expect(client.updateCalls).toEqual([]);
  });

  it('updates existing resources when comparable current state differs', async () => {
    const client = new FakeDokployClient([
      {
        id: 'app_existing',
        name: 'rntme-acme-commerce-catalog',
        image: 'outdated-image',
        env: rendered.resources[0].env,
        labels: { 'rntme.workload': 'catalog' },
      },
    ]);
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0]).toMatchObject({
      targetResourceId: 'app_existing',
      action: 'updated',
    });
    expect(client.updateCalls).toHaveLength(1);
  });

  it('updates existing resources when rendered build, ports, or ingress metadata is missing from current state', async () => {
    const resourceWithMetadata = resource({
      build: {
        kind: 'domain-service-artifact',
        baseImage: 'rntme-runtime',
        image: 'rntme-acme-commerce-catalog:artifact',
        artifact: { source: 'composed-project', serviceSlug: 'catalog' },
        context: {
          kind: 'generated',
          serviceSlug: 'catalog',
          files: ['Dockerfile', 'artifacts/catalog/manifest.json'],
        },
      },
      image: 'rntme-acme-commerce-catalog:artifact',
      ports: [{ containerPort: 8080, protocol: 'http' }],
      ingress: {
        publicBaseUrl: 'https://commerce.example.com',
        containerPort: 8080,
        healthPath: '/health',
        routes: [
          {
            routeId: 'http:/api/catalog',
            path: '/api/catalog',
            url: 'https://commerce.example.com/api/catalog',
          },
        ],
      },
    });
    const client = new FakeDokployClient([
      {
        id: 'app_existing',
        name: 'rntme-acme-commerce-catalog',
        image: 'rntme-acme-commerce-catalog:artifact',
        env: resourceWithMetadata.env,
        labels: resourceWithMetadata.labels,
      },
    ]);
    const r = await applyDokployPlan({ ...rendered, resources: [resourceWithMetadata] }, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0]).toMatchObject({
      targetResourceId: 'app_existing',
      action: 'updated',
    });
    expect(client.updateCalls).toHaveLength(1);
  });

  it('leaves existing resources unchanged when rendered build, ports, and ingress metadata matches', async () => {
    const resourceWithMetadata = resource({
      build: {
        kind: 'domain-service-artifact',
        baseImage: 'rntme-runtime',
        image: 'rntme-acme-commerce-catalog:artifact',
        artifact: { source: 'composed-project', serviceSlug: 'catalog' },
        context: {
          kind: 'generated',
          serviceSlug: 'catalog',
          files: ['Dockerfile', 'artifacts/catalog/manifest.json'],
        },
      },
      image: 'rntme-acme-commerce-catalog:artifact',
      ports: [{ containerPort: 8080, protocol: 'http' }],
      ingress: {
        publicBaseUrl: 'https://commerce.example.com',
        containerPort: 8080,
        healthPath: '/health',
        routes: [
          {
            routeId: 'http:/api/catalog',
            path: '/api/catalog',
            url: 'https://commerce.example.com/api/catalog',
          },
        ],
      },
    });
    const client = new FakeDokployClient([
      {
        id: 'app_existing',
        name: 'rntme-acme-commerce-catalog',
        image: 'rntme-acme-commerce-catalog:artifact',
        env: resourceWithMetadata.env,
        labels: resourceWithMetadata.labels,
        build: resourceWithMetadata.build,
        ports: resourceWithMetadata.ports,
        ingress: resourceWithMetadata.ingress,
      },
    ]);
    const r = await applyDokployPlan({ ...rendered, resources: [resourceWithMetadata] }, client);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0]?.action).toBe('unchanged');
    expect(client.updateCalls).toEqual([]);
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

  it('reports lifecycle failures after resource apply as partial failures', async () => {
    const client = new FakeDokployClient([], { failDeployFor: 'app_1' });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
          resource: 'rntme-acme-commerce-catalog',
          partialFailure: expect.objectContaining({
            failedStep: {
              action: 'deploy',
              resourceName: 'rntme-acme-commerce-catalog',
              workloadSlug: 'catalog',
            },
            retrySafe: true,
          }),
        }),
      );
      expect(client.lifecycleCalls).toEqual([
        'create:rntme-acme-commerce-catalog',
        'configure:app_1:rntme-acme-commerce-catalog',
        'deploy:app_1',
      ]);
    }
  });

  it('returns environment initialization failures with a sanitized cause', async () => {
    const client = new FakeDokployClient([], { failEnvironment: true });
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

  it('preserves benign client error messages in serialized apply errors', async () => {
    const client = new FakeDokployClient([], {
      failEnvironment: true,
      failMessage: 'Dokploy returned 502 while ensuring environment',
      includeSecretFixture: false,
    });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          cause: {
            message: 'Dokploy returned 502 while ensuring environment',
          },
        }),
      );
    }
  });

  it('redacts sensitive bearer and API token text while preserving diagnostic context', async () => {
    const client = new FakeDokployClient([], {
      failEnvironment: true,
      failMessage:
        'request failed with Bearer bearer-secret and apiToken=api-secret at https://dokploy.example.com/hook?apiToken=query-secret&ok=true password=pw-secret secret: sec-secret token=generic-secret while ensuring environment',
      includeSecretFixture: false,
    });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(JSON.stringify(r.errors)).toContain('request failed with');
      expect(JSON.stringify(r.errors)).toContain('ok=true');
      expect(JSON.stringify(r.errors)).toContain('while ensuring environment');
      expect(JSON.stringify(r.errors)).toContain('[redacted]');
      expect(JSON.stringify(r.errors)).not.toContain('bearer-secret');
      expect(JSON.stringify(r.errors)).not.toContain('api-secret');
      expect(JSON.stringify(r.errors)).not.toContain('query-secret');
      expect(JSON.stringify(r.errors)).not.toContain('pw-secret');
      expect(JSON.stringify(r.errors)).not.toContain('sec-secret');
      expect(JSON.stringify(r.errors)).not.toContain('generic-secret');
      expect(JSON.stringify(r.errors)).not.toContain('Bearer bearer-secret');
      expect(JSON.stringify(r.errors)).not.toContain('apiToken=api-secret');
      expect(JSON.stringify(r.errors)).not.toContain('apiToken=query-secret');
    }
  });

  it('redacts the existing token fixture value without dropping benign context', async () => {
    const client = new FakeDokployClient([], {
      failEnvironment: true,
      failMessage: 'environment failed after Dokploy timeout',
    });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(JSON.stringify(r.errors)).toContain('environment failed after Dokploy timeout');
      expect(JSON.stringify(r.errors)).toContain('[redacted]');
      expect(JSON.stringify(r.errors)).not.toContain('dokploy-token-secret');
    }
  });

  it('redacts JSON-style credential keys while preserving surrounding diagnostic context', async () => {
    const client = new FakeDokployClient([], {
      failEnvironment: true,
      failMessage:
        'Dokploy response body {"apiToken":"json-secret","password":"pw-secret",' +
        '"access_token":"access-secret","refresh_token":"refresh-secret",' +
        '"client_secret":"client-secret","DOKPLOY_TOKEN":"env-secret","status":"denied"} ' +
        'while configuring app',
      includeSecretFixture: false,
    });
    const r = await applyDokployPlan(rendered, client);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      const errors = JSON.stringify(r.errors);
      expect(errors).toContain('Dokploy response body');
      expect(errors).toContain('status');
      expect(errors).toContain('denied');
      expect(errors).toContain('while configuring app');
      expect(errors).toContain('[redacted]');
      expect(errors).not.toContain('json-secret');
      expect(errors).not.toContain('pw-secret');
      expect(errors).not.toContain('access-secret');
      expect(errors).not.toContain('refresh-secret');
      expect(errors).not.toContain('client-secret');
      expect(errors).not.toContain('env-secret');
    }
  });
});

class FakeDokployClient implements DokployClient {
  private readonly apps = new Map<string, DokployApplication>();
  readonly createCalls: Array<{
    readonly environmentId: string;
    readonly resource: RenderedDokployResource;
  }> = [];
  readonly updateCalls: Array<{
    readonly applicationId: string;
    readonly resource: RenderedDokployResource;
  }> = [];
  readonly configureCalls: Array<{
    readonly applicationId: string;
    readonly resource: RenderedDokployResource;
  }> = [];
  readonly deployCalls: Array<{ readonly applicationId: string }> = [];
  readonly startCalls: Array<{ readonly applicationId: string }> = [];
  readonly lifecycleCalls: string[] = [];

  private next = 1;

  constructor(
    existing: DokployApplication[] = [],
    private readonly failures: {
      readonly failEnvironment?: boolean;
      readonly failFindFor?: string;
      readonly failCreateFor?: string;
      readonly failUpdateFor?: string;
      readonly failConfigureFor?: string;
      readonly failDeployFor?: string;
      readonly failStartFor?: string;
      readonly failMessage?: string;
      readonly includeSecretFixture?: boolean;
    } = {},
  ) {
    for (const app of existing) this.apps.set(app.name, app);
  }

  async ensureEnvironment(
    ref: DokployProjectRef,
    environmentName: string,
  ): Promise<{ environmentId: string }> {
    void ref;
    if (this.failures.failEnvironment === true) {
      throw clientError(this.failures.failMessage ?? 'environment failed', {
        includeSecretFixture: this.failures.includeSecretFixture ?? true,
      });
    }
    return { environmentId: `env_${environmentName}` };
  }

  async findApplicationByName(
    environmentId: string,
    name: string,
  ): Promise<DokployApplication | null> {
    void environmentId;
    if (this.failures.failFindFor === name) throw secretError('find failed');
    return this.apps.get(name) ?? null;
  }

  async createApplication(
    environmentId: string,
    input: RenderedDokployResource,
  ): Promise<{ id: string; name: string }> {
    if (this.failures.failCreateFor === input.name) throw secretError('create failed');
    this.lifecycleCalls.push(`create:${input.name}`);
    this.createCalls.push({ environmentId, resource: input });
    const app = { id: `app_${this.next++}`, name: input.name };
    this.apps.set(app.name, app);
    return app;
  }

  async updateApplication(
    id: string,
    input: RenderedDokployResource,
  ): Promise<{ id: string; name: string }> {
    if (this.failures.failUpdateFor === input.name) throw secretError('update failed');
    this.lifecycleCalls.push(`update:${id}:${input.name}`);
    this.updateCalls.push({ applicationId: id, resource: input });
    const app = { id, name: input.name };
    this.apps.set(input.name, app);
    return app;
  }

  async configureApplication(id: string, input: RenderedDokployResource): Promise<void> {
    this.lifecycleCalls.push(`configure:${id}:${input.name}`);
    this.configureCalls.push({ applicationId: id, resource: input });
    if (this.failures.failConfigureFor === id) throw secretError('configure failed');
  }

  async deployApplication(id: string): Promise<void> {
    this.lifecycleCalls.push(`deploy:${id}`);
    this.deployCalls.push({ applicationId: id });
    if (this.failures.failDeployFor === id) throw secretError('deploy failed');
  }

  async startApplication(id: string): Promise<void> {
    this.lifecycleCalls.push(`start:${id}`);
    this.startCalls.push({ applicationId: id });
    if (this.failures.failStartFor === id) throw secretError('start failed');
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
  return clientError(message, { includeSecretFixture: true });
}

function clientError(
  message: string,
  options: { readonly includeSecretFixture: boolean },
): Error & { readonly token: string } {
  const errorMessage = options.includeSecretFixture ? `${message}: dokploy-token-secret` : message;
  return Object.assign(new Error(errorMessage), {
    token: 'dokploy-token-secret',
  });
}
