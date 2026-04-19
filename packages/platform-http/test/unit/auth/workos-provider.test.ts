import { describe, it, expect } from 'vitest';
import { FakeStore, isOk } from '@rntme-cli/platform-core';
import { WorkOSAuthKitProvider } from '../../../src/auth/workos-provider.js';

const mockWorkos = {
  userManagement: {
    loadSealedSession: () => ({
      authenticate: async () => ({ authenticated: false as const, reason: 'invalid_jwt' as const }),
    }),
  },
} as never;

describe('WorkOSAuthKitProvider', () => {
  it('returns AUTH_MISSING when no cookie present', async () => {
    const store = new FakeStore();
    const p = new WorkOSAuthKitProvider({
      workos: mockWorkos,
      cookiePassword: 'x'.repeat(32),
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
    });
    const r = await p.authenticate({ authorizationHeader: undefined, cookieHeader: undefined });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_AUTH_MISSING');
  });
});
