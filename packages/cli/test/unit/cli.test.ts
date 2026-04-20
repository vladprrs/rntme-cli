import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, '..', '..', 'dist', 'bin', 'cli.js');
const pkgPath = join(here, '..', '..', 'package.json');
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
  });
}

describe('rntme CLI', () => {
  it('prints usage with --help and exits 0', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: rntme');
    expect(result.stdout).toContain('--help');
    expect(result.stdout).toContain('--version');
  });

  it('prints usage with -h and exits 0', () => {
    const result = runCli(['-h']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: rntme');
  });

  it('prints the package version with --version and exits 0', () => {
    const result = runCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkgVersion);
  });

  it('prints the package version with -v and exits 0', () => {
    const result = runCli(['-v']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkgVersion);
  });

  it('prints usage to stderr and exits 1 on unknown command', () => {
    const result = runCli(['frobnicate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command: frobnicate');
    expect(result.stderr).toContain('Usage: rntme');
  });

  it('prints usage to stderr and exits 1 on no args', () => {
    const result = runCli([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: rntme');
  });
});

describe('cli dispatcher: init', () => {
  it('rejects missing slug', async () => {
    const { main } = await import('../../src/bin/cli.js');
    const code = await main(['init']);
    expect(code).toBe(1);
  });
});

describe('cli dispatcher: skills', () => {
  it('rejects unknown subcommand', async () => {
    const { main } = await import('../../src/bin/cli.js');
    const code = await main(['skills', 'foo']);
    expect(code).toBe(2);
  });

  it('rejects install without --agent', async () => {
    const { main } = await import('../../src/bin/cli.js');
    const code = await main(['skills', 'install']);
    expect(code).toBe(1);
  });
});
