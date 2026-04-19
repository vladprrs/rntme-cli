import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { bodyLimit } from '../../../src/middleware/body-limit.js';

describe('bodyLimit', () => {
  it('returns 413 on oversize request', async () => {
    const app = new Hono();
    app.post('/small', bodyLimit(8), (c) => c.text('ok'));
    const res = await app.request('/small', { method: 'POST', body: 'x'.repeat(100) });
    expect(res.status).toBe(413);
  });
  it('passes through small bodies', async () => {
    const app = new Hono();
    app.post('/small', bodyLimit(1024), (c) => c.text('ok'));
    const res = await app.request('/small', { method: 'POST', body: 'ok' });
    expect(res.status).toBe(200);
  });
  it('rejects oversize declared via Content-Length header', async () => {
    const app = new Hono();
    app.post('/small', bodyLimit(8), (c) => c.text('ok'));
    const res = await app.request('/small', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: 'x'.repeat(100),
    });
    expect(res.status).toBe(413);
  });
  it('drains and rejects when Content-Length is non-finite', async () => {
    const app = new Hono();
    app.post('/small', bodyLimit(8), (c) => c.text('ok'));
    const res = await app.request('/small', {
      method: 'POST',
      headers: { 'content-length': 'Infinity' },
      body: 'x'.repeat(100),
    });
    expect(res.status).toBe(413);
  });
});
