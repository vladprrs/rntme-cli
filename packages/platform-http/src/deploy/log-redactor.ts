const SECRET_PATTERNS: readonly RegExp[] = [
  /(api[-_]?key|password|token|secret|authorization)\s*[:=]\s*["']?([^\s"',]+)/gi,
  /Bearer\s+([A-Za-z0-9._-]+)/g,
];

export function redact(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => match.replace(/[^=:\s"']+$/, '***'));
  }
  return output;
}
