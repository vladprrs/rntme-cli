import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/bin/cli.js';

describe('skills smoke (e2e, no network)', () => {
  it('init + skills install + validate', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rntme-e2e-'));
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      expect(await main(['init', 'smoke-svc', '--org', 'demo', '--project', 'smoke'])).toBe(0);
      expect(await main(['skills', 'install', '--agent', 'claude-code'])).toBe(0);
      expect(existsSync(join(tmp, '.claude/skills/rntme/using-rntme.md'))).toBe(true);
      expect(existsSync(join(tmp, 'rntme.json'))).toBe(true);
      expect(existsSync(join(tmp, 'artifacts/pdm.json'))).toBe(true);
      const validateExit = await main(['validate']);
      expect(validateExit).toBe(0);
    } finally {
      process.chdir(origCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
