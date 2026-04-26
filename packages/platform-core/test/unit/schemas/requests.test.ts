import { describe, it, expect } from 'vitest';
import {
  CreateProjectInputSchema,
  CreateTokenInputSchema,
} from '../../../src/schemas/requests.js';

describe('request schemas', () => {
  it('CreateProjectInputSchema requires slug+displayName', () => {
    expect(CreateProjectInputSchema.safeParse({ slug: 'foo', displayName: 'Foo' }).success).toBe(true);
    expect(CreateProjectInputSchema.safeParse({ slug: 'foo' }).success).toBe(false);
  });
  it('CreateTokenInputSchema requires non-empty scopes', () => {
    expect(CreateTokenInputSchema.safeParse({ name: 'cli', scopes: ['project:read'] }).success).toBe(true);
    expect(CreateTokenInputSchema.safeParse({ name: 'cli', scopes: [] }).success).toBe(false);
  });
});
