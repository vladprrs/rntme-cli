import type { Adapter, SkillSource, RenderedSkill } from './types.js';

const TARGET_DIR = '.claude/skills/rntme';

export const claudeCodeAdapter: Adapter = {
  name: 'claude-code',
  render(source: SkillSource): RenderedSkill {
    return {
      relPath: `${TARGET_DIR}/${source.fileName}`,
      content: source.body,
    };
  },
};
