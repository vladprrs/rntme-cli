import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  credentialsPath,
  readCredentials,
  writeCredentials,
} from '../../../src/config/credentials.js';

describe('credentialsPath', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('honours XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = '/custom/xdg';
    delete process.env.HOME;
    if (process.platform !== 'win32') {
      expect(credentialsPath()).toBe('/custom/xdg/rntme/credentials.json');
    }
  });

  it('falls back to ~/.config/rntme on Linux/macOS', () => {
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = '/home/user';
    if (process.platform !== 'win32') {
      expect(credentialsPath()).toBe('/home/user/.config/rntme/credentials.json');
    }
  });
});

describe('writeCredentials + readCredentials', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rntme-creds-'));
  });

  it('writes with mode 0600 and dir 0700', async () => {
    const target = join(tmp, 'rntme/credentials.json');
    const result = await writeCredentials(target, {
      version: 1,
      defaultProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://platform.rntme.com',
          token: 'rntme_pat_abcdefghijklmnopqrstuv',
          addedAt: new Date().toISOString(),
        },
      },
    });
    expect(result.ok).toBe(true);
    const fileMode = statSync(target).mode & 0o777;
    const dirMode = statSync(join(tmp, 'rntme')).mode & 0o777;
    if (process.platform !== 'win32') {
      expect(fileMode).toBe(0o600);
      expect(dirMode).toBe(0o700);
    }
  });

  it('round-trips via readCredentials', async () => {
    const target = join(tmp, 'creds.json');
    const input = {
      version: 1 as const,
      defaultProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://platform.rntme.com',
          token: 'rntme_pat_abcdefghijklmnopqrstuv',
          addedAt: '2026-04-19T12:00:00.000Z',
        },
      },
    };
    await writeCredentials(target, input);
    const read = await readCredentials(target);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual(input);
  });

  it('CLI_CREDENTIALS_MISSING when file absent', async () => {
    const result = await readCredentials(join(tmp, 'nope.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CREDENTIALS_MISSING');
  });

  it('CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN when mode 0644', async () => {
    if (process.platform === 'win32') return;
    const target = join(tmp, 'creds.json');
    await writeCredentials(target, {
      version: 1,
      defaultProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://platform.rntme.com',
          token: 'rntme_pat_abcdefghijklmnopqrstuv',
          addedAt: '2026-04-19T12:00:00.000Z',
        },
      },
    });
    chmodSync(target, 0o644);
    const result = await readCredentials(target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN');
  });

  it('CLI_CREDENTIALS_INVALID on bad JSON', async () => {
    const target = join(tmp, 'creds.json');
    await writeCredentials(target, {
      version: 1,
      defaultProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://platform.rntme.com',
          token: 'rntme_pat_abcdefghijklmnopqrstuv',
          addedAt: '2026-04-19T12:00:00.000Z',
        },
      },
    });
    const fs = await import('node:fs/promises');
    await fs.writeFile(target, 'not json', { mode: 0o600 });
    const result = await readCredentials(target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CREDENTIALS_INVALID');
  });
});
