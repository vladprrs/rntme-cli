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

  it('allows omitting public app base URL on create for wildcard-derived deploy URLs', () => {
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
    expect(r.success).toBe(true);
  });

  it('leaves omitted policyValues undefined on patch', () => {
    const r = UpdateDeployTargetRequestSchema.parse({ displayName: 'Renamed' });
    expect(r).toEqual({ displayName: 'Renamed' });
    expect(r.policyValues).toBeUndefined();
  });

  it('accepts public app base URL patches', () => {
    const r = UpdateDeployTargetRequestSchema.safeParse({
      publicBaseUrl: 'https://notes.example.test',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-http public app base URLs', () => {
    const r = UpdateDeployTargetRequestSchema.safeParse({
      publicBaseUrl: 'ftp://notes.example.test',
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing apiToken', () => {
    const r = CreateDeployTargetRequestSchema.safeParse({
      slug: 'x',
      displayName: 'X',
      kind: 'dokploy',
      dokployUrl: 'https://x.example.test',
      publicBaseUrl: 'https://x-app.example.test',
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

  it('requires apiToken in rotate payload', () => {
    expect(RotateApiTokenRequestSchema.safeParse({}).success).toBe(false);
    expect(RotateApiTokenRequestSchema.safeParse({ apiToken: 'dkp_new' }).success).toBe(true);
  });
});
