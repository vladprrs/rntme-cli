import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { WorkOSClient } from '../auth/workos-client.js';
import type { Env } from '../config/env.js';
import type { AuthSubject, OrganizationRepo, AccountRepo, MembershipMirrorRepo } from '@rntme-cli/platform-core';

export function authRoutes(deps: {
  workos: WorkOSClient;
  env: Env;
  cookiePassword: string;
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
  };
}): Hono {
  const app = new Hono();

  app.get('/login', (c) => {
    const url = deps.workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      redirectUri: deps.env.WORKOS_REDIRECT_URI,
      clientId: deps.env.WORKOS_CLIENT_ID,
    });
    return c.redirect(url);
  });

  app.get('/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing code' } }, 400);
    try {
      const { user, organizationId, sealedSession } = await deps.workos.userManagement.authenticateWithCode({
        code,
        clientId: deps.env.WORKOS_CLIENT_ID,
        session: { sealSession: true, cookiePassword: deps.cookiePassword },
      });
      await deps.repos.accounts.upsertFromWorkos({
        workosUserId: user.id,
        email: user.email ?? null,
        displayName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || user.id,
      });
      if (organizationId) {
        await deps.repos.organizations.upsertFromWorkos({
          workosOrganizationId: organizationId,
          slug: organizationId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40),
          displayName: organizationId,
        });
      }
      if (sealedSession) {
        setCookie(c, 'rntme_session', sealedSession, {
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          path: '/',
          domain: deps.env.PLATFORM_SESSION_COOKIE_DOMAIN,
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return c.json({ account: { workosUserId: user.id }, org: { workosOrganizationId: organizationId ?? null } });
    } catch (cause) {
      return c.json({ error: { code: 'PLATFORM_AUTH_INVALID', message: String(cause) } }, 401);
    }
  });

  app.post('/logout', async (c) => {
    const sealed = getCookie(c, 'rntme_session');
    let url = deps.env.PLATFORM_BASE_URL;
    if (sealed) {
      try {
        const session = deps.workos.userManagement.loadSealedSession({
          sessionData: sealed,
          cookiePassword: deps.cookiePassword,
        });
        url = await session.getLogoutUrl();
      } catch {
        /* stale session, just clear cookie */
      }
    }
    deleteCookie(c, 'rntme_session', { domain: deps.env.PLATFORM_SESSION_COOKIE_DOMAIN, path: '/' });
    return c.json({ logoutUrl: url });
  });

  app.get('/me', (c) => {
    const s = c.get('subject' as never) as AuthSubject | undefined;
    if (!s) return c.json({ error: { code: 'PLATFORM_AUTH_MISSING', message: 'authenticate first' } }, 401);
    return c.json({ account: s.account, org: s.org, role: s.role, scopes: s.scopes });
  });

  return app;
}
