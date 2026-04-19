import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('app skeleton', () => {
  it('GET /health returns 200 ok', async () => {
    const app = createApp({} as never);
    const r = await app.request('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok' });
  });
});
