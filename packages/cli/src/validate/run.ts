import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ok, err } from '../result.js';
import type { Result } from '../result.js';
import { cliError } from '../errors/codes.js';
import type { CliError } from '../errors/codes.js';
import type { RntmeProjectConfig } from '../config/project.js';
import { bundleDigest, fileDigest } from '../util/canonical-json.js';
import type { BundleFiles } from '../util/canonical-json.js';

export type ValidateReport = {
  ok: boolean;
  bundleDigest: string;
  artifactDigests: Record<keyof BundleFiles, string>;
  errors?: Array<{
    code: string;
    message: string;
    path?: string | undefined;
    pkg?: string | undefined;
    stage?: string | undefined;
  }>;
};

// Shape of platform-core's Result when err: { ok: false; errors: readonly PlatformError[] }
// PlatformError: { code: string; message: string; stage?: string; pkg?: string; path?: string; cause?: unknown }
type PlatformError = {
  readonly code: string;
  readonly message: string;
  readonly stage?: string | undefined;
  readonly pkg?: string | undefined;
  readonly path?: string | undefined;
  readonly cause?: unknown;
};

type PlatformResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: readonly PlatformError[] };

type ValidateBundleFn = (input: Record<string, Record<string, unknown>>) => Promise<PlatformResult>;

export async function runValidate(
  cfg: RntmeProjectConfig,
  cfgDir: string,
): Promise<Result<ValidateReport, CliError>> {
  const files: Partial<BundleFiles> = {};
  for (const key of ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const) {
    const p = resolve(cfgDir, cfg.artifacts[key]);
    let raw: string;
    try {
      raw = await readFile(p, 'utf8');
    } catch (cause) {
      return err(
        cliError('CLI_CONFIG_ARTIFACT_NOT_FOUND', `artifact ${key} not found at ${p}`, undefined, cause),
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      return err(
        cliError('CLI_CONFIG_INVALID', `artifact ${key} is not valid JSON (${p})`, undefined, cause),
      );
    }
    files[key] = parsed;
  }

  const bundle = files as BundleFiles;
  const digest = bundleDigest(bundle);

  let validateBundleFn: ValidateBundleFn;
  try {
    const mod = (await import('@rntme-cli/platform-core')) as { validateBundle?: unknown };
    if (typeof mod.validateBundle !== 'function') {
      return err(
        cliError(
          'CLI_VALIDATE_LOCAL_FAILED',
          'platform-core.validateBundle not exported (submodule out of sync?)',
        ),
      );
    }
    validateBundleFn = mod.validateBundle as ValidateBundleFn;
  } catch (cause) {
    return err(
      cliError(
        'CLI_VALIDATE_LOCAL_FAILED',
        'could not import @rntme-cli/platform-core — is this CLI running inside the rntme monorepo?',
        undefined,
        cause,
      ),
    );
  }

  // BundleFiles values are `unknown`; platform-core BundleInput uses z.record(string, unknown)
  // Cast via a bridging type that satisfies both sides without `any`.
  const bundleInput = bundle as unknown as Record<string, Record<string, unknown>>;
  const result = await validateBundleFn(bundleInput);

  if (result.ok) {
    return ok({
      ok: true,
      bundleDigest: digest,
      artifactDigests: perFileDigests(bundle),
    });
  }

  return ok({
    ok: false,
    bundleDigest: digest,
    artifactDigests: perFileDigests(bundle),
    errors: result.errors.map((e) => ({
      code: e.code,
      message: e.message,
      path: e.path,
      pkg: e.pkg,
      stage: e.stage,
    })),
  });
}

function perFileDigests(bundle: BundleFiles): Record<keyof BundleFiles, string> {
  return {
    manifest: fileDigest(bundle.manifest),
    pdm: fileDigest(bundle.pdm),
    qsm: fileDigest(bundle.qsm),
    graphIr: fileDigest(bundle.graphIr),
    bindings: fileDigest(bundle.bindings),
    ui: fileDigest(bundle.ui),
    seed: fileDigest(bundle.seed),
  };
}
