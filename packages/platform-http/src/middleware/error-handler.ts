import type { MiddlewareHandler } from 'hono';
import type { PlatformError, ErrorCode } from '@rntme-cli/platform-core';

const STATUS: Partial<Record<ErrorCode, number>> = {
  PLATFORM_AUTH_MISSING: 401,
  PLATFORM_AUTH_INVALID: 401,
  PLATFORM_AUTH_TOKEN_REVOKED: 401,
  PLATFORM_AUTH_TOKEN_EXPIRED: 401,
  PLATFORM_AUTH_FORBIDDEN: 403,
  PLATFORM_PARSE_BODY_INVALID: 400,
  PLATFORM_PARSE_PATH_INVALID: 400,
  PLATFORM_TENANCY_ORG_NOT_FOUND: 404,
  PLATFORM_TENANCY_PROJECT_NOT_FOUND: 404,
  PLATFORM_TENANCY_SERVICE_NOT_FOUND: 404,
  PLATFORM_TENANCY_RESOURCE_ARCHIVED: 410,
  PLATFORM_VALIDATION_BUNDLE_FAILED: 422,
  PLATFORM_STORAGE_BLOB_UPLOAD_FAILED: 502,
  PLATFORM_STORAGE_DB_UNAVAILABLE: 503,
  PLATFORM_CONCURRENCY_VERSION_CONFLICT: 409,
  PLATFORM_CONCURRENCY_LAST_OWNER: 409,
  PLATFORM_CONFLICT_SLUG_TAKEN: 409,
  PLATFORM_RATE_LIMITED: 429,
  PLATFORM_INTERNAL: 500,
  PLATFORM_WORKOS_WEBHOOK_INVALID: 400,
  PLATFORM_WORKOS_UNAVAILABLE: 503,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS[code] ?? 500;
}

export function errorEnvelope(
  errors: readonly PlatformError[],
): { error: PlatformError; errors?: readonly PlatformError[] } {
  const first = errors[0] ?? { code: 'PLATFORM_INTERNAL', message: 'unknown' };
  return errors.length > 1 ? { error: first, errors } : { error: first };
}

export function errorHandler(): MiddlewareHandler {
  return async (c, next) => {
    try {
      await next();
    } catch (cause) {
      const body = errorEnvelope([{ code: 'PLATFORM_INTERNAL', message: String(cause) }]);
      return c.json(body, 500);
    }
  };
}
