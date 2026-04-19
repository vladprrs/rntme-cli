import { describe, it, expect } from 'vitest';
import { ProjectSchema, ArtifactVersionSchema, ApiTokenSchema } from '../../../src/schemas/entities.js';

describe('entity schemas', () => {
  it('ProjectSchema parses a valid row', () => {
    const r = ProjectSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      slug: 'acme',
      displayName: 'Acme',
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });
  it('ArtifactVersionSchema requires all 7 per-file digests', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      serviceId: '33333333-3333-4333-8333-333333333333',
      seq: 1,
      bundleDigest: 'a'.repeat(64),
      previousVersionId: null,
      manifestDigest: 'a'.repeat(64),
      pdmDigest: 'a'.repeat(64),
      qsmDigest: 'a'.repeat(64),
      graphIrDigest: 'a'.repeat(64),
      bindingsDigest: 'a'.repeat(64),
      uiDigest: 'a'.repeat(64),
      seedDigest: 'a'.repeat(64),
      validationSnapshot: {},
      publishedByAccountId: '44444444-4444-4444-8444-444444444444',
      publishedByTokenId: null,
      publishedAt: new Date(),
      message: null,
    };
    expect(ArtifactVersionSchema.safeParse(base).success).toBe(true);
    const { pdmDigest: _, ...missing } = base;
    expect(ArtifactVersionSchema.safeParse(missing).success).toBe(false);
  });
  it('ApiTokenSchema — scopes non-empty array of known strings', () => {
    const r = ApiTokenSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      accountId: '33333333-3333-4333-8333-333333333333',
      name: 'cli',
      tokenHash: new Uint8Array(32),
      prefix: 'rntme_pat_ab',
      scopes: ['project:read'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });
});
