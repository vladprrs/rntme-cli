import { readCredentials, writeCredentials, credentialsPath } from '../config/credentials.js';
import type { CredentialsFile } from '../config/credentials.js';
import { cliError } from '../errors/codes.js';
import { DEFAULT_BASE_URL } from '../config/resolve.js';
import { formatSuccess, formatFailure, toFailureOutput } from '../output/format.js';
import type { OutputMode } from '../output/format.js';
import { exitCodeFor } from '../errors/exit.js';
import { isOk } from '../result.js';

export type LoginFlags = {
  token?: string;
  baseUrl?: string;
  profile?: string;
  json?: boolean;
};

export async function runLogin(flags: LoginFlags): Promise<number> {
  const mode: OutputMode = flags.json ? 'json' : 'human';
  const profile = flags.profile ?? 'default';
  const baseUrl = flags.baseUrl ?? DEFAULT_BASE_URL;

  if (!flags.token) {
    process.stderr.write('No token provided. Usage:\n');
    process.stderr.write('  rntme login --token <pat>\n');
    process.stderr.write('  rntme login --token -     # read from stdin\n');
    process.stderr.write('\nCreate a machine token in the platform dashboard (not yet available);\n');
    process.stderr.write('for MVP, contact your org admin for a PAT.\n');
    return 0;
  }

  let token: string;
  if (flags.token === '-') {
    token = (await readAllStdin()).trim();
  } else {
    token = flags.token;
    if (process.stderr.isTTY) {
      process.stderr.write('warning: token visible in process list; prefer --token -\n');
    }
  }

  if (!/^rntme_pat_[a-zA-Z0-9]{22}$/.test(token)) {
    const e = cliError('CLI_CREDENTIALS_INVALID', 'token format invalid; expected rntme_pat_<22 base62 chars>');
    process.stderr.write(formatFailure(mode, toFailureOutput(e)) + '\n');
    return exitCodeFor(e.code);
  }

  const path = credentialsPath();
  const existing = await readCredentials(path);

  const file: CredentialsFile = isOk(existing)
    ? existing.value
    : {
        version: 1 as const,
        defaultProfile: profile,
        profiles: {},
      };

  file.profiles[profile] = { baseUrl, token, addedAt: new Date().toISOString() };
  if (!file.defaultProfile) file.defaultProfile = profile;

  const wrote = await writeCredentials(path, file);
  if (!isOk(wrote)) {
    process.stderr.write(formatFailure(mode, toFailureOutput(wrote.error)) + '\n');
    return exitCodeFor(wrote.error.code);
  }

  const out = formatSuccess(
    mode,
    { profile, baseUrl, credentialsPath: path },
    (d) => `✓ logged in\n  profile:      ${d.profile}\n  baseUrl:      ${d.baseUrl}\n  credentials:  ${d.credentialsPath}`,
  );
  process.stdout.write(out + '\n');
  return 0;
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
