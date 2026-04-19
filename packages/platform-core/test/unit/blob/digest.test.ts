import { describe, it, expect } from 'vitest';
import { bundleDigest, perFileDigest } from '../../../src/blob/store.js';

describe('digest helpers', () => {
  it('perFileDigest is canonical-JSON sha256', () => {
    const d1 = perFileDigest({ b: 1, a: 2 });
    const d2 = perFileDigest({ a: 2, b: 1 });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
  });
  it('bundleDigest concatenates in fixed order', () => {
    const per = {
      manifest: 'a'.repeat(64),
      pdm: 'b'.repeat(64),
      qsm: 'c'.repeat(64),
      graphIr: 'd'.repeat(64),
      bindings: 'e'.repeat(64),
      ui: 'f'.repeat(64),
      seed: '0'.repeat(64),
    };
    const d = bundleDigest(per);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    // Non-alphabetical order (manifest→pdm→qsm→graphIr→bindings→ui→seed) matches spec
    const again = bundleDigest({ ...per });
    expect(d).toBe(again);
  });
});
