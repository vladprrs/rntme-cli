import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { renderTable } from '../../output/tables.js';
import type { z } from 'zod';
import type { ServicesListResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ServicesList = z.infer<typeof ServicesListResponseSchema>;

export async function runServiceList(flags: CommonFlags): Promise<number> {
  return runCommand<ServicesList>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        renderTable(
          ['SLUG', 'DISPLAY NAME', 'ARCHIVED'],
          d.services.map((s) => [s.slug, s.displayName, s.archivedAt ?? '—']),
        ),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      const project = flags.project ?? ctx.resolved.project;
      if (!org || !project) return err(cliError('CLI_CONFIG_MISSING', 'need org + project'));
      return endpoints.services.list({ baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token }, org, project);
    },
  );
}
