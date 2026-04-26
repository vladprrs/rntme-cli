import { describe, expect, it } from 'vitest';
import {
  CanonicalBundleSchema,
  ProjectVersionSchema,
} from '../../../src/schemas/project-version.js';

describe('ProjectVersionSchema', () => {
  it('accepts a well-formed row', () => {
    const r = ProjectVersionSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      seq: 1,
      bundleDigest: 'sha256:' + 'a'.repeat(64),
      bundleBlobKey: 'projects/abc/versions/sha256-aaaa.json.gz',
      bundleSizeBytes: 1234,
      summary: {
        projectName: 'shop',
        services: [],
        routes: { ui: {}, http: {} },
        middleware: {},
        mounts: [],
      },
      uploadedByAccountId: '44444444-4444-4444-8444-444444444444',
      createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad digest format', () => {
    const r = ProjectVersionSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      seq: 1,
      bundleDigest: 'badformat',
      bundleBlobKey: 'k',
      bundleSizeBytes: 0,
      summary: {
        projectName: 'x',
        services: [],
        routes: { ui: {}, http: {} },
        middleware: {},
        mounts: [],
      },
      uploadedByAccountId: '44444444-4444-4444-8444-444444444444',
      createdAt: new Date(),
    });
    expect(r.success).toBe(false);
  });
});

describe('CanonicalBundleSchema', () => {
  it('accepts a flat files dict', () => {
    const r = CanonicalBundleSchema.safeParse({
      version: 1,
      files: {
        'project.json': { name: 'x', services: [] },
        'pdm/entities/A.json': { name: 'A' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects path traversal', () => {
    const r = CanonicalBundleSchema.safeParse({
      version: 1,
      files: { '../../etc/passwd': {} },
    });
    expect(r.success).toBe(false);
  });

  it('rejects absolute paths', () => {
    const r = CanonicalBundleSchema.safeParse({
      version: 1,
      files: { '/etc/passwd': {} },
    });
    expect(r.success).toBe(false);
  });
});
