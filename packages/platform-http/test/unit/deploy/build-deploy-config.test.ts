import { describe, expect, it } from 'vitest';
import type { DeployTarget } from '@rntme-cli/platform-core';
import { buildProjectDeploymentConfig, buildDokployTargetConfig } from '../../../src/deploy/build-deploy-config.js';

describe('buildProjectDeploymentConfig', () => {
  it('maps target event bus and preview/default constants', () => {
    const config = buildProjectDeploymentConfig(target(), 'acme', {});

    expect(config).toMatchObject({
      orgSlug: 'acme',
      environment: 'default',
      mode: 'preview',
      eventBus: target().eventBus,
    });
  });

  it('maps integrationModuleImages to module image config and merges policy overrides', () => {
    const config = buildProjectDeploymentConfig(target(), 'acme', {
      integrationModuleImages: { stripe: 'registry/stripe:1' },
      policyOverrides: { timeout: { edge: { upstreamTimeoutMs: 1000 } } },
    });

    expect(config.modules).toEqual({ stripe: { image: 'registry/stripe:1' } });
    expect(config.policies).toEqual({
      rateLimit: { edge: { requestsPerMinute: 60, burst: 10 } },
      timeout: { edge: { upstreamTimeoutMs: 1000 } },
    });
  });
});

describe('buildDokployTargetConfig', () => {
  it('normalizes Dokploy endpoint and forwards project ref', () => {
    expect(buildDokployTargetConfig(target(), { publicBaseUrl: 'https://app.example.test' })).toEqual({
      endpoint: 'https://dokploy.example.test',
      projectId: 'project-1',
      projectName: undefined,
      allowCreateProject: false,
      publicBaseUrl: 'https://app.example.test',
    });
  });
});

function target(): DeployTarget {
  return {
    id: 'target-1',
    orgId: '11111111-1111-4111-8111-111111111111',
    slug: 'staging',
    displayName: 'Staging',
    kind: 'dokploy',
    dokployUrl: 'https://dokploy.example.test/api',
    dokployProjectId: 'project-1',
    dokployProjectName: null,
    allowCreateProject: false,
    apiTokenRedacted: '***',
    eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
    policyValues: { rateLimit: { edge: { requestsPerMinute: 60, burst: 10 } } },
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}
