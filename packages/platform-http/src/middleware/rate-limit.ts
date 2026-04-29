import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

type RateLimiter = {
  check(key: string): boolean | Promise<boolean>;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export class InMemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly opts: { windowMs: number; max: number }) {}

  check(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.opts.windowMs);
    if (arr.length >= this.opts.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

export class PostgresRateLimiter {
  private lastCleanupMs = 0;

  constructor(private readonly opts: { db: Queryable; windowMs: number; max: number }) {}

  async check(key: string): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCleanupMs >= this.opts.windowMs) {
      this.lastCleanupMs = now;
      await this.opts.db.query(`DELETE FROM platform_rate_limit WHERE expires_at < $1`, [new Date(now)]);
    }

    const bucketKeyHash = createHash('sha256').update(key).digest();
    const windowStartMs = Math.floor(now / this.opts.windowMs) * this.opts.windowMs;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + this.opts.windowMs);
    const result = await this.opts.db.query<{ count: number }>(
      `INSERT INTO platform_rate_limit (bucket_key_hash, window_start, count, expires_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (bucket_key_hash, window_start)
       DO UPDATE SET count = platform_rate_limit.count + 1, expires_at = EXCLUDED.expires_at
       RETURNING count`,
      [bucketKeyHash, windowStart, expiresAt],
    );
    return Number(result.rows[0]?.count ?? 0) <= this.opts.max;
  }
}

export function rateLimit(
  limiter: RateLimiter,
  keyFn: (c: Parameters<MiddlewareHandler>[0]) => string,
): MiddlewareHandler {
  return async (c, next) => {
    const key = keyFn(c);
    if (!(await limiter.check(key))) {
      return c.json({ error: { code: 'PLATFORM_RATE_LIMITED', message: 'rate limit exceeded' } }, 429);
    }
    await next();
  };
}
