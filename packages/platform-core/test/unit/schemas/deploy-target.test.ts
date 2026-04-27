import { describe, expect, it } from 'vitest';
import {
  CreateDeployTargetRequestSchema,
  RotateApiTokenRequestSchema,
  UpdateDeployTargetRequestSchema,
} from '../../../src/schemas/deploy-target.js';

describe('CreateDeployTargetRequestSchema', () => {
  it('accepts a well-formed payload', () => {
    const r = CreateDeployTargetRequestSchema.safeParse({
      slug: 'dokploy-staging',
      displayName: 'Staging',
      kind: 'dokploy',
      dokployUrl: 'https://dok.example.test',
      publicBaseUrl: 'https://notes.example.test',
      dokployProjectId: 'abc-123',
      apiToken: 'dkp_supersecret',
      eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
      policyValues: {},
      isDefault: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing apiToken', () => {
    const r = CreateDeployTargetRequestSchema.safeParse({
      slug: 'x',
      displayName: 'X',
      kind: 'dokploy',
      dokployUrl: 'https://x.example.test',
      publicBaseUrl: 'https://notes.example.test',
      eventBus: { kind: 'kafka', brokers: [] },
      policyValues: {},
      isDefault: false,
    });
    expect(r.success).toBe(false);
  });

  it('forbids apiToken in update payload', () => {
    const r = UpdateDeployTargetRequestSchema.safeParse({ apiToken: 'leak' });
    expect(r.success).toBe(false);
  });

  it('requires a real public base URL on create payloads', () => {
    const r = CreateDeployTargetRequestSchema.safeParse({
      slug: 'dokploy-staging',
      displayName: 'Staging',
      kind: 'dokploy',
      dokployUrl: 'https://dok.example.test',
      dokployProjectId: 'abc-123',
      apiToken: 'dkp_supersecret',
      eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
      policyValues: {},
      isDefault: false,
    });
    expect(r.success).toBe(false);
  });

  it('does not materialize policyValues when omitted from update payloads', () => {
    const r = UpdateDeployTargetRequestSchema.safeParse({ displayName: 'Staging EU' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({ displayName: 'Staging EU' });
    expect('policyValues' in r.data).toBe(false);
  });

  it('requires apiToken in rotate payload', () => {
    expect(RotateApiTokenRequestSchema.safeParse({}).success).toBe(false);
    expect(RotateApiTokenRequestSchema.safeParse({ apiToken: 'dkp_new' }).success).toBe(true);
  });
});
