import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AuthSubject } from '@rntme-cli/platform-core';

const mockSubject: AuthSubject = {
  account: {
    id: 'acct_01',
    workosUserId: 'user_wos_01',
    displayName: 'Test User',
    email: 'test@example.com',
  },
  org: {
    id: 'org_01',
    workosOrgId: 'org_wos_01',
    slug: 'test-org',
  },
  role: 'admin',
  scopes: ['project:read', 'project:write'],
  tokenId: undefined,
};

describe('/v1/auth/me', () => {
  it('returns subject shape with 200 when subject is set', async () => {
    const app = new Hono<{ Variables: { subject: AuthSubject } }>();
    app.use('*', async (c, next) => {
      c.set('subject', mockSubject);
      await next();
    });
    app.get('/v1/auth/me', (c) => {
      const s = c.get('subject');
      return c.json({
        account: s.account,
        org: s.org,
        role: s.role,
        scopes: s.scopes,
        tokenId: s.tokenId ?? null,
      });
    });

    const res = await app.request('/v1/auth/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      account: {
        id: 'acct_01',
        workosUserId: 'user_wos_01',
        displayName: 'Test User',
        email: 'test@example.com',
      },
      org: {
        id: 'org_01',
        workosOrgId: 'org_wos_01',
        slug: 'test-org',
      },
      role: 'admin',
      scopes: ['project:read', 'project:write'],
      tokenId: null,
    });
  });

  it('returns subject shape with nullable email when email is null', async () => {
    const subjectNoEmail: AuthSubject = { ...mockSubject, account: { ...mockSubject.account, email: null } };
    const app = new Hono<{ Variables: { subject: AuthSubject } }>();
    app.use('*', async (c, next) => {
      c.set('subject', subjectNoEmail);
      await next();
    });
    app.get('/v1/auth/me', (c) => {
      const s = c.get('subject');
      return c.json({
        account: s.account,
        org: s.org,
        role: s.role,
        scopes: s.scopes,
        tokenId: s.tokenId ?? null,
      });
    });

    const res = await app.request('/v1/auth/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account.email).toBeNull();
  });

  it('returns tokenId when present', async () => {
    const subjectWithToken: AuthSubject = { ...mockSubject, tokenId: 'tok_abc123' };
    const app = new Hono<{ Variables: { subject: AuthSubject } }>();
    app.use('*', async (c, next) => {
      c.set('subject', subjectWithToken);
      await next();
    });
    app.get('/v1/auth/me', (c) => {
      const s = c.get('subject');
      return c.json({
        account: s.account,
        org: s.org,
        role: s.role,
        scopes: s.scopes,
        tokenId: s.tokenId ?? null,
      });
    });

    const res = await app.request('/v1/auth/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenId).toBe('tok_abc123');
  });

  it('returns 401 when no subject', async () => {
    const app = new Hono();
    app.get('/v1/auth/me', (c) =>
      c.json({ error: { code: 'PLATFORM_AUTH_MISSING', message: 'x' } }, 401),
    );
    const res = await app.request('/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
