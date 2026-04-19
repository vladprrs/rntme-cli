import { Hono } from 'hono';
import type { Pool } from 'pg';
import type { BlobStore } from '@rntme-cli/platform-core';
import type { WorkOSClient } from '../auth/workos-client.js';

type WorkOSWithOptionalKeys = WorkOSClient & {
  listApiKeys?: (opts: { limit: number }) => Promise<unknown>;
};

export function opsRoutes(deps: {
  pool: Pool;
  blob: BlobStore;
  workos: WorkOSClient;
  openApiJson: () => object;
}): Hono {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/ready', async (c) => {
    const results: Record<string, boolean> = {};
    try {
      await deps.pool.query('SELECT 1');
      results.postgres = true;
    } catch {
      results.postgres = false;
    }
    try {
      const u = await deps.blob.presignedGet('health-check', 30);
      results.rustfs = u.ok;
    } catch {
      results.rustfs = false;
    }
    try {
      const w = deps.workos as WorkOSWithOptionalKeys;
      await w.listApiKeys?.({ limit: 1 });
      results.workos = true;
    } catch {
      results.workos = false;
    }
    const ok = results.postgres && results.rustfs;
    return c.json({ status: ok ? 'ready' : 'degraded', checks: results }, ok ? 200 : 503);
  });

  app.get('/openapi.json', (c) => c.json(deps.openApiJson()));

  app.get('/openapi.yaml', async (c) => {
    const json = deps.openApiJson();
    const { stringify } = await import('yaml');
    c.header('content-type', 'application/yaml; charset=utf-8');
    return c.body(stringify(json));
  });

  return app;
}
