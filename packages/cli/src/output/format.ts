import type { CliError } from '../errors/codes.js';
import type { ClientError } from '../api/client.js';

export type OutputMode = 'human' | 'json';

export type SuccessOutput<T> = { ok: true; data: T };
export type FailureOutput = {
  ok: false;
  error: {
    code: string;
    status?: number | undefined;
    message: string;
    requestId?: string | undefined;
    hint?: string | undefined;
    nested?: Array<{ code: string; message: string; path?: string | undefined; pkg?: string | undefined; stage?: string | undefined }> | undefined;
  };
};

export function formatSuccess<T>(mode: OutputMode, data: T, human?: ((d: T) => string) | undefined): string {
  if (mode === 'json') {
    return JSON.stringify({ ok: true, data } satisfies SuccessOutput<T>);
  }
  return human ? human(data) : JSON.stringify(data, null, 2);
}

export function formatFailure(mode: OutputMode, fail: FailureOutput['error']): string {
  if (mode === 'json') {
    return JSON.stringify({ ok: false, error: fail } satisfies FailureOutput);
  }
  const lines = [`✖ ${fail.code}`, `  ${fail.message}`];
  if (fail.requestId) lines.push(`  request: ${fail.requestId}`);
  if (fail.nested) {
    lines.push('', 'Nested errors:');
    for (const n of fail.nested) {
      lines.push(`  • ${n.code}`);
      if (n.path) lines.push(`      at  ${n.path}`);
      lines.push(`      msg ${n.message}`);
    }
  }
  if (fail.hint) {
    lines.push('', `Hint: ${fail.hint}`);
  }
  return lines.join('\n');
}

export function toFailureOutput(e: CliError | ClientError): FailureOutput['error'] {
  if ('kind' in e && e.kind === 'cli') {
    return { code: e.code, message: e.message, hint: e.hint };
  }
  if ('kind' in e && e.kind === 'network') {
    return { code: 'CLI_NETWORK_TIMEOUT', message: e.message };
  }
  if ('kind' in e && e.kind === 'http') {
    return {
      code: e.code,
      status: e.status,
      message: e.message,
      requestId: e.requestId,
      nested: e.nested,
    };
  }
  return { code: 'PLATFORM_INTERNAL', message: 'unknown error' };
}
