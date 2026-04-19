import { describe, it, expectTypeOf } from 'vitest';
import type { ValidatedPublishBundle, ValidatedSlug } from '../../../src/types/brands.js';

describe('brand types', () => {
  it('ValidatedPublishBundle is not assignable from plain object', () => {
    expectTypeOf<{ foo: 1 }>().not.toMatchTypeOf<ValidatedPublishBundle>();
  });
  it('ValidatedSlug is not assignable from plain string', () => {
    expectTypeOf<string>().not.toMatchTypeOf<ValidatedSlug>();
  });
});
