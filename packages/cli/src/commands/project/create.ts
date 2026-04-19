import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import type { z } from 'zod';
import type { ProjectResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export type ProjectCreateArgs = { slug: string; displayName?: string };

export async function runProjectCreate(args: ProjectCreateArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ProjectResponse>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [
          `✓ project created`,
          `  slug:         ${d.project.slug}`,
          `  id:           ${d.project.id}`,
          `  displayName:  ${d.project.displayName}`,
        ].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'no org; use --org or run in repo with rntme.json'));
      return endpoints.projects.create(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        { slug: args.slug, displayName: args.displayName ?? args.slug },
      );
    },
  );
}
