import { runCommand } from './harness.js';
import type { CommonFlags } from './harness.js';
import { endpoints } from '../api/endpoints.js';
import type { z } from 'zod';
import type { AuthMeResponseSchema } from '../api/types.js';

type AuthMe = z.infer<typeof AuthMeResponseSchema>;

export async function runWhoami(flags: CommonFlags): Promise<number> {
  return runCommand<AuthMe>(
    flags,
    {
      requireToken: true,
      humanRender: (d) => {
        const lines = [
          `account:  ${d.account.email ?? '(no email)'} (${d.account.displayName})`,
          `org:      ${d.org.slug} (${d.org.id})`,
          `role:     ${d.role}`,
          `scopes:   ${d.scopes.join(', ')}`,
        ];
        if (d.tokenId) lines.push(`tokenId:  ${d.tokenId}`);
        return lines.join('\n');
      },
    },
    async (ctx) =>
      endpoints.auth.me({ baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token }),
  );
}
