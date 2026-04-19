import type { MiddlewareHandler } from 'hono';

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

export function rateLimit(
  limiter: InMemoryRateLimiter,
  keyFn: (c: Parameters<MiddlewareHandler>[0]) => string,
): MiddlewareHandler {
  return async (c, next) => {
    const key = keyFn(c);
    if (!limiter.check(key)) {
      return c.json({ error: { code: 'PLATFORM_RATE_LIMITED', message: 'rate limit exceeded' } }, 429);
    }
    await next();
  };
}
