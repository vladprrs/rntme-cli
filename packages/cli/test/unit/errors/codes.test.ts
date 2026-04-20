import { describe, it, expect } from 'vitest';
import { CLI_ERROR_CODES } from '../../../src/errors/codes.js';

describe('CLI_ERROR_CODES registry', () => {
  const expectedNew = [
    'CLI_INIT_ALREADY_INITIALIZED',
    'CLI_INIT_INVALID_SLUG',
    'CLI_SKILLS_UNKNOWN_AGENT',
    'CLI_SKILLS_TARGET_NOT_WRITABLE',
  ] as const;

  it.each(expectedNew)('contains %s', (code) => {
    expect(CLI_ERROR_CODES).toContain(code);
  });

  it('is append-only (older codes still present)', () => {
    expect(CLI_ERROR_CODES).toContain('CLI_CONFIG_MISSING');
    expect(CLI_ERROR_CODES).toContain('CLI_VALIDATE_LOCAL_FAILED');
  });
});
