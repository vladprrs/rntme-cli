import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';
import type { z } from 'zod';
import type { TokenCreatedResponseSchema } from '../../api/types.js';

type TokenCreated = z.infer<typeof TokenCreatedResponseSchema>;

export type TokenCreateArgs = {
  name: string;
  scopes: string[];
  expiresAt?: string;
};

export async function runTokenCreate(args: TokenCreateArgs, flags: CommonFlags): Promise<number> {
  return runCommand<TokenCreated>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [
          `✓ token created — save it now, it will NOT be shown again`,
          ``,
          `  name:        ${d.token.name}`,
          `  id:          ${d.token.id}`,
          `  scopes:      ${d.token.scopes.join(', ')}`,
          `  prefix:      ${d.token.prefix}`,
          `  expiresAt:   ${d.token.expiresAt ?? '—'}`,
          ``,
          `  plaintext:   ${d.plaintext}`,
        ].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'need --org'));
      return endpoints.tokens.create(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        { name: args.name, scopes: args.scopes, expiresAt: args.expiresAt ?? null },
      );
    },
  );
}
