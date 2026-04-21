import { Hono } from 'hono';
import type { Env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { loggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimit, InMemoryRateLimiter } from './middleware/rate-limit.js';
import { bodyLimit } from './middleware/body-limit.js';
import { requireAuth } from './middleware/auth.js';
import { openOrgScopedTx } from './middleware/tx.js';
import { authRoutes } from './routes/auth.js';
import { webhookWorkosRoute } from './routes/webhook-workos.js';
import { orgRoutes } from './routes/orgs.js';
import { projectRoutes } from './routes/projects.js';
import { serviceRoutes } from './routes/services.js';
import { versionRoutes } from './routes/versions.js';
import { tokenRoutes } from './routes/tokens.js';
import { auditRoutes } from './routes/audit.js';
import { opsRoutes } from './routes/ops.js';
import { createUiApp } from './ui/app.js';
import { buildOpenApi } from './openapi.js';
import { ApiTokenProvider } from './auth/api-token-provider.js';
import { WorkOSAuthKitProvider } from './auth/workos-provider.js';
import type { WorkOSClient } from './auth/workos-client.js';
import type pino from 'pino';
import type { Pool } from 'pg';
import type {
  OrganizationRepo,
  AccountRepo,
  MembershipMirrorRepo,
  WorkosEventLogRepo,
  ProjectRepo,
  TokenRepo,
  BlobStore,
  Ids,
} from '@rntme-cli/platform-core';

export type AppDeps = {
  env: Env;
  logger: pino.Logger;
  workos: WorkOSClient;
  cookiePassword: string;
  pool: Pool;
  blob: BlobStore;
  ids: Ids;
  /** Pool-scoped repos used by pre-auth routes only (webhook, auth callback, ops). */
  poolRepos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    workosEventLog: WorkosEventLogRepo;
    projects: ProjectRepo;
    tokens: TokenRepo;
  };
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));
  app.use('*', errorHandler());
  app.use('*', corsMiddleware(deps.env.PLATFORM_CORS_ORIGINS));

  // Pre-auth body-size guard (Errata §3.8): 10 MiB for publish-version POSTs,
  // 1 MiB for all other POSTs. Must run before auth so DoS protection does not
  // depend on authentication.
  app.use('*', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    const url = new URL(c.req.url);
    const isPublish = /\/v1\/orgs\/[^/]+\/projects\/[^/]+\/services\/[^/]+\/versions\/?$/.test(
      url.pathname,
    );
    const cap = isPublish ? 10 * 1024 * 1024 : 1 * 1024 * 1024;
    return bodyLimit(cap)(c, next);
  });

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

  app.route(
    '/',
    opsRoutes({
      pool: deps.pool,
      blob: deps.blob,
      workos: deps.workos,
      openApiJson: () => buildOpenApi(deps.env),
    }),
  );

  app.route(
    '/v1/webhooks',
    webhookWorkosRoute({
      workos: deps.workos,
      secret: deps.env.WORKOS_WEBHOOK_SECRET,
      pool: deps.pool,
      repos: {
        organizations: deps.poolRepos.organizations,
        accounts: deps.poolRepos.accounts,
        memberships: deps.poolRepos.memberships,
        projects: deps.poolRepos.projects,
        tokens: deps.poolRepos.tokens,
        workosEventLog: deps.poolRepos.workosEventLog,
      },
    }),
  );

  // Pre-auth /v1/auth (login, callback, logout) stays on pool-scoped repos.
  app.route(
    '/v1/auth',
    authRoutes({
      workos: deps.workos,
      env: deps.env,
      cookiePassword: deps.cookiePassword,
      repos: {
        organizations: deps.poolRepos.organizations,
        accounts: deps.poolRepos.accounts,
        memberships: deps.poolRepos.memberships,
      },
    }),
  );

  const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 1000 });
  const authed = new Hono()
    .use('*', requireAuth([apiTokenProvider, workosProvider]))
    .use('*', rateLimit(rateLimiter, (c) => c.get('subject').tokenId ?? c.get('subject').account.id))
    .use('*', openOrgScopedTx(deps.pool));

  authed.get('/auth/me', (c) => {
    const s = c.get('subject');
    return c.json({
      account: s.account,
      org: s.org,
      role: s.role,
      scopes: s.scopes,
      tokenId: s.tokenId ?? null,
    });
  });
  authed.route('/orgs', orgRoutes({ ids: deps.ids }));
  authed.route('/orgs/:orgSlug/projects', projectRoutes({ ids: deps.ids }));
  authed.route('/orgs/:orgSlug/projects/:projSlug/services', serviceRoutes({ ids: deps.ids }));
  authed.route(
    '/orgs/:orgSlug/projects/:projSlug/services/:svcSlug',
    versionRoutes({ blob: deps.blob, ids: deps.ids }),
  );
  authed.route('/orgs/:orgSlug/tokens', tokenRoutes({ ids: deps.ids }));
  authed.route('/orgs/:orgSlug/audit', auditRoutes());

  // Scope `requireAuth` to /v1/*: mounting authed at `/` would also match the
  // UI's public `/login` and `/logout` routes registered below, returning 401
  // JSON before the UI sub-router gets a chance to render LoginPage.
  app.route('/v1', authed);

  app.route(
    '/',
    createUiApp({
      env: deps.env,
      logger: deps.logger,
      workos: deps.workos,
      cookiePassword: deps.cookiePassword,
      pool: deps.pool,
      ids: deps.ids,
      poolRepos: {
        organizations: deps.poolRepos.organizations,
        accounts: deps.poolRepos.accounts,
        memberships: deps.poolRepos.memberships,
        tokens: deps.poolRepos.tokens,
      },
    }),
  );

  return app;
}
