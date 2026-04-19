import { describe, it, expect } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('@rntme-cli/platform-storage', () => {
  it('exposes VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
