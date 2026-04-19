import { createHash } from 'node:crypto';
import { canonify } from '@truestamp/canonify';

export type BundleFiles = {
  manifest: unknown;
  pdm: unknown;
  qsm: unknown;
  graphIr: unknown;
  bindings: unknown;
  ui: unknown;
  seed: unknown;
};

const BUNDLE_ORDER: ReadonlyArray<keyof BundleFiles> = [
  'manifest',
  'pdm',
  'qsm',
  'graphIr',
  'bindings',
  'ui',
  'seed',
];

export function canonicalJson(value: unknown): string {
  const out = canonify(value);
  if (out === undefined) {
    throw new TypeError('canonify returned undefined — value is not JSON-serializable');
  }
  return out;
}

export function fileDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function bundleDigest(files: BundleFiles): string {
  const concat = BUNDLE_ORDER.map((k) => fileDigest(files[k])).join('');
  return createHash('sha256').update(concat).digest('hex');
}
