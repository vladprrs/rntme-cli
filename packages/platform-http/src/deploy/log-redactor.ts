const SECRET_KEY =
  String.raw`(?:apiToken|api[-_]?key|x-api-key|clientSecret|client_secret|accessToken|access_token|refreshToken|refresh_token|password|token|secret)`;

const REDACTION_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly replace: string;
}[] = [
  {
    pattern: /\b(Authorization\s*:\s*)(Bearer|Basic)\s+[^\s"',;&]+/gi,
    replace: '$1$2 ***',
  },
  {
    pattern: /\b(x-api-key\s*:\s*)[^\s"',;&]+/gi,
    replace: '$1***',
  },
  {
    pattern: new RegExp(String.raw`([?&]${SECRET_KEY}=)([^&#\s]+)`, 'gi'),
    replace: '$1***',
  },
  {
    pattern: new RegExp(String.raw`((?:"|')?${SECRET_KEY}(?:"|')?\s*[:=]\s*)(["']?)([^"',\s&}]+)\2`, 'gi'),
    replace: '$1$2***$2',
  },
  {
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g,
    replace: '$1 ***',
  },
];

export function redact(input: string): string {
  let output = input;
  for (const { pattern, replace } of REDACTION_PATTERNS) {
    output = output.replace(pattern, replace);
  }
  return output;
}
