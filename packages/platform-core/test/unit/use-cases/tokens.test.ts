import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { SeededIds } from '../../../src/ids.js';
import { createToken, listTokens, revokeToken } from '../../../src/use-cases/tokens.js';

async function setup() {
  const store = new FakeStore();
  const ids = new SeededIds(['tok-1'], { tokenBody: 'abcdefghijklmnopqrstuv' });
  const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
  return { store, ids, orgId: org.id, accountId: acct.id };
}

describe('token use-cases', () => {
  it('createToken returns plaintext once', async () => {
    const { store, ids, orgId, accountId } = await setup();
    const r = await createToken(
      { repos: { tokens: store.tokensRepo }, ids },
      {
        orgId,
        accountId,
        name: 'cli',
        scopes: ['project:read'],
        expiresAt: null,
        creatorScopes: ['project:read', 'token:manage'],
      },
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.plaintext).toMatch(/^rntme_pat_/);
      expect(r.value.token.prefix).toBe(r.value.plaintext.slice(0, 12));
    }
  });

  it('createToken rejects scope elevation', async () => {
    const { store, ids, orgId, accountId } = await setup();
    const r = await createToken(
      { repos: { tokens: store.tokensRepo }, ids },
      {
        orgId,
        accountId,
        name: 'cli',
        scopes: ['token:manage'],
        expiresAt: null,
        creatorScopes: ['project:read'],
      },
    );
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_AUTH_FORBIDDEN');
  });

  it('revokeToken sets revokedAt', async () => {
    const { store, ids, orgId, accountId } = await setup();
    const c = await createToken(
      { repos: { tokens: store.tokensRepo }, ids },
      {
        orgId,
        accountId,
        name: 'cli',
        scopes: ['project:read'],
        expiresAt: null,
        creatorScopes: ['project:read', 'token:manage'],
      },
    );
    if (!isOk(c)) throw new Error('seed');
    const r = await revokeToken({ repos: { tokens: store.tokensRepo } }, { orgId, id: c.value.token.id });
    expect(isOk(r)).toBe(true);
    const l = await listTokens({ repos: { tokens: store.tokensRepo } }, { orgId });
    expect(isOk(l) && l.value[0]!.revokedAt).not.toBeNull();
  });
});
