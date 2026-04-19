import { Hono } from 'hono';
import type { Env } from './config/env.js';

export type AppDeps = {
  env: Env;
  // subsequent tasks add: pool, repos, blob, workosClient, logger, identityProviders
};

export function createApp(_deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}
