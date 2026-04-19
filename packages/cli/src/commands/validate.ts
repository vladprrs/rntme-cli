import { discoverProjectConfig } from '../config/project.js';
import { runValidate } from '../validate/run.js';
import { formatSuccess, formatFailure, toFailureOutput } from '../output/format.js';
import type { OutputMode } from '../output/format.js';
import { exitCodeFor } from '../errors/exit.js';
import { isOk } from '../result.js';
import { cliError } from '../errors/codes.js';

export async function runValidateCommand(flags: {
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}): Promise<number> {
  const mode: OutputMode = flags.json === true ? 'json' : 'human';

  const found = await discoverProjectConfig(process.cwd());
  if (!isOk(found)) {
    process.stderr.write(formatFailure(mode, toFailureOutput(found.error)) + '\n');
    return exitCodeFor(found.error.code);
  }

  const report = await runValidate(found.value.config, found.value.dir);
  if (!isOk(report)) {
    process.stderr.write(formatFailure(mode, toFailureOutput(report.error)) + '\n');
    return exitCodeFor(report.error.code);
  }

  if (report.value.ok) {
    process.stdout.write(
      formatSuccess(
        mode,
        report.value,
        (d) =>
          `bundle valid\n  bundleDigest: ${d.bundleDigest}\n  pdm:          ${d.artifactDigests.pdm.slice(0, 12)}\n  qsm:          ${d.artifactDigests.qsm.slice(0, 12)}\n  graphIr:      ${d.artifactDigests.graphIr.slice(0, 12)}\n  bindings:     ${d.artifactDigests.bindings.slice(0, 12)}\n  ui:           ${d.artifactDigests.ui.slice(0, 12)}\n  seed:         ${d.artifactDigests.seed.slice(0, 12)}\n  manifest:     ${d.artifactDigests.manifest.slice(0, 12)}`,
      ) + '\n',
    );
    return 0;
  }

  const e = cliError(
    'CLI_VALIDATE_LOCAL_FAILED',
    `bundle failed validation (${report.value.errors?.length ?? 0} errors)`,
  );
  process.stderr.write(
    formatFailure(mode, {
      code: e.code,
      message: e.message,
      nested: report.value.errors,
    }) + '\n',
  );
  return exitCodeFor(e.code);
}
