import { describe, expect, it } from 'vitest';
import {
  canonicalBundleDigest,
  parseCanonicalBundle,
} from '../../../src/validation/canonical-bundle.js';

describe('canonicalBundleDigest', () => {
  it('is deterministic across key order', () => {
    const a = {
      version: 1 as const,
      files: {
        'project.json': { b: 2, a: 1 },
        'z.json': { y: 2, x: 1 },
      },
    };
    const b = {
      version: 1 as const,
      files: {
        'z.json': { x: 1, y: 2 },
        'project.json': { a: 1, b: 2 },
      },
    };
    expect(canonicalBundleDigest(a)).toBe(canonicalBundleDigest(b));
  });

  it('emits sha256: prefix + 64 hex', () => {
    const d = canonicalBundleDigest({ version: 1, files: { 'project.json': {} } });
    expect(d).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('parseCanonicalBundle', () => {
  it('parses a valid bundle', () => {
    const raw = JSON.stringify({
      version: 1,
      files: { 'project.json': { name: 'x', services: [] } },
    });
    const r = parseCanonicalBundle(Buffer.from(raw));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.bundle.files['project.json']).toEqual({
        name: 'x',
        services: [],
      });
      expect(r.value.digest).toMatch(/^sha256:/);
    }
  });

  it('rejects malformed JSON', () => {
    const r = parseCanonicalBundle(Buffer.from('not json'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe('PROJECT_VERSION_BUNDLE_PARSE_ERROR');
  });

  it('rejects path traversal', () => {
    const raw = JSON.stringify({ version: 1, files: { '../etc/passwd': {} } });
    const r = parseCanonicalBundle(Buffer.from(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe('PROJECT_VERSION_BUNDLE_INVALID_SHAPE');
  });
});
