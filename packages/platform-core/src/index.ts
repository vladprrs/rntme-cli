export const VERSION = '0.0.0';

export * from './types/result.js';
export * from './types/brands.js';
export * from './schemas/primitives.js';
export * from './schemas/entities.js';
export * from './schemas/requests.js';
export * from './auth/scopes.js';
export * from './auth/provider.js';
export * from './clock.js';
export * from './ids.js';
export { canonicalize, sha256Hex, canonicalDigest } from './validation/canonical-json.js';
