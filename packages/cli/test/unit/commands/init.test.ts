import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../../src/commands/init.js';

describe('runInit', () => {
  let tmp: string;
  let origCwd: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rntme-init-'));
    origCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('scaffolds rntme.json and 7 artifact files on fresh dir', async () => {
    const exit = await runInit({ slug: 'my-svc' });
    expect(exit).toBe(0);
    expect(existsSync(join(tmp, 'rntme.json'))).toBe(true);
    for (const f of ['manifest.json', 'pdm.json', 'qsm.json', 'graph-ir.json', 'bindings.json', 'ui.json', 'seed.json']) {
      expect(existsSync(join(tmp, 'artifacts', f))).toBe(true);
    }
  });

  it('substitutes service slug, default org/project placeholders', async () => {
    await runInit({ slug: 'my-svc' });
    const cfg = JSON.parse(readFileSync(join(tmp, 'rntme.json'), 'utf8'));
    expect(cfg.service).toBe('my-svc');
    expect(cfg.org).toBe('{{fill-me}}');
    expect(cfg.project).toBe('{{fill-me}}');
    expect(cfg.artifacts.pdm).toBe('artifacts/pdm.json');
  });

  it('substitutes org + project when provided', async () => {
    await runInit({ slug: 'api', org: 'acme', project: 'tracker' });
    const cfg = JSON.parse(readFileSync(join(tmp, 'rntme.json'), 'utf8'));
    expect(cfg.org).toBe('acme');
    expect(cfg.project).toBe('tracker');
  });

  it('refuses when rntme.json already exists', async () => {
    await runInit({ slug: 'one' });
    const exit = await runInit({ slug: 'two' });
    expect(exit).toBe(2);
  });

  it('rejects invalid slug', async () => {
    const exit = await runInit({ slug: 'X' }); // too short, uppercase
    expect(exit).toBe(2);
  });

  it('respects --artifacts-dir', async () => {
    await runInit({ slug: 'svc', artifactsDir: 'bundle' });
    expect(existsSync(join(tmp, 'bundle', 'pdm.json'))).toBe(true);
    const cfg = JSON.parse(readFileSync(join(tmp, 'rntme.json'), 'utf8'));
    expect(cfg.artifacts.pdm).toBe('bundle/pdm.json');
  });
});
