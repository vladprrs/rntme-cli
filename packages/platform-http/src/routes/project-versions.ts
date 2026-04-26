import { Buffer } from 'node:buffer';
import { Hono, type Context } from 'hono';
import {
  getProjectVersion,
  isOk,
  ListProjectVersionsQuerySchema,
  listProjectVersions,
  parseCanonicalBundle,
  publishProjectVersion,
  type BlobStore,
  type Ids,
} from '@rntme-cli/platform-core';
import type { PoolClient } from 'pg';
import { requireOrgMatch, requireScope } from '../middleware/auth.js';
import { materializeAndCompose } from '../blueprint/load.js';
import {
  resolveDeps as defaultResolveDeps,
  type RequestRepos,
} from '../resolve-deps.js';
import { respond, resolveProject } from './helpers.js';

const BUNDLE_CONTENT_TYPE = 'application/rntme-project-bundle+json';
const BUNDLE_MAX_BYTES = 10 * 1024 * 1024;

type Deps = {
  readonly blob: BlobStore;
  readonly ids: Ids;
  readonly resolveDeps?: (tx: PoolClient) => RequestRepos;
};

export function projectVersionRoutes(deps: Deps): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;

  app.use('*', requireOrgMatch('orgSlug'));

  app.post('/versions', requireScope('version:publish'), async (c) => {
    const repos = resolve(c.get('tx'));
    const orgSlug = c.req.param('orgSlug');
    const projSlug = c.req.param('projSlug');
    if (!orgSlug || !projSlug) {
      return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: 'missing path params' } }, 400);
    }
    const project = await resolveProject(repos, orgSlug, projSlug);
    if (!project.ok) return respond(c, project);

    const ct = c.req.header('content-type') ?? '';
    if (!ct.startsWith(BUNDLE_CONTENT_TYPE)) {
      return c.json(
        {
          error: {
            code: 'PROJECT_VERSION_BUNDLE_INVALID_SHAPE',
            message: `expected ${BUNDLE_CONTENT_TYPE}`,
          },
        },
        415,
      );
    }

    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.byteLength > BUNDLE_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: 'PROJECT_VERSION_BUNDLE_TOO_LARGE',
            message: `max ${BUNDLE_MAX_BYTES} bytes`,
          },
        },
        413,
      );
    }

    const parsed = parseCanonicalBundle(bytes);
    if (!isOk(parsed)) return respond(c, parsed);

    const existing = await repos.projectVersions.findByDigest(
      project.value.project.id,
      parsed.value.digest,
    );
    if (!isOk(existing)) return respond(c, existing);

    const composed = await materializeAndCompose(parsed.value.bundle);
    if (!isOk(composed)) return respond(c, composed);

    if (existing.value) return c.json({ version: existing.value }, 200);

    const subject = c.get('subject');
    const published = await publishProjectVersion(
      {
        repos: {
          projects: repos.projects,
          projectVersions: repos.projectVersions,
        },
        blob: deps.blob,
        ids: deps.ids,
      },
      {
        orgId: subject.org.id,
        projectId: project.value.project.id,
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
        bundleBytes: bytes,
        bundleDigest: parsed.value.digest,
        summary: composed.value.summary,
      },
    );
    return respond(c, published, 201, 'version');
  });

  app.get('/versions', requireScope('project:read'), async (c) => {
    const repos = resolve(c.get('tx'));
    const project = await resolveProject(
      repos,
      c.req.param('orgSlug') ?? '',
      c.req.param('projSlug') ?? '',
    );
    if (!project.ok) return respond(c, project);
    const query = ListProjectVersionsQuerySchema.safeParse({
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
    });
    if (!query.success) {
      return c.json(
        { error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: query.error.message } },
        400,
      );
    }
    const versions = await listProjectVersions(
      { repos: { projectVersions: repos.projectVersions } },
      {
        projectId: project.value.project.id,
        limit: query.data.limit,
        cursor: query.data.cursor,
      },
    );
    return respond(c, versions, 200, 'versions');
  });

  app.get('/versions/:seq', requireScope('project:read'), async (c) => {
    const resolved = await resolveVersion(c, resolve(c.get('tx')));
    if (!resolved.ok) return respond(c, resolved);
    return c.json({ version: resolved.value.version });
  });

  app.get('/versions/:seq/bundle', requireScope('project:read'), async (c) => {
    const resolved = await resolveVersion(c, resolve(c.get('tx')));
    if (!resolved.ok) return respond(c, resolved);
    const url = await deps.blob.presignedGet(resolved.value.version.bundleBlobKey, 600);
    if (!isOk(url)) return respond(c, url);
    return c.redirect(url.value, 302);
  });

  return app;
}

async function resolveVersion(
  c: Context,
  repos: RequestRepos,
) {
  const project = await resolveProject(
    repos,
    c.req.param('orgSlug') ?? '',
    c.req.param('projSlug') ?? '',
  );
  if (!project.ok) return project;
  const seq = Number(c.req.param('seq'));
  if (!Number.isInteger(seq) || seq <= 0) {
    return {
      ok: false as const,
      errors: [{ code: 'PLATFORM_PARSE_PATH_INVALID' as const, message: 'seq' }],
    };
  }
  const version = await getProjectVersion(
    { repos: { projectVersions: repos.projectVersions } },
    { projectId: project.value.project.id, seq },
  );
  if (!isOk(version)) return version;
  if (!version.value) {
    return {
      ok: false as const,
      errors: [{ code: 'PROJECT_VERSION_NOT_FOUND' as const, message: `seq=${seq}` }],
    };
  }
  return { ok: true as const, value: { ...project.value, version: version.value } };
}
