import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { FakeStore } from '@rntme-cli/platform-core/testing';
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
  organizations: {
    getOrganization: async (id: string) => ({ id, name: id, slug: undefined }),
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
    const r = await app.request('/v1/auth/callback?code=xyz', {
      headers: { Accept: 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/rntme_session=sealed/);
    expect(store.accounts.size).toBe(1);
  });

  it('callback seeds the org mirror with the real WorkOS org name', async () => {
    const stub = {
      userManagement: {
        getAuthorizationUrl: () => 'u',
        authenticateWithCode: async () => ({
          user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B' },
          organizationId: 'org_01ABC',
          sealedSession: 'sealed',
        }),
        loadSealedSession: () => ({
          authenticate: async () => ({
            authenticated: true,
            user: { id: 'u1' },
            organizationId: 'org_01ABC',
          }),
        }),
      },
      organizations: {
        getOrganization: async (id: string) => ({ id, name: 'Acme Corp', slug: 'acme' }),
      },
    };
    const orgUpserts: Array<{ slug: string; displayName: string }> = [];
    const app = new Hono().route(
      '/v1/auth',
      authRoutes({
        workos: stub as never,
        env,
        cookiePassword: 'x'.repeat(32),
        repos: {
          organizations: {
            upsertFromWorkos: async (a: { slug: string; displayName: string }) => {
              orgUpserts.push({ slug: a.slug, displayName: a.displayName });
              return { ok: true, value: a };
            },
          } as never,
          accounts: { upsertFromWorkos: async () => ({ ok: true, value: {} as never }) } as never,
          memberships: { find: async () => ({ ok: true, value: null }) } as never,
        },
      }),
    );
    const res = await app.request('/v1/auth/callback?code=abc', {
      headers: { Accept: 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(orgUpserts[0]!.slug).toBe('acme');
    expect(orgUpserts[0]!.displayName).toBe('Acme Corp');
  });
});

describe('/v1/auth/callback content-negotiation', () => {
  function makeApp() {
    const workos = {
      userManagement: {
        getAuthorizationUrl: () => 'https://workos.test/start',
        authenticateWithCode: vi.fn(async () => ({
          user: { id: 'u1', email: 'u@example.com', firstName: 'U', lastName: 'X' },
          organizationId: 'org_x',
          sealedSession: 'sealed',
        })),
        loadSealedSession: () => ({
          authenticate: async () => ({ authenticated: true, user: { id: 'u1' }, organizationId: 'org_x' }),
          getLogoutUrl: async () => 'https://workos.test/logout',
        }),
      },
      organizations: { getOrganization: async () => ({ name: 'Org X', slug: 'org-x' }) },
    } as never;
    const repos = {
      organizations: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
      accounts: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
      memberships: {} as never,
    } as never;
    const envLocal = {
      WORKOS_CLIENT_ID: 'cid',
      WORKOS_REDIRECT_URI: 'http://localhost/callback',
      PLATFORM_BASE_URL: 'http://localhost',
      PLATFORM_SESSION_COOKIE_DOMAIN: 'localhost',
    } as never;
    const app = new Hono();
    app.route('/v1/auth', authRoutes({ workos, env: envLocal, cookiePassword: 'x'.repeat(32), repos }));
    return app;
  }

  it('returns JSON when Accept: application/json', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/callback?code=abc', {
      headers: { Accept: 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    const body = await r.json();
    expect(body.account.workosUserId).toBe('u1');
  });

  it('redirects to / when Accept is text/html', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/callback?code=abc', {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/');
  });

  it('redirects to / when no Accept header (browser default)', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/callback?code=abc', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/');
  });

  it('redirects to /login?flash=auth-failed when authenticateWithCode rejects', async () => {
    function makeFailingApp() {
      const workos = {
        userManagement: {
          getAuthorizationUrl: () => 'https://workos.test/start',
          authenticateWithCode: vi.fn(async () => { throw new Error('bad code'); }),
          loadSealedSession: () => ({
            authenticate: async () => ({ authenticated: false }),
            getLogoutUrl: async () => 'https://workos.test/logout',
          }),
        },
        organizations: { getOrganization: async () => ({ name: 'Org X', slug: 'org-x' }) },
      } as never;
      const repos = {
        organizations: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
        accounts: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
        memberships: {} as never,
      } as never;
      const envLocal = {
        WORKOS_CLIENT_ID: 'cid',
        WORKOS_REDIRECT_URI: 'http://localhost/callback',
        PLATFORM_BASE_URL: 'http://localhost',
        PLATFORM_SESSION_COOKIE_DOMAIN: 'localhost',
      } as never;
      const app = new Hono();
      app.route('/v1/auth', authRoutes({ workos, env: envLocal, cookiePassword: 'x'.repeat(32), repos }));
      return app;
    }

    const app = makeFailingApp();
    const r = await app.request('/v1/auth/callback?code=abc', {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login?flash=auth-failed');
  });
});

describe('/v1/auth/logout content-negotiation', () => {
  function makeApp() {
    const workos = {
      userManagement: {
        getAuthorizationUrl: () => 'https://workos.test/start',
        authenticateWithCode: vi.fn(async () => ({
          user: { id: 'u1', email: 'u@example.com', firstName: 'U', lastName: 'X' },
          organizationId: 'org_x',
          sealedSession: 'sealed',
        })),
        loadSealedSession: () => ({
          authenticate: async () => ({ authenticated: true, user: { id: 'u1' }, organizationId: 'org_x' }),
          getLogoutUrl: async () => 'https://workos.test/logout',
        }),
      },
      organizations: { getOrganization: async () => ({ name: 'Org X', slug: 'org-x' }) },
    } as never;
    const repos = {
      organizations: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
      accounts: { upsertFromWorkos: async () => ({ ok: true, value: {} }) },
      memberships: {} as never,
    } as never;
    const envLocal = {
      WORKOS_CLIENT_ID: 'cid',
      WORKOS_REDIRECT_URI: 'http://localhost/callback',
      PLATFORM_BASE_URL: 'http://localhost',
      PLATFORM_SESSION_COOKIE_DOMAIN: 'localhost',
    } as never;
    const app = new Hono();
    app.route('/v1/auth', authRoutes({ workos, env: envLocal, cookiePassword: 'x'.repeat(32), repos }));
    return app;
  }

  it('returns JSON with logoutUrl when Accept: application/json', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Cookie: 'rntme_session=sealed',
      },
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.logoutUrl).toBe('https://workos.test/logout');
  });

  it('redirects to WorkOS logout URL when Accept is text/html', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Accept: 'text/html',
        Cookie: 'rntme_session=sealed',
      },
      redirect: 'manual',
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://workos.test/logout');
  });

  it('redirects to PLATFORM_BASE_URL when no session cookie and Accept is text/html', async () => {
    const app = makeApp();
    const r = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: { Accept: 'text/html' },
      redirect: 'manual',
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('http://localhost');
  });
});
