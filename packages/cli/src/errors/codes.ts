export const CLI_ERROR_CODES = [
  'CLI_CONFIG_MISSING',
  'CLI_CONFIG_INVALID',
  'CLI_CONFIG_ARTIFACT_NOT_FOUND',
  'CLI_CREDENTIALS_MISSING',
  'CLI_CREDENTIALS_INVALID',
  'CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN',
  'CLI_RESPONSE_PARSE_FAILED',
  'CLI_VALIDATE_LOCAL_FAILED',
  'CLI_PUBLISH_DIGEST_MISMATCH',
  'CLI_NETWORK_TIMEOUT',
  'CLI_USAGE',
] as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[number];

export type CliError = {
  readonly kind: 'cli';
  readonly code: CliErrorCode;
  readonly message: string;
  readonly hint?: string | undefined;
  readonly cause?: unknown;
};

export function cliError(
  code: CliErrorCode,
  message: string,
  hint?: string,
  cause?: unknown
): CliError {
  return { kind: 'cli', code, message, hint, cause };
}
