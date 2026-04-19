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
import type { OrganizationRepo, ProjectRepo, Ids } from '@rntme-cli/platform-core';
import { requireScope, requireOrgMatch } from '../middleware/auth.js';
import { respond } from './helpers.js';

export function projectRoutes(deps: { organizations: OrganizationRepo; projects: ProjectRepo; ids: Ids }): Hono {
  const app = new Hono();

  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/', requireScope('project:write'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreateProjectInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const s = c.get('subject');
    const r = await createProject(
      { repos: { projects: deps.projects }, ids: deps.ids },
      { orgId: s.org.id, ...parsed.data },
    );
    return respond(c, r, 201);
  });

  app.get('/', requireScope('project:read'), async (c) => {
    const includeArchived = c.req.query('includeArchived') === 'true';
    const s = c.get('subject');
    const r = await listProjects({ repos: { projects: deps.projects } }, { orgId: s.org.id, includeArchived });
    return respond(c, r);
  });

  app.get('/:projSlug', requireScope('project:read'), async (c) => {
    const s = c.get('subject');
    const p = await deps.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    const count = await deps.projects.countServices(s.org.id, p.value.id);
    return c.json({ project: p.value, serviceCount: isOk(count) ? count.value : 0 });
  });

  app.patch('/:projSlug', requireScope('project:write'), async (c) => {
    const s = c.get('subject');
    const body = await c.req.json().catch(() => null);
    const parsed = PatchProjectInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const p = await deps.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    const r = await patchProject(
      { repos: { projects: deps.projects } },
      { orgId: s.org.id, id: p.value.id, displayName: parsed.data.displayName },
    );
    return respond(c, r);
  });

  app.post('/:projSlug/archive', requireScope('project:write'), async (c) => {
    const s = c.get('subject');
    const p = await deps.projects.findBySlug(s.org.id, c.req.param('projSlug'));
    if (!isOk(p) || !p.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: c.req.param('projSlug') } }, 404);
    const r = await archiveProject({ repos: { projects: deps.projects } }, { orgId: s.org.id, id: p.value.id });
    return respond(c, r);
  });

  return app;
}
