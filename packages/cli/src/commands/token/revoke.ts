import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

export type TokenRevokeArgs = { id: string };

export async function runTokenRevoke(args: TokenRevokeArgs, flags: CommonFlags): Promise<number> {
  return runCommand<void>(
    flags,
    {
      requireToken: true,
      humanRender: () => `✓ token ${args.id} revoked`,
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'need --org'));
      return endpoints.tokens.revoke(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        args.id,
      );
    },
  );
}
