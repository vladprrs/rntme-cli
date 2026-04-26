import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type InitArgs = {
  readonly slug: string;
  readonly artifactsDir?: string | undefined;
  readonly json?: boolean | undefined;
};

const SLUG_RE = /^[a-z0-9-]{3,60}$/;

export async function runInit(args: InitArgs): Promise<number> {
  if (!SLUG_RE.test(args.slug)) {
    writeErr(args.json, 'CLI_INIT_INVALID_SLUG', `slug "${args.slug}" does not match ${SLUG_RE}`);
    return 2;
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, 'project.json'))) {
    writeErr(args.json, 'CLI_INIT_ALREADY_INITIALIZED', 'project.json already exists in this directory');
    return 2;
  }

  mkdirSync(join(cwd, 'pdm', 'entities'), { recursive: true });
  mkdirSync(join(cwd, 'services', 'app', 'qsm'), { recursive: true });
  mkdirSync(join(cwd, 'services', 'app', 'ui'), { recursive: true });

  writeJson(join(cwd, 'project.json'), {
    name: args.slug,
    services: ['app'],
    routes: { ui: {}, http: {} },
    middleware: {},
    mounts: [],
  });
  writeJson(join(cwd, 'pdm', 'pdm.json'), { version: '1' });
  writeJson(join(cwd, 'services', 'app', 'service.json'), { kind: 'domain' });
  writeJson(join(cwd, 'services', 'app', 'qsm', 'qsm.json'), {
    version: '1',
    relations: {},
  });
  writeJson(join(cwd, 'services', 'app', 'ui', 'manifest.json'), {
    version: '2.0',
    pdmRef: '../../pdm',
    qsmRef: '../qsm',
    graphSpecRef: '../graphs',
    bindingsRef: '../bindings',
    metadata: { title: args.slug },
    layouts: {},
    routes: {},
  });

  writeOk(args.json, { slug: args.slug });
  return 0;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function writeOk(json: boolean | undefined, data: unknown): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
    return;
  }
  const d = data as { slug: string };
  process.stdout.write(
    `✓ initialized rntme project "${d.slug}"\n` +
      `next:\n  1. edit project.json\n  2. rntme skills install --agent <claude-code|cursor>\n  3. invoke Skill: using-rntme in your agent\n`,
  );
}

function writeErr(json: boolean | undefined, code: string, message: string): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
    return;
  }
  process.stderr.write(`error: ${code}: ${message}\n`);
}
