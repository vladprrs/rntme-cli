import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(HERE, '../../src/skills/sources');

describe('skills chain graph', () => {
  it('every Next-step reference targets an existing skill', () => {
    const files = readdirSync(SOURCES).filter((f) => f.endsWith('.md'));
    const names = new Set(files.map((f) => f.replace(/\.md$/, '')));

    const skillRefRe = /Skill:\s+([a-z-]+)/g;
    const unknown: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(SOURCES, f), 'utf8');
      for (const m of body.matchAll(skillRefRe)) {
        const ref = m[1]!;
        if (!names.has(ref)) unknown.push(`${f}: references unknown skill "${ref}"`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every non-terminal skill has a "Next step" section', () => {
    const files = readdirSync(SOURCES).filter((f) => f.endsWith('.md'));
    const missing: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(SOURCES, f), 'utf8');
      if (!body.includes('## Next step')) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it('every skill description starts with "Use when" or "Use after" etc', () => {
    const files = readdirSync(SOURCES).filter((f) => f.endsWith('.md'));
    const bad: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(SOURCES, f), 'utf8');
      const m = /description:\s+([^\n]+)/.exec(body);
      if (!m || !m[1]!.startsWith('Use ')) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
