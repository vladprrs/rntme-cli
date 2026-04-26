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
import {
  getDeployment,
  getProjectVersion,
  isOk,
  listDeployments,
  listDeployTargets,
  listProjects,
  listProjectVersions,
  listTokens,
  readDeploymentLogs,
  startDeployment,
  createToken,
  revokeToken,
} from '@rntme-cli/platform-core';
import { TokenCreated } from './fragments/token-created.js';
import { TokenRow } from './fragments/token-row.js';
import { hasScope } from './scopes.js';
import { resolveDeps } from '../resolve-deps.js';
import { renderFragment, renderHtml } from './render.js';
import { LoginPage } from './pages/login.js';
import { NoOrgPage } from './pages/no-org.js';
import { ErrorPage } from './pages/error.js';
import { OrgPage } from './pages/org.js';
import { ProjectPage } from './pages/project.js';
import { ProjectVersionPage } from './pages/project-version.js';
import { AuditPage } from './pages/audit.js';
import { TokensPage } from './pages/tokens.js';
import { DeployTargetDetailPage, DeployTargetsPage } from './pages/deploy-targets.js';
import { DeploymentsListPage } from './pages/deployments-list.js';
import { DeploymentPage } from './pages/deployment.js';
import { DeploymentStatusFragment } from './fragments/deployment-status.js';
import { DeploymentLogsFragment } from './fragments/deployment-logs.js';

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
  scheduleDeployment?: (deploymentId: string, orgId: string) => void;
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
    .use(
      '*',
      requireAuth([apiTokenProvider, workosProvider], {
        onUnauth: 'redirect',
        redirectTo: '/login',
        sessionCookieDomain: deps.env.PLATFORM_SESSION_COOKIE_DOMAIN,
      }),
    )
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

  authed.delete(
    '/:orgSlug/tokens/:id',
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
      const id = c.req.param('id')!;
      const repos = resolveDeps(c.get('tx'));
      const r = await revokeToken({ repos: { tokens: repos.tokens } }, { orgId: s.org.id, id });
      if (!r.ok) {
        return renderHtml(
          c,
          <ErrorPage status={400} title="Cannot revoke token" detail={r.errors[0]?.message ?? 'Unknown error'} backHref={`/${s.org.slug}/tokens`} />,
          400,
        );
      }
      // revokeToken returns Result<void>; re-fetch to get the updated token for rendering.
      const listRes = await repos.tokens.list(s.org.id);
      const t = isOk(listRes) ? listRes.value.find((x) => x.id === id) : undefined;
      if (!t) {
        return renderHtml(
          c,
          <ErrorPage status={500} title="Token not found after revoke" backHref={`/${s.org.slug}/tokens`} />,
          500,
        );
      }
      return renderHtml(
        c,
        <TokenRow
          orgSlug={s.org.slug}
          token={{
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            scopes: t.scopes,
            lastUsedAt: t.lastUsedAt,
            expiresAt: t.expiresAt,
            revokedAt: t.revokedAt,
            createdAt: t.createdAt,
          }}
          canManage={true}
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
    const [versionsRes, otherRes, orgRes] = await Promise.all([
      listProjectVersions(
        { repos: { projectVersions: repos.projectVersions } },
        { projectId: projLookup.value.id, limit: 50, cursor: undefined },
      ),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!versionsRes.ok) {
      const detail = versionsRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <ProjectPage subject={enrichedSubject} otherOrgs={otherOrgs} project={projLookup.value} versions={versionsRes.value} />);
  });

  authed.get('/:orgSlug/projects/:projSlug/versions/:seq', async (c) => {
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
    const seq = Number(c.req.param('seq'));
    if (!Number.isInteger(seq) || seq <= 0) {
      return renderHtml(c, <ErrorPage status={404} title="Version not found" backHref={`/${s.org.slug}/projects/${projSlug}`} />, 404);
    }
    const projLookup = await repos.projects.findBySlug(s.org.id, projSlug);
    if (!isOk(projLookup) || !projLookup.value) {
      return renderHtml(
        c,
        <ErrorPage status={404} title="Project not found" backHref={`/${s.org.slug}`} />,
        404,
      );
    }
    const [versionRes, otherRes, orgRes, targetsRes] = await Promise.all([
      getProjectVersion(
        { repos: { projectVersions: repos.projectVersions } },
        { projectId: projLookup.value.id, seq },
      ),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
      listDeployTargets({ repos }, { orgId: s.org.id }),
    ]);
    if (!versionRes.ok) {
      const detail = versionRes.errors[0]?.message ?? 'Unknown error';
      return renderHtml(c, <ErrorPage status={500} title="Error" detail={detail} />, 500);
    }
    if (!versionRes.value) {
      return renderHtml(c, <ErrorPage status={404} title="Version not found" backHref={`/${s.org.slug}/projects/${projSlug}`} />, 404);
    }
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(
      c,
      <ProjectVersionPage
        subject={enrichedSubject}
        otherOrgs={otherOrgs}
        project={projLookup.value}
        version={versionRes.value}
        deployTargets={isOk(targetsRes) ? targetsRes.value : []}
      />,
    );
  });

  authed.get('/:orgSlug/deploy-targets', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const [targetsRes, otherRes, orgRes] = await Promise.all([
      listDeployTargets({ repos }, { orgId: s.org.id }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!targetsRes.ok) return renderHtml(c, <ErrorPage status={500} title="Error" detail={targetsRes.errors[0]?.message ?? 'Unknown error'} />, 500);
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <DeployTargetsPage subject={enrichedSubject} otherOrgs={otherOrgs} targets={targetsRes.value} />);
  });

  authed.get('/:orgSlug/deploy-targets/:targetSlug', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const targetRes = await repos.deployTargets.getBySlug(s.org.id, c.req.param('targetSlug'));
    if (!isOk(targetRes) || !targetRes.value) {
      return renderHtml(c, <ErrorPage status={404} title="Deploy target not found" backHref={`/${s.org.slug}/deploy-targets`} />, 404);
    }
    const [otherRes, orgRes] = await Promise.all([
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <DeployTargetDetailPage subject={enrichedSubject} otherOrgs={otherOrgs} target={targetRes.value} />);
  });

  authed.post('/:orgSlug/projects/:projSlug/deployments', sameOriginOnly(deps.env.PLATFORM_BASE_URL), async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const projSlug = c.req.param('projSlug')!;
    const project = await repos.projects.findBySlug(s.org.id, projSlug);
    if (!isOk(project) || !project.value) return renderHtml(c, <ErrorPage status={404} title="Project not found" backHref={`/${s.org.slug}`} />, 404);
    const form = await c.req.parseBody();
    const projectVersionSeq = Number(form.projectVersionSeq);
    const targetSlug = typeof form.targetSlug === 'string' && form.targetSlug.length > 0 ? form.targetSlug : undefined;
    const result = await startDeployment({ repos, ids: deps.ids }, {
      orgId: s.org.id,
      projectId: project.value.id,
      accountId: s.account.id,
      tokenId: s.tokenId ?? null,
      req: { projectVersionSeq, targetSlug, configOverrides: {} },
    });
    if (!isOk(result)) return renderHtml(c, <ErrorPage status={400} title="Cannot start deployment" detail={result.errors[0]?.message ?? 'Unknown error'} backHref={`/${s.org.slug}/projects/${projSlug}/versions/${projectVersionSeq}`} />, 400);
    deps.scheduleDeployment?.(result.value.id, s.org.id);
    return c.redirect(`/${s.org.slug}/projects/${projSlug}/deployments/${result.value.id}`, 303);
  });

  authed.get('/:orgSlug/projects/:projSlug/deployments', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const project = await repos.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(project) || !project.value) return renderHtml(c, <ErrorPage status={404} title="Project not found" backHref={`/${s.org.slug}`} />, 404);
    const [deploymentsRes, otherRes, orgRes] = await Promise.all([
      listDeployments({ repos }, { projectId: project.value.id, limit: 50 }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    if (!isOk(deploymentsRes)) return renderHtml(c, <ErrorPage status={500} title="Error" detail={deploymentsRes.errors[0]?.message ?? 'Unknown error'} />, 500);
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <DeploymentsListPage subject={enrichedSubject} otherOrgs={otherOrgs} project={project.value} deployments={deploymentsRes.value} />);
  });

  authed.get('/:orgSlug/projects/:projSlug/deployments/:deploymentId', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const s = c.get('subject');
    const project = await repos.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(project) || !project.value) return renderHtml(c, <ErrorPage status={404} title="Project not found" backHref={`/${s.org.slug}`} />, 404);
    const deploymentRes = await getDeployment({ repos }, { id: c.req.param('deploymentId') });
    if (!isOk(deploymentRes) || !deploymentRes.value) return renderHtml(c, <ErrorPage status={404} title="Deployment not found" backHref={`/${s.org.slug}/projects/${project.value.slug}`} />, 404);
    const [logsRes, otherRes, orgRes] = await Promise.all([
      readDeploymentLogs({ repos }, { deploymentId: deploymentRes.value.id, sinceLineId: 0, limit: 200 }),
      repos.organizations.listForAccount(s.account.id),
      repos.organizations.findById(s.org.id),
    ]);
    const otherOrgs = isOk(otherRes) ? otherRes.value.filter((o) => o.slug !== s.org.slug) : [];
    const orgDisplayName = (isOk(orgRes) && orgRes.value?.displayName) ? orgRes.value.displayName : s.org.slug;
    const enrichedSubject = { ...s, org: { ...s.org, displayName: orgDisplayName } };
    return renderHtml(c, <DeploymentPage subject={enrichedSubject} otherOrgs={otherOrgs} project={project.value} deployment={deploymentRes.value} logs={isOk(logsRes) ? logsRes.value.lines : []} />);
  });

  authed.get('/:orgSlug/projects/:projSlug/deployments/:deploymentId/status', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const deploymentRes = await getDeployment({ repos }, { id: c.req.param('deploymentId') });
    if (!isOk(deploymentRes) || !deploymentRes.value) return c.text('not found', 404);
    return renderFragment(c, <DeploymentStatusFragment deployment={deploymentRes.value} />);
  });

  authed.get('/:orgSlug/projects/:projSlug/deployments/:deploymentId/logs', async (c) => {
    const repos = resolveDeps(c.get('tx'));
    const logsRes = await readDeploymentLogs({ repos }, { deploymentId: c.req.param('deploymentId'), sinceLineId: Number(c.req.query('sinceLineId') ?? 0), limit: 200 });
    if (!isOk(logsRes)) return c.text('error', 500);
    return renderFragment(c, <DeploymentLogsFragment lines={logsRes.value.lines} lastLineId={logsRes.value.lastLineId} />);
  });

  app.route('/', authed);

  app.notFound((c) =>
    renderHtml(c, <ErrorPage status={404} title="Not found" detail="No such page." />, 404),
  );

  return app;
}
