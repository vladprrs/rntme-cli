import { describe, it, expect } from 'vitest';
import { validateBundle } from '../../../src/validation/bundle.js';
import { isOk } from '../../../src/types/result.js';
import { minimalValidBundle } from '../../fixtures/bundles/minimal-valid.js';
import { brokenPdmBundle } from '../../fixtures/bundles/broken-pdm.js';

describe('validateBundle', () => {
  it('passes a minimal valid bundle', async () => {
    const r = await validateBundle(minimalValidBundle);
    expect(isOk(r)).toBe(true);
  });
  it('fails PDM layer first when PDM is broken', async () => {
    const r = await validateBundle(brokenPdmBundle);
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) {
      const top = r.errors[0]!;
      expect(top.code).toBe('PLATFORM_VALIDATION_BUNDLE_FAILED');
      expect(top.pkg).toBe('pdm');
    }
  });
});
