import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import type { z } from 'zod';
import type { ServiceResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ServiceResponse = z.infer<typeof ServiceResponseSchema>;

export type ServiceShowArgs = { slug?: string };

export async function runServiceShow(args: ServiceShowArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ServiceResponse>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [
          `service:      ${d.service.slug}`,
          `id:           ${d.service.id}`,
          `displayName:  ${d.service.displayName}`,
          `archivedAt:   ${d.service.archivedAt ?? '—'}`,
        ].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      const project = flags.project ?? ctx.resolved.project;
      const slug = args.slug ?? flags.service ?? ctx.resolved.service;
      if (!org || !project || !slug) return err(cliError('CLI_CONFIG_MISSING', 'need org + project + service'));
      return endpoints.services.show({ baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token }, org, project, slug);
    },
  );
}
