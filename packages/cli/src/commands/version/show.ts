import { runCommand } from '../harness.js';
import type { CommonFlags } from '../harness.js';
import { endpoints } from '../../api/endpoints.js';
import { isOk, err } from '../../result.js';
import { cliError } from '../../errors/codes.js';
import type { z } from 'zod';
import type { VersionResponseSchema } from '../../api/types.js';

type VersionResponse = z.infer<typeof VersionResponseSchema>;

export type VersionShowArgs = { seqOrTag: string };

export async function runVersionShow(args: VersionShowArgs, flags: CommonFlags): Promise<number> {
  return runCommand<VersionResponse>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: (d) =>
        [
          `seq:          ${d.version.seq}`,
          `bundleDigest: ${d.version.bundleDigest}`,
          `publishedAt:  ${d.version.publishedAt}`,
          `message:      ${d.version.message ?? '—'}`,
        ].join('\n'),
    },
    async (ctx) => {
      const ctxApi = { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token };
      const org = ctx.resolved.org!;
      const project = ctx.resolved.project!;
      const service = ctx.resolved.service!;

      let seq: number;
      const maybeSeq = Number.parseInt(args.seqOrTag, 10);
      if (!Number.isNaN(maybeSeq) && String(maybeSeq) === args.seqOrTag) {
        seq = maybeSeq;
      } else {
        const tags = await endpoints.tags.list(ctxApi, org, project, service);
        if (!isOk(tags)) return tags;
        const match = tags.value.tags.find((t) => t.name === args.seqOrTag);
        if (!match) return err(cliError('CLI_CONFIG_MISSING', `tag "${args.seqOrTag}" not found`));
        const versions = await endpoints.versions.list(ctxApi, org, project, service, { limit: 200 });
        if (!isOk(versions)) return versions;
        const ver = versions.value.versions.find((v) => v.id === match.versionId);
        if (!ver)
          return err(
            cliError(
              'CLI_CONFIG_MISSING',
              `version for tag ${args.seqOrTag} not found in last 200 versions`,
            ),
          );
        seq = ver.seq;
      }

      return endpoints.versions.show(ctxApi, org, project, service, seq);
    },
  );
}
