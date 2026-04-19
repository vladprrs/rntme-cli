import { Hono } from 'hono';
import type { Env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { loggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimit, InMemoryRateLimiter } from './middleware/rate-limit.js';
import { requireAuth } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { webhookWorkosRoute } from './routes/webhook-workos.js';
import { orgRoutes } from './routes/orgs.js';
import { projectRoutes } from './routes/projects.js';
import { serviceRoutes } from './routes/services.js';
import { versionRoutes } from './routes/versions.js';
import { tokenRoutes } from './routes/tokens.js';
import { auditRoutes } from './routes/audit.js';
import { opsRoutes } from './routes/ops.js';
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
  ServiceRepo,
  ArtifactRepo,
  TagRepo,
  TokenRepo,
  AuditRepo,
  OutboxRepo,
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
  repos: {
    organizations: OrganizationRepo;
    accounts: AccountRepo;
    memberships: MembershipMirrorRepo;
    workosEventLog: WorkosEventLogRepo;
    projects: ProjectRepo;
    services: ServiceRepo;
    artifacts: ArtifactRepo;
    tags: TagRepo;
    tokens: TokenRepo;
    audit: AuditRepo;
    outbox: OutboxRepo;
  };
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use('*', requestId());
  app.use('*', loggerMiddleware(deps.logger));
  app.use('*', errorHandler());
  app.use('*', corsMiddleware(deps.env.PLATFORM_CORS_ORIGINS));

  const apiTokenProvider = new ApiTokenProvider({
    tokens: deps.repos.tokens,
    organizations: deps.repos.organizations,
    accounts: deps.repos.accounts,
    memberships: deps.repos.memberships,
  });
  const workosProvider = new WorkOSAuthKitProvider({
    workos: deps.workos,
    cookiePassword: deps.cookiePassword,
    organizations: deps.repos.organizations,
    accounts: deps.repos.accounts,
    memberships: deps.repos.memberships,
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
      repos: {
        organizations: deps.repos.organizations,
        accounts: deps.repos.accounts,
        memberships: deps.repos.memberships,
        projects: deps.repos.projects,
        workosEventLog: deps.repos.workosEventLog,
      },
    }),
  );

  app.route(
    '/v1/auth',
    authRoutes({
      workos: deps.workos,
      env: deps.env,
      cookiePassword: deps.cookiePassword,
      repos: {
        organizations: deps.repos.organizations,
        accounts: deps.repos.accounts,
        memberships: deps.repos.memberships,
      },
    }),
  );

  const rateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 1000 });
  const authed = new Hono()
    .use('*', requireAuth([apiTokenProvider, workosProvider]))
    .use('*', rateLimit(rateLimiter, (c) => c.get('subject').tokenId ?? c.get('subject').account.id));

  authed.route('/v1/orgs', orgRoutes({ organizations: deps.repos.organizations }));
  authed.route(
    '/v1/orgs/:orgSlug/projects',
    projectRoutes({
      organizations: deps.repos.organizations,
      projects: deps.repos.projects,
      ids: deps.ids,
    }),
  );
  authed.route(
    '/v1/orgs/:orgSlug/projects/:projSlug/services',
    serviceRoutes({
      organizations: deps.repos.organizations,
      projects: deps.repos.projects,
      services: deps.repos.services,
      ids: deps.ids,
    }),
  );
  authed.route(
    '/v1/orgs/:orgSlug/projects/:projSlug/services/:svcSlug',
    versionRoutes({
      organizations: deps.repos.organizations,
      projects: deps.repos.projects,
      services: deps.repos.services,
      artifacts: deps.repos.artifacts,
      tags: deps.repos.tags,
      blob: deps.blob,
      ids: deps.ids,
    }),
  );
  authed.route('/v1/orgs/:orgSlug/tokens', tokenRoutes({ tokens: deps.repos.tokens, ids: deps.ids }));
  authed.route('/v1/orgs/:orgSlug/audit', auditRoutes({ audit: deps.repos.audit }));

  app.route('/', authed);

  return app;
}
