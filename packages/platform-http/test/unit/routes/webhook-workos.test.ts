import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { FakeStore } from '@rntme-cli/platform-core';
import { webhookWorkosRoute } from '../../../src/routes/webhook-workos.js';

const passingMock = {
  webhooks: {
    constructEvent: async ({ payload }: { payload: string }) => JSON.parse(payload) as unknown as Record<string, unknown>,
  },
} as never;
const failingMock = {
  webhooks: { constructEvent: async () => Promise.reject(new Error('bad sig')) },
} as never;

describe('workos webhook', () => {
  it('rejects invalid signature with 400', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/webhooks',
      webhookWorkosRoute({
        workos: failingMock,
        secret: 'x',
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      }),
    );
    const r = await app.request('/v1/webhooks/workos', {
      method: 'POST',
      headers: { 'workos-signature': 'sig' },
      body: JSON.stringify({ id: 'ev', type: 'user.created', data: {} }),
    });
    expect(r.status).toBe(400);
  });

  it('processes user.created event', async () => {
    const store = new FakeStore();
    const app = new Hono().route(
      '/v1/webhooks',
      webhookWorkosRoute({
        workos: passingMock,
        secret: 'x',
        repos: {
          organizations: store.organizations,
          accounts: store.accountsRepo,
          memberships: store.membershipMirror,
          projects: store.projects,
          workosEventLog: store.workosEventLog,
        },
      }),
    );
    const body = {
      id: 'ev_1',
      type: 'user.created',
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
