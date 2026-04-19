import { WorkOS } from '@workos-inc/node';
import type { Env } from '../config/env.js';

/**
 * The WorkOS SDK's Organization type (as of @workos-inc/node) exposes `name` but
 * does NOT expose `slug` on its TypeScript interface, even though the WorkOS API
 * response includes it. We widen the client type so callers can read `slug` off
 * `getOrganization()` results without an `as never` cast at the call site.
 */
export type WorkOSClient = Omit<WorkOS, 'organizations'> & {
  organizations: Omit<WorkOS['organizations'], 'getOrganization'> & {
    getOrganization(
      id: string,
    ): Promise<
      Awaited<ReturnType<WorkOS['organizations']['getOrganization']>> & { slug?: string }
    >;
  };
};

export function createWorkos(env: Env): WorkOSClient {
  return new WorkOS(env.WORKOS_API_KEY, { clientId: env.WORKOS_CLIENT_ID }) as WorkOSClient;
}
