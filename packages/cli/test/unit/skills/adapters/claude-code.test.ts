import { describe, it, expect } from 'vitest';
import { claudeCodeAdapter } from '../../../../src/skills/adapters/claude-code.js';

describe('claudeCodeAdapter', () => {
  const source = {
    fileName: 'using-rntme.md',
    body: '---\nname: using-rntme\ndescription: Use when starting a rntme service.\n---\n\n## What\nbody text\n',
  };

  it('writes to .claude/skills/rntme/<fileName> with identical content', () => {
    const out = claudeCodeAdapter.render(source);
    expect(out.relPath).toBe('.claude/skills/rntme/using-rntme.md');
    expect(out.content).toBe(source.body);
  });

  it('has name "claude-code"', () => {
    expect(claudeCodeAdapter.name).toBe('claude-code');
  });

  it('preserves frontmatter byte-for-byte', () => {
    const out = claudeCodeAdapter.render(source);
    expect(out.content.startsWith('---\nname: using-rntme\n')).toBe(true);
  });
});
