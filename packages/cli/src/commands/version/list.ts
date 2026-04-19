import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { renderTable } from '../../output/tables.js';
import type { z } from 'zod';
import type { VersionsListResponseSchema } from '../../api/types.js';

type VersionsList = z.infer<typeof VersionsListResponseSchema>;

export type VersionListArgs = { limit?: number; cursor?: string };

export async function runVersionList(args: VersionListArgs, flags: CommonFlags): Promise<number> {
  return runCommand<VersionsList>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: (d) =>
        renderTable(
          ['SEQ', 'DIGEST', 'MESSAGE', 'PUBLISHED'],
          d.versions.map((v) => [
            String(v.seq),
            v.bundleDigest.slice(0, 12),
            (v.message ?? '').slice(0, 40),
            v.publishedAt,
          ]),
        ),
    },
    async (ctx) => {
      const listOpts: { limit?: number; cursor?: string } = {};
      if (args.limit !== undefined) listOpts.limit = args.limit;
      if (args.cursor !== undefined) listOpts.cursor = args.cursor;
      return endpoints.versions.list(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        ctx.resolved.org!,
        ctx.resolved.project!,
        ctx.resolved.service!,
        listOpts,
      );
    },
  );
}
