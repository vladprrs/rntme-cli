import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { FakeStore } from '@rntme-cli/platform-core/testing';
import type { Pool } from 'pg';
import { webhookWorkosRoute } from '../../../src/routes/webhook-workos.js';

const passingMock = {
  webhooks: {
    constructEvent: async ({ payload }: { payload: unknown }) => payload as Record<string, unknown>,
  },
} as never;
const failingMock = {
  webhooks: { constructEvent: async () => Promise.reject(new Error('bad sig')) },
} as never;

// Non-organization.deleted branches never touch the pool; a stub is enough.
const stubPool = {} as unknown as Pool;

describe('workos webhook', () => {
  it('rejects invalid signature with 400', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/webhooks',
      webhookWorkosRoute({
        workos: failingMock,
        secret: 'x',
        pool: stubPool,
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          tokens: store.tokensRepo,
          workosEventLog: store.workosEventLog,
        },
      }),
    );
    const r = await app.request('/v1/webhooks/workos', {
      method: 'POST',
      headers: { 'workos-signature': 'sig' },
      body: JSON.stringify({ id: 'ev', event: 'user.created', data: {} }),
    });
    expect(r.status).toBe(400);
  });

  it('self-heals missing org and account mirrors on organization_membership.created', async () => {
    const store = new FakeStore();
    const getOrganizationCalls: string[] = [];
    const getUserCalls: string[] = [];
    const workosStub = {
      webhooks: {
        constructEvent: async ({ payload }: { payload: unknown }) => payload as Record<string, unknown>,
      },
      organizations: {
        getOrganization: async (id: string) => {
          getOrganizationCalls.push(id);
          return { id, name: 'Test Organization', slug: 'test-organization' };
        },
      },
      userManagement: {
        getUser: async (id: string) => {
          getUserCalls.push(id);
          return { id, email: 'u@e.c', firstName: 'U', lastName: 'X' };
        },
      },
    } as never;
    const app = new Hono().route(
      '/v1/webhooks',
      webhookWorkosRoute({
        workos: workosStub,
        secret: 'x',
        pool: stubPool,
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          tokens: store.tokensRepo,
          workosEventLog: store.workosEventLog,
        },
      }),
    );
    const body = {
      id: 'event_mem_1',
      event: 'organization_membership.created',
      data: {
        id: 'om_1',
        role: { slug: 'member' },
        status: 'active',
        user_id: 'user_lost',
        organization_id: 'org_lost',
      },
    };
    const r = await app.request('/v1/webhooks/workos', {
      method: 'POST',
      headers: { 'workos-signature': 'sig' },
      body: JSON.stringify(body),
    });
    expect(r.status).toBe(200);
    expect(getOrganizationCalls).toEqual(['org_lost']);
    expect(getUserCalls).toEqual(['user_lost']);
    expect(store.orgs.size).toBeGreaterThanOrEqual(1);
    expect(store.accounts.size).toBeGreaterThanOrEqual(1);
    expect(store.memberships.size).toBeGreaterThanOrEqual(1);
  });

  it('processes user.created event', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/webhooks',
      webhookWorkosRoute({
        workos: passingMock,
        secret: 'x',
        pool: stubPool,
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          tokens: store.tokensRepo,
          workosEventLog: store.workosEventLog,
        },
      }),
    );
    const body = {
      id: 'ev_1',
      event: 'user.created',
      data: { id: 'u_a', email: 'x@y', first_name: 'X', last_name: 'Y' },
    };
    const r = await app.request('/v1/webhooks/workos', {
      method: 'POST',
      headers: { 'workos-signature': 'sig' },
      body: JSON.stringify(body),
    });
    expect(r.status).toBe(200);
    expect(store.accounts.size).toBe(1);
  });
});
