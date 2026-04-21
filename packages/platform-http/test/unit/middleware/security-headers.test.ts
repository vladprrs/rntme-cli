import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from '../../../src/middleware/security-headers.js';

describe('securityHeaders', () => {
  const app = new Hono();
  app.use('*', securityHeaders());
  app.get('/x', (c) => c.text('ok'));

  it('sets Content-Security-Policy', async () => {
    const r = await app.request('/x');
    const csp = r.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://cdn.tailwindcss.com https://unpkg.com");
    expect(csp).toContain("form-action 'self'");
  });

  it('sets X-Content-Type-Options', async () => {
    const r = await app.request('/x');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets Referrer-Policy', async () => {
    const r = await app.request('/x');
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});
