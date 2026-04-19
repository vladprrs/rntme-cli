import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming ?? randomUUID();
    c.set('requestId', id);
    c.header('X-Request-ID', id);
    await next();
  };
}
