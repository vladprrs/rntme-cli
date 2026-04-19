import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { opsRoutes } from '../../../src/routes/ops.js';

describe('ops routes', () => {
  it('/health returns ok', async () => {
    const app = new Hono();
    app.route(
      '/',
      opsRoutes({
        pool: { query: async () => ({ rows: [] }) } as never,
        blob: { presignedGet: async () => ({ ok: true, value: 'u' }) } as never,
        workos: { listApiKeys: async () => ({}) } as never,
        openApiJson: () => ({}),
      }),
    );
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('/ready reports postgres, rustfs, and workos true when probes succeed', async () => {
    const app = new Hono();
    app.route(
      '/',
      opsRoutes({
        pool: { query: async () => ({ rows: [] }) } as never,
        blob: { presignedGet: async () => ({ ok: true, value: 'u' }) } as never,
        workos: { listApiKeys: async () => ({}) } as never,
        openApiJson: () => ({}),
      }),
    );
    const res = await app.request('/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks.postgres).toBe(true);
    expect(body.checks.rustfs).toBe(true);
    expect(body.checks.workos).toBe(true);
    expect(body.status).toBe('ready');
  });

  it('/ready marks workos false when the probe throws', async () => {
    const app = new Hono();
    app.route(
      '/',
      opsRoutes({
        pool: { query: async () => ({ rows: [] }) } as never,
        blob: { presignedGet: async () => ({ ok: true, value: 'u' }) } as never,
        workos: {
          listApiKeys: async () => {
            throw new Error('down');
          },
        } as never,
        openApiJson: () => ({}),
      }),
    );
    const res = await app.request('/ready');
    const body = await res.json();
    expect(body.checks.workos).toBe(false);
    // postgres+rustfs still ok, so overall status stays 'ready' per current contract
    expect(body.checks.postgres).toBe(true);
    expect(body.checks.rustfs).toBe(true);
  });

  it('/ready returns 503 degraded when postgres probe throws', async () => {
    const app = new Hono();
    app.route(
      '/',
      opsRoutes({
        pool: {
          query: async () => {
            throw new Error('pg down');
          },
        } as never,
        blob: { presignedGet: async () => ({ ok: true, value: 'u' }) } as never,
        workos: { listApiKeys: async () => ({}) } as never,
        openApiJson: () => ({}),
      }),
    );
    const res = await app.request('/ready');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.postgres).toBe(false);
    expect(body.status).toBe('degraded');
  });

  it('/openapi.json returns JSON from openApiJson()', async () => {
    const app = new Hono();
    app.route(
      '/',
      opsRoutes({
        pool: { query: async () => ({ rows: [] }) } as never,
        blob: { presignedGet: async () => ({ ok: true, value: 'u' }) } as never,
        workos: { listApiKeys: async () => ({}) } as never,
        openApiJson: () => ({ openapi: '3.1.0' }),
      }),
    );
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
  });
});
