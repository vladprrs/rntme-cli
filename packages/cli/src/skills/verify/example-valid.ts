import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '@rntme-cli/platform-core';

const JSON_BLOCK_RE = /```json\s+artifact=(\S+)\r?\n([\s\S]*?)```/g;

const KEYS = ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const;
const FILE_NAMES: Record<(typeof KEYS)[number], string> = {
  manifest: 'manifest.json',
  pdm: 'pdm.json',
  qsm: 'qsm.json',
  graphIr: 'graph-ir.json',
  bindings: 'bindings.json',
  ui: 'ui.json',
  seed: 'seed.json',
};

export type ExampleValidResult = { ok: true } | { ok: false; errors: string[] };
export type ExampleValidArgs = { readonly sourcesDir: string };

function examplesDir(sourcesDir: string): string {
  return join(sourcesDir, 'examples', 'issue-tracker');
}

function loadCanonicalBundle(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    out[key] = JSON.parse(readFileSync(join(dir, FILE_NAMES[key]), 'utf8'));
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalOrder(a)) === JSON.stringify(canonicalOrder(b));
}

function canonicalOrder(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonicalOrder);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonicalOrder(obj[k]);
  return out;
}

export async function runExampleValid(args: ExampleValidArgs): Promise<ExampleValidResult> {
  const errors: string[] = [];

  // 1. Canonical bundle must validate.
  const bundleDir = examplesDir(args.sourcesDir);
  if (!existsSync(bundleDir)) {
    return { ok: false, errors: [`canonical bundle dir missing: ${bundleDir}`] };
  }
  const bundle = loadCanonicalBundle(bundleDir) as Parameters<typeof validateBundle>[0];
  const result = await validateBundle(bundle);
  if (!result.ok) {
    errors.push(`canonical bundle failed validateBundle: ${JSON.stringify(result.errors)}`);
  }

  // 2. Every json artifact=X block in skills must deep-equal the canonical file.
  const canonicalByName: Record<string, unknown> = {};
  for (const key of KEYS) canonicalByName[key] = bundle[key];
  // Also accept "graph-ir" as an alias for "graphIr"
  canonicalByName['graph-ir'] = bundle.graphIr;

  for (const entry of readdirSync(args.sourcesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const body = readFileSync(join(args.sourcesDir, entry.name), 'utf8');
    for (const m of body.matchAll(JSON_BLOCK_RE)) {
      const artifactName = m[1]!;
      const jsonText = m[2]!;
      const canon = canonicalByName[artifactName];
      if (canon === undefined) {
        errors.push(`${entry.name}: unknown artifact name "${artifactName}" in worked-example block`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (cause) {
        errors.push(`${entry.name}: worked-example block (artifact=${artifactName}) is not valid JSON (${String(cause)})`);
        continue;
      }
      if (!deepEqual(parsed, canon)) {
        errors.push(
          `${entry.name}: worked-example for artifact=${artifactName} does not match canonical ` +
            `examples/issue-tracker/${FILE_NAMES[(artifactName === 'graph-ir' ? 'graphIr' : artifactName) as (typeof KEYS)[number]]}. ` +
            `Copy the canonical file verbatim into the skill.`,
        );
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
