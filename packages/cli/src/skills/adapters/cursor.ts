import type { Adapter, SkillSource, RenderedSkill } from './types.js';

const TARGET_DIR = '.cursor/rules/rntme';
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const INJECTED = `globs:\n  - "**/rntme.json"\n  - "**/artifacts/**"\nalwaysApply: false`;

export const cursorAdapter: Adapter = {
  name: 'cursor',
  render(source: SkillSource): RenderedSkill {
    const m = FRONTMATTER_RE.exec(source.body);
    if (!m) {
      throw new Error(`skill "${source.fileName}" missing YAML frontmatter`);
    }
    const [, fm, rest] = m;
    const augmented = `---\n${fm}\n${INJECTED}\n---\n${rest}`;
    const baseName = source.fileName.replace(/\.md$/, '');
    return {
      relPath: `${TARGET_DIR}/${baseName}.mdc`,
      content: augmented,
    };
  },
};
