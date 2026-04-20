import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runExampleValid } from '../../../../src/skills/verify/example-valid.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('runExampleValid', () => {
  it('passes: canonical bundle valid, every skill example matches', async () => {
    const result = await runExampleValid({
      sourcesDir: join(HERE, '../../../../src/skills/sources'),
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(result.errors);
    }
    expect(result.ok).toBe(true);
  });
});
