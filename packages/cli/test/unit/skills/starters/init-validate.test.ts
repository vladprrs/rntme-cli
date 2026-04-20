import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '@rntme-cli/platform-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(HERE, '../../../../src/skills/sources/examples/issue-tracker');
const KEYS = ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const;
const FILE_NAMES: Record<(typeof KEYS)[number], string> = {
  manifest: 'manifest.json',
  pdm: 'pdm.json',
  qsm: 'qsm.json',
  graphIr: 'graph-ir.json',
  bindings: 'bindings.json',
  ui: 'ui.json',
  seed: 'seed.json',
};

function loadBundle(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    const raw = readFileSync(join(dir, FILE_NAMES[key]), 'utf8');
    out[key] = JSON.parse(raw);
  }
  return out;
}

describe('worked-example bundle (issue-tracker)', () => {
  it('passes validateBundle', async () => {
    const bundle = loadBundle(EXAMPLES_DIR) as Parameters<typeof validateBundle>[0];
    const result = await validateBundle(bundle);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('validateBundle errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.ok).toBe(true);
  });
});

const STARTERS_DIR = join(HERE, '../../../../src/skills/starters/artifacts');

describe('starter bundle (rntme init defaults)', () => {
  it('passes validateBundle', async () => {
    const bundle = loadBundle(STARTERS_DIR) as Parameters<typeof validateBundle>[0];
    const result = await validateBundle(bundle);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('starter validateBundle errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.ok).toBe(true);
  });
});
