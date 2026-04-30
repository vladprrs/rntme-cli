import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { err, ok, type Result } from '../result.js';
import { cliError, type CliError } from '../errors/codes.js';
import { canonicalJson } from '../util/canonical-json.js';

export type CanonicalBundle = {
  readonly version: 1;
  readonly files: Readonly<Record<string, unknown>>;
};

export type BuiltProjectBundle = {
  readonly bundle: CanonicalBundle;
  readonly bytes: string;
  readonly digest: string;
  readonly size: number;
};

export function buildProjectBundle(folder: string): Result<BuiltProjectBundle, CliError> {
  const root = resolve(folder);
  const files = collectFiles(root);
  if (!files.ok) return files;

  if (!files.value.includes('project.json')) {
    return err(cliError('CLI_CONFIG_MISSING', 'project.json not found in bundle root'));
  }

  const bundleFiles: Record<string, unknown> = {};
  for (const relPath of files.value) {
    if (!relPath.endsWith('.json')) continue;
    try {
      bundleFiles[relPath] = JSON.parse(readFileSync(resolve(root, relPath), 'utf8'));
    } catch (cause) {
      return err(cliError('CLI_CONFIG_INVALID', `invalid JSON in ${relPath}`, undefined, cause));
    }
  }

  const bundle: CanonicalBundle = { version: 1, files: bundleFiles };
  const bytes = canonicalJson(bundle);
  return ok({
    bundle,
    bytes,
    digest: canonicalBundleDigest(bundle),
    size: Buffer.byteLength(bytes),
  });
}

export function canonicalBundleDigest(bundle: CanonicalBundle): string {
  return `sha256:${createHash('sha256').update(canonicalJson(bundle)).digest('hex')}`;
}

function collectFiles(root: string): Result<string[], CliError> {
  const out: string[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const abs = resolve(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!st.isFile()) continue;
      out.push(relative(root, abs).split(sep).join('/'));
    }
  }

  try {
    walk(root);
  } catch (cause) {
    return err(cliError('CLI_CONFIG_MISSING', `cannot read project bundle folder: ${root}`, undefined, cause));
  }

  out.sort();
  return ok(out);
}
