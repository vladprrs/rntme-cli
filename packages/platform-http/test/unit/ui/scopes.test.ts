import { describe, it, expect } from 'vitest';
import { hasScope } from '../../../src/ui/scopes.js';

describe('hasScope', () => {
  it('returns true when subject has the scope', () => {
    expect(hasScope({ scopes: ['token:manage', 'project:read'] } as never, 'token:manage')).toBe(true);
  });

  it('returns false when subject lacks the scope', () => {
    expect(hasScope({ scopes: ['project:read'] } as never, 'token:manage')).toBe(false);
  });

  it('returns false for null/undefined subject', () => {
    expect(hasScope(null as never, 'token:manage')).toBe(false);
    expect(hasScope(undefined as never, 'token:manage')).toBe(false);
  });
});
