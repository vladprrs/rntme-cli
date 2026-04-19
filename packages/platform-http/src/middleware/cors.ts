import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

export function corsMiddleware(originsCsv: string): MiddlewareHandler {
  const allow = originsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      for (const a of allow) {
        if (a === origin) return origin;
        if (
          a.includes('*') &&
          new RegExp(`^${a.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`).test(origin)
        ) {
          return origin;
        }
      }
      return null;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });
}
