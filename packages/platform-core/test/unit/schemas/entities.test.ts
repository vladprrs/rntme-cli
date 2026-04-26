import { describe, it, expect } from 'vitest';
import { ProjectSchema, ApiTokenSchema } from '../../../src/schemas/entities.js';

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
