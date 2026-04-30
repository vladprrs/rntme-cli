import { describe, expect, it } from 'vitest';
import {
  DeploymentStatusSchema,
  StartDeploymentRequestSchema,
} from '../../../src/schemas/deployment.js';

describe('DeploymentStatusSchema', () => {
  it('accepts canonical statuses', () => {
    for (const status of [
      'queued',
      'running',
      'succeeded',
      'succeeded_with_warnings',
      'failed',
      'failed_orphaned',
    ]) {
      expect(DeploymentStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(DeploymentStatusSchema.safeParse('cancelled').success).toBe(false);
  });
});

describe('StartDeploymentRequestSchema', () => {
  it('accepts minimal body with projectVersionSeq', () => {
    expect(StartDeploymentRequestSchema.safeParse({ projectVersionSeq: 1 }).success).toBe(true);
  });

  it('accepts overrides', () => {
    const parsed = StartDeploymentRequestSchema.safeParse({
      projectVersionSeq: 1,
      targetSlug: 'dokploy-staging',
      configOverrides: {
        integrationModuleImages: { 'mod-x': 'r/mod-x:1' },
        runtimeImage: 'ghcr.io/acme/rntme-runtime:rnt-364',
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.configOverrides.runtimeImage).toBe('ghcr.io/acme/rntme-runtime:rnt-364');
  });
});
