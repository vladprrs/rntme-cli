import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { openOrgScopedTx } from '../../../src/middleware/tx.js';

function makePoolStub() {
  const queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [] };
    }),
    release,
  };
  const connect = vi.fn(async () => client);
  return { pool: { connect } as never, client, queries, release };
}

describe('openOrgScopedTx', () => {
  it('issues BEGIN, SET LOCAL app.org_id, runs handler, COMMITs, releases', async () => {
    const { pool, queries, release } = makePoolStub();
    const app = new Hono();
    app.use('*', (c, next) => {
      c.set('subject', { org: { id: 'org-1', slug: 'a' } } as never);
      return next();
    });
    app.use('*', openOrgScopedTx(pool));
    app.get('/', (c) => c.text(c.get('tx') ? 'ok' : 'no-tx'));
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(queries.map((q) => q.sql)).toEqual([
      'BEGIN',
      expect.stringContaining("set_config('app.org_id', $1, true)"),
      'COMMIT',
    ]);
    expect(queries[1]!.params).toEqual(['org-1']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does NOT use SET LOCAL with a bound parameter (Postgres 42601 regression)', async () => {
    // Guard: `SET LOCAL key = $1` is a Postgres syntax error; the correct
    // parameterised form is `SELECT set_config('key', $1, true)`.
    const { pool, queries } = makePoolStub();
    const app = new Hono();
    app.use('*', (c, next) => {
      c.set('subject', { org: { id: 'org-1', slug: 'a' } } as never);
      return next();
    });
    app.use('*', openOrgScopedTx(pool));
    app.get('/', (c) => c.text('ok'));
    await app.request('/');
    const rawSqls = queries.map((q) => q.sql).join('\n');
    expect(rawSqls).not.toMatch(/SET\s+LOCAL\s+app\.org_id\s*=\s*\$\d/);
  });

  it('ROLLBACKs when the handler throws', async () => {
    const { pool, queries, release } = makePoolStub();
    const app = new Hono();
    app.use('*', (c, next) => {
      c.set('subject', { org: { id: 'org-x', slug: 'x' } } as never);
      return next();
    });
    app.use('*', openOrgScopedTx(pool));
    app.get('/', () => {
      throw new Error('boom');
    });
    const res = await app.request('/');
    expect(res.status).toBe(500);
    expect(queries.map((q) => q.sql)).toEqual([
      'BEGIN',
      expect.stringContaining("set_config('app.org_id', $1, true)"),
      'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
