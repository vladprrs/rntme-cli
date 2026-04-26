import { endpoints } from '../../api/endpoints.js';
import type { ProjectVersionResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';
import { runCommand, type CommonFlags } from '../harness.js';
import type { z } from 'zod';

type ProjectVersionResponse = z.infer<typeof ProjectVersionResponseSchema>;

export type ProjectVersionShowArgs = { readonly seq: number };

export async function runProjectVersionShow(args: ProjectVersionShowArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ProjectVersionResponse>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [
          `seq:    ${d.version.seq}`,
          `id:     ${d.version.id}`,
          `digest: ${d.version.bundleDigest}`,
          `size:   ${d.version.bundleSizeBytes}`,
          `created:${d.version.createdAt}`,
        ].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      const project = flags.project ?? ctx.resolved.project;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'no org; use --org'));
      if (!project) return err(cliError('CLI_CONFIG_MISSING', 'no project; use --project'));
      return endpoints.projectVersions.show(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        project,
        args.seq,
      );
    },
  );
}
