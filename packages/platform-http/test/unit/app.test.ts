import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import type { Pool } from 'pg';
import type { BlobStore } from '@rntme-cli/platform-core';
import { RandomIds } from '@rntme-cli/platform-core';
import { parseEnv } from '../../src/config/env.js';
import { createApp, type AppDeps } from '../../src/app.js';

const baseline = {
  DATABASE_URL: 'postgres://x',
  RUSTFS_ENDPOINT: 'https://rustfs.internal',
  RUSTFS_ACCESS_KEY_ID: 'k',
  RUSTFS_SECRET_ACCESS_KEY: 's',
  RUSTFS_BUCKET: 'b',
  WORKOS_API_KEY: 'wk',
  WORKOS_CLIENT_ID: 'wc',
  WORKOS_WEBHOOK_SECRET: 'ww',
  WORKOS_REDIRECT_URI: 'https://platform.rntme.com/v1/auth/callback',
  PLATFORM_BASE_URL: 'https://platform.rntme.com',
  PLATFORM_SESSION_COOKIE_DOMAIN: '.rntme.com',
  PLATFORM_CORS_ORIGINS: 'https://*.rntme.com',
  PLATFORM_COOKIE_PASSWORD: 'y'.repeat(32),
};

describe('createApp', () => {
  it('GET /health returns 200 ok', async () => {
    const app = createApp({
      env: parseEnv(baseline),
      logger: pino({ level: 'silent' }),
      workos: {} as AppDeps['workos'],
      cookiePassword: 'x'.repeat(32),
      pool: { query: vi.fn().mockResolvedValue({}) } as unknown as Pool,
      blob: { presignedGet: async () => ({ ok: true as const, value: 'http://x' }) } as unknown as BlobStore,
      ids: new RandomIds(),
      poolRepos: {} as AppDeps['poolRepos'],
    });
    const r = await app.request('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok' });
  });
});
