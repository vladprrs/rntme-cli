import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import type { z } from 'zod';
import type { TagResponseSchema } from '../../api/types.js';

type TagResponse = z.infer<typeof TagResponseSchema>;

export type TagSetArgs = { name: string; seq: number };

export async function runTagSet(args: TagSetArgs, flags: CommonFlags): Promise<number> {
  return runCommand<TagResponse>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: (d) => `✓ tag ${d.tag.name} → version ${args.seq}`,
    },
    async (ctx) =>
      endpoints.tags.set(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        ctx.resolved.org!,
        ctx.resolved.project!,
        ctx.resolved.service!,
        args.name,
        { versionSeq: args.seq },
      ),
  );
}
