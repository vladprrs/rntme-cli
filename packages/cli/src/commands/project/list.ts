import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { renderTable } from '../../output/tables.js';
import type { z } from 'zod';
import type { ProjectsListResponseSchema } from '../../api/types.js';
import { err } from '../../result.js';
import { cliError } from '../../errors/codes.js';

type ProjectsList = z.infer<typeof ProjectsListResponseSchema>;

export type ProjectListArgs = { includeArchived?: boolean };

export async function runProjectList(args: ProjectListArgs, flags: CommonFlags): Promise<number> {
  return runCommand<ProjectsList>(
    flags,
    {
      requireToken: true,
      humanRender: (d) =>
        renderTable(
          ['SLUG', 'DISPLAY NAME', 'CREATED', 'ARCHIVED'],
          d.projects.map((p) => [
            p.slug,
            p.displayName,
            p.createdAt.slice(0, 10),
            p.archivedAt ? p.archivedAt.slice(0, 10) : '—',
          ]),
        ),
    },
    async (ctx) => {
      const org = flags.org ?? ctx.resolved.org;
      if (!org) return err(cliError('CLI_CONFIG_MISSING', 'no org'));
      const listOpts = args.includeArchived !== undefined ? { includeArchived: args.includeArchived } : undefined;
      return endpoints.projects.list(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        org,
        listOpts,
      );
    },
  );
}
