import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Hono } from 'hono';
import { describe, it, expect, vi } from 'vitest';
import { InMemoryRateLimiter, PostgresRateLimiter, rateLimit } from '../../../src/middleware/rate-limit.js';

describe('InMemoryRateLimiter', () => {
  it('allows up to N within window, then rejects', () => {
    const l = new InMemoryRateLimiter({ windowMs: 1000, max: 3 });
    const key = 'tok-1';
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(false);
  });
  it('forgets after window', async () => {
    const l = new InMemoryRateLimiter({ windowMs: 30, max: 1 });
    expect(l.check('k')).toBe(true);
    expect(l.check('k')).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(l.check('k')).toBe(true);
  });
});

describe('PostgresRateLimiter', () => {
  it('uses the database count and hashes the limiter key', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const limiter = new PostgresRateLimiter({ db: { query } as never, windowMs: 60_000, max: 2 });

    await expect(limiter.check('account-raw-id')).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain('DELETE FROM platform_rate_limit');
    const values = query.mock.calls[1]?.[1] as unknown[];
    expect(Buffer.isBuffer(values[0])).toBe(true);
    expect((values[0] as Buffer).toString('hex')).toBe(createHash('sha256').update('account-raw-id').digest('hex'));
    expect(values).not.toContain('account-raw-id');
  });

  it('rejects when the database count exceeds max', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 3 }] });
    const limiter = new PostgresRateLimiter({ db: { query } as never, windowMs: 60_000, max: 2 });

    await expect(limiter.check('token-raw-id')).resolves.toBe(false);
  });

  it('returns 429 from middleware when the database limiter rejects', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 3 }] });
    const limiter = new PostgresRateLimiter({ db: { query } as never, windowMs: 60_000, max: 2 });
    const app = new Hono().use('*', rateLimit(limiter, () => 'account-raw-id')).get('/limited', (c) => c.json({ ok: true }));

    const response = await app.request('/limited');

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'PLATFORM_RATE_LIMITED', message: 'rate limit exceeded' },
    });
  });
});
