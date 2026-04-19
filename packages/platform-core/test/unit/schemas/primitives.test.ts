import { describe, it, expect } from 'vitest';
import { SlugSchema, TagNameSchema, TokenNameSchema, RESERVED_SLUGS } from '../../../src/schemas/primitives.js';

describe('SlugSchema', () => {
  it('accepts valid', () => {
    expect(SlugSchema.safeParse('my-proj').success).toBe(true);
  });
  it('rejects too short', () => {
    expect(SlugSchema.safeParse('ab').success).toBe(false);
  });
  it('rejects reserved', () => {
    for (const r of RESERVED_SLUGS) expect(SlugSchema.safeParse(r).success).toBe(false);
  });
  it('rejects uppercase', () => {
    expect(SlugSchema.safeParse('MyProj').success).toBe(false);
  });
});

describe('TagNameSchema', () => {
  it('accepts snake-case', () => expect(TagNameSchema.safeParse('v1_0').success).toBe(true));
  it('rejects uppercase', () => expect(TagNameSchema.safeParse('Stable').success).toBe(false));
});

describe('TokenNameSchema', () => {
  it('accepts human-readable label', () => expect(TokenNameSchema.safeParse('laptop cli').success).toBe(true));
  it('rejects empty', () => expect(TokenNameSchema.safeParse('').success).toBe(false));
});
