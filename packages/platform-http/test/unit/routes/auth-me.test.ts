import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('/v1/auth/me', () => {
  it('returns 401 when no subject', async () => {
    const app = new Hono();
    app.get('/v1/auth/me', (c) =>
      c.json({ error: { code: 'PLATFORM_AUTH_MISSING', message: 'x' } }, 401),
    );
    const res = await app.request('/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
