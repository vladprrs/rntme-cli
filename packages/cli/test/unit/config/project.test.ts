import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverProjectConfig, parseProjectConfig } from '../../../src/config/project.js';

function setupTree(layout: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rntme-cfg-'));
  for (const [path, content] of Object.entries(layout)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe('discoverProjectConfig', () => {
  it('finds rntme.json in cwd', async () => {
    const root = setupTree({
      'rntme.json': JSON.stringify({
        org: 'acme', project: 'p-one', service: 's-one',
        artifacts: { manifest: 'a.json', pdm: 'a.json', qsm: 'a.json',
                     graphIr: 'a.json', bindings: 'a.json', ui: 'a.json', seed: 'a.json' },
      }),
    });
    const result = await discoverProjectConfig(root);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.path).toBe(join(root, 'rntme.json'));
      expect(result.value.config.org).toBe('acme');
    }
  });

  it('walks up from sub-directory', async () => {
    const root = setupTree({
      'rntme.json': JSON.stringify({
        org: 'acme', project: 'p-one', service: 's-one',
        artifacts: { manifest: 'a.json', pdm: 'a.json', qsm: 'a.json',
                     graphIr: 'a.json', bindings: 'a.json', ui: 'a.json', seed: 'a.json' },
      }),
      'src/index.ts': '',
    });
    const result = await discoverProjectConfig(join(root, 'src'));
    expect(result.ok).toBe(true);
  });

  it('returns CLI_CONFIG_MISSING when no rntme.json up the tree', async () => {
    const root = setupTree({ 'index.ts': '' });
    const result = await discoverProjectConfig(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CONFIG_MISSING');
  });

  it('CLI_CONFIG_INVALID on bad JSON', async () => {
    const root = setupTree({ 'rntme.json': '{ not json' });
    const result = await discoverProjectConfig(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CONFIG_INVALID');
  });

  it('CLI_CONFIG_INVALID on bad slug', async () => {
    const root = setupTree({
      'rntme.json': JSON.stringify({
        org: 'ab', // too short
        project: 'p-one', service: 's-one',
        artifacts: { manifest: 'a.json', pdm: 'a.json', qsm: 'a.json',
                     graphIr: 'a.json', bindings: 'a.json', ui: 'a.json', seed: 'a.json' },
      }),
    });
    const result = await discoverProjectConfig(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CONFIG_INVALID');
  });

  it('CLI_CONFIG_INVALID on absolute artifact path', async () => {
    const root = setupTree({
      'rntme.json': JSON.stringify({
        org: 'acme', project: 'p-one', service: 's-one',
        artifacts: { manifest: '/abs/manifest.json', pdm: 'a.json', qsm: 'a.json',
                     graphIr: 'a.json', bindings: 'a.json', ui: 'a.json', seed: 'a.json' },
      }),
    });
    const result = await discoverProjectConfig(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CLI_CONFIG_INVALID');
  });
});
