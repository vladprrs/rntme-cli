// A minimal stand-in for @workos-inc/node that the platform-http app can use in tests.
import type { WorkOSClient } from '../../src/auth/workos-client.js';

export function makeWorkosStub(opts?: { forceCallbackOrg?: string }): WorkOSClient {
  const stub: unknown = {
    userManagement: {
      getAuthorizationUrl: (_args: unknown) => 'https://workos.test/start',
      authenticateWithCode: async (_args: unknown) => ({
        user: { id: 'user_stub_1', email: 'stub@example.com', firstName: 'Stub', lastName: 'User' },
        organizationId: opts?.forceCallbackOrg ?? 'org_stub_1',
        sealedSession: 'stub-sealed',
      }),
      loadSealedSession: (_args: unknown) => ({
        authenticate: async () => ({
          authenticated: true,
          user: { id: 'user_stub_1', email: 'stub@example.com', firstName: 'Stub', lastName: 'User' },
          organizationId: 'org_stub_1',
          sessionId: 'sess_1',
          reason: undefined,
        }),
        getLogoutUrl: async () => 'https://workos.test/logout',
      }),
    },
    webhooks: {
      constructEvent: async (args: { payload: string }) => JSON.parse(args.payload),
    },
  };
  return stub as WorkOSClient;
}
