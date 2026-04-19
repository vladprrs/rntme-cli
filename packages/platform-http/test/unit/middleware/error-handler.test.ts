import { describe, it, expect } from 'vitest';
import { errorEnvelope, statusForCode } from '../../../src/middleware/error-handler.js';

describe('error-handler helpers', () => {
  it('statusForCode maps known PLATFORM_* codes to HTTP statuses', () => {
    expect(statusForCode('PLATFORM_AUTH_MISSING')).toBe(401);
    expect(statusForCode('PLATFORM_AUTH_FORBIDDEN')).toBe(403);
    expect(statusForCode('PLATFORM_TENANCY_PROJECT_NOT_FOUND')).toBe(404);
    expect(statusForCode('PLATFORM_CONFLICT_SLUG_TAKEN')).toBe(409);
    expect(statusForCode('PLATFORM_TENANCY_RESOURCE_ARCHIVED')).toBe(410);
    expect(statusForCode('PLATFORM_VALIDATION_BUNDLE_FAILED')).toBe(422);
    expect(statusForCode('PLATFORM_RATE_LIMITED')).toBe(429);
    expect(statusForCode('PLATFORM_STORAGE_DB_UNAVAILABLE')).toBe(503);
  });
  it('errorEnvelope shapes the JSON body', () => {
    const e = errorEnvelope([{ code: 'PLATFORM_INTERNAL', message: 'oops' }]);
    expect(e.error.code).toBe('PLATFORM_INTERNAL');
  });
});
