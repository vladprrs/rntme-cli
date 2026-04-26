import { describe, it, expect } from 'vitest';
import { scopesForRole, tokenScopesSubsetOf } from '../../../src/auth/scopes.js';

describe('scopes', () => {
  it('admin has all scopes', () => {
    expect(scopesForRole('admin')).toEqual([
      'project:read',
      'project:write',
      'version:publish',
      'member:read',
      'token:manage',
      'deploy:target:manage',
      'deploy:execute',
    ]);
  });
  it('member has project + publish only', () => {
    expect(scopesForRole('member')).toEqual([
      'project:read',
      'project:write',
      'version:publish',
      'deploy:execute',
    ]);
  });
  it('tokenScopesSubsetOf rejects elevation', () => {
    expect(tokenScopesSubsetOf(['token:manage'], scopesForRole('member'))).toBe(false);
    expect(tokenScopesSubsetOf(['project:read'], scopesForRole('member'))).toBe(true);
  });
});
