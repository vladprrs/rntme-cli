import { describe, it, expect } from 'vitest';
import {
  CreateProjectInputSchema,
  PublishRequestSchema,
  CreateTokenInputSchema,
} from '../../../src/schemas/requests.js';

describe('request schemas', () => {
  it('PublishRequestSchema requires all 7 bundle files', () => {
    const valid = {
      bundle: { manifest: {}, pdm: {}, qsm: {}, graphIr: {}, bindings: {}, ui: {}, seed: {} },
    };
    expect(PublishRequestSchema.safeParse(valid).success).toBe(true);
    const { bundle: _b, ...rest } = valid;
    expect(
      PublishRequestSchema.safeParse({
        ...rest,
        bundle: { manifest: {}, pdm: {}, qsm: {}, graphIr: {}, bindings: {}, ui: {} },
      }).success,
    ).toBe(false);
  });
  it('CreateProjectInputSchema requires slug+displayName', () => {
    expect(CreateProjectInputSchema.safeParse({ slug: 'foo', displayName: 'Foo' }).success).toBe(true);
    expect(CreateProjectInputSchema.safeParse({ slug: 'foo' }).success).toBe(false);
  });
  it('CreateTokenInputSchema requires non-empty scopes', () => {
    expect(CreateTokenInputSchema.safeParse({ name: 'cli', scopes: ['project:read'] }).success).toBe(true);
    expect(CreateTokenInputSchema.safeParse({ name: 'cli', scopes: [] }).success).toBe(false);
  });
});
