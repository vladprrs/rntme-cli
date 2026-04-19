import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import type { z } from 'zod';
import type { ProjectResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export type ProjectShowArgs = { slug?: string };

export async function runProjectShow(args: ProjectShowArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ProjectResponse>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        [
          `project:      ${d.project.slug}`,
          `id:           ${d.project.id}`,
          `displayName:  ${d.project.displayName}`,
          `createdAt:    ${d.project.createdAt}`,
          `archivedAt:   ${d.project.archivedAt ?? '—'}`,
        ].join('\n'),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      const slug = args.slug ?? flags.project ?? ctx.resolved.project;
      if (!org || !slug) return err(cliError('CLI_CONFIG_MISSING', 'need --org and a project slug'));
      return endpoints.projects.show({ baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token }, org, slug);
    },
  );
}
