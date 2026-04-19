import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import type { CliError } from '../errors/codes.js';
import { cliError } from '../errors/codes.js';
import type { CredentialsFile } from './credentials.js';
import type { RntmeProjectConfig } from './project.js';

export const DEFAULT_BASE_URL = 'https://platform.rntme.com';

export type ResolveFlags = {
  baseUrl?: string;
  token?: string;
  profile?: string;
  org?: string;
  project?: string;
  service?: string;
};

export type ResolveEnv = Partial<{
  RNTME_BASE_URL: string;
  RNTME_TOKEN: string;
  RNTME_PROFILE: string;
}>;

export type ResolveInput = {
  flags: ResolveFlags;
  env: ResolveEnv;
  projectConfig: RntmeProjectConfig | null;
  credentials: CredentialsFile | null;
  requireToken?: boolean;
  requireTenancy?: boolean;
};

export type ResolvedConfig = {
  baseUrl: string;
  token: string | null;
  profileName: string;
  org: string | null;
  project: string | null;
  service: string | null;
};

export function resolveConfig(input: ResolveInput): Result<ResolvedConfig, CliError> {
  const profileName = input.flags.profile ?? input.env.RNTME_PROFILE ?? input.credentials?.defaultProfile ?? 'default';
  const profile = input.credentials?.profiles[profileName] ?? null;

  const baseUrl =
    input.flags.baseUrl ??
    input.env.RNTME_BASE_URL ??
    profile?.baseUrl ??
    DEFAULT_BASE_URL;

  const token =
    input.flags.token ??
    input.env.RNTME_TOKEN ??
    profile?.token ??
    null;

  const org = input.flags.org ?? input.projectConfig?.org ?? null;
  const project = input.flags.project ?? input.projectConfig?.project ?? null;
  const service = input.flags.service ?? input.projectConfig?.service ?? null;

  if (input.requireToken && token === null) {
    return err(
      cliError(
        'CLI_CREDENTIALS_MISSING',
        'no token found in flags, env, or credentials file',
        'run `rntme login --token <your-pat>`',
      ),
    );
  }

  if (input.requireTenancy && (org === null || project === null || service === null)) {
    return err(
      cliError(
        'CLI_CONFIG_MISSING',
        'org/project/service not resolved',
        'run from a directory containing `rntme.json`, or pass --org --project --service',
      ),
    );
  }

  return ok({ baseUrl, token, profileName, org, project, service });
}
