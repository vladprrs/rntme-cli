import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';

export type TagDeleteArgs = { name: string };

export async function runTagDelete(args: TagDeleteArgs, flags: CommonFlags): Promise<number> {
  return runCommand<void>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: () => `✓ tag ${args.name} deleted`,
    },
    async (ctx) =>
      endpoints.tags.delete(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        ctx.resolved.org!,
        ctx.resolved.project!,
        ctx.resolved.service!,
        args.name,
      ),
  );
}
