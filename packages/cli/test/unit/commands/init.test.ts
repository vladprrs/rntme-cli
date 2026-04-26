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

  it('scaffolds a project blueprint on fresh dir without rntme.json', async () => {
    const exit = await runInit({ slug: 'my-svc' });
    expect(exit).toBe(0);
    expect(existsSync(join(tmp, 'rntme.json'))).toBe(false);
    expect(existsSync(join(tmp, 'project.json'))).toBe(true);
    expect(existsSync(join(tmp, 'pdm', 'pdm.json'))).toBe(true);
    expect(existsSync(join(tmp, 'pdm', 'entities'))).toBe(true);
    expect(existsSync(join(tmp, 'services', 'app', 'service.json'))).toBe(true);
    expect(existsSync(join(tmp, 'services', 'app', 'qsm', 'qsm.json'))).toBe(true);
    expect(existsSync(join(tmp, 'services', 'app', 'ui', 'manifest.json'))).toBe(true);
  });

  it('uses the provided slug as project name and app service by default', async () => {
    await runInit({ slug: 'my-svc' });
    const project = JSON.parse(readFileSync(join(tmp, 'project.json'), 'utf8'));
    expect(project.name).toBe('my-svc');
    expect(project.services).toEqual(['app']);
  });

  it('refuses when project.json already exists', async () => {
    await runInit({ slug: 'one' });
    const exit = await runInit({ slug: 'two' });
    expect(exit).toBe(2);
  });

  it('rejects invalid slug', async () => {
    const exit = await runInit({ slug: 'X' }); // too short, uppercase
    expect(exit).toBe(2);
  });

  it('ignores legacy artifact directory options for project blueprints', async () => {
    await runInit({ slug: 'svc', artifactsDir: 'bundle' });
    expect(existsSync(join(tmp, 'pdm', 'pdm.json'))).toBe(true);
    expect(existsSync(join(tmp, 'bundle'))).toBe(false);
  });
});
