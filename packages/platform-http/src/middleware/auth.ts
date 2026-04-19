import type { MiddlewareHandler } from 'hono';
import type { IdentityProvider, AuthSubject, Scope } from '@rntme-cli/platform-core';
import { isOk } from '@rntme-cli/platform-core';

declare module 'hono' {
  interface ContextVariableMap {
    subject: AuthSubject;
  }
}

export function requireAuth(providers: readonly IdentityProvider[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = {
      authorizationHeader: c.req.header('authorization'),
      cookieHeader: c.req.header('cookie'),
    };
    for (const p of providers) {
      const r = await p.authenticate(ctx);
      if (isOk(r)) {
        c.set('subject', r.value);
        return next();
      }
    }
    return c.json({ error: { code: 'PLATFORM_AUTH_MISSING', message: 'authentication required' } }, 401);
  };
}

export function requireScope(scope: Scope): MiddlewareHandler {
  return async (c, next) => {
    const s = c.get('subject');
    if (!s || !s.scopes.includes(scope)) {
      return c.json({ error: { code: 'PLATFORM_AUTH_FORBIDDEN', message: `missing scope ${scope}` } }, 403);
    }
    return next();
  };
}

export function requireOrgMatch(urlOrgSlugParam: string = 'orgSlug'): MiddlewareHandler {
  return async (c, next) => {
    const s = c.get('subject');
    const slug = c.req.param(urlOrgSlugParam);
    if (!s || s.org.slug !== slug) {
      return c.json({ error: { code: 'PLATFORM_AUTH_FORBIDDEN', message: 'org mismatch' } }, 403);
    }
    return next();
  };
}
