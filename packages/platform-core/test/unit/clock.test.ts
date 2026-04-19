import { describe, it, expect } from 'vitest';
import { SystemClock, FakeClock } from '../../src/clock.js';

describe('Clock', () => {
  it('SystemClock returns now', () => {
    const c = new SystemClock();
    const t = c.now();
    expect(t).toBeInstanceOf(Date);
  });
  it('FakeClock is advanceable', () => {
    const c = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    c.advance(60_000);
    expect(c.now().toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });
});
