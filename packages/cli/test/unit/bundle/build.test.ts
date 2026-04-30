import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProjectBundle, canonicalBundleDigest } from '../../../src/bundle/build.js';

function withTmp(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'rntme-bundle-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('buildProjectBundle', () => {
  it('builds a deterministic canonical project bundle from JSON files', () => {
    withTmp((dir) => {
      mkdirSync(join(dir, 'pdm'), { recursive: true });
      mkdirSync(join(dir, 'services', 'app', 'qsm'), { recursive: true });
      writeFileSync(join(dir, 'project.json'), JSON.stringify({ services: ['app'], name: 'demo' }));
      writeFileSync(join(dir, 'pdm', 'pdm.json'), JSON.stringify({ version: '1' }));
      writeFileSync(join(dir, 'services', 'app', 'qsm', 'qsm.json'), JSON.stringify({ relations: {}, version: '1' }));

      const first = buildProjectBundle(dir);
      const second = buildProjectBundle(dir);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.value.bundle).toEqual(second.value.bundle);
      expect(first.value.bytes).toBe(second.value.bytes);
      expect(first.value.digest).toBe(canonicalBundleDigest(first.value.bundle));
      expect(Object.keys(first.value.bundle.files)).toEqual([
        'pdm/pdm.json',
        'project.json',
        'services/app/qsm/qsm.json',
      ]);
    });
  });

  it('rejects folders without root project.json', () => {
    withTmp((dir) => {
      mkdirSync(join(dir, 'pdm'), { recursive: true });
      writeFileSync(join(dir, 'pdm', 'pdm.json'), '{}');

      const result = buildProjectBundle(dir);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CLI_CONFIG_MISSING');
    });
  });

  it('ignores non-JSON support files inside the project folder', () => {
    withTmp((dir) => {
      writeFileSync(join(dir, 'project.json'), JSON.stringify({ services: [], name: 'demo' }));
      writeFileSync(join(dir, 'README.md'), '# demo');

      const result = buildProjectBundle(dir);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value.bundle.files)).toEqual(['project.json']);
    });
  });
});
