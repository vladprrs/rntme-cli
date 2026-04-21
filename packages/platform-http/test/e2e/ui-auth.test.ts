import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootE2e, type E2eEnv } from './harness.js';
import { e2eContainersAvailable } from './docker-available.js';

describe.skipIf(!e2eContainersAvailable())('UI auth entry', () => {
  let env: E2eEnv;

  beforeAll(async () => {
    env = await bootE2e();
  }, 300_000);

  afterAll(async () => {
    await env.teardown();
  });

  it('GET / unauth → 302 to /login', async () => {
    const r = await env.app.request('/');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });

  it('GET /login → 200 with Sign in link', async () => {
    const r = await env.app.request('/login');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const body = await r.text();
    expect(body).toContain('href="/v1/auth/login"');
  });

  it('GET /login → has security headers', async () => {
    const r = await env.app.request('/login');
    expect(r.headers.get('content-security-policy')).toBeTruthy();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('POST /logout without session → redirects to PLATFORM_BASE_URL', async () => {
    const r = await env.app.request('/logout', {
      method: 'POST',
      headers: { Origin: 'http://localhost', Accept: 'text/html' },
      redirect: 'manual',
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('http://localhost');
  });

  it('POST /logout with foreign Origin → 403', async () => {
    const r = await env.app.request('/logout', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', Accept: 'text/html' },
    });
    expect(r.status).toBe(403);
  });
});
