import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { sameOriginOnly } from '../../../src/middleware/same-origin.js';

describe('sameOriginOnly', () => {
  const make = (base: string) => {
    const app = new Hono();
    app.use('*', sameOriginOnly(base));
    app.post('/x', (c) => c.text('ok'));
    return app;
  };

  it('allows a request whose Origin matches the base URL', async () => {
    const app = make('https://platform.rntme.com');
    const r = await app.request('/x', {
      method: 'POST',
      headers: { Origin: 'https://platform.rntme.com' },
    });
    expect(r.status).toBe(200);
  });

  it('allows a request whose Referer starts with the base URL', async () => {
    const app = make('https://platform.rntme.com');
    const r = await app.request('/x', {
      method: 'POST',
      headers: { Referer: 'https://platform.rntme.com/tokens' },
    });
    expect(r.status).toBe(200);
  });

  it('rejects a request with a foreign Origin', async () => {
    const app = make('https://platform.rntme.com');
    const r = await app.request('/x', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error.code).toBe('PLATFORM_AUTH_CSRF');
  });

  it('rejects a request with no Origin or Referer', async () => {
    const app = make('https://platform.rntme.com');
    const r = await app.request('/x', { method: 'POST' });
    expect(r.status).toBe(403);
  });

  it('skips GET requests', async () => {
    const app = new Hono();
    app.use('*', sameOriginOnly('https://platform.rntme.com'));
    app.get('/x', (c) => c.text('ok'));
    const r = await app.request('/x');
    expect(r.status).toBe(200);
  });
});
