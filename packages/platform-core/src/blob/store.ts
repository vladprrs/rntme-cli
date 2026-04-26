import type { Result, PlatformError } from '../types/result.js';
import { canonicalDigest, sha256Hex } from '../validation/canonical-json.js';

export type PerFileDigests = {
  readonly manifest: string;
  readonly pdm: string;
  readonly qsm: string;
  readonly graphIr: string;
  readonly bindings: string;
  readonly ui: string;
  readonly seed: string;
};

const BUNDLE_ORDER = ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const;

export function perFileDigest(file: unknown): string {
  return canonicalDigest(file);
}

export function bundleDigest(per: PerFileDigests): string {
  return sha256Hex(BUNDLE_ORDER.map((k) => per[k]).join(''));
}

export function blobKey(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}.json`;
}

export interface BlobStore {
  putIfAbsent(key: string, body: Buffer): Promise<Result<void, PlatformError>>;
  presignedGet(key: string, expiresSeconds: number): Promise<Result<string, PlatformError>>;
  getJson<T = unknown>(key: string): Promise<Result<T, PlatformError>>;
  getRaw(key: string): Promise<Result<Buffer, PlatformError>>;
}
