import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { main } from '../../src/bin/cli.js';

const E2E_TOKEN = process.env.RNTME_E2E_TOKEN;
const E2E_BASE = process.env.RNTME_E2E_BASE_URL ?? 'https://platform.rntme.com';

const DEMO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'demo', 'issue-tracker-api');

type RunResult = { code: number; stdout: string; stderr: string };

async function run(argv: string[]): Promise<RunResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;

  const envBackup = { ...process.env };
  if (E2E_TOKEN) process.env.RNTME_TOKEN = E2E_TOKEN;
  process.env.RNTME_BASE_URL = E2E_BASE;

  try {
    const code = await main(argv);
    return { code, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.env = envBackup;
  }
}

describe.skipIf(!E2E_TOKEN)('e2e: publish loop', () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const projectSlug = `cli-e2e-${stamp}`;
  const serviceSlug = 'api';

  it('whoami succeeds with E2E token', async () => {
    const r = await run(['whoami']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('rntme-cli-e2e');
  });

  it(
    'creates project, service, publishes, moves tag, re-publishes idempotently',
    async () => {
      const cp = await run(['--org', 'rntme-cli-e2e', 'project', 'create', projectSlug]);
      expect(cp.code).toBe(0);

      const cs = await run(['--org', 'rntme-cli-e2e', '--project', projectSlug, 'service', 'create', serviceSlug]);
      expect(cs.code).toBe(0);

      const cwd = process.cwd();
      process.chdir(DEMO_DIR);
      try {
        const p1 = await run([
          '--org',
          'rntme-cli-e2e',
          '--project',
          projectSlug,
          '--service',
          serviceSlug,
          'publish',
          '--tag',
          'preview',
          '--message',
          'e2e smoke',
        ]);
        const p2 = await run([
          '--org',
          'rntme-cli-e2e',
          '--project',
          projectSlug,
          '--service',
          serviceSlug,
          'publish',
          '--tag',
          'preview',
        ]);
        expect(p1.code).toBe(0);
        expect(p2.code).toBe(0);
        const digest1 = /bundleDigest:\s*(\S+)/.exec(p1.stdout)?.[1];
        const digest2 = /bundleDigest:\s*(\S+)/.exec(p2.stdout)?.[1];
        expect(digest1).toBeDefined();
        expect(digest1).toBe(digest2);
      } finally {
        process.chdir(cwd);
      }
    },
    60_000,
  );
});
