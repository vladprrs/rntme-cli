import { describe, it, expect } from 'vitest';
import { exitCodeFor } from '../../../src/errors/exit.js';

describe('exitCodeFor', () => {
  it.each([
    ['CLI_CONFIG_MISSING', 2],
    ['CLI_CONFIG_INVALID', 2],
    ['CLI_CREDENTIALS_MISSING', 2],
    ['CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN', 2],
    ['PLATFORM_AUTH_MISSING', 3],
    ['PLATFORM_AUTH_INVALID', 3],
    ['PLATFORM_AUTH_FORBIDDEN', 4],
    ['PLATFORM_TENANCY_PROJECT_NOT_FOUND', 5],
    ['PLATFORM_TENANCY_RESOURCE_ARCHIVED', 5],
    ['PLATFORM_VALIDATION_BUNDLE_FAILED', 6],
    ['CLI_VALIDATE_LOCAL_FAILED', 6],
    ['PLATFORM_CONCURRENCY_VERSION_CONFLICT', 7],
    ['PLATFORM_RATE_LIMITED', 8],
    ['CLI_NETWORK_TIMEOUT', 9],
    ['PLATFORM_INTERNAL', 10],
    ['PLATFORM_STORAGE_BLOB_UPLOAD_FAILED', 10],
  ])('%s → exit %i', (code, exit) => {
    expect(exitCodeFor(code)).toBe(exit);
  });

  it('unknown code defaults to 1', () => {
    expect(exitCodeFor('BOGUS_CODE')).toBe(1);
  });

  it('null/undefined input returns 1', () => {
    expect(exitCodeFor(undefined)).toBe(1);
  });
});
