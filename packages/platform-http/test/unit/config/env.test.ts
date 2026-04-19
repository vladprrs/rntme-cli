import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';

const baseEnv = {
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

describe('parseEnv', () => {
  it('parses a full env', () => {
    const r = parseEnv(baseEnv);
    expect(r.PORT).toBe(3000);
    expect(r.LOG_LEVEL).toBe('info');
  });
  it('throws on missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...rest } = baseEnv;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });
  it('rejects missing PLATFORM_COOKIE_PASSWORD', () => {
    expect(() => parseEnv({ ...baseEnv, PLATFORM_COOKIE_PASSWORD: undefined })).toThrow(/PLATFORM_COOKIE_PASSWORD/);
  });
  it('rejects a PLATFORM_COOKIE_PASSWORD shorter than 32 chars', () => {
    expect(() => parseEnv({ ...baseEnv, PLATFORM_COOKIE_PASSWORD: 'short' })).toThrow(/>=32/);
  });
  it('accepts a PLATFORM_COOKIE_PASSWORD of 32+ chars', () => {
    const env = parseEnv({ ...baseEnv, PLATFORM_COOKIE_PASSWORD: 'x'.repeat(32) });
    expect(env.PLATFORM_COOKIE_PASSWORD).toHaveLength(32);
  });
});
