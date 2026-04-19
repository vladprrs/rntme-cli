import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Result, ok, err } from '../result.js';

export type NestedError = { code: string; message: string; path?: string; pkg?: string; stage?: string };

export type ApiError = {
  kind: 'http';
  status: number;
  code: string;
  message: string;
  stage?: string;
  pkg?: string;
  path?: string;
  requestId?: string;
  nested?: NestedError[];
};

export type NetworkError = { kind: 'network'; message: string; cause: unknown };
export type ClientError = ApiError | NetworkError;

export type ApiCallOptions<T> = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  baseUrl: string;
  token: string | null;
  body?: unknown;
  responseSchema: z.ZodType<T>;
  requestId?: string;
  timeoutMs?: number;
};

const VERSION = '0.0.0';

export async function apiCall<T>(opts: ApiCallOptions<T>): Promise<Result<T, ClientError>> {
  const requestId = opts.requestId ?? `req_${randomUUID().replaceAll('-', '')}`;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}${opts.path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': `rntme-cli/${VERSION} (node/${process.version.replace(/^v/, '')})`,
    'X-Request-ID': requestId,
  };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timeout);
    return err({ kind: 'network', message: String((cause as Error)?.message ?? cause), cause });
  }
  clearTimeout(timeout);

  const echoedRequestId = res.headers.get('x-request-id') ?? requestId;

  const text = await res.text();
  let parsedBody: unknown = null;
  if (text.length > 0) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = null;
    }
  }

  if (res.ok) {
    const schemaResult = opts.responseSchema.safeParse(parsedBody);
    if (!schemaResult.success) {
      return err({
        kind: 'http',
        status: res.status,
        code: 'CLI_RESPONSE_PARSE_FAILED',
        message: `response did not match expected schema: ${schemaResult.error.issues.map((i) => i.message).join('; ')}`,
        requestId: echoedRequestId,
      });
    }
    return ok(schemaResult.data);
  }

  const envelope = parseErrorEnvelope(parsedBody);
  return err({
    kind: 'http',
    status: res.status,
    code: envelope?.code ?? 'PLATFORM_INTERNAL',
    message: envelope?.message ?? `HTTP ${res.status}`,
    stage: envelope?.stage,
    pkg: envelope?.pkg,
    path: envelope?.path,
    requestId: echoedRequestId,
    nested: envelope?.nested,
  });
}

function parseErrorEnvelope(body: unknown):
  | { code: string; message: string; stage?: string; pkg?: string; path?: string; nested?: NestedError[] }
  | null {
  if (!body || typeof body !== 'object') return null;
  const errObj = (body as { error?: unknown }).error;
  if (!errObj || typeof errObj !== 'object') return null;
  const e = errObj as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : 'PLATFORM_INTERNAL';
  const message = typeof e.message === 'string' ? e.message : 'unknown';
  const stage = typeof e.stage === 'string' ? e.stage : undefined;
  const pkg = typeof e.pkg === 'string' ? e.pkg : undefined;
  const path = typeof e.path === 'string' ? e.path : undefined;

  const nestedRaw =
    (e.cause && typeof e.cause === 'object' && (e.cause as { errors?: unknown }).errors) || undefined;
  let nested: NestedError[] | undefined;
  if (Array.isArray(nestedRaw)) {
    nested = nestedRaw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        code: typeof x.code === 'string' ? x.code : 'UNKNOWN',
        message: typeof x.message === 'string' ? x.message : '',
        path: typeof x.path === 'string' ? x.path : undefined,
        pkg: typeof x.pkg === 'string' ? x.pkg : undefined,
        stage: typeof x.stage === 'string' ? x.stage : undefined,
      }));
  }

  return { code, message, stage, pkg, path, nested };
}
