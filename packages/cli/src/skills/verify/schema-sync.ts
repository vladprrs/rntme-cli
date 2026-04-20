import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './canonicalize.js';

const SCHEMA_BLOCK_RE = /```ts\s+pkg=(\S+)\s+export=(\S+)\r?\n[\s\S]*?```/g;

export type SchemaSyncResult = { ok: true } | { ok: false; errors: string[] };

export type SchemaSyncArgs = {
  readonly sourcesDir: string;
};

function snapshotsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'snapshots');
}

type Ref = { pkg: string; exportName: string; file: string };

function collectRefs(dir: string): Ref[] {
  const refs: Ref[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const body = readFileSync(join(dir, entry.name), 'utf8');
    for (const m of body.matchAll(SCHEMA_BLOCK_RE)) {
      refs.push({ pkg: m[1]!, exportName: m[2]!, file: entry.name });
    }
  }
  return refs;
}

function snapshotFileFor(pkg: string, exportName: string): string {
  const short = pkg.replace(/^@rntme\//, '').replace(/-compiler$/, '');
  const safe = short === 'graph-ir' ? 'graphIr' : short;
  return `${safe}.${exportName}.txt`;
}

export async function runSchemaSync(args: SchemaSyncArgs): Promise<SchemaSyncResult> {
  const refs = collectRefs(args.sourcesDir);
  const errors: string[] = [];
  for (const ref of refs) {
    const expected = snapshotFileFor(ref.pkg, ref.exportName);
    const path = join(snapshotsDir(), expected);
    if (!existsSync(path)) {
      errors.push(
        `${ref.file}: references ${ref.pkg}.${ref.exportName}, but no snapshot at verify/snapshots/${expected}. ` +
          `Run \`pnpm -F @rntme-cli/cli gen:snapshots\` to regenerate.`,
      );
    }
  }

  const driftErrs = await verifySnapshotsMatchRuntime();
  errors.push(...driftErrs);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

async function verifySnapshotsMatchRuntime(): Promise<string[]> {
  const errors: string[] = [];
  const pairs: Array<{ file: string; load: () => Promise<{ _def: unknown } | undefined> }> = [
    { file: 'pdm.PdmArtifactSchema.txt',           load: async () => (await import('@rntme/pdm')).PdmArtifactSchema as { _def: unknown } | undefined },
    { file: 'qsm.QsmArtifactSchema.txt',           load: async () => (await import('@rntme/qsm')).QsmArtifactSchema as { _def: unknown } | undefined },
    { file: 'bindings.BindingArtifactSchema.txt',  load: async () => (await import('@rntme/bindings')).BindingArtifactSchema as { _def: unknown } | undefined },
    { file: 'seed.SeedArtifactSchema.txt',         load: async () => (await import('@rntme/seed')).SeedArtifactSchema as { _def: unknown } | undefined },
    { file: 'graphIr.AuthoringSpecSchema.txt',     load: async () => (await import('@rntme/graph-ir-compiler')).AuthoringSpecSchema as { _def: unknown } | undefined },
  ];
  for (const p of pairs) {
    const path = join(snapshotsDir(), p.file);
    if (!existsSync(path)) continue;
    const committed = readFileSync(path, 'utf8');
    let schema: { _def: unknown } | undefined;
    try {
      schema = await p.load();
    } catch (cause) {
      errors.push(`${p.file}: failed to import runtime schema (${String(cause)})`);
      continue;
    }
    if (!schema || !('_def' in schema)) {
      errors.push(`${p.file}: schema missing from runtime import`);
      continue;
    }
    const live = canonicalize(schema._def);
    if (live !== committed) {
      errors.push(
        `${p.file}: runtime schema does not match committed snapshot. ` +
          `A @rntme/* schema changed — run \`pnpm -F @rntme-cli/cli gen:snapshots\` ` +
          `and review skill files that reference this schema.`,
      );
    }
  }
  return errors;
}
