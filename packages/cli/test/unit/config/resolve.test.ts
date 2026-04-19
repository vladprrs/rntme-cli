import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../../src/config/resolve.js';

const FIXED_BASE = 'https://platform.rntme.com';
const DUMMY_TOKEN = 'rntme_pat_abcdefghijklmnopqrstuv';
const PROJECT_STUB = {
  org: 'acme',
  project: 'p-one',
  service: 's-one',
  artifacts: {
    manifest: 'a.json', pdm: 'a.json', qsm: 'a.json',
    graphIr: 'a.json', bindings: 'a.json', ui: 'a.json', seed: 'a.json',
  },
} as const;

describe('resolveConfig', () => {
  it('flag beats env beats project beats credentials beats default', () => {
    const r = resolveConfig({
      flags:        { org: 'flag-org' },
      env:          { RNTME_BASE_URL: 'https://env.example', RNTME_TOKEN: DUMMY_TOKEN, RNTME_PROFILE: 'p2' },
      projectConfig: PROJECT_STUB,
      credentials:  {
        version: 1, defaultProfile: 'default',
        profiles: { default: { baseUrl: 'https://cred.example', token: DUMMY_TOKEN, addedAt: '2026-04-19T00:00:00Z' } },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.org).toBe('flag-org');
      expect(r.value.baseUrl).toBe('https://env.example');
      expect(r.value.token).toBe(DUMMY_TOKEN);
      expect(r.value.project).toBe('p-one');
      expect(r.value.service).toBe('s-one');
    }
  });

  it('default baseUrl when nothing else', () => {
    const r = resolveConfig({ flags: {}, env: {}, projectConfig: null, credentials: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseUrl).toBe(FIXED_BASE);
  });

  it('CLI_CREDENTIALS_MISSING when no token anywhere', () => {
    const r = resolveConfig({ flags: {}, env: {}, projectConfig: null, credentials: null, requireToken: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CLI_CREDENTIALS_MISSING');
  });

  it('CLI_CONFIG_MISSING when requireTenancy and no org/project/service', () => {
    const r = resolveConfig({
      flags: {}, env: {},
      projectConfig: null,
      credentials: {
        version: 1, defaultProfile: 'default',
        profiles: { default: { baseUrl: FIXED_BASE, token: DUMMY_TOKEN, addedAt: '2026-04-19T00:00:00Z' } },
      },
      requireTenancy: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CLI_CONFIG_MISSING');
  });

  it('--profile env picks profile', () => {
    const r = resolveConfig({
      flags: {},
      env: { RNTME_PROFILE: 'staging' },
      projectConfig: null,
      credentials: {
        version: 1,
        defaultProfile: 'default',
        profiles: {
          default: { baseUrl: FIXED_BASE, token: DUMMY_TOKEN, addedAt: '2026-04-19T00:00:00Z' },
          staging: { baseUrl: 'https://staging.example', token: 'rntme_pat_' + 'z'.repeat(22), addedAt: '2026-04-19T00:00:00Z' },
        },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseUrl).toBe('https://staging.example');
  });
});
