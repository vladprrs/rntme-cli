import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCommand } from './harness.js';
import type { CommonFlags } from './harness.js';
import { endpoints } from '../api/endpoints.js';
import type { PublishRequest } from '../api/types.js';
import { discoverProjectConfig } from '../config/project.js';
import { bundleDigest } from '../util/canonical-json.js';
import type { BundleFiles } from '../util/canonical-json.js';
import { isOk, err } from '../result.js';
import { cliError } from '../errors/codes.js';
import type { z } from 'zod';
import type { VersionResponseSchema } from '../api/types.js';

type VersionResponse = z.infer<typeof VersionResponseSchema>;
type PublishOutput = VersionResponse & { __replay: boolean };

export type PublishArgs = {
  tag?: string[];
  message?: string;
  previousVersionSeq?: number;
};

export async function runPublish(args: PublishArgs, flags: CommonFlags): Promise<number> {
  return runCommand<PublishOutput>(
    flags,
    {
      requireToken: true,
      requireTenancy: true,
      humanRender: (d) =>
        [
          d.__replay ? `↺ version already published (idempotent replay)` : `✓ published`,
          `  seq:          ${d.version.seq}`,
          `  bundleDigest: ${d.version.bundleDigest}`,
          `  previousSeq:  ${d.version.previousVersionId ?? '—'}`,
          `  publishedAt:  ${d.version.publishedAt}`,
          `  message:      ${d.version.message ?? '—'}`,
        ].join('\n'),
    },
    async (ctx) => {
      // 1. Load bundle from rntme.json
      const disco = await discoverProjectConfig(process.cwd());
      if (!isOk(disco)) return disco;
      const cfg = disco.value.config;
      const cfgDir = disco.value.dir;

      const bundle: Partial<BundleFiles> = {};
      for (const key of ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const) {
        const p = resolve(cfgDir, cfg.artifacts[key]);
        try {
          const raw = await readFile(p, 'utf8');
          bundle[key] = JSON.parse(raw);
        } catch (cause) {
          return err(cliError('CLI_CONFIG_ARTIFACT_NOT_FOUND', `cannot load artifact "${key}" from ${p}`, undefined, cause));
        }
      }
      const files = bundle as BundleFiles;

      // 2. Compute local digest
      const localDigest = bundleDigest(files);
      if (ctx.verbose) {
        process.stderr.write(`[rntme] local bundleDigest: ${localDigest}\n`);
      }

      // 3. Build request body
      // BundleFiles keys are `unknown`; PublishRequest['bundle'] uses Record<string, unknown> per key.
      // Bridge via a double cast (same pattern as validate/run.ts's bundleInput cast).
      const bundleForRequest = files as unknown as PublishRequest['bundle'];

      const publishBody: PublishRequest = {
        bundle: bundleForRequest,
      };
      if (args.previousVersionSeq !== undefined) {
        publishBody.previousVersionSeq = args.previousVersionSeq;
      }
      const msg = args.message ?? cfg.defaults?.message;
      if (msg !== undefined) {
        publishBody.message = msg;
      }
      const tags = args.tag && args.tag.length > 0 ? args.tag : cfg.defaults?.tags;
      if (tags !== undefined) {
        publishBody.moveTags = tags;
      }

      const resp = await endpoints.versions.publish(
        { baseUrl: ctx.resolved.baseUrl, token: ctx.resolved.token },
        ctx.resolved.org!,
        ctx.resolved.project!,
        ctx.resolved.service!,
        publishBody,
      );
      if (!resp.ok) return resp;

      // 4. Invariant: local digest matches server digest
      if (resp.value.version.bundleDigest.replace(/^sha256:/, '') !== localDigest) {
        return err(
          cliError(
            'CLI_PUBLISH_DIGEST_MISMATCH',
            `local bundleDigest (${localDigest}) != server bundleDigest (${resp.value.version.bundleDigest})`,
            'report this as a bug — canonical-JSON or ordering drift',
          ),
        );
      }

      // 5. Replay heuristic: publishedAt > 5s old suggests idempotent replay
      const ageMs = Date.now() - Date.parse(resp.value.version.publishedAt);
      const isReplay = ageMs > 5_000;
      return { ok: true, value: { ...resp.value, __replay: isReplay } };
    },
  );
}
