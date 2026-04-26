import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSkillsInstall } from '../../src/commands/skills/install.js';

const EXPECTED = [
  'using-rntme',
  'brainstorming-rntme-service',
  'designing-ui',
  'designing-pdm',
  'designing-bindings',
  'designing-qsm',
  'designing-graph-ir',
  'composing-blueprint',
  'publishing-via-rntme-cli',
];

describe('skills install — full set', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'rntme-int-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('claude-code: installs all 9 skills', async () => {
    await runSkillsInstall({ agent: 'claude-code', target: tmp });
    const dir = join(tmp, '.claude/skills/rntme');
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(9);
    for (const name of EXPECTED) {
      expect(files).toContain(`${name}.md`);
    }
  });

  it('cursor: installs all 9 skills as .mdc', async () => {
    await runSkillsInstall({ agent: 'cursor', target: tmp });
    const dir = join(tmp, '.cursor/rules/rntme');
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(9);
    for (const name of EXPECTED) {
      expect(files).toContain(`${name}.mdc`);
    }
    const sample = readFileSync(join(dir, 'using-rntme.mdc'), 'utf8');
    expect(sample).toContain('alwaysApply: false');
    expect(sample).toContain('globs:');
  });
});
