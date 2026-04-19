import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, ERROR_CODES } from '../../../src/types/result.js';

describe('Result', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it('err wraps errors array', () => {
    const r = err([{ code: 'PLATFORM_INTERNAL', message: 'x' }]);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.errors).toHaveLength(1);
  });

  it('ERROR_CODES registry is append-only set', () => {
    expect(ERROR_CODES.PLATFORM_AUTH_MISSING).toBe('PLATFORM_AUTH_MISSING');
    expect(ERROR_CODES.PLATFORM_VALIDATION_BUNDLE_FAILED).toBe('PLATFORM_VALIDATION_BUNDLE_FAILED');
  });
});
