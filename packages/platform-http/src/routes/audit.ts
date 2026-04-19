import { Hono } from 'hono';
import { z } from 'zod';
import type { AuditRepo } from '@rntme-cli/platform-core';
import { requireOrgMatch } from '../middleware/auth.js';
import { respond } from './helpers.js';

const QuerySchema = z.object({
  resource: z.string().optional(),
  actor: z.string().uuid().optional(),
  action: z.string().optional(),
  since: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function auditRoutes(deps: { audit: AuditRepo }): Hono {
  const app = new Hono();
  app.use('*', requireOrgMatch('orgSlug'));

  app.get('/', async (c) => {
    const q = QuerySchema.safeParse({
      resource: c.req.query('resource'),
      actor: c.req.query('actor'),
      action: c.req.query('action'),
      since: c.req.query('since'),
      limit: c.req.query('limit'),
    });
    if (!q.success) return c.json({ error: { code: 'PLATFORM_PARSE_PATH_INVALID', message: q.error.message } }, 400);
    const s = c.get('subject');
    const opts: {
      resourceKind?: string;
      actorAccountId?: string;
      action?: string;
      since?: Date;
      limit: number;
    } = { limit: q.data.limit };
    if (q.data.resource !== undefined) opts.resourceKind = q.data.resource;
    if (q.data.actor !== undefined) opts.actorAccountId = q.data.actor;
    if (q.data.action !== undefined) opts.action = q.data.action;
    if (q.data.since !== undefined) opts.since = new Date(q.data.since);
    const r = await deps.audit.list(s.org.id, opts);
    return respond(c, r);
  });
  return app;
}
