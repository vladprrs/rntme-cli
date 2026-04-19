import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canonicalJson, fileDigest, bundleDigest } from '../../../src/util/canonical-json.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../fixtures/bundle');

const read = (n: string) => JSON.parse(readFileSync(join(fixtures, `${n}.json`), 'utf8'));

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ b: { y: 1, x: 2 }, a: 3 })).toBe('{"a":3,"b":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('emits no whitespace', () => {
    const out = canonicalJson({ a: [1, 2], b: { c: 3 } });
    expect(out).not.toMatch(/\s/);
  });

  it('is deterministic across formatting', () => {
    const a = JSON.parse('{ "b": 1, "a": 2 }');
    const b = JSON.parse('{"a":2,"b":1}');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe('fileDigest', () => {
  it('returns sha256 hex of canonical form', () => {
    expect(fileDigest({ hello: 'world' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const d1 = fileDigest({ a: 1, b: 2 });
    const d2 = fileDigest({ b: 2, a: 1 });
    expect(d1).toBe(d2);
  });
});

describe('bundleDigest', () => {
  it('concatenates per-file digests in fixed order', () => {
    const digest = bundleDigest({
      manifest: read('manifest'),
      pdm: read('pdm'),
      qsm: read('qsm'),
      graphIr: read('graphIr'),
      bindings: read('bindings'),
      ui: read('ui'),
      seed: read('seed'),
    });

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('order-sensitive: swapping pdm and qsm changes digest', () => {
    const d1 = bundleDigest({
      manifest: {}, pdm: { a: 1 }, qsm: { b: 2 },
      graphIr: {}, bindings: {}, ui: {}, seed: {},
    });
    const d2 = bundleDigest({
      manifest: {}, pdm: { b: 2 }, qsm: { a: 1 },
      graphIr: {}, bindings: {}, ui: {}, seed: {},
    });
    expect(d1).not.toBe(d2);
  });
});
