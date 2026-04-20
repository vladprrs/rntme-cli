import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeCodeAdapter } from '../../skills/adapters/claude-code.js';
import { cursorAdapter } from '../../skills/adapters/cursor.js';
import type { Adapter, AdapterName, SkillSource } from '../../skills/adapters/types.js';

const ADAPTERS: Record<AdapterName, Adapter> = {
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
};

export type InstallArgs = {
  readonly agent: AdapterName | string;
  readonly target?: string | undefined;
  readonly force?: boolean | undefined;
  readonly json?: boolean | undefined;
};

function sourcesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/commands/skills/install.ts → ../../skills/sources
  // dist/commands/skills/install.js → ../../skills/sources (post-tsc copy)
  return join(here, '..', '..', 'skills', 'sources');
}

function loadSources(): SkillSource[] {
  const dir = sourcesDir();
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: SkillSource[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const body = readFileSync(join(dir, e.name), 'utf8');
    out.push({ fileName: e.name, body });
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export async function runSkillsInstall(args: InstallArgs): Promise<number> {
  const adapter = ADAPTERS[args.agent as AdapterName];
  if (!adapter) {
    writeErr(args.json, 'CLI_SKILLS_UNKNOWN_AGENT', `unknown agent "${args.agent}" (expected: claude-code | cursor)`);
    return 2;
  }
  const target = args.target ?? process.cwd();
  try {
    mkdirSync(target, { recursive: true });
  } catch (cause) {
    writeErr(args.json, 'CLI_SKILLS_TARGET_NOT_WRITABLE', `cannot create target dir ${target}: ${String(cause)}`);
    return 2;
  }

  const written: string[] = [];
  const skipped: string[] = [];
  for (const source of loadSources()) {
    const rendered = adapter.render(source);
    const outPath = join(target, rendered.relPath);
    if (existsSync(outPath) && !args.force) {
      skipped.push(rendered.relPath);
      continue;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered.content);
    written.push(rendered.relPath);
  }

  writeOk(args.json, { agent: adapter.name, target, written, skipped });
  return 0;
}

function writeOk(json: boolean | undefined, data: { agent: string; target: string; written: string[]; skipped: string[] }): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
    return;
  }
  process.stdout.write(`✓ installed ${data.written.length} skills for ${data.agent}\n`);
  for (const p of data.written) process.stdout.write(`  → ${p}\n`);
  for (const p of data.skipped) process.stdout.write(`  · skipped ${p} (use --force to overwrite)\n`);
  process.stdout.write(`hint: in your agent, invoke Skill: using-rntme to start\n`);
}

function writeErr(json: boolean | undefined, code: string, message: string): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
    return;
  }
  process.stderr.write(`error: ${code}: ${message}\n`);
}
