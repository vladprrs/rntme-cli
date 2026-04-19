import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { renderTable } from '../../output/tables.js';
import type { z } from 'zod';
import type { TagsListResponseSchema } from '../../api/types.js';

type TagsList = z.infer<typeof TagsListResponseSchema>;

export async function runTagList(flags: CommonFlags): Promise<number> {
  return runCommand<TagsList>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: (d) =>
        renderTable(
          ['NAME', 'VERSION ID', 'UPDATED'],
          d.tags.map((t) => [t.name, t.versionId.slice(0, 12), t.updatedAt]),
        ),
    },
    async (ctx) =>
      endpoints.tags.list(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        ctx.resolved.org!,
        ctx.resolved.project!,
        ctx.resolved.service!,
      ),
  );
}
