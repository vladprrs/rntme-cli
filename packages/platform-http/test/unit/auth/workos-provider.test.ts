import { describe, it, expect } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { FakeStore } from '@rntme-cli/platform-core/testing';
import { WorkOSAuthKitProvider } from '../../../src/auth/workos-provider.js';

const mockWorkos = {
  userManagement: {
    loadSealedSession: () => ({
      authenticate: async () => ({ authenticated: false as const, reason: 'invalid_jwt' as const }),
    }),
  },
} as never;

const stubSession = () =>
  ({
    userManagement: {
      loadSealedSession: () => ({
        authenticate: async () => ({
          authenticated: true as const,
          user: { id: 'u' },
          organizationId: 'w',
        }),
      }),
    },
  }) as never;

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

  it('returns PLATFORM_AUTH_INVALID when the account is not a member of the org', async () => {
    const provider = new WorkOSAuthKitProvider({
      workos: stubSession(),
      cookiePassword: 'x'.repeat(32),
      organizations: {
        findByWorkosId: async () => ({
          ok: true,
          value: { id: 'o1', workosOrganizationId: 'w', slug: 's', displayName: 'S' } as never,
        }),
      } as never,
      accounts: {
        findByWorkosUserId: async () => ({
          ok: true,
          value: { id: 'a1', workosUserId: 'u', displayName: 'U', email: null } as never,
        }),
      } as never,
      memberships: { find: async () => ({ ok: true, value: null }) } as never,
    });
    const r = await provider.authenticate({
      cookieHeader: 'rntme_session=sealed-ok',
      authorizationHeader: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.code).toBe('PLATFORM_AUTH_INVALID');
  });

  it('returns err when memberships.find itself errors (no silent downgrade)', async () => {
    const provider = new WorkOSAuthKitProvider({
      workos: stubSession(),
      cookiePassword: 'x'.repeat(32),
      organizations: {
        findByWorkosId: async () => ({
          ok: true,
          value: {
            id: 'o1',
            workosOrganizationId: 'w',
            slug: 's',
            displayName: 'S',
          } as never,
        }),
      } as never,
      accounts: {
        findByWorkosUserId: async () => ({
          ok: true,
          value: { id: 'a1', workosUserId: 'u', displayName: 'U', email: null } as never,
        }),
      } as never,
      memberships: {
        find: async () => ({
          ok: false,
          errors: [{ code: 'PLATFORM_STORAGE_DB_UNAVAILABLE' as const, message: 'boom' }],
        }),
      } as never,
    });
    const r = await provider.authenticate({
      cookieHeader: 'rntme_session=sealed-ok',
      authorizationHeader: undefined,
    });
    expect(r.ok).toBe(false);
  });
});
