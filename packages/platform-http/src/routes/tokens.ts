import { Hono } from 'hono';
import { CreateTokenInputSchema, createToken, listTokens, revokeToken } from '@rntme-cli/platform-core';
import type { TokenRepo, Ids } from '@rntme-cli/platform-core';
import { requireScope, requireOrgMatch } from '../middleware/auth.js';
import { respond } from './helpers.js';

export function tokenRoutes(deps: { tokens: TokenRepo; ids: Ids }): Hono {
  const app = new Hono();
  app.use('*', requireOrgMatch('orgSlug'), requireScope('token:manage'));

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreateTokenInputSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: { code: 'PLATFORM_PARSE_BODY_INVALID', message: parsed.error.message } }, 400);
    const s = c.get('subject');
    const r = await createToken(
      { repos: { tokens: deps.tokens }, ids: deps.ids },
      {
        orgId: s.org.id,
        accountId: s.account.id,
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        creatorScopes: s.scopes as never,
      },
    );
    if (!r.ok) return respond(c, r);
    const { token, plaintext } = r.value;
    return c.json(
      {
        id: token.id,
        plaintext,
        prefix: token.prefix,
        scopes: token.scopes,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        name: token.name,
      },
      201,
    );
  });

  app.get('/', async (c) => {
    const s = c.get('subject');
    const r = await listTokens({ repos: { tokens: deps.tokens } }, { orgId: s.org.id });
    if (!r.ok) return respond(c, r);
    return c.json({
      tokens: r.value.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        scopes: t.scopes,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        createdAt: t.createdAt,
      })),
    });
  });

  app.delete('/:id', async (c) => {
    const s = c.get('subject');
    const r = await revokeToken({ repos: { tokens: deps.tokens } }, { orgId: s.org.id, id: c.req.param('id') });
    return respond(c, r, 204);
  });

  return app;
}
