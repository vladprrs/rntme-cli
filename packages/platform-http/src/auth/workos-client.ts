import { WorkOS } from '@workos-inc/node';
import type { Env } from '../config/env.js';

export function createWorkos(env: Env): WorkOS {
  return new WorkOS(env.WORKOS_API_KEY, { clientId: env.WORKOS_CLIENT_ID });
}

export type WorkOSClient = WorkOS;
