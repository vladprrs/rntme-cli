export type SkillSource = {
  readonly fileName: string; // e.g. "using-rntme.md"
  readonly body: string; // full markdown, including YAML frontmatter
};

export type RenderedSkill = {
  readonly relPath: string; // relative to user's project root, e.g. ".claude/skills/rntme/using-rntme.md"
  readonly content: string; // bytes to write
};

export type AdapterName = 'claude-code' | 'cursor';

export interface Adapter {
  readonly name: AdapterName;
  render(source: SkillSource): RenderedSkill;
}
