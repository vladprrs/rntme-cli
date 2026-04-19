import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { renderTable } from '../../output/tables.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';
import type { z } from 'zod';
import type { TokensListResponseSchema } from '../../api/types.js';

type TokensList = z.infer<typeof TokensListResponseSchema>;

export async function runTokenList(flags: CommonFlags): Promise<number> {
  return runCommand<TokensList>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        renderTable(
          ['NAME', 'PREFIX', 'SCOPES', 'EXPIRES', 'LAST USED', 'REVOKED'],
          d.tokens.map((t) => [
            t.name,
            t.prefix,
            t.scopes.join('/'),
            t.expiresAt ?? '—',
            t.lastUsedAt ?? '—',
            t.revokedAt ?? '—',
          ]),
        ),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'need --org'));
      return endpoints.tokens.list({ baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token }, org);
    },
  );
}
