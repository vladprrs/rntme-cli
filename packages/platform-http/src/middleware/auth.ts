import type { MiddlewareHandler } from 'hono';
import { setCookie } from 'hono/cookie';
import type { IdentityProvider, AuthSubject, Scope } from '@rntme-cli/platform-core';
import { isOk } from '@rntme-cli/platform-core';

declare module 'hono' {
  interface ContextVariableMap {
    subject: AuthSubject;
  }
}

export type RequireAuthOptions = {
  /** How to respond when every provider denies. Defaults to `'json'` for back-compat. */
  onUnauth?: 'json' | 'redirect';
  /** Target when `onUnauth` is `'redirect'`. Defaults to `/login`. */
  redirectTo?: string;
  /** Cookie domain used when a provider rotates the session; omit to skip rewrite. */
  sessionCookieDomain?: string | undefined;
};

export function requireAuth(
  providers: readonly IdentityProvider[],
  options: RequireAuthOptions = {},
): MiddlewareHandler {
  const onUnauth = options.onUnauth ?? 'json';
  const redirectTo = options.redirectTo ?? '/login';
  const sessionCookieDomain = options.sessionCookieDomain;
  return async (c, next) => {
    const ctx = {
      authorizationHeader: c.req.header('authorization'),
      cookieHeader: c.req.header('cookie'),
    };
    for (const p of providers) {
      const r = await p.authenticate(ctx);
      if (isOk(r)) {
        c.set('subject', r.value);
        if (r.value.refreshedSealedSession) {
          setCookie(c, 'rntme_session', r.value.refreshedSealedSession, {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            path: '/',
            ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {}),
            maxAge: 60 * 60 * 24 * 30,
          });
        }
        return next();
      }
    }
    if (onUnauth === 'redirect') return c.redirect(redirectTo, 302);
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
