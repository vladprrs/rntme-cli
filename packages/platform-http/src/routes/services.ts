import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  CreateServiceInputSchema,
  PatchServiceInputSchema,
  createService,
  listServices,
  getServiceDetail,
  patchService,
  archiveService,
  isOk,
} from '@rntme-cli/platform-core';
import type { Ids } from '@rntme-cli/platform-core';
import { requireScope, requireOrgMatch } from '../middleware/auth.js';
import { respond, resolveProject } from './helpers.js';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import type { PoolClient } from 'pg';

function orgProjFrom(c: Context): { orgSlug: string; projSlug: string } | null {
  const orgSlug = c.req.param('orgSlug');
  const projSlug = c.req.param('projSlug');
  if (orgSlug === undefined || projSlug === undefined) return null;
  return { orgSlug, projSlug };
}

export function serviceRoutes(deps: {
  ids: Ids;
  resolveDeps?: (tx: PoolClient) => RequestRepos;
}): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;
  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const op = orgProjFrom(c);
    if (!op) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'orgSlug and projSlug required' } }, 400);
    const r0 = await resolveProject(repos, op.orgSlug, op.projSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const body = await c.req.json().catch(() => null);
    const parsed = CreateServiceInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const r = await createService(
      { repos: { services: repos.services }, ids: deps.ids },
      {
        orgId: r0.value.org.id,
        projectId: r0.value.project.id,
        slug: parsed.data.slug,
        displayName: parsed.data.displayName,
      },
    );
    return respond(c, r, 201);
  });

  app.get('/', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const op = orgProjFrom(c);
    if (!op) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'orgSlug and projSlug required' } }, 400);
    const r0 = await resolveProject(repos, op.orgSlug, op.projSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const r = await listServices(
      { repos: { services: repos.services } },
      { orgId: r0.value.org.id, projectId: r0.value.project.id },
    );
    return respond(c, r);
  });

  app.get('/:svcSlug', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const op = orgProjFrom(c);
    if (!op) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'orgSlug and projSlug required' } }, 400);
    const r0 = await resolveProject(repos, op.orgSlug, op.projSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const svcSlug = c.req.param('svcSlug');
    if (svcSlug === undefined)
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'svcSlug required' } }, 400);
    const s = await repos.services.findBySlug(r0.value.project.id, svcSlug);
    if (!isOk(s) || !s.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: svcSlug } }, 404);
    const r = await getServiceDetail({ repos: { services: repos.services } }, { orgId: r0.value.org.id, id: s.value.id });
    return respond(c, r);
  });

  app.patch('/:svcSlug', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const op = orgProjFrom(c);
    if (!op) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'orgSlug and projSlug required' } }, 400);
    const r0 = await resolveProject(repos, op.orgSlug, op.projSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const body = await c.req.json().catch(() => null);
    const parsed = PatchServiceInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const svcSlug = c.req.param('svcSlug');
    if (svcSlug === undefined)
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'svcSlug required' } }, 400);
    const s = await repos.services.findBySlug(r0.value.project.id, svcSlug);
    if (!isOk(s) || !s.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: svcSlug } }, 404);
    const r = await patchService(
      { repos: { services: repos.services } },
      { orgId: r0.value.org.id, id: s.value.id, displayName: parsed.data.displayName },
    );
    return respond(c, r);
  });

  app.post('/:svcSlug/archive', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const op = orgProjFrom(c);
    if (!op) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'orgSlug and projSlug required' } }, 400);
    const r0 = await resolveProject(repos, op.orgSlug, op.projSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const svcSlug = c.req.param('svcSlug');
    if (svcSlug === undefined)
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'svcSlug required' } }, 400);
    const s = await repos.services.findBySlug(r0.value.project.id, svcSlug);
    if (!isOk(s) || !s.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: svcSlug } }, 404);
    const r = await archiveService({ repos: { services: repos.services } }, { orgId: r0.value.org.id, id: s.value.id });
    return respond(c, r);
  });

  return app;
}
