import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSkillsInstall } from '../../../../src/commands/skills/install.js';

describe('runSkillsInstall', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rntme-install-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes at least one skill to .claude/skills/rntme for claude-code', async () => {
    const exit = await runSkillsInstall({ agent: 'claude-code', target: tmp });
    expect(exit).toBe(0);
    const dir = join(tmp, '.claude/skills/rntme');
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });

  it('writes at least one skill to .cursor/rules/rntme for cursor', async () => {
    const exit = await runSkillsInstall({ agent: 'cursor', target: tmp });
    expect(exit).toBe(0);
    const dir = join(tmp, '.cursor/rules/rntme');
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });

  it('rejects unknown agent with exit 2', async () => {
    const exit = await runSkillsInstall({ agent: 'windsurf', target: tmp });
    expect(exit).toBe(2);
  });

  it('skips existing files without --force', async () => {
    await runSkillsInstall({ agent: 'claude-code', target: tmp });
    const path = join(tmp, '.claude/skills/rntme/using-rntme.md');
    writeFileSync(path, 'STALE');
    await runSkillsInstall({ agent: 'claude-code', target: tmp });
    expect(readFileSync(path, 'utf8')).toBe('STALE');
  });

  it('overwrites existing files with --force', async () => {
    await runSkillsInstall({ agent: 'claude-code', target: tmp });
    const path = join(tmp, '.claude/skills/rntme/using-rntme.md');
    writeFileSync(path, 'STALE');
    await runSkillsInstall({ agent: 'claude-code', target: tmp, force: true });
    expect(readFileSync(path, 'utf8')).not.toBe('STALE');
  });

  it('creates target dir if missing', async () => {
    const nested = join(tmp, 'nested');
    const exit = await runSkillsInstall({ agent: 'claude-code', target: nested });
    expect(exit).toBe(0);
    expect(existsSync(join(nested, '.claude/skills/rntme/using-rntme.md'))).toBe(true);
  });
});
