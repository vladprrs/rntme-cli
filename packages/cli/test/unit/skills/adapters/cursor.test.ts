import { describe, it, expect } from 'vitest';
import { cursorAdapter } from '../../../../src/skills/adapters/cursor.js';

describe('cursorAdapter', () => {
  const source = {
    fileName: 'using-rntme.md',
    body: '---\nname: using-rntme\ndescription: Use when starting a rntme service.\n---\n\n## What\nbody text\n',
  };

  it('has name "cursor"', () => {
    expect(cursorAdapter.name).toBe('cursor');
  });

  it('renames .md extension to .mdc', () => {
    const out = cursorAdapter.render(source);
    expect(out.relPath).toBe('.cursor/rules/rntme/using-rntme.mdc');
  });

  it('injects globs and alwaysApply into frontmatter', () => {
    const out = cursorAdapter.render(source);
    expect(out.content).toContain('globs:');
    expect(out.content).toContain('**/rntme.json');
    expect(out.content).toContain('**/artifacts/**');
    expect(out.content).toContain('alwaysApply: false');
  });

  it('preserves name and description', () => {
    const out = cursorAdapter.render(source);
    expect(out.content).toContain('name: using-rntme');
    expect(out.content).toContain('description: Use when starting a rntme service.');
  });

  it('preserves body below frontmatter', () => {
    const out = cursorAdapter.render(source);
    expect(out.content).toContain('## What\nbody text');
  });

  it('fails on missing frontmatter', () => {
    expect(() =>
      cursorAdapter.render({ fileName: 'bad.md', body: 'no frontmatter here' }),
    ).toThrow(/frontmatter/);
  });
});
