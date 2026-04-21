import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { WorkOSClient } from '../auth/workos-client.js';
import type { Env } from '../config/env.js';
import type { OrganizationRepo, AccountRepo, MembershipMirrorRepo } from '@rntme-cli/platform-core';
import { isOk } from '@rntme-cli/platform-core';

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
      const authResult = await deps.workos.userManagement.authenticateWithCode({
        code,
        clientId: deps.env.WORKOS_CLIENT_ID,
        session: { sealSession: true, cookiePassword: deps.cookiePassword },
      });
      const { user } = authResult;
      let organizationId = authResult.organizationId;
      let sealedSession = authResult.sealedSession;

      await deps.repos.accounts.upsertFromWorkos({
        workosUserId: user.id,
        email: user.email ?? null,
        displayName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || user.id,
      });

      // WorkOS may seal the session before a freshly-created membership is
      // attached to it (typical on the first sign-in). Fall back to the
      // authoritative memberships API to pick a home org and re-seal the
      // session so the user lands in an authenticated state.
      if (!organizationId) {
        try {
          const list = await deps.workos.userManagement.listOrganizationMemberships({
            userId: user.id,
            statuses: ['active'],
          });
          const first = list.data[0];
          if (first && sealedSession) {
            const cs = deps.workos.userManagement.loadSealedSession({
              sessionData: sealedSession,
              cookiePassword: deps.cookiePassword,
            });
            const refreshed = await cs.refresh({
              cookiePassword: deps.cookiePassword,
              organizationId: first.organizationId,
            });
            if (refreshed.authenticated && refreshed.sealedSession) {
              organizationId = first.organizationId;
              sealedSession = refreshed.sealedSession;
            }
          }
        } catch {
          /* best-effort — missing org falls through to the /login redirect below */
        }
      }

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

        // Do not wait for the organization_membership.created webhook — sync
        // the membership row from the SDK right now so the sealed session
        // can resolve to an authorized subject on the very next request.
        try {
          const memList = await deps.workos.userManagement.listOrganizationMemberships({
            userId: user.id,
            organizationId,
          });
          const m = memList.data.find((x) => x.status === 'active') ?? memList.data[0];
          if (m) {
            const [acc, org] = await Promise.all([
              deps.repos.accounts.findByWorkosUserId(user.id),
              deps.repos.organizations.findByWorkosId(organizationId),
            ]);
            if (isOk(acc) && isOk(org) && acc.value && org.value) {
              await deps.repos.memberships.upsert({
                orgId: org.value.id,
                accountId: acc.value.id,
                role: m.role.slug,
              });
            }
          }
        } catch {
          /* best-effort — webhook will backfill */
        }
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
      if (!organizationId) {
        return c.redirect('/login?flash=no-org', 302);
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
    const wantsJson = (c.req.header('accept') ?? '').toLowerCase().includes('application/json');
    if (wantsJson) return c.json({ logoutUrl: url });
    return c.redirect(url, 302);
  });

  return app;
}
