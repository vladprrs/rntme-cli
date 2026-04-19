import { discoverProjectConfig } from '../config/project.js';
import { readCredentials, credentialsPath } from '../config/credentials.js';
import { resolveConfig } from '../config/resolve.js';
import type { ResolveFlags, ResolvedConfig } from '../config/resolve.js';
import { isOk } from '../result.js';
import type { Result } from '../result.js';
import type { CliError } from '../errors/codes.js';
import type { ClientError } from '../api/client.js';
import { exitCodeFor } from '../errors/exit.js';
import { formatSuccess, formatFailure, toFailureOutput } from '../output/format.js';
import type { OutputMode } from '../output/format.js';

export type CommonFlags = ResolveFlags & {
  json?: boolean | undefined;
  verbose?: boolean | undefined;
  quiet?: boolean | undefined;
};

export type CommandContext = {
  mode: OutputMode;
  verbose: boolean;
  quiet: boolean;
  resolved: ResolvedConfig;
};

export type CommandHandler<T> = (ctx: CommandContext) => Promise<Result<T, CliError | ClientError>>;

export async function runCommand<T>(
  flags: CommonFlags,
  opts: { requireToken?: boolean | undefined; requireTenancy?: boolean | undefined; humanRender?: ((d: T) => string) | undefined },
  handler: CommandHandler<T>,
): Promise<number> {
  const mode: OutputMode = flags.json ? 'json' : 'human';

  const projectResult = await discoverProjectConfig(process.cwd());
  const projectConfig = isOk(projectResult) ? projectResult.value.config : null;

  const credsPathResolved = credentialsPath();
  const credsResult = await readCredentials(credsPathResolved);

  if (!isOk(credsResult) && credsResult.error.code !== 'CLI_CREDENTIALS_MISSING') {
    emit(mode, null, credsResult.error);
    return exitCodeFor(credsResult.error.code);
  }

  const credentials = isOk(credsResult) ? credsResult.value : null;

  const resolved = resolveConfig({
    flags: {
      baseUrl: flags.baseUrl,
      token: flags.token,
      profile: flags.profile,
      org: flags.org,
      project: flags.project,
      service: flags.service,
    },
    env: {
      RNTME_BASE_URL: process.env.RNTME_BASE_URL,
      RNTME_TOKEN: process.env.RNTME_TOKEN,
      RNTME_PROFILE: process.env.RNTME_PROFILE,
    },
    projectConfig,
    credentials,
    requireToken: opts.requireToken,
    requireTenancy: opts.requireTenancy,
  });

  if (!isOk(resolved)) {
    emit(mode, null, resolved.error);
    return exitCodeFor(resolved.error.code);
  }

  const result = await handler({
    mode,
    verbose: flags.verbose ?? false,
    quiet: flags.quiet ?? false,
    resolved: resolved.value,
  });

  if (isOk(result)) {
    if (!flags.quiet) emit(mode, result.value, null, opts.humanRender);
    return 0;
  }
  emit(mode, null, result.error);
  const code =
    'kind' in result.error && result.error.kind === 'cli'
      ? result.error.code
      : 'kind' in result.error && result.error.kind === 'http'
        ? result.error.code
        : 'CLI_NETWORK_TIMEOUT';
  return exitCodeFor(code);
}

function emit<T>(
  mode: OutputMode,
  success: T | null,
  error: CliError | ClientError | null,
  human?: ((d: T) => string) | undefined,
): void {
  if (error) {
    process.stderr.write(formatFailure(mode, toFailureOutput(error)) + '\n');
    return;
  }
  if (success !== null) {
    process.stdout.write(formatSuccess(mode, success, human) + '\n');
  }
}
