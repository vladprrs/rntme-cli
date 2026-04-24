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

    expect(r.value.targetProject).toEqual({ mode: 'existing', projectId: 'project_123' });
    expect(r.value.resources.map((resource) => resource.name)).toEqual([
      'rntme-acme-commerce-catalog',
      'rntme-acme-commerce-edge',
    ]);
    expect(r.value.resources[0]).toMatchObject({
      kind: 'application',
      workloadKind: 'domain-service',
      image: 'rntme-runtime',
    });
    expect(r.value.resources[0].env).toContainEqual({
      name: 'RNTME_EVENT_BUS_BROKERS',
      value: 'redpanda.internal:9092',
      secret: false,
    });
    expect(r.value.digest).toMatch(/^sha256:/);
    expect(JSON.stringify(r.value)).not.toContain('apiToken');
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
});
