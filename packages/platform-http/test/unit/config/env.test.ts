import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';

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
};

describe('parseEnv', () => {
  it('parses a full env', () => {
    const r = parseEnv(baseline);
    expect(r.PORT).toBe(3000);
    expect(r.LOG_LEVEL).toBe('info');
  });
  it('throws on missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...rest } = baseline;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
