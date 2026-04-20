import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSchemaSync } from '../../../../src/skills/verify/schema-sync.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '../../../fixtures/skills');

describe('runSchemaSync', () => {
  it('passes for the real sources directory (committed snapshots match live schemas)', async () => {
    const result = await runSchemaSync({ sourcesDir: join(HERE, '../../../../src/skills/sources') });
    expect(result.ok).toBe(true);
  });

  it('detects reference to unknown export', async () => {
    const result = await runSchemaSync({ sourcesDir: FIXTURES });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('NoSuchSchema'))).toBe(true);
    }
  });
});
