import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { WorkOSClient } from '../auth/workos-client.js';
import type { Env } from '../config/env.js';
import type { OrganizationRepo, AccountRepo, MembershipMirrorRepo } from '@rntme-cli/platform-core';

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
        let name = organizationId;
        let slug = organizationId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
        try {
          const wosOrg = await deps.workos.organizations.getOrganization(organizationId);
          if (wosOrg.name) name = wosOrg.name;
          if (wosOrg.slug) {
            slug = wosOrg.slug;
          } else {
            slug =
              name
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40) || slug;
          }
        } catch {
          /* fall back to organizationId-derived defaults */
        }
        await deps.repos.organizations.upsertFromWorkos({
          workosOrganizationId: organizationId,
          slug,
          displayName: name,
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
      const wantsJson = (c.req.header('accept') ?? '').toLowerCase().includes('application/json');
      if (wantsJson) {
        return c.json({ account: { workosUserId: user.id }, org: { workosOrganizationId: organizationId ?? null } });
      }
      return c.redirect('/', 302);
    } catch (cause) {
      const wantsJson = (c.req.header('accept') ?? '').toLowerCase().includes('application/json');
      if (wantsJson) {
        return c.json({ error: { code: 'PLATFORM_AUTH_INVALID', message: String(cause) } }, 401);
      }
      return c.redirect('/login?flash=auth-failed', 302);
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

  return app;
}
