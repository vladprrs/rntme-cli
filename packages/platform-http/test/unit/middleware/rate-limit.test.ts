import { describe, it, expect } from 'vitest';
import { InMemoryRateLimiter } from '../../../src/middleware/rate-limit.js';

describe('InMemoryRateLimiter', () => {
  it('allows up to N within window, then rejects', () => {
    const l = new InMemoryRateLimiter({ windowMs: 1000, max: 3 });
    const key = 'tok-1';
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(true);
    expect(l.check(key)).toBe(false);
  });
  it('forgets after window', async () => {
    const l = new InMemoryRateLimiter({ windowMs: 30, max: 1 });
    expect(l.check('k')).toBe(true);
    expect(l.check('k')).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(l.check('k')).toBe(true);
  });
});
