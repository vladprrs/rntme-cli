import { describe, expect, it } from 'vitest';
import { buildProjectDeploymentPlan } from '../../src/plan.js';
import type { ComposedProjectInput } from '../../src/composed-project.js';
import type { ProjectDeploymentConfig } from '../../src/config.js';

const project: ComposedProjectInput = {
  name: 'commerce',
  services: {
    catalog: { slug: 'catalog', kind: 'domain', runtimeFiles: { 'manifest.json': '{}' } },
    app: { slug: 'app', kind: 'domain', runtimeFiles: { 'manifest.json': '{}' } },
    'mod-workos': { slug: 'mod-workos', kind: 'integration' },
  },
  routes: {
    ui: { '/': 'app' },
    http: { '/api/catalog': 'catalog' },
  },
  middleware: {},
  mounts: [],
};

const previewConfig: ProjectDeploymentConfig = {
  orgSlug: 'acme',
  environment: 'default',
  mode: 'preview',
  eventBus: {
    kind: 'kafka',
    mode: 'external',
    brokers: ['redpanda.internal:9092'],
  },
  modules: {
    'mod-workos': {
      image: 'ghcr.io/acme/mod-workos:2026-04-24',
      expose: false,
    },
  },
  policies: {},
};

describe('buildProjectDeploymentPlan', () => {
  it('builds preview workloads for domain services, integration modules, and edge', () => {
    const r = buildProjectDeploymentPlan(project, previewConfig);

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.project).toEqual({
      orgSlug: 'acme',
      projectSlug: 'commerce',
      environment: 'default',
      mode: 'preview',
    });
    expect(r.value.infrastructure.eventBus.brokers).toEqual(['redpanda.internal:9092']);
    expect(r.value.workloads.map((w) => w.slug)).toEqual([
      'catalog',
      'app',
      'mod-workos',
      'edge',
    ]);
    expect(r.value.workloads.find((w) => w.kind === 'domain-service' && w.slug === 'catalog')).toMatchObject({
      runtime: { image: 'rntme-runtime' },
      runtimeFiles: { 'manifest.json': '{}' },
      persistence: { mode: 'ephemeral' },
    });
    expect(r.value.workloads.find((w) => w.kind === 'integration-module')).toMatchObject({
      slug: 'mod-workos',
      image: 'ghcr.io/acme/mod-workos:2026-04-24',
      expose: false,
    });
  });

  it('rejects production mode in the MVP', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      mode: 'production',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_PLAN_UNSUPPORTED_PRODUCTION_MODE',
        }),
      );
    }
  });

  it('rejects preview plans without an event bus', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      eventBus: undefined,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_PLAN_MISSING_EVENT_BUS',
          path: 'eventBus',
        }),
      );
    }
  });

  it('rejects integration modules without explicit image config', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      modules: {},
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_PLAN_MISSING_MODULE_IMAGE',
          service: 'mod-workos',
          path: 'modules.mod-workos',
        }),
      );
    }
  });

  it('accumulates missing event bus and module image errors in validation order', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      eventBus: undefined,
      modules: {},
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((error) => error.code)).toEqual([
        'DEPLOY_PLAN_MISSING_EVENT_BUS',
        'DEPLOY_PLAN_MISSING_MODULE_IMAGE',
      ]);
    }
  });

  it('accepts complete SASL_SSL/SCRAM event bus security config', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      eventBus: {
        kind: 'kafka',
        mode: 'external',
        brokers: ['redpanda.example.com:9092'],
        security: {
          protocol: 'sasl_ssl',
          mechanism: 'scram-sha-512',
          secretRefs: {
            username: 'RNTME_EVENT_BUS_USERNAME',
            password: 'RNTME_EVENT_BUS_PASSWORD',
          },
        },
      },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.infrastructure.eventBus.security).toEqual({
      protocol: 'sasl_ssl',
      mechanism: 'scram-sha-512',
      secretRefs: {
        username: 'RNTME_EVENT_BUS_USERNAME',
        password: 'RNTME_EVENT_BUS_PASSWORD',
      },
    });
  });

  it('rejects unsupported SASL mechanisms', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      eventBus: {
        kind: 'kafka',
        mode: 'external',
        brokers: ['redpanda.example.com:9092'],
        security: {
          protocol: 'sasl_ssl',
          mechanism: 'plain',
          secretRefs: {
            username: 'RNTME_EVENT_BUS_USERNAME',
            password: 'RNTME_EVENT_BUS_PASSWORD',
          },
        },
      } as ProjectDeploymentConfig['eventBus'],
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_PLAN_EVENT_BUS_SASL_MECHANISM_UNSUPPORTED',
          path: 'eventBus.security.mechanism',
        }),
      );
    }
  });

  it('rejects incomplete SASL secret refs', () => {
    const r = buildProjectDeploymentPlan(project, {
      ...previewConfig,
      eventBus: {
        kind: 'kafka',
        mode: 'external',
        brokers: ['redpanda.example.com:9092'],
        security: {
          protocol: 'sasl_ssl',
          mechanism: 'scram-sha-256',
          secretRefs: { username: 'RNTME_EVENT_BUS_USERNAME' },
        },
      } as ProjectDeploymentConfig['eventBus'],
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({
          code: 'DEPLOY_PLAN_EVENT_BUS_SASL_INCOMPLETE',
          path: 'eventBus.security.secretRefs',
        }),
      );
    }
  });
});
