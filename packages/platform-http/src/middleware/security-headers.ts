import type { MiddlewareHandler } from 'hono';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.tailwindcss.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Security headers for UI (HTML) responses. Do not apply to /v1/* JSON API —
 * the CSP would block nothing useful there but adds noise to headers.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.res.headers.set('Content-Security-Policy', CSP);
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  };
}
