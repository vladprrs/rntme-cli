import { Hono } from 'hono';
import {
  StartDeploymentRequestSchema,
  getDeployment,
  isOk,
  listDeployments,
  readDeploymentLogs,
  startDeployment,
  type Ids,
} from '@rntme-cli/platform-core';
import type { PoolClient } from 'pg';
import { requireOrgMatch, requireScope } from '../middleware/auth.js';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import { respond, resolveProject } from './helpers.js';

type Deps = {
  readonly ids: Ids;
  readonly resolveDeps?: (tx: PoolClient) => RequestRepos;
  readonly scheduleDeployment?: (deploymentId: string, orgId: string) => void;
};

export function deploymentRoutes(deps: Deps): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;

  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/deployments', requireScope('deploy:execute'), async (c) => {
    const parsed = StartDeploymentRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    }
    const repos = resolve(c.get('tx'));
    const project = await resolveProject(repos, c.req.param('orgSlug') ?? '', c.req.param('projSlug') ?? '');
    if (!project.ok) return respond(c, project);
    const subject = c.get('subject');
    const result = await startDeployment(
      { repos, ids: deps.ids },
      {
        orgId: subject.org.id,
        projectId: project.value.project.id,
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
        req: parsed.data,
      },
    );
    if (isOk(result)) deps.scheduleDeployment?.(result.value.id, subject.org.id);
    return respond(c, result, 202, 'deployment');
  });

  app.get('/deployments', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const project = await resolveProject(repos, c.req.param('orgSlug') ?? '', c.req.param('projSlug') ?? '');
    if (!project.ok) return respond(c, project);
    const result = await listDeployments(
      { repos },
      { projectId: project.value.project.id, limit: Number(c.req.query('limit') ?? 50) },
    );
    return respond(c, result, 200, 'deployments');
  });

  app.get('/deployments/:deploymentId', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const result = await getDeployment({ repos }, { id: c.req.param('deploymentId') });
    if (isOk(result) && result.value === null) {
      return c.json({ error: { code: 'DEPLOYMENT_NOT_FOUND', message: c.req.param('deploymentId') } }, 404);
    }
    return respond(c, result, 200, 'deployment');
  });

  app.get('/deployments/:deploymentId/logs', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const result = await readDeploymentLogs(
      { repos },
      {
        deploymentId: c.req.param('deploymentId'),
        sinceLineId: Number(c.req.query('sinceLineId') ?? 0),
        limit: Number(c.req.query('limit') ?? 200),
      },
    );
    return respond(c, result, 200);
  });

  return app;
}
