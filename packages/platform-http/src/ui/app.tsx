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
  Ids,
} from '@rntme-cli/platform-core';
import { isOk, listProjects, listServices, listVersions, listTags, listTokens, createToken } from '@rntme-cli/platform-core';
import { TokenCreated } from './fragments/token-created.js';
import { hasScope } from './scopes.js';
import { resolveDeps } from '../resolve-deps.js';
import { renderHtml } from './render.js';
import { LoginPage } from './pages/login.js';
import { NoOrgPage } from './pages/no-org.js';
import { ErrorPage } from './pages/error.js';
import { OrgPage } from './pages/org.js';
import { ProjectPage } from './pages/project.js';
import { ServicePage } from './pages/service.js';
import { AuditPage } from './pages/audit.js';
import { TokensPage } from './pages/tokens.js';

export type UiDeps = {
  env: Env;
  logger: pino.Logger;
  workos: WorkOSClient;
  cookiePassword: string;
  pool: Pool;
  ids: Ids;
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

  authed.get('/:orgSlug', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const urlSlug = c.req.param('orgSlug');
    if (s.org.slug !== urlSlug) {
      return renderHtml(
        c,
        <ErrorPage status={403} title="Not authorized" detail="You don't have access to this organization." backHref={`/${s.org.slug}`} />,
        403,
      );
    }
    const flash = c.req.query('flash') ?? undefined;
    const [projRes, otherRes, orgRes] = await Promise.all([
      listProjects({ repos: { projects: repos.projects } }, { orgId: s.org.id, includeArchived: false }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!projRes.ok) {
      const detail = projRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <OrgPage subject={enrichedSubject} otherOrgs={otherOrgs} projects={projRes.value} flash={flash} />);
  });

  authed.get('/:orgSlug/audit', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    if (s.org.slug !== c.req.param('orgSlug')) {
      return renderHtml(
        c,
        <ErrorPage status={403} title="Not authorized" backHref={`/${s.org.slug}`} />,
        403,
      );
    }
    const [auditRes, otherRes, orgRes] = await Promise.all([
      repos.audit.list(s.org.id, { limit: 100 }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!isOk(auditRes)) {
      const detail = auditRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <AuditPage subject={enrichedSubject} otherOrgs={otherOrgs} events={auditRes.value} />);
  });

  authed.get('/:orgSlug/tokens', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    if (s.org.slug !== c.req.param('orgSlug')) {
      return renderHtml(
        c,
        <ErrorPage status={403} title="Not authorized" backHref={`/${s.org.slug}`} />,
        403,
      );
    }
    const [tokRes, otherRes, orgRes] = await Promise.all([
      listTokens({ repos: { tokens: repos.tokens } }, { orgId: s.org.id }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!tokRes.ok) {
      const detail = tokRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    const flash = c.req.query('flash') ?? undefined;
    const tokens = tokRes.value.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
    }));
    return renderHtml(
      c,
      <TokensPage subject={enrichedSubject} otherOrgs={otherOrgs} tokens={tokens} flash={flash} />,
    );
  });

  authed.post(
    '/:orgSlug/tokens',
    sameOriginOnly(deps.env.PLATFORM_BASE_URL),
    async (c) => {
      const s = c.get('subject');
      if (s.org.slug !== c.req.param('orgSlug')) {
        return renderHtml(
          c,
          <ErrorPage status={403} title="Not authorized" backHref={`/${s.org.slug}`} />,
          403,
        );
      }
      if (!hasScope(s, 'token:manage')) {
        return renderHtml(
          c,
          <ErrorPage status={403} title="Missing scope token:manage" backHref={`/${s.org.slug}/tokens`} />,
          403,
        );
      }
      const form = await c.req.parseBody();
      const name = typeof form.name === 'string' ? form.name.trim() : '';
      const scopesStr = typeof form.scopes === 'string' ? form.scopes : '';
      const scopes = scopesStr
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (!name || scopes.length === 0) {
        return renderHtml(
          c,
          <ErrorPage status={400} title="Invalid token form" detail="name and scopes are required." backHref={`/${s.org.slug}/tokens`} />,
          400,
        );
      }
      const repos = resolveDeps(c.get('tx'));
      const r = await createToken(
        { repos: { tokens: repos.tokens }, ids: deps.ids },
        {
          orgId: s.org.id,
          accountId: s.account.id,
          name,
          scopes: scopes as never,
          expiresAt: null,
          creatorScopes: s.scopes as never,
        },
      );
      if (!r.ok) {
        // PLATFORM_AUTH_FORBIDDEN (scope-exceeds-creator) is a 403, not 400.
        const isAuthForbidden = r.errors.some((e) => e.code === 'PLATFORM_AUTH_FORBIDDEN');
        const status = isAuthForbidden ? 403 : 400;
        const detail = r.errors[0]?.message ?? 'Unknown error';
        return renderHtml(
          c,
          <ErrorPage status={status} title="Cannot create token" detail={detail} backHref={`/${s.org.slug}/tokens`} />,
          status,
        );
      }
      return renderHtml(
        c,
        <TokenCreated
          orgSlug={s.org.slug}
          token={{
            id: r.value.token.id,
            name: r.value.token.name,
            prefix: r.value.token.prefix,
            scopes: r.value.token.scopes,
            lastUsedAt: null,
            expiresAt: r.value.token.expiresAt,
            revokedAt: null,
            createdAt: r.value.token.createdAt,
          }}
          plaintext={r.value.plaintext}
        />,
      );
    },
  );

  authed.get('/:orgSlug/projects/:projSlug', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    if (s.org.slug !== c.req.param('orgSlug')) {
      return renderHtml(
        c,
        <ErrorPage status={403} title="Not authorized" detail="You don't have access to this organization." backHref={`/${s.org.slug}`} />,
        403,
      );
    }
    const projSlug = c.req.param('projSlug')!;
    const projLookup = await repos.projects.findBySlug(s.org.id, projSlug);
    if (!isOk(projLookup) || !projLookup.value) {
      return renderHtml(
        c,
        <ErrorPage status={404} title="Project not found" detail={`No project with slug "${projSlug}".`} backHref={`/${s.org.slug}`} />,
        404,
      );
    }
    const [svcRes, otherRes, orgRes] = await Promise.all([
      listServices({ repos: { services: repos.services } }, { orgId: s.org.id, projectId: projLookup.value.id }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!svcRes.ok) {
      const detail = svcRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <ProjectPage subject={enrichedSubject} otherOrgs={otherOrgs} project={projLookup.value} services={svcRes.value} />);
  });

  authed.get('/:orgSlug/projects/:projSlug/services/:svcSlug', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    if (s.org.slug !== c.req.param('orgSlug')) {
      return renderHtml(
        c,
        <ErrorPage status={403} title="Not authorized" backHref={`/${s.org.slug}`} />,
        403,
      );
    }
    const projSlug = c.req.param('projSlug')!;
    const svcSlug = c.req.param('svcSlug')!;
    const projLookup = await repos.projects.findBySlug(s.org.id, projSlug);
    if (!isOk(projLookup) || !projLookup.value) {
      return renderHtml(
        c,
        <ErrorPage status={404} title="Project not found" backHref={`/${s.org.slug}`} />,
        404,
      );
    }
    const svcLookup = await repos.services.findBySlug(projLookup.value.id, svcSlug);
    if (!isOk(svcLookup) || !svcLookup.value) {
      return renderHtml(
        c,
        <ErrorPage status={404} title="Service not found" backHref={`/${s.org.slug}/projects/${projSlug}`} />,
        404,
      );
    }
    const [versRes, tagsRes, otherRes, orgRes] = await Promise.all([
      listVersions({ repos: { artifacts: repos.artifacts } }, { serviceId: svcLookup.value.id, limit: 50, cursor: undefined }),
      listTags({ repos: { tags: repos.tags } }, { serviceId: svcLookup.value.id }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!versRes.ok) {
      const detail = versRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(
      c,
      <ServicePage
        subject={enrichedSubject}
        otherOrgs={otherOrgs}
        project={projLookup.value}
        service={svcLookup.value}
        versions={versRes.value}
        tags={isOk(tagsRes) ? tagsRes.value : []}
      />,
    );
  });

  app.route('/', authed);

  app.notFound((c) =>
    renderHtml(c, <ErrorPage status={404} title="Not found" detail="No such page." />, 404),
  );

  return app;
}
