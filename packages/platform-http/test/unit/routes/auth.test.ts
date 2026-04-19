import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { FakeStore } from '@rntme-cli/platform-core';
import { authRoutes } from '../../../src/routes/auth.js';

const mockWorkos = {
  userManagement: {
    getAuthorizationUrl: () => 'https://workos.test/auth?x=1',
    authenticateWithCode: async () => ({
      user: { id: 'u_1', email: 'a@b', firstName: 'A', lastName: 'B' },
      organizationId: 'org_1',
      sealedSession: 'sealed',
    }),
    loadSealedSession: () => ({ getLogoutUrl: async () => 'https://workos.test/logout' }),
  },
} as never;

const env = {
  WORKOS_REDIRECT_URI: 'https://platform.rntme.com/v1/auth/callback',
  WORKOS_CLIENT_ID: 'wc',
  PLATFORM_SESSION_COOKIE_DOMAIN: '.rntme.com',
  PLATFORM_BASE_URL: 'https://platform.rntme.com',
} as never;

describe('auth routes', () => {
  it('GET /login redirects to WorkOS', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/auth',
      authRoutes({
        workos: mockWorkos,
        env,
        cookiePassword: 'p'.repeat(32),
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
        },
      }),
    );
    const r = await app.request('/v1/auth/login');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toMatch(/workos\.test/);
  });
  it('GET /callback upserts mirrors and sets cookie', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/auth',
      authRoutes({
        workos: mockWorkos,
        env,
        cookiePassword: 'p'.repeat(32),
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
        },
      }),
    );
    const r = await app.request('/v1/auth/callback?code=xyz');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/rntme_session=sealed/);
    expect(store.accounts.size).toBe(1);
  });
});
