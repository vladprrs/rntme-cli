#!/usr/bin/env node
/* eslint-env node */
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

async function main() {
  // Use dynamic import() because this .cjs runs under node, but target packages are ESM.
  const pdm = await import('@rntme/pdm');
  const qsm = await import('@rntme/qsm');
  const bindings = await import('@rntme/bindings');
  const seed = await import('@rntme/seed');
  const graphIr = await import('@rntme/graph-ir-compiler');

  const targets = [
    { file: 'pdm.PdmArtifactSchema.txt',       schema: pdm.PdmArtifactSchema },
    { file: 'qsm.QsmArtifactSchema.txt',       schema: qsm.QsmArtifactSchema },
    { file: 'bindings.BindingArtifactSchema.txt', schema: bindings.BindingArtifactSchema },
    { file: 'seed.SeedArtifactSchema.txt',     schema: seed.SeedArtifactSchema },
    { file: 'graphIr.AuthoringSpecSchema.txt', schema: graphIr.AuthoringSpecSchema },
  ];

  const outDir = join(__dirname, '..', 'src', 'skills', 'verify', 'snapshots');
  mkdirSync(outDir, { recursive: true });

  for (const t of targets) {
    if (!t.schema) {
      throw new Error(`schema ${t.file} not exported by its package (check Task 10 preamble)`);
    }
    const canonical = canonicalize(t.schema._def);
    writeFileSync(join(outDir, t.file), canonical);
    console.log(`wrote ${t.file}`);
  }
}

function canonicalize(def, seen = new WeakSet()) {
  // Walk a Zod ._def tree, producing a stable JSON-ish string:
  //   typeName, keys (sorted), primitive facts.
  // Avoid cycles via WeakSet.
  if (def === null || typeof def !== 'object') return JSON.stringify(def);
  if (seen.has(def)) return '"<cycle>"';
  seen.add(def);
  const keys = Object.keys(def).filter((k) => k !== 'description').sort();
  const parts = keys.map((k) => {
    const v = def[k];
    if (v && typeof v === 'object' && '_def' in v) return `${JSON.stringify(k)}:${canonicalize(v._def, seen)}`;
    if (typeof v === 'function') return `${JSON.stringify(k)}:"<fn>"`;
    if (Array.isArray(v)) return `${JSON.stringify(k)}:[${v.map((x) => (x && typeof x === 'object' && '_def' in x ? canonicalize(x._def, seen) : canonicalize(x, seen))).join(',')}]`;
    if (v && typeof v === 'object') return `${JSON.stringify(k)}:${canonicalize(v, seen)}`;
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{${parts.join(',')}}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
