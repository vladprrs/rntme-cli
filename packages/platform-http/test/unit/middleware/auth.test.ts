import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireAuth, requireScope } from '../../../src/middleware/auth.js';
import type { IdentityProvider } from '@rntme-cli/platform-core';
import { ok, err } from '@rntme-cli/platform-core';

function makeProvider(subject: unknown | null): IdentityProvider {
  return {
    name: 'api-token',
    authenticate: async () =>
      subject ? ok(subject as never) : err([{ code: 'PLATFORM_AUTH_MISSING', message: '' }]),
  };
}

describe('requireAuth', () => {
  it('401 when no provider authenticates', async () => {
    const app = new Hono().use(requireAuth([makeProvider(null)])).get('/', (c) => c.text('ok'));
    const r = await app.request('/');
    expect(r.status).toBe(401);
  });
  it('passes when one provider authenticates', async () => {
    const subj = { account: { id: 'a' }, org: { id: 'o' }, role: 'member', scopes: ['project:read'] };
    const app = new Hono()
      .use(requireAuth([makeProvider(subj)]))
      .get('/', (c) => c.json({ who: c.get('subject') }));
    const r = await app.request('/', { headers: { authorization: 'Bearer rntme_pat_x' } });
    expect(r.status).toBe(200);
  });
  it('requireScope 403 when missing', async () => {
    const subj = { account: { id: 'a' }, org: { id: 'o' }, role: 'member', scopes: ['project:read'] };
    const app = new Hono()
      .use(requireAuth([makeProvider(subj)]))
      .use(requireScope('version:publish'))
      .get('/', (c) => c.text('ok'));
    const r = await app.request('/', { headers: { authorization: 'Bearer rntme_pat_x' } });
    expect(r.status).toBe(403);
  });

  it('returns JSON 401 by default when all providers deny', async () => {
    const app = new Hono();
    app.use('*', requireAuth([makeProvider(null)]));
    app.get('/x', (c) => c.text('ok'));
    const r = await app.request('/x');
    expect(r.status).toBe(401);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    const body = await r.json();
    expect(body.error.code).toBe('PLATFORM_AUTH_MISSING');
  });

  it('redirects to login when onUnauth is "redirect"', async () => {
    const app = new Hono();
    app.use('*', requireAuth([makeProvider(null)], { onUnauth: 'redirect', redirectTo: '/login' }));
    app.get('/x', (c) => c.text('ok'));
    const r = await app.request('/x', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });

  it('defaults redirectTo to /login', async () => {
    const app = new Hono();
    app.use('*', requireAuth([makeProvider(null)], { onUnauth: 'redirect' }));
    app.get('/x', (c) => c.text('ok'));
    const r = await app.request('/x', { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });
});
