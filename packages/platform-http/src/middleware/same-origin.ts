import type { MiddlewareHandler } from 'hono';

/**
 * Blocks non-GET requests whose Origin (preferred) or Referer does not start
 * with the provided base URL. Defence-in-depth alongside SameSite=Lax cookies.
 *
 * Intended for UI mutation routes only. API routes on /v1/* should not use this —
 * bearer tokens are their CSRF defence.
 */
export function sameOriginOnly(baseUrl: string): MiddlewareHandler {
  const base = baseUrl.replace(/\/$/, '');
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
      return next();
    }
    const origin = c.req.header('origin');
    const referer = c.req.header('referer');
    const matches =
      (origin !== undefined && origin === base) ||
      (referer !== undefined && referer.startsWith(base + '/'));
    if (!matches) {
      return c.json({ error: { code: 'PLATFORM_AUTH_CSRF', message: 'cross-origin request blocked' } }, 403);
    }
    return next();
  };
}
