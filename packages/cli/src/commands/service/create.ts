import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import type { z } from 'zod';
import type { ServiceResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ServiceResponse = z.infer<typeof ServiceResponseSchema>;

export type ServiceCreateArgs = { slug: string; displayName?: string };

export async function runServiceCreate(args: ServiceCreateArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ServiceResponse>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [`✓ service created`, `  slug:  ${d.service.slug}`, `  id:    ${d.service.id}`].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      const project = flags.project ?? ctx.resolved.project;
      if (!org || !project) return err(cliError('CLI_CONFIG_MISSING', 'need org + project'));
      return endpoints.services.create(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        project,
        { slug: args.slug, displayName: args.displayName ?? args.slug },
      );
    },
  );
}
