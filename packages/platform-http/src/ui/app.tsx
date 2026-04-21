import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import type { Pool } from 'pg';
import type pino from 'pino';
import type { Env } from '../config/env.js';
import type { WorkOSClient } from '../auth/workos-client.js';
import { requireAuth } from '../middleware/auth.js';
import { openOrgScopedTx } from '../middleware/tx.js';
import { sameOriginOnly } from '../middleware/same-origin.js';
import { securityHeaders } from '../middleware/security-headers.js';
import { ApiTokenProvider } from '../auth/api-token-provider.js';
import { WorkOSAuthKitProvider } from '../auth/workos-provider.js';
import type {
  OrganizationRepo,
  AccountRepo,
  MembershipMirrorRepo,
  TokenRepo,
} from '@rntme-cli/platform-core';
import { isOk } from '@rntme-cli/platform-core';
import { resolveDeps } from '../resolve-deps.js';
import { renderHtml } from './render.js';
import { LoginPage } from './pages/login.js';
import { NoOrgPage } from './pages/no-org.js';
import { ErrorPage } from './pages/error.js';

export type UiDeps = {
  env: Env;
  logger: pino.Logger;
  workos: WorkOSClient;
  cookiePassword: string;
  pool: Pool;
  poolRepos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    tokens: TokenRepo;
  };
};

export function createUiApp(deps: UiDeps): Hono {
  const app = new Hono();

  app.use('*', securityHeaders());

  // Public routes (no auth required).
  app.get('/login', (c) => {
    const flash = c.req.query('flash') ?? undefined;
    return renderHtml(c, <LoginPage flash={flash} />);
  });

  // Logout: clear cookie + redirect to WorkOS logout. Same-origin CSRF guard.
  app.post('/logout', sameOriginOnly(deps.env.PLATFORM_BASE_URL), async (c) => {
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
    return c.redirect(url, 302);
  });

  // Authed section.
  const apiTokenProvider = new ApiTokenProvider({
    tokens: deps.poolRepos.tokens,
    organizations: deps.poolRepos.organizations,
    accounts: deps.poolRepos.accounts,
    memberships: deps.poolRepos.memberships,
  });
  const workosProvider = new WorkOSAuthKitProvider({
    workos: deps.workos,
    cookiePassword: deps.cookiePassword,
    organizations: deps.poolRepos.organizations,
    accounts: deps.poolRepos.accounts,
    memberships: deps.poolRepos.memberships,
  });

  const authed = new Hono()
    .use('*', requireAuth([apiTokenProvider, workosProvider], { onUnauth: 'redirect', redirectTo: '/login' }))
    .use('*', openOrgScopedTx(deps.pool));

  authed.get('/', async (c) => {
    const s = c.get('subject');
    if (s.org && s.org.slug) return c.redirect(`/${s.org.slug}`, 302);
    return c.redirect('/no-org', 302);
  });

  authed.get('/no-org', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const r = await repos.organizations.listForAccount(s.account.id);
    const orgs = isOk(r) ? r.value : [];
    return renderHtml(c, <NoOrgPage orgs={orgs} />);
  });

  app.route('/', authed);

  app.notFound((c) =>
    renderHtml(c, <ErrorPage status={404} title="Not found" detail="No such page." />, 404),
  );

  return app;
}
