import { Hono } from 'hono';
import {
  PublishRequestSchema,
  MoveTagInputSchema,
  ListVersionsQuerySchema,
  publishVersion,
  listVersions,
  getVersion,
  getBundle,
  moveTag,
  deleteTag,
  listTags,
  isOk,
  blobKey,
} from '@rntme-cli/platform-core';
import type { BlobStore, Ids } from '@rntme-cli/platform-core';
import { requireScope, requireOrgMatch } from '../middleware/auth.js';
import { respond, resolveService } from './helpers.js';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import type { PoolClient } from 'pg';

type Deps = {
  blob: BlobStore;
  ids: Ids;
  resolveDeps?: (tx: PoolClient) => RequestRepos;
};

function svcParams(c: { req: { param: (k: string) => string | undefined } }) {
  const orgSlug = c.req.param('orgSlug');
  const projSlug = c.req.param('projSlug');
  const svcSlug = c.req.param('svcSlug');
  if (orgSlug === undefined || projSlug === undefined || svcSlug === undefined) return null;
  return { orgSlug, projSlug, svcSlug };
}

export function versionRoutes(deps: Deps): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;
  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/versions', requireScope('version:publish'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const body = await c.req.json().catch(() => null);
    const parsed = PublishRequestSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const s = c.get('subject');
    const r = await publishVersion(
      { repos: { artifacts: repos.artifacts, services: repos.services }, blob: deps.blob, ids: deps.ids },
      {
        orgId: s.org.id,
        serviceId: r0.value.service.id,
        accountId: s.account.id,
        tokenId: s.tokenId ?? null,
        bundle: parsed.data.bundle,
        ...(parsed.data.previousVersionSeq !== undefined
          ? { previousVersionSeq: parsed.data.previousVersionSeq }
          : {}),
        ...(parsed.data.message !== undefined ? { message: parsed.data.message } : {}),
        ...(parsed.data.moveTags !== undefined ? { moveTags: parsed.data.moveTags } : {}),
      },
    );
    return respond(c, r, 201, 'version');
  });

  app.get('/versions', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const q = ListVersionsQuerySchema.safeParse({ limit: c.req.query('limit'), cursor: c.req.query('cursor') });
    if (!q.success) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: q.error.message } }, 400);
    const r = await listVersions(
      { repos: { artifacts: repos.artifacts } },
      { serviceId: r0.value.service.id, limit: q.data.limit, cursor: q.data.cursor },
    );
    return respond(c, r, 200, 'versions');
  });

  app.get('/versions/:seq', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const seq = Number(c.req.param('seq'));
    if (!Number.isInteger(seq) || seq <= 0)
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'seq' } }, 400);
    const v = await getVersion({ repos: { artifacts: repos.artifacts } }, { serviceId: r0.value.service.id, seq });
    if (!isOk(v)) return respond(c, v);
    const per: Record<string, string> = {
      manifest: v.value.manifestDigest,
      pdm: v.value.pdmDigest,
      qsm: v.value.qsmDigest,
      graphIr: v.value.graphIrDigest,
      bindings: v.value.bindingsDigest,
      ui: v.value.uiDigest,
      seed: v.value.seedDigest,
    };
    const urls: Record<string, string> = {};
    for (const [k, d] of Object.entries(per)) {
      const u = await deps.blob.presignedGet(blobKey(d), 600);
      if (isOk(u)) urls[k] = u.value;
    }
    return c.json({ version: v.value, files: urls });
  });

  app.get('/versions/by-digest/:bundleDigest', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const r = await repos.artifacts.findByDigest(r0.value.service.id, c.req.param('bundleDigest'));
    if (!isOk(r)) return respond(c, r);
    if (!r.value)
      return c.json({ error: { code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: 'digest not found' } }, 404);
    return c.json({ version: r.value });
  });

  app.get('/versions/:seq/bundle', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const seq = Number(c.req.param('seq'));
    if (!Number.isInteger(seq) || seq <= 0)
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'seq' } }, 400);
    const r = await getBundle(
      { repos: { artifacts: repos.artifacts }, blob: deps.blob },
      { serviceId: r0.value.service.id, seq },
    );
    return respond(c, r);
  });

  app.get('/tags', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const r = await listTags({ repos: { tags: repos.tags } }, { serviceId: r0.value.service.id });
    return respond(c, r, 200, 'tags');
  });

  app.put('/tags/:tagName', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const body = await c.req.json().catch(() => null);
    const parsed = MoveTagInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const s = c.get('subject');
    const r = await moveTag(
      { repos: { tags: repos.tags, artifacts: repos.artifacts } },
      {
        serviceId: r0.value.service.id,
        name: c.req.param('tagName'),
        versionSeq: parsed.data.versionSeq,
        updatedByAccountId: s.account.id,
      },
    );
    return respond(c, r, 200, 'tag');
  });

  app.delete('/tags/:tagName', requireScope('project:write'), async (c) => {
    const repos = resolve(c.get('tx'));
    const p = svcParams(c);
    if (!p) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    const r0 = await resolveService(repos, p.orgSlug, p.projSlug, p.svcSlug);
    if (!r0.ok) return respond(c, r0 as never);
    const s = c.get('subject');
    const r = await deleteTag(
      { repos: { tags: repos.tags } },
      { serviceId: r0.value.service.id, name: c.req.param('tagName'), actorAccountId: s.account.id },
    );
    return respond(c, r, 204);
  });

  return app;
}
