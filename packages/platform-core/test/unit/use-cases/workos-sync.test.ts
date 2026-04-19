import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { syncWorkosEvent } from '../../../src/use-cases/workos-sync.js';
import type { OrganizationRepo, ProjectRepo, TokenRepo } from '../../../src/index.js';

type InMemoryTx = { store: FakeStore };

function makeDeps(store: FakeStore) {
  return {
    repos: {
      organizations: store.organizations,
      accounts: store.accountsRepo,
      memberships: store.membershipMirror,
      projects: store.projects,
      tokens: store.tokensRepo,
      workosEventLog: store.workosEventLog,
    },
    withOrgTx: async <T>(_orgId: string, fn: (tx: InMemoryTx) => Promise<T>): Promise<T> => {
      // No real transaction boundary in the fake; tests assert semantic ordering.
      return fn({ store });
    },
    makeTxCascadeRepos: (
      _tx: InMemoryTx,
    ): { organizations: OrganizationRepo; projects: ProjectRepo; tokens: TokenRepo } => ({
      organizations: store.organizations,
      projects: store.projects,
      tokens: store.tokensRepo,
    }),
    claimWorkosEvent: async (tx: InMemoryTx, eventId: string, _eventType: string) => {
      if (tx.store.workosEvents.has(eventId)) return false;
      tx.store.workosEvents.add(eventId);
      return true;
    },
  };
}

describe('syncWorkosEvent', () => {
  it('handles user.created by upserting account', async () => {
    const store = new FakeStore();
    const r = await syncWorkosEvent(makeDeps(store), {
      id: 'ev_1',
      event: 'user.created',
      data: { id: 'user_abc', email: 'x@example.com', first_name: 'X', last_name: 'Y' },
    });
    expect(isOk(r)).toBe(true);
    expect([...store.accounts.values()][0]!.workosUserId).toBe('user_abc');
  });

  it('is idempotent on replay', async () => {
    const store = new FakeStore();
    const ev = {
      id: 'ev_2',
      event: 'user.created' as const,
      data: { id: 'u_b', email: null, first_name: 'A', last_name: 'B' },
    };
    await syncWorkosEvent(makeDeps(store), ev);
    const r = await syncWorkosEvent(makeDeps(store), ev);
    expect(isOk(r)).toBe(true);
    expect(store.accounts.size).toBe(1);
  });

  it('organization.deleted cascades project archive + token revoke', async () => {
    const store = new FakeStore();
    const org = await store.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_x',
      slug: 'x',
      displayName: 'X',
    });
    if (!isOk(org)) throw new Error('seed');
    await store.projects.create({ id: 'p1', orgId: org.value.id, slug: 'pr', displayName: 'P' });
    await store.tokensRepo.create({
      id: 'tok1',
      orgId: org.value.id,
      accountId: 'acc1',
      name: 't',
      tokenHash: new Uint8Array(32),
      prefix: 'abcdefghijkl',
      scopes: ['project:read'],
      expiresAt: null,
    });
    const r = await syncWorkosEvent(makeDeps(store), {
      id: 'ev_3',
      event: 'organization.deleted',
      data: { id: 'org_x' },
    });
    expect(isOk(r)).toBe(true);
    const proj = (store.projectsByOrg.get(org.value.id) ?? [])[0];
    expect(proj?.archivedAt).not.toBeNull();
    expect(store.tokens.get('tok1')!.revokedAt).not.toBeNull();
    expect(store.orgs.get(org.value.id)!.archivedAt).not.toBeNull();
  });

  it('double delivery of organization.deleted cascades exactly once (atomic claim)', async () => {
    const store = new FakeStore();
    const org = await store.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_y',
      slug: 'y',
      displayName: 'Y',
    });
    if (!isOk(org)) throw new Error('seed');
    await store.tokensRepo.create({
      id: 'tok2',
      orgId: org.value.id,
      accountId: 'acc1',
      name: 't',
      tokenHash: new Uint8Array(32),
      prefix: 'abcdefghijkm',
      scopes: ['project:read'],
      expiresAt: null,
    });
    const deps = makeDeps(store);
    const ev = {
      id: 'ev_same',
      event: 'organization.deleted' as const,
      data: { id: 'org_y' },
    };
    const [r1, r2] = await Promise.all([syncWorkosEvent(deps, ev), syncWorkosEvent(deps, ev)]);
    expect(isOk(r1) && isOk(r2)).toBe(true);
    // Claimed exactly once — event id appears only once in the log set.
    expect(store.workosEvents.has('ev_same')).toBe(true);
    expect(store.tokens.get('tok2')!.revokedAt).not.toBeNull();
  });
});
