import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type InitArgs = {
  readonly slug: string;
  readonly org?: string | undefined;
  readonly project?: string | undefined;
  readonly artifactsDir?: string | undefined;
  readonly json?: boolean | undefined;
};

const SLUG_RE = /^[a-z0-9-]{3,60}$/;

const STARTER_FILES = [
  'manifest.json',
  'pdm.json',
  'qsm.json',
  'graph-ir.json',
  'bindings.json',
  'ui.json',
  'seed.json',
] as const;

function startersDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/commands/init.ts → ../skills/starters/
  // dist/commands/init.js → ../skills/starters/   (copy-skills-assets keeps this layout)
  return join(here, '..', 'skills', 'starters');
}

export async function runInit(args: InitArgs): Promise<number> {
  if (!SLUG_RE.test(args.slug)) {
    writeErr(args.json, 'CLI_INIT_INVALID_SLUG', `slug "${args.slug}" does not match ${SLUG_RE}`);
    return 2;
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, 'rntme.json'))) {
    writeErr(args.json, 'CLI_INIT_ALREADY_INITIALIZED', 'rntme.json already exists in this directory');
    return 2;
  }

  const artifactsDir = args.artifactsDir ?? 'artifacts';
  const org = args.org ?? '{{fill-me}}';
  const project = args.project ?? '{{fill-me}}';

  const tmplPath = join(startersDir(), 'rntme.json.tmpl');
  const tmpl = readFileSync(tmplPath, 'utf8')
    .replaceAll('{{org}}', org)
    .replaceAll('{{project}}', project)
    .replaceAll('{{service}}', args.slug)
    .replaceAll('{{artifactsDir}}', artifactsDir);

  writeFileSync(join(cwd, 'rntme.json'), tmpl);

  mkdirSync(join(cwd, artifactsDir), { recursive: true });
  for (const f of STARTER_FILES) {
    copyFileSync(join(startersDir(), 'artifacts', f), join(cwd, artifactsDir, f));
  }

  writeOk(args.json, { slug: args.slug, org, project, artifactsDir });
  return 0;
}

function writeOk(json: boolean | undefined, data: unknown): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
    return;
  }
  const d = data as { slug: string; org: string; project: string; artifactsDir: string };
  process.stdout.write(
    `✓ initialized rntme service "${d.slug}" (org: ${d.org}, project: ${d.project})\n` +
      `next:\n  1. edit rntme.json — set org and project\n  2. rntme skills install --agent <claude-code|cursor>\n  3. invoke Skill: using-rntme in your agent\n`,
  );
}

function writeErr(json: boolean | undefined, code: string, message: string): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
    return;
  }
  process.stderr.write(`error: ${code}: ${message}\n`);
}
