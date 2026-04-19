import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { isOk } from '@rntme-cli/platform-core';
import { FakeStore } from '@rntme-cli/platform-core/testing';
import { ApiTokenProvider } from '../../../src/auth/api-token-provider.js';

async function setup() {
  const store = new FakeStore();
  const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u', email: null, displayName: 'U' });
  await store.membershipMirror.upsert({ orgId: org.id, accountId: acct.id, role: 'member' });
  const plain = 'rntme_pat_' + 'a'.repeat(22);
  const hash = new Uint8Array(createHash('sha256').update(plain).digest());
  await store.tokensRepo.create({
    id: 'tid-1',
    orgId: org.id,
    accountId: acct.id,
    name: 'cli',
    tokenHash: hash,
    prefix: plain.slice(0, 12),
    scopes: ['project:read', 'project:write', 'version:publish'],
    expiresAt: null,
  });
  return { store, plain };
}

describe('ApiTokenProvider', () => {
  it('authenticates a valid bearer token', async () => {
    const { store, plain } = await setup();
    const p = new ApiTokenProvider({
      tokens: store.tokensRepo,
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
    });
    const r = await p.authenticate({ authorizationHeader: `Bearer ${plain}`, cookieHeader: undefined });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.role).toBe('member');
  });
  it('returns PLATFORM_AUTH_INVALID on bad hash', async () => {
    const { store } = await setup();
    const p = new ApiTokenProvider({
      tokens: store.tokensRepo,
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
    });
    const r = await p.authenticate({
      authorizationHeader: `Bearer rntme_pat_${'b'.repeat(22)}`,
      cookieHeader: undefined,
    });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_AUTH_INVALID');
  });
  it('returns PLATFORM_AUTH_MISSING without header', async () => {
    const { store } = await setup();
    const p = new ApiTokenProvider({
      tokens: store.tokensRepo,
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
    });
    const r = await p.authenticate({ authorizationHeader: undefined, cookieHeader: undefined });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_AUTH_MISSING');
  });
});
