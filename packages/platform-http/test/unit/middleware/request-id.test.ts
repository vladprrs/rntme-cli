import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestId } from '../../../src/middleware/request-id.js';

describe('requestId middleware', () => {
  it('echoes incoming X-Request-ID header', async () => {
    const app = new Hono().use(requestId()).get('/', (c) => c.json({ id: c.get('requestId') }));
    const r = await app.request('/', { headers: { 'x-request-id': 'abc123' } });
    expect(r.headers.get('x-request-id')).toBe('abc123');
    expect((await r.json()).id).toBe('abc123');
  });
  it('generates a UUID when header missing', async () => {
    const app = new Hono().use(requestId()).get('/', (c) => c.json({ id: c.get('requestId') }));
    const r = await app.request('/');
    const hdr = r.headers.get('x-request-id')!;
    expect(hdr).toMatch(/^[0-9a-f-]{36}$/);
  });
});
