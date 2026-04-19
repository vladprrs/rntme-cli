import { readFile, writeFile, mkdir, stat, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import type { CliError } from '../errors/codes.js';
import { cliError } from '../errors/codes.js';

export const PROFILE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

const ProfileSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().regex(/^rntme_pat_[a-zA-Z0-9]{22}$/),
  addedAt: z.string().datetime(),
});

export const CredentialsFileSchema = z.object({
  version: z.literal(1),
  defaultProfile: z.string().regex(PROFILE_REGEX),
  profiles: z.record(z.string().regex(PROFILE_REGEX), ProfileSchema),
});

export type CredentialsFile = z.infer<typeof CredentialsFileSchema>;

export function credentialsPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'rntme', 'credentials.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return join(xdg, 'rntme', 'credentials.json');
  }
  const home = process.env.HOME ?? homedir();
  return join(home, '.config', 'rntme', 'credentials.json');
}

export async function writeCredentials(
  path: string,
  data: CredentialsFile,
): Promise<Result<void, CliError>> {
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(dirname(path), 0o700);
    await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
    if (process.platform !== 'win32') await chmod(path, 0o600);
    return ok(undefined);
  } catch (cause) {
    return err(cliError('CLI_CREDENTIALS_INVALID', `cannot write credentials at ${path}`, undefined, cause));
  }
}

export async function readCredentials(
  path: string,
): Promise<Result<CredentialsFile, CliError>> {
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(path);
  } catch (cause) {
    return err(
      cliError(
        'CLI_CREDENTIALS_MISSING',
        `credentials file not found at ${path}`,
        'run `rntme login --token <your-pat>`',
        cause,
      ),
    );
  }

  if (process.platform !== 'win32') {
    const mode = s.mode & 0o777;
    if (mode !== 0o600) {
      return err(
        cliError(
          'CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN',
          `credentials file ${path} has mode ${mode.toString(8)}; must be 600`,
          `run: chmod 600 ${path}`,
        ),
      );
    }
  }

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (cause) {
    return err(cliError('CLI_CREDENTIALS_INVALID', `cannot read credentials at ${path}`, undefined, cause));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(cliError('CLI_CREDENTIALS_INVALID', `invalid JSON in ${path}`, undefined, cause));
  }

  const result = CredentialsFileSchema.safeParse(parsed);
  if (!result.success) {
    return err(
      cliError(
        'CLI_CREDENTIALS_INVALID',
        `credentials schema violation: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      ),
    );
  }
  return ok(result.data);
}
