import { createHash } from 'node:crypto';
import {
  CanonicalBundleSchema,
  type CanonicalBundle,
} from '../schemas/project-version.js';
import { err, ok, type PlatformError, type Result } from '../types/result.js';
import { canonicalize } from './canonical-json.js';

export type ParsedCanonicalBundle = {
  readonly bundle: CanonicalBundle;
  readonly digest: string;
  readonly size: number;
};

export function canonicalBundleDigest(bundle: CanonicalBundle): string {
  const bytes = canonicalize(bundle);
  const h = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${h}`;
}

export function parseCanonicalBundle(
  bytes: Buffer,
): Result<ParsedCanonicalBundle, PlatformError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    return err([
      {
        code: 'PROJECT_VERSION_BUNDLE_PARSE_ERROR',
        message: String(cause),
        stage: 'parse',
        cause,
      },
    ]);
  }

  const r = CanonicalBundleSchema.safeParse(parsed);
  if (!r.success) {
    return err([
      {
        code: 'PROJECT_VERSION_BUNDLE_INVALID_SHAPE',
        message: r.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
        stage: 'parse',
      },
    ]);
  }

  return ok({
    bundle: r.data,
    digest: canonicalBundleDigest(r.data),
    size: bytes.byteLength,
  });
}
