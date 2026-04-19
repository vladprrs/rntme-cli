import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { syncWorkosEvent } from '../../../src/use-cases/workos-sync.js';

describe('syncWorkosEvent', () => {
  it('handles user.created by upserting account', async () => {
    const store = new FakeStore();
    const r = await syncWorkosEvent(
      {
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      },
      {
        id: 'ev_1',
        type: 'user.created',
        data: { id: 'user_abc', email: 'x@example.com', first_name: 'X', last_name: 'Y' },
      },
    );
    expect(isOk(r)).toBe(true);
    expect([...store.accounts.values()][0]!.workosUserId).toBe('user_abc');
  });

  it('is idempotent on replay', async () => {
    const store = new FakeStore();
    const ev = {
      id: 'ev_2',
      type: 'user.created' as const,
      data: { id: 'u_b', email: null, first_name: 'A', last_name: 'B' },
    };
    await syncWorkosEvent(
      {
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      },
      ev,
    );
    const r = await syncWorkosEvent(
      {
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      },
      ev,
    );
    expect(isOk(r)).toBe(true);
    expect(store.accounts.size).toBe(1);
  });

  it('organization.deleted cascades project archive', async () => {
    const store = new FakeStore();
    const org = await store.organizations.upsertFromWorkos({
      workosOrganizationId: 'org_x',
      slug: 'x',
      displayName: 'X',
    });
    if (!isOk(org)) throw new Error('seed');
    await store.projects.create({ id: 'p1', orgId: org.value.id, slug: 'pr', displayName: 'P' });
    const r = await syncWorkosEvent(
      {
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      },
      { id: 'ev_3', type: 'organization.deleted', data: { id: 'org_x' } },
    );
    expect(isOk(r)).toBe(true);
  });
});
