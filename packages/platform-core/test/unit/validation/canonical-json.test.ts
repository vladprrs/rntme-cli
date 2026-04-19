import { describe, it, expect } from 'vitest';
import { canonicalize, sha256Hex, canonicalDigest } from '../../../src/validation/canonical-json.js';

describe('canonicalize', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}');
  });
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
  it('produces stable digest regardless of key order', () => {
    const a = canonicalDigest({ foo: 1, bar: 2 });
    const b = canonicalDigest({ bar: 2, foo: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('sha256Hex produces lowercase hex', () => {
    expect(sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
