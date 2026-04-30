import { describe, expect, it } from 'vitest';
import type { ProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import { renderDokployPlan } from '../../src/render.js';

const plan: ProjectDeploymentPlan = {
  project: { orgSlug: 'acme', projectSlug: 'commerce', environment: 'default', mode: 'preview' },
  infrastructure: {
    eventBus: { kind: 'kafka', mode: 'external', brokers: ['redpanda.internal:9092'] },
  },
  workloads: [
    {
      kind: 'domain-service',
      slug: 'catalog',
      serviceSlug: 'catalog',
      resourceName: 'rntme-acme-commerce-catalog',
      runtime: { image: 'rntme-runtime' },
      artifact: { source: 'composed-project', serviceSlug: 'catalog' },
      runtimeFiles: {
        'manifest.json': '{"service":{"name":"catalog"}}',
        'graphs/listCatalog.json': '{"id":"listCatalog"}',
      },
      publicConfigJson: '{}',
      persistence: { mode: 'ephemeral' },
    },
    {
      kind: 'edge-gateway',
      slug: 'edge',
      resourceName: 'rntme-acme-commerce-edge',
      image: 'nginx:1.27-alpine',
    },
  ],
  edge: {
    routes: [
      {
        id: 'http:/api/catalog',
        kind: 'http',
        path: '/api/catalog',
        targetService: 'catalog',
        targetWorkload: 'catalog',
      },
    ],
    middleware: [],
  },
  diagnostics: { warnings: [] },
};

describe('renderDokployPlan', () => {
  it('renders redacted Dokploy resources and digest', () => {
    const r = renderDokployPlan(plan, {
      endpoint: 'https://dokploy.example.com',
      projectId: 'project_123',
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.deployment).toEqual({
      orgSlug: 'acme',
      projectSlug: 'commerce',
      environment: 'default',
      mode: 'preview',
    });
    expect(r.value.targetProject).toEqual({ mode: 'existing', projectId: 'project_123' });
    expect(r.value.resources.map((resource) => resource.name)).toEqual([
      'rntme-acme-commerce-catalog',
      'rntme-acme-commerce-edge',
    ]);
    expect(r.value.resources[0]).toMatchObject({
      kind: 'application',
      workloadKind: 'domain-service',
      image: 'rntme-runtime',
      files: {
        '/srv/artifacts/graphs/listCatalog.json': '{"id":"listCatalog"}',
        '/srv/artifacts/manifest.json': '{"service":{"name":"catalog"}}',
        '/srv/config.json': '{}',
      },
    });
    expect(r.value.resources[0]).not.toHaveProperty('build');
    expect(r.value.resources[0].env).toContainEqual({
      name: 'RNTME_EVENT_BUS_BROKERS',
      value: 'redpanda.internal:9092',
      secret: false,
    });
    expect(r.value.resources[0].env).toContainEqual({
      name: 'RNTME_ARTIFACTS_DIR',
      value: '/srv/artifacts',
      secret: false,
    });
    expect(r.value.digest).toMatch(/^sha256:/);
    expect(JSON.stringify(r.value)).not.toContain('apiToken');
  });

  it('renders edge gateway port and public ingress metadata', () => {
    const r = renderDokployPlan(plan, {
      endpoint: 'https://dokploy.example.com',
      projectId: 'project_123',
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[1]).toMatchObject({
      kind: 'application',
      workloadKind: 'edge-gateway',
      files: {
        '/srv/config.json': '{}',
      },
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
  });

  it('rejects missing Dokploy project identity when creation is disabled', () => {
    const r = renderDokployPlan(plan, {
      endpoint: 'https://dokploy.example.com',
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({ code: 'DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT' }),
      );
    }
  });

  it('returns an error result when Nginx rendering rejects the edge config', () => {
    const r = renderDokployPlan(
      {
        ...plan,
        edge: {
          routes: [
            {
              id: 'http:/api/catalog',
              kind: 'http',
              path: '/api/catalog; return 200',
              targetService: 'catalog',
              targetWorkload: 'catalog',
            },
          ],
          middleware: [],
        },
      },
      {
        endpoint: 'https://dokploy.example.com',
        projectId: 'project_123',
        publicBaseUrl: 'https://commerce.example.com',
      },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({ code: 'DEPLOY_RENDER_DOKPLOY_INVALID_NGINX_CONFIG' }),
      );
    }
  });

  it('rejects domain services without runtime artifact files', () => {
    const r = renderDokployPlan(
      {
        ...plan,
        workloads: [
          {
            kind: 'domain-service',
            slug: 'catalog',
            serviceSlug: 'catalog',
            resourceName: 'rntme-acme-commerce-catalog',
            runtime: { image: 'rntme-runtime' },
            artifact: { source: 'composed-project', serviceSlug: 'catalog' },
            runtimeFiles: {},
            publicConfigJson: '{}',
            persistence: { mode: 'ephemeral' },
          },
          {
            kind: 'edge-gateway',
            slug: 'edge',
            resourceName: 'rntme-acme-commerce-edge',
            image: 'nginx:1.27-alpine',
          },
        ],
      },
      {
        endpoint: 'https://dokploy.example.com',
        projectId: 'project_123',
        publicBaseUrl: 'https://commerce.example.com',
      },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_RENDER_DOKPLOY_MISSING_RUNTIME_FILES',
          resource: 'rntme-acme-commerce-catalog',
        }),
      );
    }
  });

  it('joins trailing slash public base URLs and root UI routes without double slashes', () => {
    const r = renderDokployPlan(
      {
        ...plan,
        edge: {
          routes: [
            {
              id: 'ui:/',
              kind: 'ui',
              path: '/',
              targetService: 'catalog',
              targetWorkload: 'catalog',
            },
            {
              id: 'http:/api/catalog',
              kind: 'http',
              path: '/api/catalog',
              targetService: 'catalog',
              targetWorkload: 'catalog',
            },
          ],
          middleware: [],
        },
      },
      {
        endpoint: 'https://dokploy.example.com',
        projectId: 'project_123',
        publicBaseUrl: 'https://commerce.example.com/',
      },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.urls.projectUrl).toBe('https://commerce.example.com/');
    expect(r.value.urls.uiUrl).toBe('https://commerce.example.com/');
    expect(r.value.urls.publicRoutes).toEqual([
      { routeId: 'ui:/', url: 'https://commerce.example.com/' },
      { routeId: 'http:/api/catalog', url: 'https://commerce.example.com/api/catalog' },
    ]);
  });

  it('sorts integration module env and secret refs for stable rendering', () => {
    const integrationPlan: ProjectDeploymentPlan = {
      ...plan,
      workloads: [
        {
          kind: 'integration-module',
          slug: 'payments',
          serviceSlug: 'payments',
          resourceName: 'rntme-acme-commerce-payments',
          image: 'payments:latest',
          expose: false,
          env: { Z_VAR: 'z', A_VAR: 'a' },
          secretRefs: { Z_SECRET: 'secret/z', A_SECRET: 'secret/a' },
        },
        {
          kind: 'edge-gateway',
          slug: 'edge',
          resourceName: 'rntme-acme-commerce-edge',
          image: 'nginx:1.27-alpine',
        },
      ],
    };

    const r = renderDokployPlan(integrationPlan, {
      endpoint: 'https://dokploy.example.com',
      projectId: 'project_123',
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.resources[0].env).toEqual([
      { name: 'A_VAR', value: 'a', secret: false },
      { name: 'Z_VAR', value: 'z', secret: false },
      { name: 'A_SECRET', value: 'secret/a', secret: true },
      { name: 'Z_SECRET', value: 'secret/z', secret: true },
    ]);
  });

  it('renders create target project when allowed', () => {
    const r = renderDokployPlan(plan, {
      endpoint: 'https://dokploy.example.com',
      projectName: 'commerce-default',
      allowCreateProject: true,
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.targetProject).toEqual({
      mode: 'create',
      projectName: 'commerce-default',
    });
  });

  it('renders SASL event bus env, auth env, and composed public config for authed domain workloads', () => {
    const publicConfig = {
      '@rntme/identity-auth0': {
        domain: 'tenant.us.auth0.com',
        clientId: 'auth0-public-client-id',
        audience: 'https://commerce.example.com/api',
        redirectUri: 'https://commerce.example.com',
      },
    };
    const authPlan: ProjectDeploymentPlan = {
      ...plan,
      infrastructure: {
        eventBus: {
          kind: 'kafka',
          mode: 'external',
          brokers: ['redpanda.example.com:9092'],
          topicPrefix: 'rntme.notes',
          security: {
            protocol: 'sasl_ssl',
            mechanism: 'scram-sha-512',
            secretRefs: {
              username: 'RNTME_EVENT_BUS_USERNAME',
              password: 'RNTME_EVENT_BUS_PASSWORD',
            },
          },
        },
        auth: {
          auth0: {
            clientId: 'auth0-public-client-id',
          },
        },
      },
      workloads: [
        {
          kind: 'domain-service',
          slug: 'app',
          serviceSlug: 'app',
          resourceName: 'rntme-acme-commerce-app',
          runtime: { image: 'rntme-runtime' },
          artifact: { source: 'composed-project', serviceSlug: 'app' },
          runtimeFiles: { 'manifest.json': '{"service":{"name":"app"}}' },
          publicConfigJson: JSON.stringify(publicConfig),
          persistence: { mode: 'ephemeral' },
        },
        {
          kind: 'integration-module',
          slug: 'identity-auth0',
          serviceSlug: 'identity-auth0',
          resourceName: 'rntme-acme-commerce-identity-auth0',
          image: 'identity-auth0:latest',
          expose: false,
          env: { AUTH0_DOMAIN: 'tenant.us.auth0.com' },
          secretRefs: {},
        },
        {
          kind: 'edge-gateway',
          slug: 'edge',
          resourceName: 'rntme-acme-commerce-edge',
          image: 'nginx:1.27-alpine',
        },
      ],
      edge: {
        routes: [
          {
            id: 'ui:/',
            kind: 'ui',
            path: '/',
            targetService: 'app',
            targetWorkload: 'app',
          },
          {
            id: 'http:/api',
            kind: 'http',
            path: '/api',
            targetService: 'app',
            targetWorkload: 'app',
          },
        ],
        middleware: [
          {
            mountTarget: 'http:/api',
            name: 'auth',
            kind: 'auth',
            provider: 'auth0',
            audience: 'https://commerce.example.com/api',
            moduleSlug: 'identity-auth0',
          },
        ],
      },
    };

    const r = renderDokployPlan(authPlan, {
      endpoint: 'https://dokploy.example.com',
      projectId: 'project_123',
      publicBaseUrl: 'https://commerce.example.com',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const app = r.value.resources.find((resource) => resource.workloadSlug === 'app');
    expect(app?.env).toEqual(
      expect.arrayContaining([
        { name: 'RNTME_EVENT_BUS_PROTOCOL', value: 'sasl_ssl', secret: false },
        { name: 'RNTME_EVENT_BUS_MECHANISM', value: 'scram-sha-512', secret: false },
        { name: 'RNTME_EVENT_BUS_USERNAME', value: 'RNTME_EVENT_BUS_USERNAME', secret: true },
        { name: 'RNTME_EVENT_BUS_PASSWORD', value: 'RNTME_EVENT_BUS_PASSWORD', secret: true },
        { name: 'RNTME_EVENT_BUS_TOPIC_PREFIX', value: 'rntme.notes', secret: false },
        { name: 'RNTME_AUTH_PROVIDER', value: 'auth0', secret: false },
        { name: 'RNTME_AUTH_AUDIENCE', value: 'https://commerce.example.com/api', secret: false },
        { name: 'RNTME_AUTH_MODULE_SLUG', value: 'identity-auth0', secret: false },
        {
          name: 'RNTME_AUTH_MODULE_ENDPOINT',
          value: 'rntme-acme-commerce-identity-auth0:50051',
          secret: false,
        },
      ]),
    );
    expect(JSON.stringify(app?.env)).not.toContain('scram-password');

    expect(app?.files?.['/srv/config.json']).toBeDefined();
    expect(JSON.parse(app?.files?.['/srv/config.json'] ?? '{}')).toEqual(publicConfig);
    expect(JSON.parse(app?.files?.['/srv/config.json'] ?? '{}')).not.toHaveProperty('auth0');
    expect(JSON.parse(app?.files?.['/srv/config.json'] ?? '{}')).not.toHaveProperty('runtime');

    const edge = r.value.resources.find((resource) => resource.workloadKind === 'edge-gateway');
    expect(JSON.parse(edge?.files?.['/srv/config.json'] ?? '{}')).toEqual(publicConfig);
  });

  it('rejects target resource name collisions after normalization', () => {
    const r = renderDokployPlan(
      {
        ...plan,
        workloads: [
          {
            kind: 'domain-service',
            slug: 'billing-api',
            serviceSlug: 'billing-api',
            resourceName: 'rntme-acme-commerce-billing-api',
            runtime: { image: 'rntme-runtime' },
            artifact: { source: 'composed-project', serviceSlug: 'billing-api' },
            runtimeFiles: { 'manifest.json': '{}' },
            publicConfigJson: '{}',
            persistence: { mode: 'ephemeral' },
          },
          {
            kind: 'domain-service',
            slug: 'billing_api',
            serviceSlug: 'billing_api',
            resourceName: 'rntme-acme-commerce-billing_api',
            runtime: { image: 'rntme-runtime' },
            artifact: { source: 'composed-project', serviceSlug: 'billing_api' },
            runtimeFiles: { 'manifest.json': '{}' },
            publicConfigJson: '{}',
            persistence: { mode: 'ephemeral' },
          },
          {
            kind: 'edge-gateway',
            slug: 'edge',
            resourceName: 'rntme-acme-commerce-edge',
            image: 'nginx:1.27-alpine',
          },
        ],
      },
      {
        endpoint: 'https://dokploy.example.com',
        projectId: 'project_123',
        publicBaseUrl: 'https://commerce.example.com',
      },
    );

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_RENDER_DOKPLOY_NAME_COLLISION',
          resource: 'rntme-acme-commerce-billing-api',
        }),
      );
    }
  });
});
