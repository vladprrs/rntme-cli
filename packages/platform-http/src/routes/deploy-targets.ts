import { Hono } from 'hono';
import {
  CreateDeployTargetRequestSchema,
  RotateApiTokenRequestSchema,
  UpdateDeployTargetRequestSchema,
  createDeployTarget,
  deleteDeployTarget,
  getDeployTarget,
  isOk,
  listDeployTargets,
  rotateDeployTargetApiToken,
  setDefaultDeployTarget,
  updateDeployTarget,
  type Ids,
  type SecretCipher,
} from '@rntme-cli/platform-core';
import type { PoolClient } from 'pg';
import { requireOrgMatch, requireScope } from '../middleware/auth.js';
import { resolveDeps as defaultResolveDeps, type RequestRepos } from '../resolve-deps.js';
import { respond } from './helpers.js';

type Deps = {
  readonly ids: Ids;
  readonly cipher: SecretCipher;
  readonly resolveDeps?: (tx: PoolClient) => RequestRepos;
};

export function deployTargetRoutes(deps: Deps): Hono {
  const app = new Hono();
  const resolve = deps.resolveDeps ?? defaultResolveDeps;

  app.use('*', requireOrgMatch('orgSlug'));

  app.get('/', requireScope('deploy:target:manage'), async (c) => {
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    return respond(c, await listDeployTargets({ repos }, { orgId: subject.org.id }), 200, 'targets');
  });

  app.post('/', requireScope('deploy:target:manage'), async (c) => {
    const parsed = CreateDeployTargetRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    }
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await createDeployTarget(
      { repos, cipher: deps.cipher, ids: deps.ids },
      {
        orgId: subject.org.id,
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
        req: parsed.data,
      },
    );
    return respond(c, result, 201, 'target');
  });

  app.get('/:targetSlug', requireScope('deploy:target:manage'), async (c) => {
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await getDeployTarget(
      { repos },
      { orgId: subject.org.id, slug: c.req.param('targetSlug') },
    );
    if (isOk(result) && result.value === null) {
      return c.json({ error: { code: 'DEPLOY_TARGET_NOT_FOUND', message: c.req.param('targetSlug') } }, 404);
    }
    return respond(c, result, 200, 'target');
  });

  app.patch('/:targetSlug', requireScope('deploy:target:manage'), async (c) => {
    const parsed = UpdateDeployTargetRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    }
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await updateDeployTarget(
      { repos },
      {
        orgId: subject.org.id,
        slug: c.req.param('targetSlug'),
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
        patch: parsed.data,
      },
    );
    return respond(c, result, 200, 'target');
  });

  app.put('/:targetSlug/api-token', requireScope('deploy:target:manage'), async (c) => {
    const parsed = RotateApiTokenRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    }
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await rotateDeployTargetApiToken(
      { repos, cipher: deps.cipher, ids: deps.ids },
      {
        orgId: subject.org.id,
        slug: c.req.param('targetSlug'),
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
        req: parsed.data,
      },
    );
    return respond(c, result, 200, 'target');
  });

  app.put('/:targetSlug/default', requireScope('deploy:target:manage'), async (c) => {
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await setDefaultDeployTarget(
      { repos },
      {
        orgId: subject.org.id,
        slug: c.req.param('targetSlug'),
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
      },
    );
    return respond(c, result, 200, 'target');
  });

  app.delete('/:targetSlug', requireScope('deploy:target:manage'), async (c) => {
    const subject = c.get('subject');
    const repos = resolve(c.get('tx'));
    const result = await deleteDeployTarget(
      { repos },
      {
        orgId: subject.org.id,
        slug: c.req.param('targetSlug'),
        accountId: subject.account.id,
        tokenId: subject.tokenId ?? null,
      },
    );
    return respond(c, result, 204);
  });

  return app;
}
