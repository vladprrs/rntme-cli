/* eslint-disable no-console -- CLI entrypoint */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const USAGE = `Usage: rntme [options] [command]

Commands:
  (none yet — real commands land in follow-up tasks)

Options:
  -h, --help       Show this help and exit.
  -v, --version    Print the rntme CLI version and exit.
`;

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

function main(argv: string[]): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    console.error(USAGE);
    return 1;
  }

  const { values, positionals } = parsed;

  if (values['help'] === true) {
    console.log(USAGE);
    return 0;
  }

  if (values['version'] === true) {
    console.log(readVersion());
    return 0;
  }

  if (positionals.length === 0) {
    console.error(USAGE);
    return 1;
  }

  console.error(`Unknown command: ${positionals[0]}`);
  console.error(USAGE);
  return 1;
}

process.exit(main(process.argv.slice(2)));
