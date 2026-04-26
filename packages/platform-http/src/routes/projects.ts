import { Hono } from 'hono';
import {
  CreateProjectInputSchema,
  PatchProjectInputSchema,
  createProject,
  listProjects,
  patchProject,
  archiveProject,
  isOk,
} from '@rntme-cli/platform-core';
import type { Ids } from '@rntme-cli/platform-core';
import { requireScope, requireOrgMatch } from '../middleware/auth.js';
import { respond } from './helpers.js';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import type { PoolClient } from 'pg';

export function projectRoutes(deps: {
  ids: Ids;
  resolveDeps?: (tx: PoolClient) => RequestRepos;
}): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;

  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const body = await c.req.json().catch(() => null);
    const parsed = CreateProjectInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const s = c.get('subject');
    const r = await createProject(
      { repos: { projects: repos.projects }, ids: deps.ids },
      { orgId: s.org.id, ...parsed.data },
    );
    return respond(c, r, 201, 'project');
  });

  app.get('/', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const includeArchived = c.req.query('includeArchived') === 'true';
    const s = c.get('subject');
    const r = await listProjects({ repos: { projects: repos.projects } }, { orgId: s.org.id, includeArchived });
    return respond(c, r, 200, 'projects');
  });

  app.get('/:projSlug', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const s = c.get('subject');
    const p = await repos.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    return c.json({ project: p.value });
  });

  app.patch('/:projSlug', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const s = c.get('subject');
    const body = await c.req.json().catch(() => null);
    const parsed = PatchProjectInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const p = await repos.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    const r = await patchProject(
      { repos: { projects: repos.projects } },
      { orgId: s.org.id, id: p.value.id, displayName: parsed.data.displayName },
    );
    return respond(c, r, 200, 'project');
  });

  app.post('/:projSlug/archive', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const s = c.get('subject');
    const p = await repos.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    const r = await archiveProject({ repos: { projects: repos.projects } }, { orgId: s.org.id, id: p.value.id });
    return respond(c, r, 200, 'project');
  });

  return app;
}
